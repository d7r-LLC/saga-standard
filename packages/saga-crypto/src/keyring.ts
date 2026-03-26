// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { aesGcmDecrypt, aesGcmEncrypt, generateDEK } from '@epicdm/flowstate-crypto'
import { deriveStorageKey, deriveX25519KeyPair } from './key-derivation'
import { mutualDecrypt, mutualEncrypt, sealedBoxDecrypt, sealedBoxEncrypt } from './nacl'
import type {
  AesGcmResult,
  GroupEncryptionResult,
  MutualEncryptionResult,
  PrivateEncryptionResult,
  SagaKeyRing,
} from './types'

/**
 * Create a SagaKeyRing instance.
 *
 * The KeyRing is an opaque crypto oracle — it holds wallet-derived keys
 * internally and never exposes raw private keys or symmetric keys through
 * its public interface. Callers pass data in and get encrypted/decrypted
 * data out.
 */
export function createSagaKeyRing(): SagaKeyRing {
  // Internal mutable state — never exposed
  let _x25519SecretKey: Uint8Array | null = null
  let _x25519PublicKey: Uint8Array | null = null
  let _storageKey: Uint8Array | null = null
  let _unlocked = false

  // Group keys: groupKeyId → raw AES-256 key bytes
  const _groupKeys = new Map<string, Uint8Array>()

  function assertUnlocked(): void {
    if (!_unlocked) {
      throw new Error('SagaKeyRing is locked. Call unlockWallet() first.')
    }
  }

  /** Returns a guaranteed-non-null byte array; assertUnlocked() must be called first. */
  function unwrap(material: Uint8Array | null): Uint8Array {
    if (!material) {
      throw new Error('Key material not available — call unlockWallet() first')
    }
    return material
  }

  function clearKeys(): void {
    if (_x25519SecretKey) {
      _x25519SecretKey.fill(0)
      _x25519SecretKey = null
    }
    _x25519PublicKey = null
    if (_storageKey) {
      _storageKey.fill(0)
      _storageKey = null
    }
    for (const [, key] of _groupKeys) {
      key.fill(0)
    }
    _groupKeys.clear()
    _unlocked = false
  }

  const keyRing: SagaKeyRing = {
    get isUnlocked() {
      return _unlocked
    },

    async unlockWallet(walletPrivateKey: Uint8Array): Promise<void> {
      clearKeys()
      const kp = await deriveX25519KeyPair(walletPrivateKey)
      _x25519SecretKey = kp.secretKey
      _x25519PublicKey = kp.publicKey
      _storageKey = await deriveStorageKey(walletPrivateKey)
      _unlocked = true
    },

    lock(): void {
      clearKeys()
    },

    // ── Private scope ──

    async encryptPrivate(plaintext: Uint8Array): Promise<PrivateEncryptionResult> {
      assertUnlocked()
      // Generate random DEK, encrypt payload with AES-GCM
      const dek = generateDEK()
      const encrypted = await aesGcmEncrypt(dek, plaintext)
      // Wrap DEK with sealedbox (ephemeral sender → own x25519 public key)
      const wrappedDek = sealedBoxEncrypt(dek, unwrap(_x25519PublicKey))
      // Zero DEK
      dek.fill(0)
      return {
        ciphertext: encrypted.ciphertext,
        iv: encrypted.iv,
        authTag: encrypted.authTag,
        wrappedDek,
      }
    },

    async decryptPrivate(encrypted: PrivateEncryptionResult): Promise<Uint8Array> {
      assertUnlocked()
      // Unwrap DEK from sealedbox
      const dek = sealedBoxDecrypt(encrypted.wrappedDek, unwrap(_x25519SecretKey))
      // Decrypt payload with AES-GCM
      const plaintext = await aesGcmDecrypt(dek, {
        ciphertext: encrypted.ciphertext,
        iv: encrypted.iv,
        authTag: encrypted.authTag,
      })
      dek.fill(0)
      return plaintext
    },

    // ── Mutual scope ──

    encryptMutual(plaintext: Uint8Array, recipientPublicKey: Uint8Array): MutualEncryptionResult {
      assertUnlocked()
      return mutualEncrypt(plaintext, recipientPublicKey, unwrap(_x25519SecretKey))
    },

    decryptMutual(encrypted: MutualEncryptionResult, senderPublicKey: Uint8Array): Uint8Array {
      assertUnlocked()
      return mutualDecrypt(encrypted, senderPublicKey, unwrap(_x25519SecretKey))
    },

    // ── Group scope ──

    async encryptGroup(plaintext: Uint8Array, groupKeyId: string): Promise<GroupEncryptionResult> {
      assertUnlocked()
      const groupKey = _groupKeys.get(groupKeyId)
      if (!groupKey) {
        throw new Error(`No group key found for groupKeyId: ${groupKeyId}`)
      }
      // Random DEK, encrypt payload
      const dek = generateDEK()
      const encrypted = await aesGcmEncrypt(dek, plaintext)
      // Wrap DEK under group key (AES-GCM)
      const wrappedDek = await aesGcmEncrypt(groupKey, dek)
      dek.fill(0)
      return {
        ciphertext: encrypted.ciphertext,
        iv: encrypted.iv,
        authTag: encrypted.authTag,
        wrappedDek,
      }
    },

    async decryptGroup(encrypted: GroupEncryptionResult, groupKeyId: string): Promise<Uint8Array> {
      assertUnlocked()
      const groupKey = _groupKeys.get(groupKeyId)
      if (!groupKey) {
        throw new Error(`No group key found for groupKeyId: ${groupKeyId}`)
      }
      // Unwrap DEK
      const dek = await aesGcmDecrypt(groupKey, encrypted.wrappedDek)
      // Decrypt payload
      const plaintext = await aesGcmDecrypt(dek, {
        ciphertext: encrypted.ciphertext,
        iv: encrypted.iv,
        authTag: encrypted.authTag,
      })
      dek.fill(0)
      return plaintext
    },

    // ── Group key management ──

    addGroupKey(
      groupKeyId: string,
      wrappedKey: MutualEncryptionResult,
      senderPublicKey: Uint8Array
    ): void {
      assertUnlocked()
      const rawKey = mutualDecrypt(wrappedKey, senderPublicKey, unwrap(_x25519SecretKey))
      _groupKeys.set(groupKeyId, new Uint8Array(rawKey))
    },

    wrapGroupKeyFor(groupKeyId: string, recipientPublicKey: Uint8Array): MutualEncryptionResult {
      assertUnlocked()
      const groupKey = _groupKeys.get(groupKeyId)
      if (!groupKey) {
        throw new Error(`No group key found for groupKeyId: ${groupKeyId}`)
      }
      return mutualEncrypt(groupKey, recipientPublicKey, unwrap(_x25519SecretKey))
    },

    injectGroupKey(groupKeyId: string, rawKey: Uint8Array): void {
      assertUnlocked()
      _groupKeys.set(groupKeyId, new Uint8Array(rawKey))
    },

    hasGroupKey(groupKeyId: string): boolean {
      return _groupKeys.has(groupKeyId)
    },

    // ── Storage encryption ──

    async encryptStorage(plaintext: Uint8Array): Promise<AesGcmResult> {
      assertUnlocked()
      return aesGcmEncrypt(unwrap(_storageKey), plaintext)
    },

    async decryptStorage(encrypted: AesGcmResult): Promise<Uint8Array> {
      assertUnlocked()
      return aesGcmDecrypt(unwrap(_storageKey), {
        ciphertext: encrypted.ciphertext,
        iv: encrypted.iv,
        authTag: encrypted.authTag,
      })
    },

    // ── Identity ──

    getPublicKey(): Uint8Array {
      assertUnlocked()
      return new Uint8Array(unwrap(_x25519PublicKey))
    },
  }

  return keyRing
}
