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

/** Load and decrypt a wallet's private key */
export function loadWalletPrivateKey(name: string, password: string): string {
  const path = join(WALLETS_DIR(), `${name}.json`)
  if (!existsSync(path)) {
    throw new Error(`Wallet "${name}" not found`)
  }

  const ks = JSON.parse(readFileSync(path, 'utf-8')) as EncryptedKeystore
  return decryptKeystore(ks, password)
}

/** Get wallet info without decrypting */
export function getWalletInfo(name: string): WalletInfo | null {
  const path = join(WALLETS_DIR(), `${name}.json`)
  if (!existsSync(path)) return null

  const ks = JSON.parse(readFileSync(path, 'utf-8')) as EncryptedKeystore
  return { name: ks.name, address: ks.address, chain: ks.chain, createdAt: ks.createdAt }
}

// ── Encryption helpers ────────────────────────────────────────────────

function encryptKeystore(opts: {
  name: string
  address: string
  chain: string
  createdAt: string
  privateKey: Buffer
  password: string
}): EncryptedKeystore {
  const salt = randomBytes(32)
  const key = scryptSync(opts.password, salt, 32, { N: 16384, r: 8, p: 1 })
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
      kdfParams: { n: 16384, r: 8, p: 1, salt: salt.toString('hex') },
      ciphertext: encrypted.toString('hex'),
      iv: iv.toString('hex'),
      tag: tag.toString('hex'),
    },
  }
}

function decryptKeystore(ks: EncryptedKeystore, password: string): string {
  const salt = Buffer.from(ks.crypto.kdfParams.salt, 'hex')
  const key = scryptSync(password, salt, 32, {
    N: ks.crypto.kdfParams.n,
    r: ks.crypto.kdfParams.r,
    p: ks.crypto.kdfParams.p,
  })
  const iv = Buffer.from(ks.crypto.iv, 'hex')
  const tag = Buffer.from(ks.crypto.tag, 'hex')
  const ciphertext = Buffer.from(ks.crypto.ciphertext, 'hex')

  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)

  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()])
  return `0x${decrypted.toString('hex')}`
}
