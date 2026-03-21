// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { describe, expect, it } from 'vitest'
import { generatePrivateKey } from 'viem/accounts'
import { createPrivateKeySigner } from '../sign/signer'
import type { SagaDocument } from '../types/saga-document'
import { extractSagaContainer } from './extractor'
import { packSagaContainer } from './packager'

function makeDoc(): SagaDocument {
  return {
    $schema: 'https://saga-standard.dev/schema/v1',
    sagaVersion: '1.0',
    documentId: 'saga_test12345678901234',
    exportedAt: '2026-03-20T10:00:00Z',
    exportType: 'full',
    signature: { walletAddress: '0xabc', chain: 'eip155:8453', message: 'test', sig: '0xsig' },
    layers: {
      identity: {
        handle: 'test-agent',
        walletAddress: '0xabc',
        chain: 'eip155:8453',
        createdAt: '2026-01-01T00:00:00Z',
      },
    },
  }
}

function makeSigner() {
  return createPrivateKeySigner({ privateKey: generatePrivateKey() })
}

describe('packSagaContainer + extractSagaContainer', () => {
  it('round-trip preserves document contents', async () => {
    const doc = makeDoc()
    const signer = makeSigner()

    const packed = await packSagaContainer({ document: doc, signer })
    expect(packed).toBeInstanceOf(Buffer)
    expect(packed.length).toBeGreaterThan(0)

    const result = await extractSagaContainer({ data: packed })
    expect(result.document.documentId).toBe(doc.documentId)
    expect(result.document.layers.identity?.handle).toBe('test-agent')
    expect(result.signatureValid).toBe(true)
    expect(result.meta.sagaContainerVersion).toBe('1.0')
  })

  it('round-trip preserves memory binaries', async () => {
    const doc = makeDoc()
    const signer = makeSigner()
    const longterm = Buffer.from('binary vector data here')
    const episodic = Buffer.from('{"eventId":"e1"}\n{"eventId":"e2"}\n')

    const packed = await packSagaContainer({
      document: doc,
      memoryBinaries: { longterm, episodic },
      signer,
    })

    const result = await extractSagaContainer({ data: packed })
    expect(result.memoryBinaries.longterm?.toString()).toBe('binary vector data here')
    expect(result.memoryBinaries.episodic?.toString()).toContain('eventId')
  })

  it('round-trip preserves artifacts', async () => {
    const doc = makeDoc()
    const signer = makeSigner()

    const packed = await packSagaContainer({
      document: doc,
      artifacts: [
        { name: 'auth-module.ts', data: Buffer.from('export function auth() {}') },
        { name: 'readme.md', data: Buffer.from('# My Agent') },
      ],
      signer,
    })

    const result = await extractSagaContainer({ data: packed })
    expect(result.artifacts).toHaveLength(2)
    expect(result.artifacts.find(a => a.name === 'auth-module.ts')?.data.toString()).toBe(
      'export function auth() {}'
    )
  })

  it('detects tampered content via checksum verification', async () => {
    const doc = makeDoc()
    const signer = makeSigner()
    const packed = await packSagaContainer({ document: doc, signer })

    // Corrupt one byte near the middle of the ZIP
    const corrupted = Buffer.from(packed)
    corrupted[Math.floor(corrupted.length / 2)] ^= 0xff

    // This should either fail to unzip or fail checksum verification
    await expect(extractSagaContainer({ data: corrupted })).rejects.toThrow()
  })

  it('empty container (doc only, no memory/artifacts) works', async () => {
    const doc = makeDoc()
    const signer = makeSigner()

    const packed = await packSagaContainer({ document: doc, signer })
    const result = await extractSagaContainer({ data: packed })

    expect(result.document.documentId).toBe(doc.documentId)
    expect(result.memoryBinaries.longterm).toBeUndefined()
    expect(result.memoryBinaries.episodic).toBeUndefined()
    expect(result.artifacts).toHaveLength(0)
  })

  it('META checksums are correct', async () => {
    const doc = makeDoc()
    const signer = makeSigner()

    const packed = await packSagaContainer({ document: doc, signer })
    const result = await extractSagaContainer({ data: packed })

    expect(result.meta.checksums['agent.saga.json']).toMatch(/^sha256:[a-f0-9]{64}$/)
  })
})
