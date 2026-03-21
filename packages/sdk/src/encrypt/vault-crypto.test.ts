// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { describe, expect, it } from 'vitest'
import { decryptVaultItem, deriveVaultMasterKey, encryptVaultItem } from './vault-crypto'

describe('deriveVaultMasterKey', () => {
  it('derives a 32-byte key from wallet private key and salt', () => {
    const walletPrivateKey = new Uint8Array(32).fill(0xab)
    const salt = new Uint8Array(32).fill(0xcd)

    const masterKey = deriveVaultMasterKey(walletPrivateKey, salt)

    expect(masterKey).toBeInstanceOf(Uint8Array)
    expect(masterKey.length).toBe(32)
  })

  it('produces different keys for different private keys', () => {
    const salt = new Uint8Array(32).fill(0xcd)

    const key1Input = new Uint8Array(32).fill(0xaa)
    const key2Input = new Uint8Array(32).fill(0xbb)

    const mk1 = deriveVaultMasterKey(key1Input, salt)
    const mk2 = deriveVaultMasterKey(key2Input, salt)

    expect(Buffer.from(mk1).toString('hex')).not.toBe(Buffer.from(mk2).toString('hex'))
  })

  it('produces same key for same inputs (deterministic)', () => {
    const walletPrivateKey = new Uint8Array(32).fill(0xab)
    const salt = new Uint8Array(32).fill(0xcd)

    const mk1 = deriveVaultMasterKey(walletPrivateKey, salt)
    const mk2 = deriveVaultMasterKey(walletPrivateKey, salt)

    expect(Buffer.from(mk1).toString('hex')).toBe(Buffer.from(mk2).toString('hex'))
  })
})

describe('encryptVaultItem + decryptVaultItem', () => {
  it('round-trips JSON fields through AES-256-GCM', () => {
    const masterKey = new Uint8Array(32).fill(0xab)
    const fields = {
      username: 'test-agent',
      apiKey: 'test-value-not-real',
      url: 'https://example.test',
    }

    const encrypted = encryptVaultItem(fields, masterKey)

    expect(encrypted.fields.__encrypted).toBe(true)
    expect(encrypted.fields.v).toBe(1)
    expect(encrypted.fields.alg).toBe('aes-256-gcm')
    expect(encrypted.fields.ct).toBeTruthy()
    expect(encrypted.fields.iv).toBeTruthy()
    expect(encrypted.fields.at).toBeTruthy()

    // Ciphertext should NOT be the base64 of the plaintext
    const decoded = Buffer.from(encrypted.fields.ct, 'base64').toString('utf-8')
    expect(() => JSON.parse(decoded)).toThrow()

    expect(encrypted.wrappedDek).toBeTruthy()
    expect(encrypted.wrappedDek.recipient).toBe('self')
    expect(encrypted.wrappedDek.algorithm).toBe('aes-256-gcm')
    expect(encrypted.wrappedDek.authTag).toBeTruthy()

    const decrypted = decryptVaultItem(encrypted.fields, encrypted.wrappedDek, masterKey)
    expect(decrypted).toEqual(fields)
  })

  it('rejects decryption with wrong master key', () => {
    const masterKey = new Uint8Array(32).fill(0xab)
    const wrongKey = new Uint8Array(32).fill(0xcc)
    const fields = { token: 'test-only' }

    const encrypted = encryptVaultItem(fields, masterKey)

    expect(() => decryptVaultItem(encrypted.fields, encrypted.wrappedDek, wrongKey)).toThrow()
  })

  it('produces different ciphertext for same plaintext (random IV + DEK)', () => {
    const masterKey = new Uint8Array(32).fill(0xab)
    const fields = { token: 'same-input' }

    const e1 = encryptVaultItem(fields, masterKey)
    const e2 = encryptVaultItem(fields, masterKey)

    expect(e1.fields.ct).not.toBe(e2.fields.ct)
    expect(e1.fields.iv).not.toBe(e2.fields.iv)
  })

  it('rejects decryption with missing keyWrap.iv', () => {
    const masterKey = new Uint8Array(32).fill(0xab)
    const fields = { token: 'test-only' }

    const encrypted = encryptVaultItem(fields, masterKey)
    const badKeyWrap = { ...encrypted.wrappedDek, iv: undefined }

    expect(() => decryptVaultItem(encrypted.fields, badKeyWrap as any, masterKey)).toThrow(
      'VaultKeyWrap.iv is required'
    )
  })
})
