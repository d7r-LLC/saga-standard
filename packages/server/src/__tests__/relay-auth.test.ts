// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { beforeEach, describe, expect, it } from 'vitest'
import { privateKeyToAccount } from 'viem/accounts'
import { createMockD1, runMigrations } from './test-helpers'
import { generateWsChallenge, reVerifyNft, verifyWsAuth } from '../relay/ws-auth'
import { drizzle } from 'drizzle-orm/d1'
import { agents, organizations } from '../db/schema'

// Hardhat's first account — well-known test key, NOT a real wallet
const TEST_PRIVATE_KEY =
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as const // gitleaks:allow
const testAccount = privateKeyToAccount(TEST_PRIVATE_KEY)
const TEST_WALLET = testAccount.address.toLowerCase() // 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266

async function signChallenge(challenge: string): Promise<string> {
  return testAccount.signMessage({ message: challenge })
}

describe('generateWsChallenge', () => {
  it('returns a challenge string and expiry', () => {
    const { challenge, expiresAt } = generateWsChallenge()
    expect(challenge).toMatch(/^saga-relay:/)
    expect(new Date(expiresAt).getTime()).toBeGreaterThan(Date.now())
  })

  it('generates unique challenges', () => {
    const c1 = generateWsChallenge()
    const c2 = generateWsChallenge()
    expect(c1.challenge).not.toBe(c2.challenge)
  })
})

describe('verifyWsAuth', () => {
  let db: D1Database

  beforeEach(async () => {
    db = createMockD1()
    await runMigrations(db)

    const orm = drizzle(db)
    await orm.insert(agents).values({
      id: 'agent_alice',
      handle: 'alice',
      walletAddress: TEST_WALLET,
      chain: 'eip155:8453',
      registeredAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      tokenId: 42,
      contractAddress: '0xcontract',
    })

    await orm.insert(agents).values({
      id: 'agent_bob_nonfted',
      handle: 'bob',
      walletAddress: TEST_WALLET,
      chain: 'eip155:8453',
      registeredAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      // tokenId is null — no NFT
    })

    // alice-mismatch: seeded with a different wallet address for the mismatch test
    await orm.insert(agents).values({
      id: 'agent_alice_mismatch',
      handle: 'alice-mismatch',
      walletAddress: '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
      chain: 'eip155:8453',
      registeredAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      tokenId: 55,
      contractAddress: '0xcontract',
    })

    await orm.insert(organizations).values({
      id: 'org_acme',
      handle: 'acme',
      name: 'Acme Corp',
      walletAddress: TEST_WALLET,
      chain: 'eip155:8453',
      registeredAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      tokenId: 99,
      contractAddress: '0xcontract',
    })
  })

  it('authenticates agent with valid NFT', async () => {
    const { challenge, expiresAt } = generateWsChallenge()
    const signature = await signChallenge(challenge)
    const result = await verifyWsAuth(
      TEST_WALLET,
      'eip155:8453',
      'alice',
      signature,
      challenge,
      expiresAt,
      db
    )
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.state.handle).toBe('alice')
      expect(result.state.walletAddress).toBe(TEST_WALLET)
    }
  })

  it('authenticates organization with valid NFT', async () => {
    const { challenge, expiresAt } = generateWsChallenge()
    const signature = await signChallenge(challenge)
    const result = await verifyWsAuth(
      TEST_WALLET,
      'eip155:8453',
      'acme',
      signature,
      challenge,
      expiresAt,
      db
    )
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.state.handle).toBe('acme')
    }
  })

  it('rejects agent without NFT', async () => {
    const { challenge, expiresAt } = generateWsChallenge()
    const signature = await signChallenge(challenge)
    const result = await verifyWsAuth(
      TEST_WALLET,
      'eip155:8453',
      'bob',
      signature,
      challenge,
      expiresAt,
      db
    )
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain('NFT')
    }
  })

  it('rejects unknown handle', async () => {
    const { challenge, expiresAt } = generateWsChallenge()
    const signature = await signChallenge(challenge)
    const result = await verifyWsAuth(
      TEST_WALLET,
      'eip155:8453',
      'unknown',
      signature,
      challenge,
      expiresAt,
      db
    )
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain('not found')
    }
  })

  it('rejects wallet mismatch', async () => {
    // alice-mismatch is seeded with a different wallet; TEST_WALLET signature verifies
    // but the DB record has a different address → "does not match"
    const { challenge, expiresAt } = generateWsChallenge()
    const signature = await signChallenge(challenge)
    const result = await verifyWsAuth(
      TEST_WALLET,
      'eip155:8453',
      'alice-mismatch',
      signature,
      challenge,
      expiresAt,
      db
    )
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain('does not match')
    }
  })

  it('rejects expired challenge', async () => {
    const { challenge } = generateWsChallenge()
    const expiredAt = new Date(Date.now() - 1000).toISOString()
    const signature = await signChallenge(challenge)
    const result = await verifyWsAuth(
      TEST_WALLET,
      'eip155:8453',
      'alice',
      signature,
      challenge,
      expiredAt,
      db
    )
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain('expired')
    }
  })

  it('rejects invalid challenge format', async () => {
    const { expiresAt } = generateWsChallenge()
    const signature = await signChallenge('bad-format')
    const result = await verifyWsAuth(
      TEST_WALLET,
      'eip155:8453',
      'alice',
      signature,
      'bad-format',
      expiresAt,
      db
    )
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain('format')
    }
  })

  it('rejects empty signature', async () => {
    const { challenge, expiresAt } = generateWsChallenge()
    const result = await verifyWsAuth(
      TEST_WALLET,
      'eip155:8453',
      'alice',
      'short',
      challenge,
      expiresAt,
      db
    )
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain('signature')
    }
  })
})

describe('reVerifyNft', () => {
  let db: D1Database

  beforeEach(async () => {
    db = createMockD1()
    await runMigrations(db)

    const orm = drizzle(db)
    await orm.insert(agents).values({
      id: 'agent_alice',
      handle: 'alice',
      walletAddress: TEST_WALLET,
      chain: 'eip155:8453',
      registeredAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      tokenId: 42,
    })
  })

  it('returns true for valid NFT holder', async () => {
    expect(await reVerifyNft('alice', TEST_WALLET, db)).toBe(true)
  })

  it('returns false for wallet mismatch', async () => {
    expect(await reVerifyNft('alice', '0xwrong', db)).toBe(false)
  })

  it('returns false for unknown handle', async () => {
    expect(await reVerifyNft('unknown', '0xunknown', db)).toBe(false)
  })
})
