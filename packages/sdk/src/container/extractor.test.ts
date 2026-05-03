// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { describe, expect, it } from 'vitest'
import archiver from 'archiver'
import {
  MAX_ENTRIES,
  MAX_ENTRY_BYTES,
  MAX_TOTAL_BYTES,
  extractSagaContainer,
  isUnsafeEntryName,
} from './extractor'

/** Build a ZIP via archiver (matches packager). For well-formed tests. */
function buildZip(entries: Array<{ name: string; data: Buffer }>): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const archive = archiver('zip', { zlib: { level: 0 } })
    const chunks: Buffer[] = []
    archive.on('data', (c: Buffer) => chunks.push(c))
    archive.on('end', () => resolve(Buffer.concat(chunks)))
    archive.on('error', reject)
    for (const e of entries) archive.append(e.data, { name: e.name })
    archive.finalize()
  })
}

/**
 * Hand-craft a minimal STORE-compressed ZIP with a single entry whose
 * filename is exactly `name` (no validation, no normalization). archiver
 * and yazl both sanitize traversal sequences out of filenames at build
 * time, so we have to forge the bytes ourselves to test the extractor's
 * defenses against truly malicious archives.
 */
function buildMaliciousZip(name: string, data: Buffer): Buffer {
  const fileNameBuf = Buffer.from(name, 'utf-8')

  // crc32 of `data`
  const crcTable: number[] = (() => {
    const t = new Array(256)
    for (let n = 0; n < 256; n++) {
      let c = n
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      t[n] = c >>> 0
    }
    return t
  })()
  const crc = (() => {
    let c = 0xffffffff
    for (const b of data) c = (crcTable[(c ^ b) & 0xff] ^ (c >>> 8)) >>> 0
    return (c ^ 0xffffffff) >>> 0
  })()

  // Local file header
  const lfh = Buffer.alloc(30)
  lfh.writeUInt32LE(0x04034b50, 0) // signature
  lfh.writeUInt16LE(20, 4) // version
  lfh.writeUInt16LE(0, 6) // flags
  lfh.writeUInt16LE(0, 8) // compression: store
  lfh.writeUInt16LE(0, 10) // mod time
  lfh.writeUInt16LE(0, 12) // mod date
  lfh.writeUInt32LE(crc, 14)
  lfh.writeUInt32LE(data.length, 18)
  lfh.writeUInt32LE(data.length, 22)
  lfh.writeUInt16LE(fileNameBuf.length, 26)
  lfh.writeUInt16LE(0, 28)

  // Central directory entry
  const cdh = Buffer.alloc(46)
  cdh.writeUInt32LE(0x02014b50, 0)
  cdh.writeUInt16LE(20, 4) // version made by
  cdh.writeUInt16LE(20, 6) // version needed
  cdh.writeUInt16LE(0, 8)
  cdh.writeUInt16LE(0, 10)
  cdh.writeUInt16LE(0, 12)
  cdh.writeUInt16LE(0, 14)
  cdh.writeUInt32LE(crc, 16)
  cdh.writeUInt32LE(data.length, 20)
  cdh.writeUInt32LE(data.length, 24)
  cdh.writeUInt16LE(fileNameBuf.length, 28)
  cdh.writeUInt16LE(0, 30)
  cdh.writeUInt16LE(0, 32)
  cdh.writeUInt16LE(0, 34)
  cdh.writeUInt16LE(0, 36)
  cdh.writeUInt32LE(0, 38)
  cdh.writeUInt32LE(0, 42) // local header offset

  // End of central directory record
  const lfhAndData = Buffer.concat([lfh, fileNameBuf, data])
  const cdEntry = Buffer.concat([cdh, fileNameBuf])
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(0, 4)
  eocd.writeUInt16LE(0, 6)
  eocd.writeUInt16LE(1, 8)
  eocd.writeUInt16LE(1, 10)
  eocd.writeUInt32LE(cdEntry.length, 12)
  eocd.writeUInt32LE(lfhAndData.length, 16)
  eocd.writeUInt16LE(0, 20)

  return Buffer.concat([lfhAndData, cdEntry, eocd])
}

describe('SagaContainer hardening (Phase 5 — O-Med#1, A-Low#5)', () => {
  it('exports the documented caps', () => {
    expect(MAX_ENTRY_BYTES).toBe(10 * 1024 * 1024)
    expect(MAX_TOTAL_BYTES).toBe(100 * 1024 * 1024)
    expect(MAX_ENTRIES).toBe(1000)
  })

  describe('isUnsafeEntryName helper', () => {
    it('flags empty names', () => {
      expect(isUnsafeEntryName('')).toBe(true)
    })

    it('flags absolute paths (leading slash)', () => {
      expect(isUnsafeEntryName('/etc/passwd')).toBe(true)
    })

    it('flags backslash separators (Windows-style)', () => {
      expect(isUnsafeEntryName('..\\..\\windows\\system32')).toBe(true)
      expect(isUnsafeEntryName('foo\\bar')).toBe(true)
    })

    it('flags `..` traversal at top level', () => {
      expect(isUnsafeEntryName('../../etc/passwd')).toBe(true)
      expect(isUnsafeEntryName('..')).toBe(true)
    })

    it('flags Windows drive-letter prefixes', () => {
      // Without this, `path.join(baseDir, name)` on Windows would resolve
      // to an absolute path that escapes baseDir.
      expect(isUnsafeEntryName('C:/Windows/system32')).toBe(true)
      expect(isUnsafeEntryName('c:/etc/passwd')).toBe(true)
      expect(isUnsafeEntryName('Z:nofile')).toBe(true)
    })

    it('flags `..` traversal nested in path', () => {
      expect(isUnsafeEntryName('artifacts/../../escape')).toBe(true)
      expect(isUnsafeEntryName('a/b/../c')).toBe(true)
    })

    it('accepts safe names', () => {
      expect(isUnsafeEntryName('agent.saga.json')).toBe(false)
      expect(isUnsafeEntryName('META')).toBe(false)
      expect(isUnsafeEntryName('artifacts/avatar.png')).toBe(false)
      expect(isUnsafeEntryName('memory/longterm.bin')).toBe(false)
    })

    it('does not flag names containing ".." inside a single component', () => {
      // Only literal `..` path components are unsafe; a filename like
      // `report..pdf` is fine.
      expect(isUnsafeEntryName('report..pdf')).toBe(false)
      expect(isUnsafeEntryName('artifacts/legit..name.txt')).toBe(false)
    })
  })

  // Defense-in-depth note: yauzl applies its own filename validation on
  // entry headers and will reject path-traversal/absolute-path archives
  // before our handler ever sees them. The integration tests below assert
  // that the malicious archive is REJECTED (by some layer); the
  // `isUnsafeEntryName` unit tests above pin our specific logic. Both
  // layers are required: yauzl's check covers the common cases, and our
  // check is the backstop for any edge yauzl might miss in a future
  // version (or for forks/alternative readers that callers might swap in).
  it('rejects a forged path-traversal archive end-to-end', async () => {
    const buf = buildMaliciousZip('../../etc/passwd', Buffer.from('compromised', 'utf-8'))
    await expect(extractSagaContainer({ data: buf, verifySignature: false })).rejects.toThrow()
  })

  it('rejects a forged absolute-path archive end-to-end', async () => {
    const buf = buildMaliciousZip('/etc/passwd', Buffer.from('compromised', 'utf-8'))
    await expect(extractSagaContainer({ data: buf, verifySignature: false })).rejects.toThrow()
  })

  // Note: we intentionally don't add a hand-forged backslash test here
  // because yauzl's default `decodeStrings: true` mode pre-rejects such
  // entries with its own validation, and that behavior varies across yauzl
  // versions. The `isUnsafeEntryName` unit tests above pin our backstop
  // logic regardless of which validation layer fires first in production.

  it('rejects per-entry oversized files BEFORE reading data', async () => {
    // 11 MB file in a normal-named entry. The hardening checks
    // `entry.uncompressedSize` from the central directory and throws before
    // openReadStream materializes the bytes.
    const oversized = Buffer.alloc(MAX_ENTRY_BYTES + 1)
    const buf = await buildZip([{ name: 'artifacts/giant.bin', data: oversized }])
    await expect(extractSagaContainer({ data: buf, verifySignature: false })).rejects.toThrow(
      /per-file limit/
    )
  }, 30_000)

  it('rejects when cumulative total exceeds the cap', async () => {
    // 11 entries × ~10MB ≈ 110MB. Each stays under MAX_ENTRY_BYTES so the
    // per-entry check doesn't pre-empt the total check.
    const each = Math.min(Math.floor(MAX_TOTAL_BYTES / 10) + 1, MAX_ENTRY_BYTES - 1)
    const entries = Array.from({ length: 11 }, (_, i) => ({
      name: `artifacts/chunk_${i}.bin`,
      data: Buffer.alloc(each),
    }))
    const buf = await buildZip(entries)
    await expect(extractSagaContainer({ data: buf, verifySignature: false })).rejects.toThrow(
      /total-extract limit/
    )
  }, 30_000)

  it('rejects archives with too many entries', async () => {
    const entries = Array.from({ length: MAX_ENTRIES + 5 }, (_, i) => ({
      name: `artifacts/file_${i}.txt`,
      data: Buffer.from(`x${i}`, 'utf-8'),
    }))
    const buf = await buildZip(entries)
    await expect(extractSagaContainer({ data: buf, verifySignature: false })).rejects.toThrow(
      /Too many entries/
    )
  }, 30_000)

  it('still extracts a well-formed small archive (no false positive)', async () => {
    const buf = await buildZip([
      {
        name: 'agent.saga.json',
        data: Buffer.from(JSON.stringify({ sagaVersion: '1.0', layers: {} }), 'utf-8'),
      },
      { name: 'META', data: Buffer.from(JSON.stringify({ checksums: {} }), 'utf-8') },
      { name: 'SIGNATURE', data: Buffer.from('test-sig', 'utf-8') },
      { name: 'artifacts/avatar.png', data: Buffer.from('\x89PNG', 'binary') },
    ])
    const result = await extractSagaContainer({ data: buf, verifySignature: false })
    expect(result.document.sagaVersion).toBe('1.0')
    expect(result.artifacts).toHaveLength(1)
    expect(result.artifacts[0].name).toBe('avatar.png')
  })
})
