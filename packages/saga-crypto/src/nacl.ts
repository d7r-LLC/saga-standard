// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import nacl from 'tweetnacl'
import type { MutualEncryptionResult, SealedBoxResult } from './types'

/**
 * Encrypt plaintext using NaCl box with both parties' static x25519 keys.
 *
 * Both sender and recipient can derive the same shared secret (Diffie-Hellman),
 * so both can decrypt. This is the "mutual" encryption scope in SAGA —
 * used for agent↔company work products both parties keep.
 *
 * @param plaintext - Data to encrypt
 * @param recipientPublicKey - Recipient's x25519 public key (32 bytes)
 * @param senderSecretKey - Sender's x25519 secret key (32 bytes)
 */
export function mutualEncrypt(
  plaintext: Uint8Array,
  recipientPublicKey: Uint8Array,
  senderSecretKey: Uint8Array
): MutualEncryptionResult {
  const nonce = nacl.randomBytes(nacl.box.nonceLength)
  const ciphertext = nacl.box(plaintext, nonce, recipientPublicKey, senderSecretKey)
  if (!ciphertext) {
    throw new Error('NaCl box encryption failed')
  }
  return { ciphertext, nonce }
}

/**
 * Decrypt NaCl box ciphertext using both parties' static x25519 keys.
 *
 * @param encrypted - Ciphertext and nonce from mutualEncrypt
 * @param senderPublicKey - Sender's x25519 public key (32 bytes)
 * @param recipientSecretKey - Recipient's x25519 secret key (32 bytes)
 */
export function mutualDecrypt(
  encrypted: MutualEncryptionResult,
  senderPublicKey: Uint8Array,
  recipientSecretKey: Uint8Array
): Uint8Array {
  const plaintext = nacl.box.open(
    encrypted.ciphertext,
    encrypted.nonce,
    senderPublicKey,
    recipientSecretKey
  )
  if (!plaintext) {
    throw new Error('NaCl box decryption failed: invalid key or corrupted data')
  }
  return plaintext
}

/**
 * Encrypt plaintext using sealedbox pattern (ephemeral sender key).
 *
 * Generates a one-time keypair, encrypts using NaCl box, then discards the
 * ephemeral secret key. Only the recipient can decrypt. The ephemeral public
 * key is included in the result so the recipient can reconstruct the shared secret.
 *
 * Used for DEK wrapping in agent-private scope — the agent encrypts a DEK
 * to their own x25519 public key so only their own private key can unwrap it.
 *
 * @param plaintext - Data to encrypt
 * @param recipientPublicKey - Recipient's x25519 public key (32 bytes)
 */
export function sealedBoxEncrypt(
  plaintext: Uint8Array,
  recipientPublicKey: Uint8Array
): SealedBoxResult {
  const ephemeral = nacl.box.keyPair()
  const nonce = nacl.randomBytes(nacl.box.nonceLength)
  const ciphertext = nacl.box(plaintext, nonce, recipientPublicKey, ephemeral.secretKey)
  if (!ciphertext) {
    throw new Error('NaCl sealedbox encryption failed')
  }
  // Zero the ephemeral secret key — it must not be retained
  ephemeral.secretKey.fill(0)
  return { ciphertext, nonce, ephemeralPublicKey: ephemeral.publicKey }
}

/**
 * Decrypt sealedbox ciphertext using the recipient's x25519 secret key.
 *
 * @param encrypted - Ciphertext, nonce, and ephemeral public key from sealedBoxEncrypt
 * @param recipientSecretKey - Recipient's x25519 secret key (32 bytes)
 */
export function sealedBoxDecrypt(
  encrypted: SealedBoxResult,
  recipientSecretKey: Uint8Array
): Uint8Array {
  const plaintext = nacl.box.open(
    encrypted.ciphertext,
    encrypted.nonce,
    encrypted.ephemeralPublicKey,
    recipientSecretKey
  )
  if (!plaintext) {
    throw new Error('NaCl sealedbox decryption failed: invalid key or corrupted data')
  }
  return plaintext
}
