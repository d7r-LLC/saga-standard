// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto'
import type { VaultItemEncryptedPayload, VaultKeyWrap } from '../types/layers'

const VAULT_INFO = 'saga-vault-v1'

/** Result of encrypting a vault item's fields */
export interface EncryptedVaultItemResult {
  /** The encrypted payload to store as `item.fields` */
  fields: VaultItemEncryptedPayload
  /** The DEK wrapped under the master key, to store as `item.keyWraps[0]` */
  wrappedDek: VaultKeyWrap
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
 */
export function encryptVaultItem(
  plainFields: Record<string, unknown>,
  masterKey: Uint8Array
): EncryptedVaultItemResult {
  // Generate random per-item DEK (Tier 3)
  const dek = randomBytes(32)

  // Generate random IV (96 bits for AES-256-GCM)
  const iv = randomBytes(12)

  // Encrypt fields JSON with DEK
  const plaintext = Buffer.from(JSON.stringify(plainFields), 'utf-8')
  const cipher = createCipheriv('aes-256-gcm', dek, iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()])
  const authTag = cipher.getAuthTag()

  // Wrap DEK under master key (Tier 1) using AES-256-GCM key wrap
  const dekWrapIv = randomBytes(12)
  const wrapCipher = createCipheriv('aes-256-gcm', masterKey, dekWrapIv)
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
 */
export function decryptVaultItem(
  encryptedFields: VaultItemEncryptedPayload,
  keyWrap: VaultKeyWrap,
  masterKey: Uint8Array
): Record<string, unknown> {
  if (encryptedFields.v !== 1) {
    throw new Error(`Unsupported vault encryption version: ${encryptedFields.v}`)
  }

  if (!keyWrap.iv) {
    throw new Error('VaultKeyWrap.iv is required for AES-GCM DEK unwrapping')
  }

  if (!keyWrap.authTag && !keyWrap.wrappedKey) {
    throw new Error('VaultKeyWrap.wrappedKey is required for DEK unwrapping')
  }

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
  unwrapDecipher.setAuthTag(wrapAuthTag)
  const dek = Buffer.concat([unwrapDecipher.update(wrappedDekCt), unwrapDecipher.final()])

  // Decrypt fields
  const ct = Buffer.from(encryptedFields.ct, 'base64')
  const fieldIv = Buffer.from(encryptedFields.iv, 'base64')
  const at = Buffer.from(encryptedFields.at, 'base64')

  const decipher = createDecipheriv('aes-256-gcm', dek, fieldIv)
  decipher.setAuthTag(at)
  const decryptedPlaintext = Buffer.concat([decipher.update(ct), decipher.final()])

  return JSON.parse(decryptedPlaintext.toString('utf-8'))
}
