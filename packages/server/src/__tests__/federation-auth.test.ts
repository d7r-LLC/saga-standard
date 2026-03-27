// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { beforeEach, describe, expect, it } from 'vitest'
import { createMockD1, runMigrations } from './test-helpers'
import { drizzle } from 'drizzle-orm/d1'
import { directories } from '../db/schema'
import { generateFederationChallenge, verifyFederationAuth } from '../relay/federation-auth'

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
      operatorWallet: '0xoperator',
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
      operatorWallet: '0xsuspended',
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
      operatorWallet: '0xnonft',
      conformanceLevel: 'basic',
      status: 'active',
      chain: 'eip155:84532',
      // tokenId is null — no NFT
      registeredAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
  })

  it('authenticates a valid directory with active status and NFT', async () => {
    const { challenge, expiresAt } = generateFederationChallenge()
    const result = await verifyFederationAuth(
      'epic-hub',
      '0xoperator',
      'valid-signature-1234567890',
      challenge,
      expiresAt,
      db
    )
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.directoryId).toBe('epic-hub')
      expect(result.operatorWallet).toBe('0xoperator')
    }
  })

  it('rejects unknown directoryId', async () => {
    const { challenge, expiresAt } = generateFederationChallenge()
    const result = await verifyFederationAuth(
      'unknown-hub',
      '0xoperator',
      'valid-signature-1234567890',
      challenge,
      expiresAt,
      db
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('not found')
  })

  it('rejects wallet mismatch', async () => {
    const { challenge, expiresAt } = generateFederationChallenge()
    const result = await verifyFederationAuth(
      'epic-hub',
      '0xwrongwallet',
      'valid-signature-1234567890',
      challenge,
      expiresAt,
      db
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('does not match')
  })

  it('rejects directory without NFT', async () => {
    const { challenge, expiresAt } = generateFederationChallenge()
    const result = await verifyFederationAuth(
      'no-nft-hub',
      '0xnonft',
      'valid-signature-1234567890',
      challenge,
      expiresAt,
      db
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('NFT')
  })

  it('rejects suspended directory', async () => {
    const { challenge, expiresAt } = generateFederationChallenge()
    const result = await verifyFederationAuth(
      'suspended-hub',
      '0xsuspended',
      'valid-signature-1234567890',
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
    const result = await verifyFederationAuth(
      'epic-hub',
      '0xoperator',
      'valid-signature-1234567890',
      challenge,
      expiredAt,
      db
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('expired')
  })

  it('rejects invalid challenge format', async () => {
    const { expiresAt } = generateFederationChallenge()
    const result = await verifyFederationAuth(
      'epic-hub',
      '0xoperator',
      'valid-signature-1234567890',
      'bad-format',
      expiresAt,
      db
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('format')
  })
})
