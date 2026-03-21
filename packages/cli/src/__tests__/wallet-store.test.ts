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

const { createWallet, importWallet, listWallets, loadWalletPrivateKey, getWalletInfo } =
  await import('../wallet-store')

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
})
