// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { describe, expect, it } from 'vitest'
import { verifyMessage } from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import type { SagaDocument } from '../types/saga-document'
import { createPrivateKeySigner } from './signer'

function makeUnsignedDoc(address: string): SagaDocument {
  return {
    $schema: 'https://saga-standard.dev/schema/v1',
    sagaVersion: '1.0',
    documentId: 'saga_testdoc12345abcde',
    exportedAt: '2026-03-20T10:00:00Z',
    exportType: 'identity',
    signature: {
      walletAddress: '',
      chain: 'eip155:8453',
      message: '',
      sig: '',
    },
    layers: {
      identity: {
        handle: 'test-agent',
        walletAddress: address,
        chain: 'eip155:8453',
        createdAt: '2026-01-15T08:00:00Z',
      },
    },
  }
}

describe('createPrivateKeySigner', () => {
  it('sign + verify round-trip', async () => {
    const privateKey = generatePrivateKey()
    const account = privateKeyToAccount(privateKey)
    const signer = createPrivateKeySigner({ privateKey })

    const doc = makeUnsignedDoc(account.address)
    const signed = await signer.sign(doc)

    expect(signed.signature.walletAddress).toBe(account.address)
    expect(signed.signature.sig).toMatch(/^0x/)
    expect(signed.signature.message).toContain('saga_testdoc12345abcde')

    // Verify with viem
    const valid = await verifyMessage({
      address: account.address,
      message: signed.signature.message,
      signature: signed.signature.sig as `0x${string}`,
    })
    expect(valid).toBe(true)
  })

  it('signature message matches expected format', async () => {
    const privateKey = generatePrivateKey()
    const signer = createPrivateKeySigner({ privateKey })
    const account = privateKeyToAccount(privateKey)
    const doc = makeUnsignedDoc(account.address)
    const signed = await signer.sign(doc)

    expect(signed.signature.message).toBe(
      'SAGA export saga_testdoc12345abcde at 2026-03-20T10:00:00Z'
    )
  })

  it('getAddress returns correct address', async () => {
    const privateKey = generatePrivateKey()
    const account = privateKeyToAccount(privateKey)
    const signer = createPrivateKeySigner({ privateKey })

    const address = await signer.getAddress()
    expect(address).toBe(account.address)
  })

  it('getChain returns default chain', () => {
    const privateKey = generatePrivateKey()
    const signer = createPrivateKeySigner({ privateKey })
    expect(signer.getChain()).toBe('eip155:8453')
  })

  it('respects custom chain', () => {
    const privateKey = generatePrivateKey()
    const signer = createPrivateKeySigner({ privateKey, chain: 'eip155:1' })
    expect(signer.getChain()).toBe('eip155:1')
  })

  it('signs consent messages', async () => {
    const privateKey = generatePrivateKey()
    const signer = createPrivateKeySigner({ privateKey })

    const sig = await signer.signConsent({
      operationType: 'transfer',
      documentId: 'saga_testdoc12345abcde',
      destinationUrl: 'https://other-platform.com',
      timestamp: '2026-03-20T10:00:00Z',
    })

    expect(sig).toMatch(/^0x/)
    expect(sig.length).toBeGreaterThan(10)
  })
})
