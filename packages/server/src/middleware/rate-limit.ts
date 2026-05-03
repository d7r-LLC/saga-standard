// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import type { Context, MiddlewareHandler, Next } from 'hono'
import type { Env } from '../bindings'
import type { SessionData } from './auth'

/**
 * Rate-limit class for per-wallet KV quotas. Each class has its own minute
 * bucket so a wallet can spend up to its `chat` quota AND its `api` quota in
 * the same minute.
 */
export type RateLimitClass = 'api' | 'chat'

/** Default per-wallet limits (requests per 60s). Override via env. */
export const DEFAULT_RATE_LIMITS: Record<RateLimitClass, number> = {
  api: 60,
  chat: 10,
}

/** Read the configured limit for a class, falling back to DEFAULT_RATE_LIMITS. */
export function readWalletRateLimit(env: Env, klass: RateLimitClass): number {
  const raw = klass === 'api' ? env.RATE_LIMIT_API : env.RATE_LIMIT_CHAT
  if (!raw) return DEFAULT_RATE_LIMITS[klass]
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : DEFAULT_RATE_LIMITS[klass]
}

/** KV key shape: rl:<class>:<wallet>:<minute> — TTL slightly above 60s. */
export function rateLimitKey(klass: RateLimitClass, wallet: string, minute: number): string {
  return `rl:${klass}:${wallet.toLowerCase()}:${minute}`
}

/**
 * Resolve the client IP for IP-keyed rate limiting.
 *
 * `cf-connecting-ip` is a single trustworthy IP (set by Cloudflare's edge
 * before the worker runs). `x-forwarded-for` is a comma-separated list of
 * proxied hops — using the raw header as a key would (a) treat
 * `"1.2.3.4, 5.6.7.8"` and `"1.2.3.4,5.6.7.8"` as different buckets and
 * (b) let an attacker amplify cardinality by adding noise on the left.
 * Take the first hop (closest to the original client) and trim whitespace.
 *
 * Empty / missing values map to `'unknown'` so we still observe the bucket.
 */
export function readClientIp(cfConnectingIp?: string, xForwardedFor?: string): string {
  if (cfConnectingIp && cfConnectingIp.trim()) return cfConnectingIp.trim()
  if (xForwardedFor) {
    const first = xForwardedFor.split(',')[0]?.trim()
    if (first) return first
  }
  return 'unknown'
}

/**
 * IP-keyed rate limiter for the unauthenticated auth endpoints.
 *
 * Cloudflare's Rate Limiting API is invoked via `RATE_LIMITER_AUTH.limit(...)`.
 * On limit, the middleware returns a 429 with `Retry-After: 60`. When the
 * binding is missing (local dev, unit tests without it stubbed), this
 * degrades to "always allow" so we don't break the test suite.
 *
 * IP is read from `cf-connecting-ip`; when absent (some test rigs), the
 * key falls back to a constant string so the limiter still observes test
 * traffic in aggregate. Phase 5 (A-Med, auth).
 */
export const authIpRateLimit: MiddlewareHandler<{ Bindings: Env }> = async (c, next) => {
  const limiter = c.env.RATE_LIMITER_AUTH
  if (!limiter) return next()

  const ip = readClientIp(c.req.header('cf-connecting-ip'), c.req.header('x-forwarded-for'))
  try {
    const result = await limiter.limit({ key: ip })
    if (!result.success) {
      c.header('Retry-After', '60')
      return c.json({ error: 'Too many requests', code: 'RATE_LIMITED' }, 429)
    }
  } catch {
    // Rate limiter failure shouldn't take down the auth path. Allow through;
    // KV-side observability picks up the failure.
  }
  return next()
}

/**
 * Per-wallet KV quota — meant to run AFTER `requireAuth` so the wallet is
 * known. The minute bucket is incremented via a non-atomic KV `get` + `put`,
 * so concurrent requests on the same wallet+minute can race and undercount
 * (or, less often, overcount). That's intentional: KV has no native counter,
 * and this layer is a defense-in-depth backstop, not a precision quota. The
 * hard rate-limiting at the edge is the unauthenticated `RATE_LIMITER_AUTH`
 * Cloudflare binding (which IS atomic per IP). For authenticated traffic,
 * even a sloppy ±10% wallet quota is enough to bound a runaway client; if
 * we ever need exact counting, the right primitive is a Durable Object or
 * the Cloudflare Rate Limiting binding keyed on the wallet.
 */
export function makeWalletRateLimit(klass: RateLimitClass): MiddlewareHandler<{
  Bindings: Env
  Variables: { session: SessionData }
}> {
  return async (c: Context<{ Bindings: Env; Variables: { session: SessionData } }>, next: Next) => {
    const session = c.get('session')
    if (!session) return next() // route is unauthenticated; let it through

    const limit = readWalletRateLimit(c.env, klass)
    const minute = Math.floor(Date.now() / 60_000)
    const key = rateLimitKey(klass, session.walletAddress, minute)

    const current = Number((await c.env.SESSIONS.get(key)) ?? '0')
    if (current >= limit) {
      c.header('Retry-After', '60')
      return c.json({ error: `Rate limit exceeded for ${klass}`, code: 'RATE_LIMITED' }, 429)
    }

    await c.env.SESSIONS.put(key, String(current + 1), { expirationTtl: 65 })
    return next()
  }
}
