// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import type { Context, Next } from 'hono'
import type { Env } from '../bindings'
import { rateLimitKey, readWalletRateLimit } from './rate-limit'

export interface SessionData {
  walletAddress: string
  chain: string
  /** When the token was issued (used by per-wallet revocation in Phase 2). */
  issuedAt: string
  expiresAt: string
  /** Opaque token string. Set on the in-memory copy so handlers can self-identify. */
  token?: string
}

/**
 * KV key for the per-wallet session-revocation sentinel. When set, every
 * session whose `issuedAt` precedes the sentinel timestamp is rejected by
 * `requireAuth`. Used by `DELETE /v1/auth/sessions` to revoke all of a
 * wallet's outstanding tokens after wallet-key rotation.
 *
 * The wallet address is lowercased to match the canonical form stored on
 * sessions.
 */
export function sessionRevocationKey(walletAddress: string): string {
  return `session:revoked:${walletAddress.toLowerCase()}`
}

/**
 * Bearer token auth middleware.
 *
 * Order of checks (each must pass):
 *   1. `Authorization: Bearer <token>` header present.
 *   2. Token exists in `SESSIONS` KV.
 *   3. Session has not passed its TTL.
 *   4. Wallet has not been globally revoked AFTER this session was issued
 *      (Phase 2 finding A-High#5 — adds rotation-style revocation without
 *      requiring per-token enumeration in KV).
 *
 * On success, sets `c.set('session', session)` for downstream handlers.
 */
export async function requireAuth(
  c: Context<{ Bindings: Env; Variables: { session: SessionData } }>,
  next: Next
): Promise<Response | void> {
  const header = c.req.header('Authorization')
  if (!header?.startsWith('Bearer ')) {
    return c.json({ error: 'Missing or invalid Authorization header', code: 'UNAUTHORIZED' }, 401)
  }

  const token = header.slice(7)
  const sessionJson = await c.env.SESSIONS.get(token)
  if (!sessionJson) {
    return c.json({ error: 'Invalid or expired session token', code: 'SESSION_EXPIRED' }, 401)
  }

  const session = JSON.parse(sessionJson) as SessionData
  if (new Date(session.expiresAt) <= new Date()) {
    // Clean up expired token
    await c.env.SESSIONS.delete(token)
    return c.json({ error: 'Session expired', code: 'SESSION_EXPIRED' }, 401)
  }

  // Per-wallet revocation check (Phase 2 — A-High#5).
  //
  // Comparison is `>=` (not `>`) so a session issued at exactly the
  // revocation moment (same millisecond) is also killed. This closes a
  // narrow timing edge case where sub-millisecond execution could let a
  // pre-revocation session survive on equal timestamps. New sessions are
  // unaffected: they're issued strictly after the revocation timestamp.
  //
  // If `session.issuedAt` is missing (pre-deploy sessions issued before the
  // Phase 2 change added the field), we treat the session as older than ANY
  // revocation sentinel and reject. This ensures the revoke-all primitive
  // works against legacy sessions that haven't expired yet.
  const revocationTs = await c.env.SESSIONS.get(sessionRevocationKey(session.walletAddress))
  if (revocationTs) {
    if (!session.issuedAt || revocationTs >= session.issuedAt) {
      return c.json({ error: 'Session revoked', code: 'SESSION_REVOKED' }, 401)
    }
  }

  // Attach the bearer token so handlers (e.g. DELETE /v1/auth/sessions/:token)
  // can self-identify which token issued the request.
  session.token = token
  c.set('session', session)

  // Phase 5 (A-Med, auth): per-wallet API rate limit (default 60/min).
  // Chat routes layer their own `chat` quota on top via makeWalletRateLimit.
  // Keep this OUT of the unauthenticated auth challenge/verify path —
  // those are gated by IP-keyed Cloudflare Rate Limiting instead.
  //
  // We share the bucket-key shape and per-class default with
  // `middleware/rate-limit.ts` so the two implementations can't drift on
  // TTL, key prefix, or limit. The reason this isn't just `makeWalletRateLimit('api')`
  // is that we want the limit AND the session attach to fire from the same
  // middleware, so failures here behave identically to other auth failures.
  const limit = readWalletRateLimit(c.env, 'api')
  if (limit > 0) {
    const minute = Math.floor(Date.now() / 60_000)
    const key = rateLimitKey('api', session.walletAddress, minute)
    const current = Number((await c.env.SESSIONS.get(key)) ?? '0')
    if (current >= limit) {
      c.header('Retry-After', '60')
      return c.json({ error: 'Rate limit exceeded for api', code: 'RATE_LIMITED' }, 429)
    }
    await c.env.SESSIONS.put(key, String(current + 1), { expirationTtl: 65 })
  }

  return next()
}

/** Generate a random ID with a prefix */
export function generateId(prefix: string): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  const hex = Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
  return `${prefix}_${hex}`
}
