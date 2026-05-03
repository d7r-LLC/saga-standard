// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const TEST_HOME = join(tmpdir(), `saga-wallet-test-${Date.now()}`)

vi.mock('node:os', async importOriginal => {
  const actual = await importOriginal<typeof import('node:os')>()
  return { ...actual, homedir: () => TEST_HOME }
})

const {
  createWallet,
  importWallet,
  listWallets,
  loadWalletKey,
  loadWalletPrivateKey,
  getWalletInfo,
} = await import('../wallet-store')

describe('wallet-store', () => {
  beforeEach(() => {
    mkdirSync(TEST_HOME, { recursive: true })
  })

  afterEach(() => {
    if (existsSync(TEST_HOME)) {
      rmSync(TEST_HOME, { recursive: true })
    }
  })

  it('creates a new wallet', () => {
    const wallet = createWallet('test-wallet', 'test-password')
    expect(wallet.name).toBe('test-wallet')
    expect(wallet.address).toMatch(/^0x/)
    expect(wallet.chain).toBe('eip155:8453')
  })

  it('rejects duplicate wallet names', () => {
    createWallet('dup-wallet', 'pass')
    expect(() => createWallet('dup-wallet', 'pass')).toThrow('already exists')
  })

  it('lists wallets', () => {
    createWallet('w1', 'pass')
    createWallet('w2', 'pass')
    const wallets = listWallets()
    expect(wallets.length).toBe(2)
    expect(wallets.map(w => w.name).sort()).toEqual(['w1', 'w2'])
  })

  it('encrypts and decrypts private key', () => {
    createWallet('crypto-test', 'strong-password')
    const decrypted = loadWalletPrivateKey('crypto-test', 'strong-password')
    expect(decrypted).toMatch(/^0x[0-9a-f]{64}$/)
  })

  it('rejects wrong password', () => {
    createWallet('password-test', 'correct')
    expect(() => loadWalletPrivateKey('password-test', 'wrong')).toThrow()
  })

  it('gets wallet info without decrypting', () => {
    createWallet('info-test', 'pass')
    const info = getWalletInfo('info-test')
    expect(info).not.toBeNull()
    expect(info!.name).toBe('info-test')
    expect(info!.address).toMatch(/^0x/)
  })

  it('returns null for nonexistent wallet', () => {
    expect(getWalletInfo('nonexistent')).toBeNull()
  })

  it('imports a wallet from private key', () => {
    const privateKey = `0x${'ab'.repeat(32)}`
    const wallet = importWallet('imported', privateKey, 'pass')
    expect(wallet.name).toBe('imported')
    expect(wallet.address).toMatch(/^0x/)

    const decrypted = loadWalletPrivateKey('imported', 'pass')
    expect(decrypted).toMatch(/^0x[0-9a-f]{64}$/)
  })

  // Phase 4 (G-Med#1) — new keystores use scrypt N=65536
  it('writes new keystores with N=65536 (Phase 4 KDF bump)', async () => {
    const fs = await import('node:fs')
    const path = await import('node:path')
    createWallet('kdf-test', 'pw')
    const ksPath = path.join(TEST_HOME, '.saga', 'wallets', 'kdf-test.json')
    const ks = JSON.parse(fs.readFileSync(ksPath, 'utf-8'))
    expect(ks.crypto.kdfParams.n).toBe(65536)
  })

  // Phase 4 (G-Med#1) — old N=16384 keystores still decrypt
  it('decrypts legacy N=16384 keystores correctly', async () => {
    // Create a wallet with the new code, then forge an old-style keystore by
    // re-encrypting under N=16384 to prove the decrypt path honors the
    // recorded `kdfParams.n`.
    const fs = await import('node:fs')
    const path = await import('node:path')
    const crypto = await import('node:crypto')

    const walletsDir = path.join(TEST_HOME, '.saga', 'wallets')
    fs.mkdirSync(walletsDir, { recursive: true })

    const privateKey = Buffer.from('cd'.repeat(32), 'hex')
    const password = 'legacy-pw'
    const salt = crypto.randomBytes(32)
    const key = crypto.scryptSync(password, salt, 32, { N: 16384, r: 8, p: 1 })
    const iv = crypto.randomBytes(12)
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
    const encrypted = Buffer.concat([cipher.update(privateKey), cipher.final()])
    const tag = cipher.getAuthTag()

    const legacyKs = {
      name: 'legacy',
      address: `0x${'aa'.repeat(20)}`,
      chain: 'eip155:8453',
      createdAt: '2025-01-01T00:00:00Z',
      crypto: {
        cipher: 'aes-256-gcm',
        kdf: 'scrypt',
        kdfParams: { n: 16384, r: 8, p: 1, salt: salt.toString('hex') },
        ciphertext: encrypted.toString('hex'),
        iv: iv.toString('hex'),
        tag: tag.toString('hex'),
      },
    }
    fs.writeFileSync(path.join(walletsDir, 'legacy.json'), JSON.stringify(legacyKs))

    const decrypted = loadWalletPrivateKey('legacy', password)
    expect(decrypted).toBe(`0x${'cd'.repeat(32)}`)
  })

  // Phase 4 (A-Low#1) — clearable WalletKey handle
  it('loadWalletKey returns a handle whose private key can be cleared', () => {
    const privateKey = `0x${'ef'.repeat(32)}`
    importWallet('clearable', privateKey, 'pass')

    const handle = loadWalletKey('clearable', 'pass')
    expect(handle.privateKey).toBe(privateKey)

    handle.clear()
    expect(handle.privateKey).toBe('')

    // Idempotent
    handle.clear()
    expect(handle.privateKey).toBe('')
  })
})
