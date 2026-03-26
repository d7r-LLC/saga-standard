// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { hkdfDeriveKey } from '@epicdm/flowstate-crypto'
import nacl from 'tweetnacl'
import type { DerivedKeyPair } from './types'

/** Fixed salt for SAGA encryption key derivation (domain separation, not entropy) */
const SAGA_SALT = new TextEncoder().encode('saga-encryption-v1')

/**
 * Derive an x25519 keypair from a wallet private key via HKDF-SHA256.
 *
 * The wallet key (secp256k1 or ed25519, 32 bytes) is high-entropy IKM.
 * HKDF extracts a 32-byte x25519 secret key, from which the public key
 * is derived using tweetnacl's Curve25519 scalar multiplication.
 *
 * @param walletPrivateKey - 32-byte wallet private key
 * @returns x25519 keypair for NaCl box encryption
 */
export async function deriveX25519KeyPair(walletPrivateKey: Uint8Array): Promise<DerivedKeyPair> {
  const secretKey = await hkdfDeriveKey(walletPrivateKey, SAGA_SALT, 'x25519')
  const { publicKey } = nacl.box.keyPair.fromSecretKey(secretKey)
  return { publicKey, secretKey }
}

/**
 * Derive an AES-256 key for local encrypted storage via HKDF-SHA256.
 *
 * Uses a different `info` string than x25519 derivation, ensuring the
 * storage key and encryption key are cryptographically independent.
 *
 * @param walletPrivateKey - 32-byte wallet private key
 * @returns 32-byte AES-256 key for local storage encryption
 */
export async function deriveStorageKey(walletPrivateKey: Uint8Array): Promise<Uint8Array> {
  return hkdfDeriveKey(walletPrivateKey, SAGA_SALT, 'local-storage')
}
