// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { drizzle } from 'drizzle-orm/d1'
import { eq } from 'drizzle-orm'
import { agents, organizations } from '../db/schema'
import type { ConnectionState } from './types'
import { CHALLENGE_TTL_MS } from './types'

export type AuthResult = { ok: true; state: ConnectionState } | { ok: false; error: string }

/**
 * Generate a challenge string for WebSocket authentication.
 * Challenge format: `saga-relay:{uuid}:{timestamp}`
 */
export function generateWsChallenge(): { challenge: string; expiresAt: string } {
  const nonce = crypto.randomUUID()
  const now = Date.now()
  const expiresAt = new Date(now + CHALLENGE_TTL_MS).toISOString()
  const challenge = `saga-relay:${nonce}:${now}`
  return { challenge, expiresAt }
}

/**
 * Verify WebSocket authentication.
 *
 * Checks:
 * 1. Challenge is not expired and has correct format
 * 2. Signature is present (full EIP-191 verification is a TODO — same as HTTP auth)
 * 3. Entity (agent or org) exists in D1 with matching wallet address
 * 4. Entity has a valid NFT (tokenId is not null)
 */
export async function verifyWsAuth(
  walletAddress: string,
  chain: string,
  handle: string,
  signature: string,
  challenge: string,
  challengeExpiresAt: string,
  db: D1Database
): Promise<AuthResult> {
  if (new Date(challengeExpiresAt) <= new Date()) {
    return { ok: false, error: 'Challenge expired' }
  }

  if (!challenge.startsWith('saga-relay:')) {
    return { ok: false, error: 'Invalid challenge format' }
  }

  // TODO: Full EIP-191 signature verification with viem (same pattern as routes/auth.ts)
  if (!signature || signature.length < 10) {
    return { ok: false, error: 'Invalid signature' }
  }

  const orm = drizzle(db)
  const normalizedAddress = walletAddress.toLowerCase()

  // Check agent table
  const agent = await orm.select().from(agents).where(eq(agents.handle, handle)).get()

  if (agent) {
    if (agent.walletAddress.toLowerCase() !== normalizedAddress) {
      return { ok: false, error: 'Wallet address does not match registered agent' }
    }
    if (agent.tokenId === null || agent.tokenId === undefined) {
      return { ok: false, error: 'Agent does not have a valid NFT' }
    }
    return {
      ok: true,
      state: {
        handle,
        walletAddress: normalizedAddress,
        chain,
        authenticatedAt: new Date().toISOString(),
        lastPong: Date.now(),
        lastNftCheck: Date.now(),
      },
    }
  }

  // Check organization table
  const org = await orm.select().from(organizations).where(eq(organizations.handle, handle)).get()

  if (org) {
    if (org.walletAddress.toLowerCase() !== normalizedAddress) {
      return { ok: false, error: 'Wallet address does not match registered organization' }
    }
    if (org.tokenId === null || org.tokenId === undefined) {
      return { ok: false, error: 'Organization does not have a valid NFT' }
    }
    return {
      ok: true,
      state: {
        handle,
        walletAddress: normalizedAddress,
        chain,
        authenticatedAt: new Date().toISOString(),
        lastPong: Date.now(),
        lastNftCheck: Date.now(),
      },
    }
  }

  return { ok: false, error: 'Handle not found' }
}

/**
 * Re-verify NFT ownership for an authenticated connection.
 * Called periodically by the DO's alarm handler.
 * Returns false if the entity's NFT has been revoked/transferred.
 */
export async function reVerifyNft(
  handle: string,
  walletAddress: string,
  db: D1Database
): Promise<boolean> {
  const orm = drizzle(db)
  const normalizedAddress = walletAddress.toLowerCase()

  const agent = await orm.select().from(agents).where(eq(agents.handle, handle)).get()

  if (agent) {
    return (
      agent.walletAddress.toLowerCase() === normalizedAddress &&
      agent.tokenId !== null &&
      agent.tokenId !== undefined
    )
  }

  const org = await orm.select().from(organizations).where(eq(organizations.handle, handle)).get()

  if (org) {
    return (
      org.walletAddress.toLowerCase() === normalizedAddress &&
      org.tokenId !== null &&
      org.tokenId !== undefined
    )
  }

  return false
}
