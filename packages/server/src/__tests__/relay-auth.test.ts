// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { beforeEach, describe, expect, it } from 'vitest'
import { createMockD1, runMigrations } from './test-helpers'
import { generateWsChallenge, reVerifyNft, verifyWsAuth } from '../relay/ws-auth'
import { drizzle } from 'drizzle-orm/d1'
import { agents, organizations } from '../db/schema'

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
      walletAddress: '0xalice',
      chain: 'eip155:8453',
      registeredAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      tokenId: 42,
      contractAddress: '0xcontract',
    })

    await orm.insert(agents).values({
      id: 'agent_bob_nonfted',
      handle: 'bob',
      walletAddress: '0xbob',
      chain: 'eip155:8453',
      registeredAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      // tokenId is null — no NFT
    })

    await orm.insert(organizations).values({
      id: 'org_acme',
      handle: 'acme',
      name: 'Acme Corp',
      walletAddress: '0xacme',
      chain: 'eip155:8453',
      registeredAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      tokenId: 99,
      contractAddress: '0xcontract',
    })
  })

  it('authenticates agent with valid NFT', async () => {
    const { challenge, expiresAt } = generateWsChallenge()
    const result = await verifyWsAuth(
      '0xalice',
      'eip155:8453',
      'alice',
      'valid-signature-1234567890',
      challenge,
      expiresAt,
      db
    )
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.state.handle).toBe('alice')
      expect(result.state.walletAddress).toBe('0xalice')
    }
  })

  it('authenticates organization with valid NFT', async () => {
    const { challenge, expiresAt } = generateWsChallenge()
    const result = await verifyWsAuth(
      '0xacme',
      'eip155:8453',
      'acme',
      'valid-signature-1234567890',
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
    const result = await verifyWsAuth(
      '0xbob',
      'eip155:8453',
      'bob',
      'valid-signature-1234567890',
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
    const result = await verifyWsAuth(
      '0xunknown',
      'eip155:8453',
      'unknown',
      'valid-signature-1234567890',
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
    const { challenge, expiresAt } = generateWsChallenge()
    const result = await verifyWsAuth(
      '0xwrong',
      'eip155:8453',
      'alice',
      'valid-signature-1234567890',
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
    const result = await verifyWsAuth(
      '0xalice',
      'eip155:8453',
      'alice',
      'valid-signature-1234567890',
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
    const result = await verifyWsAuth(
      '0xalice',
      'eip155:8453',
      'alice',
      'valid-signature-1234567890',
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
      '0xalice',
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
      walletAddress: '0xalice',
      chain: 'eip155:8453',
      registeredAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      tokenId: 42,
    })
  })

  it('returns true for valid NFT holder', async () => {
    expect(await reVerifyNft('alice', '0xalice', db)).toBe(true)
  })

  it('returns false for wallet mismatch', async () => {
    expect(await reVerifyNft('alice', '0xwrong', db)).toBe(false)
  })

  it('returns false for unknown handle', async () => {
    expect(await reVerifyNft('unknown', '0xunknown', db)).toBe(false)
  })
})
