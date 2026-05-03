// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { createHash } from 'node:crypto'
import yauzl from 'yauzl'
import type { SagaDocument } from '../types/saga-document'
import type { MetaFile } from './packager'

/**
 * Phase 5 (O-Med#1, A-Low#5) — .saga container hardening.
 *
 * Without these caps, a malicious archive can:
 *   - Path-traverse: an entry named `../../etc/passwd` lands outside the
 *     intended namespace once the caller writes `files.get(...)` to disk.
 *   - Absolute-path: `/etc/passwd` similarly escapes any base directory.
 *   - Zip-bomb: a 10 MB compressed archive that decompresses to 10 GB
 *     exhausts memory before the caller can react.
 *   - Entry-count bomb: 100k tiny files starve the event loop and Map.
 *
 * The caps below are deliberately tight enough to refuse pathological
 * archives but loose enough to fit any legitimate agent export. They
 * apply BEFORE any data is materialized (we read entry headers via
 * yauzl's lazy iteration), so a rejected archive never reaches the
 * read stream.
 */
export const MAX_ENTRY_BYTES = 10 * 1024 * 1024 // 10 MB per file
export const MAX_TOTAL_BYTES = 100 * 1024 * 1024 // 100 MB total
export const MAX_ENTRIES = 1000

/** Error class so callers can disambiguate hardening rejections from other failures. */
export class SagaContainerError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SagaContainerError'
  }
}

/** Reject filenames that escape the intended namespace. Exported for tests. */
export function isUnsafeEntryName(name: string): boolean {
  if (name === '') return true
  if (name.startsWith('/')) return true
  if (name.includes('\\')) return true
  // Windows drive-letter prefix (e.g. `C:/Windows/system32`). Without this,
  // a caller doing `path.join(baseDir, name)` on Windows would write
  // outside `baseDir`. Match a single ASCII letter followed by `:` at the
  // very start of the path.
  if (/^[A-Za-z]:/.test(name)) return true
  // Reject any path component equal to '..' (covers `../`, `a/../b`, etc).
  const parts = name.split('/')
  for (const part of parts) {
    if (part === '..') return true
  }
  return false
}

export interface SagaContainerContents {
  document: SagaDocument
  memoryBinaries: { longterm?: Buffer; episodic?: Buffer }
  artifacts: Array<{ name: string; data: Buffer }>
  meta: MetaFile
  signatureValid: boolean
}

/**
 * Extract and verify a .saga ZIP container.
 */
export async function extractSagaContainer(options: {
  data: Buffer
  verifySignature?: boolean
}): Promise<SagaContainerContents> {
  const { data, verifySignature = true } = options
  const files = await unzip(data)

  // Read required files
  const docBuffer = files.get('agent.saga.json')
  if (!docBuffer) {
    throw new Error('Invalid .saga container: missing agent.saga.json')
  }
  const document = JSON.parse(docBuffer.toString('utf-8')) as SagaDocument

  const metaBuffer = files.get('META')
  if (!metaBuffer) {
    throw new Error('Invalid .saga container: missing META')
  }
  const meta = JSON.parse(metaBuffer.toString('utf-8')) as MetaFile

  // Verify checksums
  if (verifySignature) {
    for (const [path, expectedChecksum] of Object.entries(meta.checksums)) {
      const fileData = files.get(path)
      if (!fileData) {
        throw new Error(`META references missing file: ${path}`)
      }
      const actual = `sha256:${createHash('sha256').update(fileData).digest('hex')}`
      if (actual !== expectedChecksum) {
        throw new Error(
          `Checksum mismatch for ${path}: expected ${expectedChecksum}, got ${actual}`
        )
      }
    }
  }

  // Check SIGNATURE exists
  const sigBuffer = files.get('SIGNATURE')
  const signatureValid = !!sigBuffer
  // Full signature crypto-verification would require the wallet address public key.
  // For now we verify structural integrity (META checksums) and SIGNATURE presence.

  // Extract optional files
  const memoryBinaries: SagaContainerContents['memoryBinaries'] = {}
  const longterm = files.get('memory/longterm.bin')
  if (longterm) memoryBinaries.longterm = longterm
  const episodic = files.get('memory/episodic.jsonl')
  if (episodic) memoryBinaries.episodic = episodic

  const artifacts: SagaContainerContents['artifacts'] = []
  for (const [name, fileData] of files.entries()) {
    if (name.startsWith('artifacts/')) {
      artifacts.push({ name: name.slice('artifacts/'.length), data: fileData })
    }
  }

  return { document, memoryBinaries, artifacts, meta, signatureValid }
}

function unzip(data: Buffer): Promise<Map<string, Buffer>> {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(data, { lazyEntries: true }, (err, zipfile) => {
      if (err || !zipfile) return reject(err ?? new Error('Failed to open ZIP'))

      const files = new Map<string, Buffer>()
      let entryCount = 0
      let totalBytes = 0
      let aborted = false
      // Use Readable from node:stream — yauzl's openReadStream returns a
      // Node Readable, which exposes .destroy(). The DOM-typed ReadableStream
      // narrowing isn't expressive enough here, so we keep it loosely typed
      // and feature-check at runtime.
      let activeStream: { destroy?: () => void } | null = null

      // Close the zipfile and tear down the active read stream (if any) so
      // we don't leak file handles or keep yauzl emitting events after we
      // reject. Both `zipfile.close()` and `stream.destroy()` are idempotent
      // and safe to call when the underlying resource is already closed.
      const abort = (e: Error) => {
        if (aborted) return
        aborted = true
        try {
          activeStream?.destroy?.()
        } catch {
          // ignore
        }
        try {
          zipfile.close()
        } catch {
          // ignore
        }
        reject(e)
      }

      zipfile.readEntry()

      zipfile.on('entry', (entry: yauzl.Entry) => {
        if (aborted) return

        if (/\/$/.test(entry.fileName)) {
          // Directory entry, skip
          zipfile.readEntry()
          return
        }

        // Phase 5 hardening — entry-count, path, and per-entry size checks.
        // Run BEFORE openReadStream so a malicious archive never reaches
        // the read path.
        entryCount += 1
        if (entryCount > MAX_ENTRIES) {
          return abort(new SagaContainerError(`Too many entries: limit ${MAX_ENTRIES}`))
        }
        if (isUnsafeEntryName(entry.fileName)) {
          return abort(new SagaContainerError(`Unsafe entry filename: ${entry.fileName}`))
        }
        if (entry.uncompressedSize > MAX_ENTRY_BYTES) {
          return abort(
            new SagaContainerError(
              `Entry "${entry.fileName}" exceeds per-file limit (${entry.uncompressedSize} > ${MAX_ENTRY_BYTES})`
            )
          )
        }
        totalBytes += entry.uncompressedSize
        if (totalBytes > MAX_TOTAL_BYTES) {
          return abort(
            new SagaContainerError(
              `Container exceeds total-extract limit (${totalBytes} > ${MAX_TOTAL_BYTES})`
            )
          )
        }

        zipfile.openReadStream(entry, (streamErr, stream) => {
          if (streamErr || !stream) return abort(streamErr ?? new Error('Failed to read entry'))
          activeStream = stream as unknown as { destroy?: () => void }
          const chunks: Buffer[] = []
          stream.on('data', (chunk: Buffer) => chunks.push(chunk))
          stream.on('end', () => {
            activeStream = null
            if (aborted) return
            files.set(entry.fileName, Buffer.concat(chunks))
            zipfile.readEntry()
          })
          stream.on('error', abort)
        })
      })

      zipfile.on('end', () => {
        if (aborted) return
        resolve(files)
      })
      zipfile.on('error', abort)
    })
  })
}
