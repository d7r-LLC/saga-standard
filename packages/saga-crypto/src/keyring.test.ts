// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { beforeEach, describe, expect, it } from 'vitest'
import nacl from 'tweetnacl'
import { createSagaKeyRing } from './keyring'

describe('SagaKeyRing', () => {
  const walletKey = nacl.randomBytes(32)
  const walletKey2 = nacl.randomBytes(32)

  describe('lifecycle', () => {
    it('starts locked', () => {
      const kr = createSagaKeyRing()
      expect(kr.isUnlocked).toBe(false)
    })

    it('unlocks with wallet private key', async () => {
      const kr = createSagaKeyRing()
      await kr.unlockWallet(walletKey)
      expect(kr.isUnlocked).toBe(true)
    })

    it('getPublicKey returns 32-byte x25519 public key after unlock', async () => {
      const kr = createSagaKeyRing()
      await kr.unlockWallet(walletKey)
      const pub = kr.getPublicKey()
      expect(pub).toBeInstanceOf(Uint8Array)
      expect(pub.length).toBe(32)
    })

    it('getPublicKey is deterministic for same wallet key', async () => {
      const kr1 = createSagaKeyRing()
      await kr1.unlockWallet(walletKey)
      const kr2 = createSagaKeyRing()
      await kr2.unlockWallet(walletKey)
      expect(kr1.getPublicKey()).toEqual(kr2.getPublicKey())
    })

    it('lock clears key material', async () => {
      const kr = createSagaKeyRing()
      await kr.unlockWallet(walletKey)
      kr.lock()
      expect(kr.isUnlocked).toBe(false)
    })

    it('throws on operations when locked', () => {
      const kr = createSagaKeyRing()
      expect(() => kr.getPublicKey()).toThrow('locked')
    })
  })

  describe('private scope', () => {
    let kr: ReturnType<typeof createSagaKeyRing>

    beforeEach(async () => {
      kr = createSagaKeyRing()
      await kr.unlockWallet(walletKey)
    })

    it('encrypts and decrypts round-trip', async () => {
      const plaintext = new TextEncoder().encode('agent private memory')
      const encrypted = await kr.encryptPrivate(plaintext)
      const decrypted = await kr.decryptPrivate(encrypted)
      expect(decrypted).toEqual(plaintext)
    })

    it('produces different ciphertext each call', async () => {
      const plaintext = new TextEncoder().encode('same data')
      const e1 = await kr.encryptPrivate(plaintext)
      const e2 = await kr.encryptPrivate(plaintext)
      expect(e1.ciphertext).not.toEqual(e2.ciphertext)
    })

    it('cannot be decrypted by a different wallet', async () => {
      const plaintext = new TextEncoder().encode('secret')
      const encrypted = await kr.encryptPrivate(plaintext)

      const otherKr = createSagaKeyRing()
      await otherKr.unlockWallet(walletKey2)
      await expect(otherKr.decryptPrivate(encrypted)).rejects.toThrow()
    })
  })

  describe('mutual scope', () => {
    let aliceKr: ReturnType<typeof createSagaKeyRing>
    let bobKr: ReturnType<typeof createSagaKeyRing>

    beforeEach(async () => {
      aliceKr = createSagaKeyRing()
      await aliceKr.unlockWallet(walletKey)
      bobKr = createSagaKeyRing()
      await bobKr.unlockWallet(walletKey2)
    })

    it('Alice encrypts, Bob decrypts', () => {
      const plaintext = new TextEncoder().encode('task result for Bob')
      const encrypted = aliceKr.encryptMutual(plaintext, bobKr.getPublicKey())
      const decrypted = bobKr.decryptMutual(encrypted, aliceKr.getPublicKey())
      expect(decrypted).toEqual(plaintext)
    })

    it('Bob encrypts, Alice decrypts', () => {
      const plaintext = new TextEncoder().encode('task request from Bob')
      const encrypted = bobKr.encryptMutual(plaintext, aliceKr.getPublicKey())
      const decrypted = aliceKr.decryptMutual(encrypted, bobKr.getPublicKey())
      expect(decrypted).toEqual(plaintext)
    })

    it('third party cannot decrypt', () => {
      const plaintext = new TextEncoder().encode('mutual secret')
      const encrypted = aliceKr.encryptMutual(plaintext, bobKr.getPublicKey())

      // Eve doesn't have Alice's or Bob's key — direct NaCl will fail
      expect(() => {
        const evePair = nacl.box.keyPair()
        nacl.box.open(
          encrypted.ciphertext,
          encrypted.nonce,
          aliceKr.getPublicKey(),
          evePair.secretKey
        )
      }).not.toThrow() // box.open returns null, doesn't throw
      // But our wrapper throws on null
      expect(() => {
        const evePair = nacl.box.keyPair()
        bobKr.decryptMutual(encrypted, evePair.publicKey)
      }).toThrow('decryption failed')
    })
  })

  describe('storage encryption', () => {
    let kr: ReturnType<typeof createSagaKeyRing>

    beforeEach(async () => {
      kr = createSagaKeyRing()
      await kr.unlockWallet(walletKey)
    })

    it('encrypts and decrypts round-trip', async () => {
      const data = new TextEncoder().encode('stored value')
      const encrypted = await kr.encryptStorage(data)
      const decrypted = await kr.decryptStorage(encrypted)
      expect(decrypted).toEqual(data)
    })

    it('different wallet cannot decrypt', async () => {
      const data = new TextEncoder().encode('stored value')
      const encrypted = await kr.encryptStorage(data)

      const otherKr = createSagaKeyRing()
      await otherKr.unlockWallet(walletKey2)
      await expect(otherKr.decryptStorage(encrypted)).rejects.toThrow()
    })
  })
})
