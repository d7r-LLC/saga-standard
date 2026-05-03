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

  // Phase 4 (A-High#8) — vault item AAD binding tests
  describe('AAD binding', () => {
    const masterKey = new Uint8Array(32).fill(0xab)

    it('round-trips with matching AAD context', () => {
      const fields = { token: 'context-bound' }
      const ctx = {
        itemId: 'vi_alpha',
        type: 'api-key',
        name: 'Stripe',
        createdAt: '2026-05-03T12:00:00Z',
      }

      const encrypted = encryptVaultItem(fields, masterKey, ctx)
      const decrypted = decryptVaultItem(encrypted.fields, encrypted.wrappedDek, masterKey, ctx)
      expect(decrypted).toEqual(fields)
    })

    it('rejects decryption with mismatched AAD context (item swap)', () => {
      const fields = { token: 'item-A-secret' }
      const ctxA = { itemId: 'vi_A', type: 'api-key', name: 'Stripe' }
      const ctxB = { itemId: 'vi_B', type: 'api-key', name: 'GitHub' }

      const encrypted = encryptVaultItem(fields, masterKey, ctxA)

      // Swap attempt: decrypt with item B's context. AES-GCM auth fails.
      expect(() =>
        decryptVaultItem(encrypted.fields, encrypted.wrappedDek, masterKey, ctxB)
      ).toThrow()
    })

    it('AAD context is order-independent (same context, different key order)', () => {
      const fields = { token: 'order-test' }
      const ctxA = { itemId: 'vi_x', type: 'note', name: 'Test' }
      const ctxB = { name: 'Test', type: 'note', itemId: 'vi_x' }

      const encrypted = encryptVaultItem(fields, masterKey, ctxA)
      const decrypted = decryptVaultItem(encrypted.fields, encrypted.wrappedDek, masterKey, ctxB)
      expect(decrypted).toEqual(fields)
    })

    it('AAD-bound ciphertext fails to decrypt without context (legacy clients)', () => {
      const fields = { token: 'aad-only' }
      const ctx = { itemId: 'vi_aad', type: 'secret' }

      const encrypted = encryptVaultItem(fields, masterKey, ctx)

      // Caller forgets context. AES-GCM auth fails.
      expect(() => decryptVaultItem(encrypted.fields, encrypted.wrappedDek, masterKey)).toThrow()
    })

    it('legacy ciphertext (no AAD) still decrypts when no context is supplied', () => {
      const fields = { token: 'legacy' }

      // Encrypt without context (older callers)
      const encrypted = encryptVaultItem(fields, masterKey)

      // Decrypt without context (older callers)
      const decrypted = decryptVaultItem(encrypted.fields, encrypted.wrappedDek, masterKey)
      expect(decrypted).toEqual(fields)
    })
  })

  // Phase 4 (O-Low#1) — Buffer.from regression: every call uses an explicit
  // encoding argument. This test pins the contract by reading the file source.
  it('vault-crypto.ts has no encoding-less Buffer.from calls', async () => {
    const fs = await import('node:fs')
    const path = await import('node:path')
    const src = fs.readFileSync(path.join(__dirname, 'vault-crypto.ts'), 'utf-8')

    // Match every `Buffer.from(...)` call. We intentionally allow nesting and
    // commas inside the argument list; we just need to capture the full call
    // and inspect whether the top-level argument list contains a comma
    // (= encoding supplied) or not (= bare call we want to flag).
    const callPattern = /Buffer\.from\(/g
    const offending: string[] = []
    let match: RegExpExecArray | null
    while ((match = callPattern.exec(src)) !== null) {
      const start = match.index + match[0].length
      let depth = 1
      let topLevelComma = false
      let isArrayArg = false
      for (let i = start; i < src.length; i++) {
        const c = src[i]
        if (c === '(') depth++
        else if (c === ')') {
          depth--
          if (depth === 0) {
            const args = src.slice(start, i)
            if (!topLevelComma && !isArrayArg) {
              offending.push(`Buffer.from(${args})`)
            }
            break
          }
        } else if (c === ',' && depth === 1) {
          topLevelComma = true
        } else if (c === '[' && depth === 1 && !topLevelComma) {
          // Array argument (Buffer.concat([Buffer.from(x)]) etc.) — by design
          // doesn't take an encoding.
          isArrayArg = true
        }
      }
    }

    expect(
      offending,
      `Found Buffer.from(...) without explicit encoding: ${offending.join(', ')}`
    ).toEqual([])
  })
})
