// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { app } from '../index'
import { createMockEnv, runMigrations } from './test-helpers'
import type { Env } from '../bindings'

let env: Env

async function req(
  method: string,
  path: string,
  opts?: { body?: unknown; headers?: Record<string, string> }
): Promise<Response> {
  const url = `http://localhost${path}`
  const headers: Record<string, string> = { ...opts?.headers }
  const init: RequestInit = { method, headers }

  if (opts?.body !== undefined) {
    headers['Content-Type'] = 'application/json'
    init.body = JSON.stringify(opts.body)
  }

  return app.request(url, init, env)
}

beforeEach(async () => {
  env = createMockEnv()
  await runMigrations(env.DB)
})

afterEach(() => {
  vi.useRealTimers()
})

// Phase 5 (A-Med, auth) — IP-keyed rate limit on /v1/auth/challenge + /verify
describe('IP rate limit on auth endpoints', () => {
  it('returns 429 + Retry-After when RATE_LIMITER_AUTH says no', async () => {
    let calls = 0
    env.RATE_LIMITER_AUTH = {
      async limit() {
        calls += 1
        return { success: calls <= 2 }
      },
    }

    const r1 = await req('POST', '/v1/auth/challenge', {
      body: { walletAddress: '0xaaaa', chain: 'eip155:8453' },
      headers: { 'cf-connecting-ip': '203.0.113.1' },
    })
    expect(r1.status).toBe(200)

    const r2 = await req('POST', '/v1/auth/challenge', {
      body: { walletAddress: '0xaaaa', chain: 'eip155:8453' },
      headers: { 'cf-connecting-ip': '203.0.113.1' },
    })
    expect(r2.status).toBe(200)

    const r3 = await req('POST', '/v1/auth/challenge', {
      body: { walletAddress: '0xaaaa', chain: 'eip155:8453' },
      headers: { 'cf-connecting-ip': '203.0.113.1' },
    })
    expect(r3.status).toBe(429)
    expect(r3.headers.get('Retry-After')).toBe('60')
    const body = (await r3.json()) as { code: string }
    expect(body.code).toBe('RATE_LIMITED')
    expect(calls).toBe(3)
  })

  it('passes through when RATE_LIMITER_AUTH binding is missing', async () => {
    // env.RATE_LIMITER_AUTH intentionally not set
    const r = await req('POST', '/v1/auth/challenge', {
      body: { walletAddress: '0xaaaa', chain: 'eip155:8453' },
    })
    expect(r.status).toBe(200)
  })

  it('passes IP from cf-connecting-ip header to limiter', async () => {
    let seenKey: string | undefined
    env.RATE_LIMITER_AUTH = {
      async limit({ key }: { key: string }) {
        seenKey = key
        return { success: true }
      },
    }

    await req('POST', '/v1/auth/challenge', {
      body: { walletAddress: '0xaaaa', chain: 'eip155:8453' },
      headers: { 'cf-connecting-ip': '198.51.100.42' },
    })
    expect(seenKey).toBe('198.51.100.42')
  })

  it('verify endpoint also gates on RATE_LIMITER_AUTH', async () => {
    let calls = 0
    env.RATE_LIMITER_AUTH = {
      async limit() {
        calls += 1
        return { success: false }
      },
    }

    const r = await req('POST', '/v1/auth/verify', {
      body: { walletAddress: '0xaaaa', chain: 'eip155:8453', signature: '0xabc', challenge: 'foo' },
      headers: { 'cf-connecting-ip': '203.0.113.99' },
    })
    expect(r.status).toBe(429)
    expect(calls).toBe(1)
  })
})

// Phase 5 (A-Med, auth) — per-wallet KV quota in requireAuth
describe('per-wallet API rate limit (requireAuth)', () => {
  /** Helper: insert a session into KV directly so requireAuth passes the lookup. */
  async function seedSession(token: string, wallet: string): Promise<void> {
    const now = Date.now()
    await env.SESSIONS.put(
      token,
      JSON.stringify({
        walletAddress: wallet.toLowerCase(),
        chain: 'eip155:8453',
        issuedAt: new Date(now).toISOString(),
        expiresAt: new Date(now + 900_000).toISOString(),
      }),
      { expirationTtl: 900 }
    )
  }

  it('returns 429 once the wallet exceeds RATE_LIMIT_API in a minute', async () => {
    env.RATE_LIMIT_API = '3'
    const token = 'saga_sess_test1'
    const wallet = '0x1111111111111111111111111111111111111111'
    await seedSession(token, wallet)

    // requireAuth is on /v1/auth/sessions (DELETE) — pick a path that's
    // protected and lightweight. We use /v1/agents which requires auth on
    // some methods. The simplest path: /v1/policies (GET) which is auth'd.
    // The exact path doesn't matter for the rate-limit assertion.
    const path = '/v1/agents/anything/documents' // requires auth (GET)
    const headers = { Authorization: `Bearer ${token}` }

    const r1 = await req('GET', path, { headers })
    const r2 = await req('GET', path, { headers })
    const r3 = await req('GET', path, { headers })
    const r4 = await req('GET', path, { headers })

    // First 3 pass through requireAuth's rate-limit gate; the 4th hits 429.
    // The downstream handler may itself return 401/404/etc on r1-r3, but the
    // rate-limit assertion is independent of that.
    expect([r1.status, r2.status, r3.status]).not.toContain(429)
    expect(r4.status).toBe(429)
    expect(r4.headers.get('Retry-After')).toBe('60')
  })

  it('does not rate-limit cross-wallet requests against each other', async () => {
    env.RATE_LIMIT_API = '1'
    const tokenA = 'saga_sess_a'
    const tokenB = 'saga_sess_b'
    await seedSession(tokenA, '0xaaaa000000000000000000000000000000000001')
    await seedSession(tokenB, '0xbbbb000000000000000000000000000000000002')

    const path = '/v1/agents/x/documents'

    const a1 = await req('GET', path, { headers: { Authorization: `Bearer ${tokenA}` } })
    const a2 = await req('GET', path, { headers: { Authorization: `Bearer ${tokenA}` } })
    const b1 = await req('GET', path, { headers: { Authorization: `Bearer ${tokenB}` } })

    expect(a1.status).not.toBe(429)
    expect(a2.status).toBe(429) // wallet A's second hit busts limit=1
    expect(b1.status).not.toBe(429) // wallet B has its own bucket
  })

  it('uses default 60 req/min when RATE_LIMIT_API is unset', async () => {
    // No env override — default is 60/min.
    const token = 'saga_sess_default'
    const wallet = '0x3333333333333333333333333333333333333333'
    await seedSession(token, wallet)
    const headers = { Authorization: `Bearer ${token}` }
    const path = '/v1/agents/x/documents'

    // Within 5 sequential hits we should not see a 429 at the 60/min default.
    for (let i = 0; i < 5; i++) {
      const r = await req('GET', path, { headers })
      expect(r.status).not.toBe(429)
    }
  })
})
