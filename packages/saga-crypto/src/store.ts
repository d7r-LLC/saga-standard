// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import type { AesGcmResult, SagaKeyRing, StorageBackend } from './types'

/** Current storage format version */
const STORE_FORMAT_VERSION = 1

// ── MemoryBackend ────────────────────────────────────────────────

/**
 * In-memory StorageBackend implementation for testing.
 * Data lives only for the lifetime of the process.
 */
export class MemoryBackend implements StorageBackend {
  private _data = new Map<string, Uint8Array>()

  async get(key: string): Promise<Uint8Array | null> {
    const value = this._data.get(key)
    return value ? new Uint8Array(value) : null
  }

  async put(key: string, value: Uint8Array): Promise<void> {
    this._data.set(key, new Uint8Array(value))
  }

  async delete(key: string): Promise<void> {
    this._data.delete(key)
  }

  async list(prefix?: string): Promise<string[]> {
    const keys: string[] = []
    for (const key of this._data.keys()) {
      if (!prefix || key.startsWith(prefix)) {
        keys.push(key)
      }
    }
    return keys
  }
}

// ── EncryptedStore ───────────────────────────────────────────────

export interface EncryptedStore {
  put(key: string, value: unknown): Promise<void>
  get<T = unknown>(key: string): Promise<T | null>
  delete(key: string): Promise<void>
  query(filter: { prefix?: string }): Promise<Array<{ key: string; value: unknown }>>
}

/**
 * Serialize an AES-GCM result into a single byte buffer.
 * Format: [version(1)] [ivLen(1)] [authTagLen(1)] [iv] [authTag] [ciphertext]
 */
function packEncrypted(result: AesGcmResult): Uint8Array {
  const totalLen = 3 + result.iv.length + result.authTag.length + result.ciphertext.length
  const buf = new Uint8Array(totalLen)
  buf[0] = STORE_FORMAT_VERSION
  buf[1] = result.iv.length
  buf[2] = result.authTag.length
  let offset = 3
  buf.set(result.iv, offset)
  offset += result.iv.length
  buf.set(result.authTag, offset)
  offset += result.authTag.length
  buf.set(result.ciphertext, offset)
  return buf
}

/** Deserialize a packed encrypted buffer back to AES-GCM components. */
function unpackEncrypted(buf: Uint8Array): AesGcmResult {
  if (buf[0] !== STORE_FORMAT_VERSION) {
    throw new Error(`Unsupported store format version: ${buf[0]}`)
  }
  const ivLen = buf[1]
  const authTagLen = buf[2]
  let offset = 3
  const iv = buf.slice(offset, offset + ivLen)
  offset += ivLen
  const authTag = buf.slice(offset, offset + authTagLen)
  offset += authTagLen
  const ciphertext = buf.slice(offset)
  return { ciphertext, iv, authTag }
}

/**
 * Create an encrypted key-value store.
 *
 * Values are JSON-serialized, encrypted with the SagaKeyRing's wallet-derived
 * AES-256 storage key, and persisted to the StorageBackend.
 *
 * @param keyRing - Unlocked SagaKeyRing (provides encryptStorage/decryptStorage)
 * @param backend - Pluggable storage backend (MemoryBackend for tests, FS/KV for prod)
 */
export function createEncryptedStore(
  keyRing: SagaKeyRing,
  backend: StorageBackend
): EncryptedStore {
  return {
    async put(key: string, value: unknown): Promise<void> {
      const json = JSON.stringify(value)
      const plaintext = new TextEncoder().encode(json)
      const encrypted = await keyRing.encryptStorage(plaintext)
      const packed = packEncrypted(encrypted)
      await backend.put(key, packed)
    },

    async get<T = unknown>(key: string): Promise<T | null> {
      const raw = await backend.get(key)
      if (!raw) return null
      const encrypted = unpackEncrypted(raw)
      const plaintext = await keyRing.decryptStorage(encrypted)
      const json = new TextDecoder().decode(plaintext)
      return JSON.parse(json) as T
    },

    async delete(key: string): Promise<void> {
      await backend.delete(key)
    },

    async query(filter: { prefix?: string }): Promise<Array<{ key: string; value: unknown }>> {
      const keys = await backend.list(filter.prefix)
      const results: Array<{ key: string; value: unknown }> = []
      for (const key of keys) {
        const value = await this.get(key)
        if (value !== null) {
          results.push({ key, value })
        }
      }
      return results
    },
  }
}
