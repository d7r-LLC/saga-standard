// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { Hono } from 'hono'
import { and, eq } from 'drizzle-orm'
import { getDb } from '../db'
import { verifyMessage } from 'viem'
import type { Env } from '../bindings'
import { authChallenges } from '../db/schema'
import { type SessionData, generateId, requireAuth, sessionRevocationKey } from '../middleware/auth'
import { authIpRateLimit } from '../middleware/rate-limit'

// Session TTL reduced 1h → 15min in Phase 2 (A-High#5). Refresh-token flow
// is the planned follow-up — for now, callers re-authenticate via challenge
// + verify when their session expires.
const SESSION_TTL_SECONDS = 900 // 15 minutes
const CHALLENGE_TTL_SECONDS = 300 // 5 minutes

// Revocation sentinel TTL: must outlive the longest session that could still
// exist in KV — including any pre-deploy 1-hour sessions issued before this
// change rolled out. We use 1 hour + 60s margin so the sentinel covers every
// possible legacy session AND the new 15-min sessions. Once a sentinel is set,
// the wallet's old sessions will all expire naturally before the sentinel
// decays, preventing revival.
const REVOCATION_SENTINEL_TTL_SECONDS = 3600 + 60

export const authRoutes = new Hono<{
  Bindings: Env
  Variables: { session: SessionData }
}>()

/**
 * POST /v1/auth/challenge
 * Generate a challenge for wallet authentication.
 *
 * Phase 5 (A-Med, auth): IP-keyed rate limit (10 req / 60s) at the edge via
 * the Cloudflare RATE_LIMITER_AUTH binding. Returns 429 + Retry-After: 60
 * on limit. Required to keep nonce-grinding attacks bounded.
 */
authRoutes.post('/challenge', authIpRateLimit, async c => {
  const body = await c.req.json<{ walletAddress: string; chain: string }>()

  if (!body.walletAddress || !body.chain) {
    return c.json({ error: 'walletAddress and chain are required', code: 'INVALID_REQUEST' }, 400)
  }

  const db = getDb(c.env.DB)
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
 *
 * Phase 5 (A-Med, auth): same IP-keyed rate limit as /challenge. Caps the
 * cost an attacker can impose on viem's signature-verification path.
 */
authRoutes.post('/verify', authIpRateLimit, async c => {
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

  const db = getDb(c.env.DB)
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

  // Issue session token. Capture a single `nowMs` reading so issuedAt and
  // expiresAt are derived from the same clock — avoids a few-ms skew that
  // would otherwise make the (expiresAt - issuedAt === SESSION_TTL_SECONDS)
  // contract flaky.
  const token = `saga_sess_${generateId('tok')}`
  const nowMs = Date.now()
  const issuedAt = new Date(nowMs).toISOString()
  const expiresAt = new Date(nowMs + SESSION_TTL_SECONDS * 1000).toISOString()

  await c.env.SESSIONS.put(
    token,
    JSON.stringify({
      walletAddress: normalizedAddress,
      chain: body.chain,
      issuedAt,
      expiresAt,
    }),
    { expirationTtl: SESSION_TTL_SECONDS }
  )

  return c.json({
    token,
    issuedAt,
    expiresAt,
    walletAddress: normalizedAddress,
  })
})

/**
 * DELETE /v1/auth/sessions/:token
 * Revoke a single session token.
 *
 * Authorization rules:
 *   - The caller must be authenticated.
 *   - They may only revoke a token belonging to their own wallet (or their
 *     own current bearer token, which is the same thing).
 *
 * Phase 2 (A-High#5): self-revocation primitive so a user who notices a
 * leaked or compromised token can kill it before TTL expiry.
 */
authRoutes.delete('/sessions/:token', requireAuth, async c => {
  const session = c.get('session')
  const targetToken = c.req.param('token') as string

  if (!targetToken) {
    return c.json({ error: 'token is required', code: 'INVALID_REQUEST' }, 400)
  }

  // Look up the target session. If it doesn't exist, return 404 to avoid
  // leaking which tokens existed.
  const targetJson = await c.env.SESSIONS.get(targetToken)
  if (!targetJson) {
    return c.json({ error: 'Token not found', code: 'NOT_FOUND' }, 404)
  }

  const targetSession = JSON.parse(targetJson) as SessionData
  if (targetSession.walletAddress.toLowerCase() !== session.walletAddress.toLowerCase()) {
    // Don't reveal cross-wallet token existence; same response shape as 404.
    return c.json({ error: 'Token not found', code: 'NOT_FOUND' }, 404)
  }

  await c.env.SESSIONS.delete(targetToken)
  return c.json({ revoked: true, token: targetToken })
})

/**
 * DELETE /v1/auth/sessions
 * Revoke ALL sessions for the authenticated wallet (post-rotation primitive).
 *
 * KV does not expose efficient enumeration by prefix, so instead of deleting
 * each token row we set a per-wallet sentinel `session:revoked:<wallet>` to
 * the current timestamp. The `requireAuth` middleware compares each session's
 * `issuedAt` to this sentinel and rejects sessions issued before it.
 *
 * The sentinel is given a TTL slightly larger than the session TTL, so once
 * every pre-revocation session has expired naturally the sentinel decays and
 * future re-authentications are not affected.
 */
authRoutes.delete('/sessions', requireAuth, async c => {
  const session = c.get('session')
  const ts = new Date().toISOString()

  await c.env.SESSIONS.put(sessionRevocationKey(session.walletAddress), ts, {
    expirationTtl: REVOCATION_SENTINEL_TTL_SECONDS,
  })

  // Also delete the caller's CURRENT token immediately to give a hard 401 on
  // their next request rather than waiting for the middleware to compare.
  if (session.token) {
    await c.env.SESSIONS.delete(session.token)
  }

  return c.json({ revoked: true, walletAddress: session.walletAddress, revokedAt: ts })
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
