// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { createHash } from 'node:crypto'
import yauzl from 'yauzl'
import type { SagaDocument } from '../types/saga-document'
import type { MetaFile } from './packager'

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
      zipfile.readEntry()

      zipfile.on('entry', (entry: yauzl.Entry) => {
        if (/\/$/.test(entry.fileName)) {
          // Directory entry, skip
          zipfile.readEntry()
          return
        }

        zipfile.openReadStream(entry, (streamErr, stream) => {
          if (streamErr || !stream) return reject(streamErr ?? new Error('Failed to read entry'))
          const chunks: Buffer[] = []
          stream.on('data', (chunk: Buffer) => chunks.push(chunk))
          stream.on('end', () => {
            files.set(entry.fileName, Buffer.concat(chunks))
            zipfile.readEntry()
          })
          stream.on('error', reject)
        })
      })

      zipfile.on('end', () => resolve(files))
      zipfile.on('error', reject)
    })
  })
}
