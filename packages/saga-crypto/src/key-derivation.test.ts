// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { describe, expect, it } from 'vitest'
import nacl from 'tweetnacl'
import { deriveStorageKey, deriveX25519KeyPair } from './key-derivation'

describe('key-derivation', () => {
  const fakeWalletKey = nacl.randomBytes(32)

  describe('deriveX25519KeyPair', () => {
    it('returns a 32-byte public key and 32-byte secret key', async () => {
      const kp = await deriveX25519KeyPair(fakeWalletKey)
      expect(kp.publicKey).toBeInstanceOf(Uint8Array)
      expect(kp.secretKey).toBeInstanceOf(Uint8Array)
      expect(kp.publicKey.length).toBe(32)
      expect(kp.secretKey.length).toBe(32)
    })

    it('is deterministic — same wallet key produces same keypair', async () => {
      const kp1 = await deriveX25519KeyPair(fakeWalletKey)
      const kp2 = await deriveX25519KeyPair(fakeWalletKey)
      expect(kp1.publicKey).toEqual(kp2.publicKey)
      expect(kp1.secretKey).toEqual(kp2.secretKey)
    })

    it('different wallet keys produce different keypairs', async () => {
      const otherKey = nacl.randomBytes(32)
      const kp1 = await deriveX25519KeyPair(fakeWalletKey)
      const kp2 = await deriveX25519KeyPair(otherKey)
      expect(kp1.publicKey).not.toEqual(kp2.publicKey)
    })

    it('derived keypair is a valid NaCl box keypair', async () => {
      const kp = await deriveX25519KeyPair(fakeWalletKey)
      const msg = new TextEncoder().encode('test')
      const nonce = nacl.randomBytes(24)
      const ct = nacl.box(msg, nonce, kp.publicKey, kp.secretKey)
      expect(ct).not.toBeNull()
    })
  })

  describe('deriveStorageKey', () => {
    it('returns a 32-byte key', async () => {
      const key = await deriveStorageKey(fakeWalletKey)
      expect(key).toBeInstanceOf(Uint8Array)
      expect(key.length).toBe(32)
    })

    it('is deterministic', async () => {
      const k1 = await deriveStorageKey(fakeWalletKey)
      const k2 = await deriveStorageKey(fakeWalletKey)
      expect(k1).toEqual(k2)
    })

    it('differs from x25519 secret key (different info string)', async () => {
      const kp = await deriveX25519KeyPair(fakeWalletKey)
      const storageKey = await deriveStorageKey(fakeWalletKey)
      expect(storageKey).not.toEqual(kp.secretKey)
    })
  })
})
