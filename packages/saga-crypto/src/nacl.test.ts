// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { describe, expect, it } from 'vitest'
import nacl from 'tweetnacl'
import { mutualDecrypt, mutualEncrypt, sealedBoxDecrypt, sealedBoxEncrypt } from './nacl'

describe('nacl', () => {
  const alice = nacl.box.keyPair()
  const bob = nacl.box.keyPair()

  describe('mutualEncrypt / mutualDecrypt', () => {
    it('round-trips plaintext between two parties', () => {
      const plaintext = new TextEncoder().encode('hello from alice')
      const encrypted = mutualEncrypt(plaintext, bob.publicKey, alice.secretKey)
      const decrypted = mutualDecrypt(encrypted, alice.publicKey, bob.secretKey)
      expect(decrypted).toEqual(plaintext)
    })

    it('either party can decrypt (shared secret is symmetric)', () => {
      const plaintext = new TextEncoder().encode('shared secret')
      // Alice encrypts to Bob
      const encrypted = mutualEncrypt(plaintext, bob.publicKey, alice.secretKey)
      // Bob decrypts using Alice's public key
      const decrypted = mutualDecrypt(encrypted, alice.publicKey, bob.secretKey)
      expect(decrypted).toEqual(plaintext)
    })

    it('wrong key fails to decrypt', () => {
      const eve = nacl.box.keyPair()
      const plaintext = new TextEncoder().encode('secret')
      const encrypted = mutualEncrypt(plaintext, bob.publicKey, alice.secretKey)
      expect(() => mutualDecrypt(encrypted, alice.publicKey, eve.secretKey)).toThrow(
        'decryption failed'
      )
    })

    it('produces different ciphertext each call (random nonce)', () => {
      const plaintext = new TextEncoder().encode('same message')
      const e1 = mutualEncrypt(plaintext, bob.publicKey, alice.secretKey)
      const e2 = mutualEncrypt(plaintext, bob.publicKey, alice.secretKey)
      expect(e1.ciphertext).not.toEqual(e2.ciphertext)
      expect(e1.nonce).not.toEqual(e2.nonce)
    })

    it('nonce is 24 bytes', () => {
      const encrypted = mutualEncrypt(new Uint8Array(1), bob.publicKey, alice.secretKey)
      expect(encrypted.nonce.length).toBe(24)
    })
  })

  describe('sealedBoxEncrypt / sealedBoxDecrypt', () => {
    it('round-trips plaintext — only recipient can decrypt', () => {
      const plaintext = new TextEncoder().encode('private data')
      const sealed = sealedBoxEncrypt(plaintext, bob.publicKey)
      const decrypted = sealedBoxDecrypt(sealed, bob.secretKey)
      expect(decrypted).toEqual(plaintext)
    })

    it('includes ephemeral public key (32 bytes)', () => {
      const sealed = sealedBoxEncrypt(new Uint8Array(1), bob.publicKey)
      expect(sealed.ephemeralPublicKey.length).toBe(32)
    })

    it('ephemeral key differs per encryption', () => {
      const s1 = sealedBoxEncrypt(new Uint8Array(1), bob.publicKey)
      const s2 = sealedBoxEncrypt(new Uint8Array(1), bob.publicKey)
      expect(s1.ephemeralPublicKey).not.toEqual(s2.ephemeralPublicKey)
    })

    it('wrong recipient key fails to decrypt', () => {
      const eve = nacl.box.keyPair()
      const sealed = sealedBoxEncrypt(new TextEncoder().encode('secret'), bob.publicKey)
      expect(() => sealedBoxDecrypt(sealed, eve.secretKey)).toThrow('decryption failed')
    })

    it('handles empty plaintext', () => {
      const sealed = sealedBoxEncrypt(new Uint8Array(0), bob.publicKey)
      const decrypted = sealedBoxDecrypt(sealed, bob.secretKey)
      expect(decrypted).toEqual(new Uint8Array(0))
    })
  })
})
