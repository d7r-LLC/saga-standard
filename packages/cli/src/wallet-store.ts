// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto'
import { privateKeyToAccount } from 'viem/accounts'
import { ensureSagaDirs, getSagaDir } from './config'

export interface WalletInfo {
  name: string
  address: string
  chain: string
  createdAt: string
}

interface EncryptedKeystore {
  name: string
  address: string
  chain: string
  createdAt: string
  crypto: {
    cipher: 'aes-256-gcm'
    kdf: 'scrypt'
    kdfParams: { n: number; r: number; p: number; salt: string }
    ciphertext: string
    iv: string
    tag: string
  }
}

const WALLETS_DIR = () => join(getSagaDir(), 'wallets')

/** Generate a new wallet (random private key) and store encrypted */
export function createWallet(name: string, password: string): WalletInfo {
  ensureSagaDirs()
  const privateKey = randomBytes(32)
  const privateKeyHex = `0x${privateKey.toString('hex')}` as `0x${string}`

  // Derive real EVM address from private key using viem
  const account = privateKeyToAccount(privateKeyHex)
  const address = account.address.toLowerCase()
  const chain = 'eip155:8453'
  const createdAt = new Date().toISOString()

  const keystore = encryptKeystore({
    name,
    address,
    chain,
    createdAt,
    privateKey,
    password,
  })

  const path = join(WALLETS_DIR(), `${name}.json`)
  if (existsSync(path)) {
    throw new Error(`Wallet "${name}" already exists`)
  }
  writeFileSync(path, JSON.stringify(keystore, null, 2))

  return { name, address, chain, createdAt }
}

/** Import a wallet from an existing private key */
export function importWallet(name: string, privateKeyHex: string, password: string): WalletInfo {
  ensureSagaDirs()
  const cleanHex = privateKeyHex.startsWith('0x') ? privateKeyHex : `0x${privateKeyHex}`
  const privateKey = Buffer.from(cleanHex.slice(2), 'hex')
  if (privateKey.length !== 32) {
    throw new Error('Private key must be 32 bytes (64 hex chars)')
  }

  // Derive real EVM address
  const account = privateKeyToAccount(cleanHex as `0x${string}`)
  const address = account.address.toLowerCase()
  const chain = 'eip155:8453'
  const createdAt = new Date().toISOString()

  const keystore = encryptKeystore({ name, address, chain, createdAt, privateKey, password })
  const path = join(WALLETS_DIR(), `${name}.json`)
  if (existsSync(path)) {
    throw new Error(`Wallet "${name}" already exists`)
  }
  writeFileSync(path, JSON.stringify(keystore, null, 2))

  return { name, address, chain, createdAt }
}

/** List all stored wallets (without private keys) */
export function listWallets(): WalletInfo[] {
  ensureSagaDirs()
  const dir = WALLETS_DIR()
  if (!existsSync(dir)) return []

  return readdirSync(dir)
    .filter(f => f.endsWith('.json'))
    .map(f => {
      const ks = JSON.parse(readFileSync(join(dir, f), 'utf-8')) as EncryptedKeystore
      return {
        name: ks.name,
        address: ks.address,
        chain: ks.chain,
        createdAt: ks.createdAt,
      }
    })
}

/**
 * Clearable handle around a decrypted wallet private key.
 *
 * Phase 4 (A-Low#1): callers that hold a decrypted key for longer than a
 * single sign should prefer `loadWalletKey()` over `loadWalletPrivateKey()`
 * and call `.clear()` after the last signing operation. `.clear()` zeroes
 * the underlying byte buffer; subsequent `.privateKey` reads return an
 * empty string.
 *
 * Note: this is best-effort. JS engines may keep their own internal copies
 * of the hex string returned by `.privateKey` (strings are immutable in JS),
 * so callers should treat the hex form as transient and avoid persisting it.
 * The `Buffer` zeroing covers the canonical in-memory copy held by the SDK.
 */
export interface WalletKey {
  /**
   * 0x-prefixed hex form of the decrypted private key. Returns the empty
   * string after `.clear()` has been called.
   */
  readonly privateKey: string
  /**
   * Zero the underlying private-key Buffer in place. Idempotent.
   */
  clear(): void
}

/** Load + decrypt a wallet, returning a clearable handle. */
export function loadWalletKey(name: string, password: string): WalletKey {
  const path = join(WALLETS_DIR(), `${name}.json`)
  if (!existsSync(path)) {
    throw new Error(`Wallet "${name}" not found`)
  }

  const ks = JSON.parse(readFileSync(path, 'utf-8')) as EncryptedKeystore
  // decryptKeystoreBuffer returns the raw 32-byte Buffer; we hold it in a
  // closure and zero it on `.clear()`.
  let buf: Buffer | null = decryptKeystoreBuffer(ks, password)

  return {
    get privateKey() {
      if (!buf) return ''
      return `0x${buf.toString('hex')}`
    },
    clear() {
      if (buf) {
        buf.fill(0)
        buf = null
      }
    },
  }
}

/**
 * Load and decrypt a wallet's private key (string form).
 *
 * Existing callers continue to work; new callers that need to zero memory
 * after use should switch to `loadWalletKey()` and call `.clear()`.
 */
export function loadWalletPrivateKey(name: string, password: string): string {
  const handle = loadWalletKey(name, password)
  const hex = handle.privateKey
  // Zero the buffer immediately — the string copy held by the caller is the
  // remaining surface, but the canonical Buffer is gone.
  handle.clear()
  return hex
}

/** Get wallet info without decrypting */
export function getWalletInfo(name: string): WalletInfo | null {
  const path = join(WALLETS_DIR(), `${name}.json`)
  if (!existsSync(path)) return null

  const ks = JSON.parse(readFileSync(path, 'utf-8')) as EncryptedKeystore
  return { name: ks.name, address: ks.address, chain: ks.chain, createdAt: ks.createdAt }
}

// ── Encryption helpers ────────────────────────────────────────────────

// Phase 4 (G-Med#1): scrypt cost bumped from 2^14 (16384) to 2^16 (65536) to
// match modern OWASP guidance. Old keystores with `n: 16384` still decrypt
// because the decrypt path reads `kdfParams.n` from the file. New keystores
// store `n: 65536` and benefit from a ~4× harder KDF for the same password.
const SCRYPT_N_NEW = 65536
const SCRYPT_R = 8
const SCRYPT_P = 1

/**
 * Node's `scryptSync` enforces a default memory cap of ~32 MB; N=65536, r=8
 * needs ~64 MB. Set maxmem to a safe upper bound so the new KDF works on
 * standard installs without changing the scrypt cost itself.
 */
const SCRYPT_MAXMEM = 128 * 1024 * 1024 // 128 MB

function encryptKeystore(opts: {
  name: string
  address: string
  chain: string
  createdAt: string
  privateKey: Buffer
  password: string
}): EncryptedKeystore {
  const salt = randomBytes(32)
  const key = scryptSync(opts.password, salt, 32, {
    N: SCRYPT_N_NEW,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: SCRYPT_MAXMEM,
  })
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)

  const encrypted = Buffer.concat([cipher.update(opts.privateKey), cipher.final()])
  const tag = cipher.getAuthTag()

  return {
    name: opts.name,
    address: opts.address,
    chain: opts.chain,
    createdAt: opts.createdAt,
    crypto: {
      cipher: 'aes-256-gcm',
      kdf: 'scrypt',
      kdfParams: {
        n: SCRYPT_N_NEW,
        r: SCRYPT_R,
        p: SCRYPT_P,
        salt: salt.toString('hex'),
      },
      ciphertext: encrypted.toString('hex'),
      iv: iv.toString('hex'),
      tag: tag.toString('hex'),
    },
  }
}

/**
 * Decrypt a keystore and return the raw 32-byte private key Buffer. This is
 * the canonical in-memory form; callers can zero it via `.fill(0)` once
 * they're done using it (see `loadWalletKey` / `WalletKey.clear`).
 */
function decryptKeystoreBuffer(ks: EncryptedKeystore, password: string): Buffer {
  const salt = Buffer.from(ks.crypto.kdfParams.salt, 'hex')
  const key = scryptSync(password, salt, 32, {
    N: ks.crypto.kdfParams.n,
    r: ks.crypto.kdfParams.r,
    p: ks.crypto.kdfParams.p,
    // Match the encrypt-side cap so old N=16384 keystores AND new N=65536
    // keystores all decrypt without bumping into Node's default maxmem.
    maxmem: SCRYPT_MAXMEM,
  })
  const iv = Buffer.from(ks.crypto.iv, 'hex')
  const tag = Buffer.from(ks.crypto.tag, 'hex')
  const ciphertext = Buffer.from(ks.crypto.ciphertext, 'hex')

  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)

  return Buffer.concat([decipher.update(ciphertext), decipher.final()])
}
