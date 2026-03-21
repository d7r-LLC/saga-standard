// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { describe, expect, it } from 'vitest'
import type { SagaDocument } from '../types/saga-document'
import { generateBoxKeyPair } from './nacl-box'
import { applyDefaultEncryption, decryptLayer, encryptLayer } from './layer-encryptor'

describe('encryptLayer + decryptLayer', () => {
  it('encrypt + decrypt round-trip preserves JSON exactly', () => {
    const recipient = generateBoxKeyPair()
    const sender = generateBoxKeyPair()

    const original = { format: 'markdown', content: 'You are a helpful agent.' }
    const encrypted = encryptLayer({
      layerData: original,
      recipientPublicKeys: [recipient.publicKey],
      senderSecretKey: sender.secretKey,
    })

    expect(encrypted.encrypted).toBe(true)
    expect(encrypted.scheme).toBe('x25519-xsalsa20-poly1305')
    expect(encrypted.recipients).toHaveLength(1)

    const decrypted = decryptLayer({
      encrypted,
      recipientPublicKey: recipient.publicKey,
      recipientSecretKey: recipient.secretKey,
    })

    expect(decrypted).toEqual(original)
  })

  it('multiple recipients can each decrypt independently', () => {
    const r1 = generateBoxKeyPair()
    const r2 = generateBoxKeyPair()
    const sender = generateBoxKeyPair()

    const data = { secret: 'classified info' }
    const encrypted = encryptLayer({
      layerData: data,
      recipientPublicKeys: [r1.publicKey, r2.publicKey],
      senderSecretKey: sender.secretKey,
    })

    expect(encrypted.recipients).toHaveLength(2)

    const d1 = decryptLayer({
      encrypted,
      recipientPublicKey: r1.publicKey,
      recipientSecretKey: r1.secretKey,
    })
    const d2 = decryptLayer({
      encrypted,
      recipientPublicKey: r2.publicKey,
      recipientSecretKey: r2.secretKey,
    })

    expect(d1).toEqual(data)
    expect(d2).toEqual(data)
  })

  it('wrong key fails to decrypt', () => {
    const recipient = generateBoxKeyPair()
    const sender = generateBoxKeyPair()
    const wrongKey = generateBoxKeyPair()

    const encrypted = encryptLayer({
      layerData: { test: true },
      recipientPublicKeys: [recipient.publicKey],
      senderSecretKey: sender.secretKey,
    })

    expect(() =>
      decryptLayer({
        encrypted,
        recipientPublicKey: recipient.publicKey,
        recipientSecretKey: wrongKey.secretKey,
      })
    ).toThrow('Decryption failed')
  })

  it('throws when recipient not found', () => {
    const r1 = generateBoxKeyPair()
    const r2 = generateBoxKeyPair()
    const sender = generateBoxKeyPair()

    const encrypted = encryptLayer({
      layerData: { test: true },
      recipientPublicKeys: [r1.publicKey],
      senderSecretKey: sender.secretKey,
    })

    expect(() =>
      decryptLayer({
        encrypted,
        recipientPublicKey: r2.publicKey,
        recipientSecretKey: r2.secretKey,
      })
    ).toThrow('No encrypted payload found')
  })
})

describe('applyDefaultEncryption', () => {
  function makeDoc(): SagaDocument {
    return {
      $schema: 'https://saga-standard.dev/schema/v1',
      sagaVersion: '1.0',
      documentId: 'saga_test12345678901234',
      exportedAt: '2026-03-20T10:00:00Z',
      exportType: 'full',
      signature: { walletAddress: '0xabc', chain: 'eip155:8453', message: '', sig: '' },
      layers: {
        identity: {
          handle: 'test',
          walletAddress: '0xabc',
          chain: 'eip155:8453',
          createdAt: '2026-01-01T00:00:00Z',
        },
        cognitive: {
          systemPrompt: { format: 'markdown', content: 'Secret system prompt' },
          parameters: { temperature: 0.7 },
        },
        memory: {
          longTerm: {
            type: 'vector-store',
            embeddingModel: 'text-embedding-3-small',
            vectorCount: 500,
          },
          episodic: { events: [] },
        },
      },
    }
  }

  it('encrypts systemPrompt on cross-org export', () => {
    const sender = generateBoxKeyPair()
    const recipient = generateBoxKeyPair()

    const result = applyDefaultEncryption({
      document: makeDoc(),
      senderSecretKey: sender.secretKey,
      recipientPublicKeys: [recipient.publicKey],
      crossOrg: true,
    })

    expect(result.privacy?.encryptedLayers).toContain('cognitive.systemPrompt')
    expect(
      (result.layers.cognitive?.systemPrompt as unknown as { encrypted: boolean })?.encrypted
    ).toBe(true)
  })

  it('encrypts memory.longTerm by default', () => {
    const sender = generateBoxKeyPair()
    const recipient = generateBoxKeyPair()

    const result = applyDefaultEncryption({
      document: makeDoc(),
      senderSecretKey: sender.secretKey,
      recipientPublicKeys: [recipient.publicKey],
    })

    expect(result.privacy?.encryptedLayers).toContain('memory.longTerm')
  })

  it('does not encrypt systemPrompt when not cross-org', () => {
    const sender = generateBoxKeyPair()
    const recipient = generateBoxKeyPair()

    const result = applyDefaultEncryption({
      document: makeDoc(),
      senderSecretKey: sender.secretKey,
      recipientPublicKeys: [recipient.publicKey],
      crossOrg: false,
    })

    const encLayers = result.privacy?.encryptedLayers ?? []
    expect(encLayers).not.toContain('cognitive.systemPrompt')
  })

  it('leaves unencrypted layers untouched', () => {
    const sender = generateBoxKeyPair()
    const recipient = generateBoxKeyPair()

    const result = applyDefaultEncryption({
      document: makeDoc(),
      senderSecretKey: sender.secretKey,
      recipientPublicKeys: [recipient.publicKey],
    })

    // Identity should be unchanged
    expect(result.layers.identity?.handle).toBe('test')
    // Episodic memory should be unchanged
    expect(result.layers.memory?.episodic?.events).toEqual([])
    // Cognitive parameters should be unchanged
    expect(result.layers.cognitive?.parameters?.temperature).toBe(0.7)
  })
})
