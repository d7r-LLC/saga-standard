// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { Hono } from 'hono'
import { drizzle } from 'drizzle-orm/d1'
import { and, eq } from 'drizzle-orm'
import { verifyMessage } from 'viem'
import type { Env } from '../bindings'
import { authChallenges } from '../db/schema'
import { generateId } from '../middleware/auth'

const SESSION_TTL_SECONDS = 3600 // 1 hour
const CHALLENGE_TTL_SECONDS = 300 // 5 minutes

export const authRoutes = new Hono<{ Bindings: Env }>()

/**
 * POST /v1/auth/challenge
 * Generate a challenge for wallet authentication.
 */
authRoutes.post('/challenge', async c => {
  const body = await c.req.json<{ walletAddress: string; chain: string }>()

  if (!body.walletAddress || !body.chain) {
    return c.json({ error: 'walletAddress and chain are required', code: 'INVALID_REQUEST' }, 400)
  }

  const db = drizzle(c.env.DB)
  const challengeId = generateId('chal')
  const nonce = generateId('nonce')
  const now = new Date()
  const expiresAt = new Date(now.getTime() + CHALLENGE_TTL_SECONDS * 1000)

  const challengeText = `Sign this to prove you own ${body.walletAddress}: nonce=${nonce} ts=${now.toISOString()}`

  await db.insert(authChallenges).values({
    id: challengeId,
    walletAddress: body.walletAddress.toLowerCase(),
    chain: body.chain,
    challenge: challengeText,
    expiresAt: expiresAt.toISOString(),
    used: 0,
  })

  return c.json({
    challenge: challengeText,
    expiresAt: expiresAt.toISOString(),
  })
})

/**
 * POST /v1/auth/verify
 * Verify a signed challenge and issue a session token.
 */
authRoutes.post('/verify', async c => {
  const body = await c.req.json<{
    walletAddress: string
    chain: string
    signature: string
    challenge: string
  }>()

  if (!body.walletAddress || !body.chain || !body.signature || !body.challenge) {
    return c.json(
      {
        error: 'walletAddress, chain, signature, and challenge are required',
        code: 'INVALID_REQUEST',
      },
      400
    )
  }

  const db = drizzle(c.env.DB)
  const normalizedAddress = body.walletAddress.toLowerCase()

  // Look up the challenge
  const challenges = await db
    .select()
    .from(authChallenges)
    .where(
      and(
        eq(authChallenges.walletAddress, normalizedAddress),
        eq(authChallenges.challenge, body.challenge),
        eq(authChallenges.used, 0)
      )
    )
    .limit(1)

  if (challenges.length === 0) {
    return c.json({ error: 'Challenge not found or already used', code: 'CHALLENGE_INVALID' }, 400)
  }

  const challengeRecord = challenges[0]

  // Check expiry
  if (new Date(challengeRecord.expiresAt) <= new Date()) {
    return c.json({ error: 'Challenge expired', code: 'CHALLENGE_EXPIRED' }, 400)
  }

  // Mark challenge as used
  await db.update(authChallenges).set({ used: 1 }).where(eq(authChallenges.id, challengeRecord.id))

  // Verify EIP-191 signature
  const isValid = await verifySignature(normalizedAddress, body.challenge, body.signature)
  if (!isValid) {
    return c.json({ error: 'Invalid signature', code: 'INVALID_SIGNATURE' }, 401)
  }

  // Issue session token
  const token = `saga_sess_${generateId('tok')}`
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString()

  await c.env.SESSIONS.put(
    token,
    JSON.stringify({
      walletAddress: normalizedAddress,
      chain: body.chain,
      expiresAt,
    }),
    { expirationTtl: SESSION_TTL_SECONDS }
  )

  return c.json({
    token,
    expiresAt,
    walletAddress: normalizedAddress,
  })
})

/**
 * Verify an EIP-191 personal_sign signature using viem.
 *
 * Behavior is documented in `packages/server/SECURITY.md`. If you change
 * what this function does, update SECURITY.md in the same commit. The
 * regression test `rejects signature from wrong wallet` in
 * `packages/server/src/__tests__/server.test.ts` is the executable check
 * on this contract.
 */
async function verifySignature(
  address: string,
  message: string,
  signature: string
): Promise<boolean> {
  if (!signature || !signature.startsWith('0x')) return false
  try {
    return await verifyMessage({
      address: address as `0x${string}`,
      message,
      signature: signature as `0x${string}`,
    })
  } catch {
    return false
  }
}

export { verifySignature as _verifySignature }
