// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes } from 'node:crypto'
import type { VaultItemEncryptedPayload, VaultKeyWrap } from '../types/layers'

const VAULT_INFO = 'saga-vault-v1'

/**
 * Optional context that binds a vault item's ciphertext to its identity. When
 * provided to `encryptVaultItem` / `decryptVaultItem`, the canonicalized
 * context is hashed with SHA-256 and used as AES-GCM AAD on both the item
 * ciphertext and the DEK key-wrap. A swap of `keyWraps[0]` between two items
 * (with different contexts) will then fail the AES-GCM auth-tag check —
 * closing the cross-item key swap vector flagged in the 2026-05-03 audit
 * (A-High#8). When omitted, no AAD is set (back-compat with legacy items).
 */
export type VaultAadContext = Record<string, string | number | undefined>

/** Result of encrypting a vault item's fields */
export interface EncryptedVaultItemResult {
  /** The encrypted payload to store as `item.fields` */
  fields: VaultItemEncryptedPayload
  /** The DEK wrapped under the master key, to store as `item.keyWraps[0]` */
  wrappedDek: VaultKeyWrap
}

/**
 * Canonicalize an AAD context (sort keys, JSON-encode, hash with SHA-256)
 * so encrypt/decrypt produce the same digest from the same input regardless
 * of property insertion order. Returns `undefined` when no context was
 * supplied (preserves the old "no AAD" behavior).
 */
function aadDigest(context: VaultAadContext | undefined): Buffer | undefined {
  if (!context) return undefined
  const keys = Object.keys(context).sort()
  const canonical: Record<string, unknown> = {}
  for (const k of keys) {
    if (context[k] !== undefined) canonical[k] = context[k]
  }
  return createHash('sha256').update(JSON.stringify(canonical), 'utf-8').digest()
}

/**
 * Derive the vault master key from the agent's wallet private key.
 * Uses HKDF-SHA256 per spec Section 12 (Tier 1).
 *
 * This key MUST never leave the client. Platforms MUST NOT store or transmit it.
 */
export function deriveVaultMasterKey(walletPrivateKey: Uint8Array, salt: Uint8Array): Uint8Array {
  const derived = hkdfSync('sha256', walletPrivateKey, salt, VAULT_INFO, 32)
  return new Uint8Array(derived)
}

/**
 * Encrypt a vault item's fields using AES-256-GCM.
 * Generates a random DEK, encrypts the fields, wraps the DEK under masterKey.
 * Per spec Section 12 (Tier 3 + Tier 1).
 *
 * @param plainFields  the fields object to encrypt
 * @param masterKey    32-byte master key (Tier 1)
 * @param aadContext   optional item-identifying context bound to the
 *                     ciphertext via AES-GCM AAD. When supplied, the same
 *                     context must be passed to `decryptVaultItem` or auth
 *                     tag verification fails. Closes the cross-item key swap
 *                     vector (A-High#8). When omitted, AAD is empty —
 *                     back-compat with legacy vault items.
 */
export function encryptVaultItem(
  plainFields: Record<string, unknown>,
  masterKey: Uint8Array,
  aadContext?: VaultAadContext
): EncryptedVaultItemResult {
  const aad = aadDigest(aadContext)

  // Generate random per-item DEK (Tier 3)
  const dek = randomBytes(32)

  // Generate random IV (96 bits for AES-256-GCM)
  const iv = randomBytes(12)

  // Encrypt fields JSON with DEK (and bind to AAD if provided)
  const plaintext = Buffer.from(JSON.stringify(plainFields), 'utf-8')
  const cipher = createCipheriv('aes-256-gcm', dek, iv)
  if (aad) cipher.setAAD(aad)
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()])
  const authTag = cipher.getAuthTag()

  // Wrap DEK under master key (Tier 1) using AES-256-GCM key wrap
  const dekWrapIv = randomBytes(12)
  const wrapCipher = createCipheriv('aes-256-gcm', masterKey, dekWrapIv)
  if (aad) wrapCipher.setAAD(aad)
  const wrappedDekCt = Buffer.concat([wrapCipher.update(dek), wrapCipher.final()])
  const wrapAuthTag = wrapCipher.getAuthTag()

  const fields: VaultItemEncryptedPayload = {
    __encrypted: true,
    v: 1,
    alg: 'aes-256-gcm',
    ct: ciphertext.toString('base64'),
    iv: iv.toString('base64'),
    at: authTag.toString('base64'),
  }

  const wrappedDek: VaultKeyWrap = {
    recipient: 'self',
    algorithm: 'aes-256-gcm',
    wrappedKey: wrappedDekCt.toString('base64'),
    iv: dekWrapIv.toString('base64'),
    authTag: wrapAuthTag.toString('base64'),
  }

  return { fields, wrappedDek }
}

/**
 * Decrypt a vault item's fields.
 * Unwraps the DEK using masterKey, then decrypts the fields ciphertext.
 *
 * @param aadContext   optional item-identifying context that MUST match the
 *                     value passed to `encryptVaultItem`. If the original
 *                     ciphertext was encrypted with AAD and the caller does
 *                     not supply matching context here, AES-GCM auth fails
 *                     and the decryption throws — closing the cross-item
 *                     key swap vector (A-High#8). When original ciphertext
 *                     was encrypted WITHOUT context (legacy items), pass
 *                     `undefined` here.
 */
export function decryptVaultItem(
  encryptedFields: VaultItemEncryptedPayload,
  keyWrap: VaultKeyWrap,
  masterKey: Uint8Array,
  aadContext?: VaultAadContext
): Record<string, unknown> {
  if (encryptedFields.v !== 1) {
    throw new Error(`Unsupported vault encryption version: ${encryptedFields.v}`)
  }

  if (!keyWrap.iv) {
    throw new Error('VaultKeyWrap.iv is required for AES-GCM DEK unwrapping')
  }

  if (!keyWrap.wrappedKey) {
    throw new Error('VaultKeyWrap.wrappedKey is required for DEK unwrapping')
  }

  const aad = aadDigest(aadContext)

  // Unwrap DEK
  const dekWrapIv = Buffer.from(keyWrap.iv, 'base64')
  let wrappedDekCt: Buffer
  let wrapAuthTag: Buffer

  if (keyWrap.authTag) {
    // Preferred: auth tag stored in explicit field
    wrappedDekCt = Buffer.from(keyWrap.wrappedKey, 'base64')
    wrapAuthTag = Buffer.from(keyWrap.authTag, 'base64')
  } else {
    // Legacy fallback: auth tag concatenated to wrappedKey (last 16 bytes)
    const wrappedDekFull = Buffer.from(keyWrap.wrappedKey, 'base64')
    wrappedDekCt = wrappedDekFull.subarray(0, wrappedDekFull.length - 16)
    wrapAuthTag = wrappedDekFull.subarray(wrappedDekFull.length - 16)
  }

  const unwrapDecipher = createDecipheriv('aes-256-gcm', masterKey, dekWrapIv)
  if (aad) unwrapDecipher.setAAD(aad)
  unwrapDecipher.setAuthTag(wrapAuthTag)
  const dek = Buffer.concat([unwrapDecipher.update(wrappedDekCt), unwrapDecipher.final()])

  // Decrypt fields
  const ct = Buffer.from(encryptedFields.ct, 'base64')
  const fieldIv = Buffer.from(encryptedFields.iv, 'base64')
  const at = Buffer.from(encryptedFields.at, 'base64')

  const decipher = createDecipheriv('aes-256-gcm', dek, fieldIv)
  if (aad) decipher.setAAD(aad)
  decipher.setAuthTag(at)
  const decryptedPlaintext = Buffer.concat([decipher.update(ct), decipher.final()])

  return JSON.parse(decryptedPlaintext.toString('utf-8'))
}
