// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { beforeEach, describe, expect, it } from 'vitest'
import { privateKeyToAccount } from 'viem/accounts'
import { createMockD1, runMigrations } from './test-helpers'
import { drizzle } from 'drizzle-orm/d1'
import { directories } from '../db/schema'
import { generateFederationChallenge, verifyFederationAuth } from '../relay/federation-auth'

// Hardhat's first account — well-known test key, NOT a real wallet
const TEST_PRIVATE_KEY =
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as const // gitleaks:allow
const testAccount = privateKeyToAccount(TEST_PRIVATE_KEY)
const TEST_WALLET = testAccount.address.toLowerCase() // 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266

async function signChallenge(challenge: string): Promise<string> {
  return testAccount.signMessage({ message: challenge })
}

describe('generateFederationChallenge', () => {
  it('returns a challenge string and expiry', () => {
    const { challenge, expiresAt } = generateFederationChallenge()
    expect(challenge).toMatch(/^saga-federation:/)
    expect(new Date(expiresAt).getTime()).toBeGreaterThan(Date.now())
  })

  it('generates unique challenges', () => {
    const c1 = generateFederationChallenge()
    const c2 = generateFederationChallenge()
    expect(c1.challenge).not.toBe(c2.challenge)
  })
})

describe('verifyFederationAuth', () => {
  let db: D1Database

  beforeEach(async () => {
    db = createMockD1()
    await runMigrations(db)

    const orm = drizzle(db)
    await orm.insert(directories).values({
      id: 'dir_epic',
      directoryId: 'epic-hub',
      url: 'https://epic.example.com',
      operatorWallet: TEST_WALLET,
      conformanceLevel: 'full',
      status: 'active',
      chain: 'eip155:84532',
      tokenId: 1,
      contractAddress: '0xdircontract',
      registeredAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })

    await orm.insert(directories).values({
      id: 'dir_suspended',
      directoryId: 'suspended-hub',
      url: 'https://suspended.example.com',
      operatorWallet: TEST_WALLET,
      conformanceLevel: 'basic',
      status: 'suspended',
      chain: 'eip155:84532',
      tokenId: 2,
      contractAddress: '0xdircontract',
      registeredAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })

    await orm.insert(directories).values({
      id: 'dir_no_nft',
      directoryId: 'no-nft-hub',
      url: 'https://nonft.example.com',
      operatorWallet: TEST_WALLET,
      conformanceLevel: 'basic',
      status: 'active',
      chain: 'eip155:84532',
      // tokenId is null — no NFT
      registeredAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })

    // wallet-mismatch hub: seeded with a different wallet address
    await orm.insert(directories).values({
      id: 'dir_mismatch',
      directoryId: 'mismatch-hub',
      url: 'https://mismatch.example.com',
      operatorWallet: '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
      conformanceLevel: 'basic',
      status: 'active',
      chain: 'eip155:84532',
      tokenId: 3,
      contractAddress: '0xdircontract',
      registeredAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
  })

  it('authenticates a valid directory with active status and NFT', async () => {
    const { challenge, expiresAt } = generateFederationChallenge()
    const signature = await signChallenge(challenge)
    const result = await verifyFederationAuth(
      'epic-hub',
      TEST_WALLET,
      signature,
      challenge,
      expiresAt,
      db
    )
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.directoryId).toBe('epic-hub')
      expect(result.operatorWallet).toBe(TEST_WALLET)
    }
  })

  it('rejects unknown directoryId', async () => {
    const { challenge, expiresAt } = generateFederationChallenge()
    const signature = await signChallenge(challenge)
    const result = await verifyFederationAuth(
      'unknown-hub',
      TEST_WALLET,
      signature,
      challenge,
      expiresAt,
      db
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('not found')
  })

  it('rejects wallet mismatch', async () => {
    // mismatch-hub is seeded with a different wallet; TEST_WALLET signature verifies
    // but the DB record has a different address → "does not match"
    const { challenge, expiresAt } = generateFederationChallenge()
    const signature = await signChallenge(challenge)
    const result = await verifyFederationAuth(
      'mismatch-hub',
      TEST_WALLET,
      signature,
      challenge,
      expiresAt,
      db
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('does not match')
  })

  it('rejects directory without NFT', async () => {
    const { challenge, expiresAt } = generateFederationChallenge()
    const signature = await signChallenge(challenge)
    const result = await verifyFederationAuth(
      'no-nft-hub',
      TEST_WALLET,
      signature,
      challenge,
      expiresAt,
      db
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('NFT')
  })

  it('rejects suspended directory', async () => {
    const { challenge, expiresAt } = generateFederationChallenge()
    const signature = await signChallenge(challenge)
    const result = await verifyFederationAuth(
      'suspended-hub',
      TEST_WALLET,
      signature,
      challenge,
      expiresAt,
      db
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('not active')
  })

  it('rejects expired challenge', async () => {
    const { challenge } = generateFederationChallenge()
    const expiredAt = new Date(Date.now() - 1000).toISOString()
    const signature = await signChallenge(challenge)
    const result = await verifyFederationAuth(
      'epic-hub',
      TEST_WALLET,
      signature,
      challenge,
      expiredAt,
      db
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('expired')
  })

  it('rejects invalid challenge format', async () => {
    const { expiresAt } = generateFederationChallenge()
    const signature = await signChallenge('bad-format')
    const result = await verifyFederationAuth(
      'epic-hub',
      TEST_WALLET,
      signature,
      'bad-format',
      expiresAt,
      db
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('format')
  })
})
