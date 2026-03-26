// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { describe, expect, it } from 'vitest'
import nacl from 'tweetnacl'
import { createSagaKeyRing } from './keyring'
import { open, seal } from './envelope'
import type { SagaEncryptedEnvelope } from './types'

describe('envelope', () => {
  const walletKey1 = nacl.randomBytes(32)
  const walletKey2 = nacl.randomBytes(32)

  describe('mutual scope', () => {
    it('seal + open round-trips', async () => {
      const aliceKr = createSagaKeyRing()
      await aliceKr.unlockWallet(walletKey1)
      const bobKr = createSagaKeyRing()
      await bobKr.unlockWallet(walletKey2)

      const plaintext = new TextEncoder().encode('hello bob')
      const envelope = seal(
        {
          type: 'direct-message',
          scope: 'mutual',
          from: 'alice@epicflow',
          to: 'bob@epicflow',
          plaintext,
          recipientPublicKey: bobKr.getPublicKey(),
        },
        aliceKr
      )

      expect(envelope.v).toBe(1)
      expect(envelope.type).toBe('direct-message')
      expect(envelope.scope).toBe('mutual')
      expect(envelope.from).toBe('alice@epicflow')
      expect(envelope.to).toBe('bob@epicflow')
      expect(envelope.nonce).toBeDefined()
      expect(envelope.ct).toBeDefined()
      expect(envelope.iv).toBeUndefined()
      expect(envelope.wrappedDek).toBeUndefined()

      const decrypted = open(envelope, bobKr, aliceKr.getPublicKey())
      expect(decrypted).toEqual(plaintext)
    })
  })

  describe('private scope', () => {
    it('seal + open round-trips', async () => {
      const kr = createSagaKeyRing()
      await kr.unlockWallet(walletKey1)

      const plaintext = new TextEncoder().encode('private memory')
      const envelope = await seal(
        {
          type: 'memory-sync',
          scope: 'private',
          from: 'alice@epicflow',
          to: 'alice@epicflow',
          plaintext,
        },
        kr
      )

      expect(envelope.scope).toBe('private')
      expect(envelope.iv).toBeDefined()
      expect(envelope.authTag).toBeDefined()
      expect(envelope.wrappedDek).toBeDefined()
      expect(envelope.nonce).toBeUndefined()

      const decrypted = await open(envelope, kr)
      expect(decrypted).toEqual(plaintext)
    })

    it('different wallet cannot open', async () => {
      const kr = createSagaKeyRing()
      await kr.unlockWallet(walletKey1)

      const envelope = await seal(
        {
          type: 'memory-sync',
          scope: 'private',
          from: 'alice@epicflow',
          to: 'alice@epicflow',
          plaintext: new TextEncoder().encode('secret'),
        },
        kr
      )

      const otherKr = createSagaKeyRing()
      await otherKr.unlockWallet(walletKey2)
      await expect(open(envelope, otherKr)).rejects.toThrow()
    })
  })

  describe('group scope', () => {
    it('seal + open round-trips', async () => {
      const aliceKr = createSagaKeyRing()
      await aliceKr.unlockWallet(walletKey1)
      const bobKr = createSagaKeyRing()
      await bobKr.unlockWallet(walletKey2)

      // Set up group key
      const groupKey = nacl.randomBytes(32)
      const groupKeyId = 'org-123'
      aliceKr.injectGroupKey(groupKeyId, groupKey)
      const wrapped = aliceKr.wrapGroupKeyFor(groupKeyId, bobKr.getPublicKey())
      bobKr.addGroupKey(groupKeyId, wrapped, aliceKr.getPublicKey())

      const plaintext = new TextEncoder().encode('org broadcast')
      const envelope = await seal(
        {
          type: 'group-message',
          scope: 'group',
          from: 'alice@epicflow',
          to: ['bob@epicflow', 'carol@epicflow'],
          plaintext,
          groupKeyId,
        },
        aliceKr
      )

      expect(envelope.scope).toBe('group')
      expect(envelope.groupKeyId).toBe(groupKeyId)
      expect(envelope.wrappedDek).toBeDefined()
      expect(envelope.iv).toBeDefined()
      expect(envelope.authTag).toBeDefined()

      const decrypted = await open(envelope, bobKr)
      expect(decrypted).toEqual(plaintext)
    })
  })

  describe('envelope metadata', () => {
    it('has valid UUID id', async () => {
      const kr = createSagaKeyRing()
      await kr.unlockWallet(walletKey1)

      const envelope = seal(
        {
          type: 'direct-message',
          scope: 'mutual',
          from: 'alice@epicflow',
          to: 'bob@epicflow',
          plaintext: new Uint8Array(1),
          recipientPublicKey: kr.getPublicKey(),
        },
        kr
      )

      expect(envelope.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
    })

    it('has ISO 8601 timestamp', async () => {
      const kr = createSagaKeyRing()
      await kr.unlockWallet(walletKey1)

      const envelope = seal(
        {
          type: 'direct-message',
          scope: 'mutual',
          from: 'a@d',
          to: 'b@d',
          plaintext: new Uint8Array(1),
          recipientPublicKey: kr.getPublicKey(),
        },
        kr
      )

      expect(() => new Date(envelope.ts).toISOString()).not.toThrow()
    })

    it('rejects unrecognized version on open', async () => {
      const kr = createSagaKeyRing()
      await kr.unlockWallet(walletKey1)

      const envelope = seal(
        {
          type: 'direct-message',
          scope: 'mutual',
          from: 'a@d',
          to: 'b@d',
          plaintext: new Uint8Array(1),
          recipientPublicKey: kr.getPublicKey(),
        },
        kr
      )

      const tampered = { ...envelope, v: 99 } as unknown as SagaEncryptedEnvelope
      expect(() => open(tampered, kr, kr.getPublicKey())).toThrow('Unsupported envelope version')
    })
  })
})
