// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { beforeEach, describe, expect, it } from 'vitest'
import { app } from '../index'
import { MAX_DOCUMENT_SIZE_BYTES } from '../routes/documents'
import { createMockEnv, runMigrations } from './test-helpers'
import type { Env } from '../bindings'

const WALLET = '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef'
const CHAIN = 'eip155:8453'

let env: Env

async function req(
  method: string,
  path: string,
  opts?: { body?: BodyInit; headers?: Record<string, string> }
): Promise<Response> {
  const url = `http://localhost${path}`
  const headers: Record<string, string> = { ...opts?.headers }
  const init: RequestInit = { method, headers, body: opts?.body }
  return app.request(url, init, env)
}

async function getSessionToken(): Promise<string> {
  // Mirror the session-issue path used in server.test.ts but bypass viem
  // verifyMessage by writing the session directly into KV — the route
  // handlers we're testing only need a valid bearer token.
  const token = 'saga_sess_size_cap_test'
  const now = Date.now()
  await env.SESSIONS.put(
    token,
    JSON.stringify({
      walletAddress: WALLET.toLowerCase(),
      chain: CHAIN,
      issuedAt: new Date(now).toISOString(),
      expiresAt: new Date(now + 900_000).toISOString(),
    }),
    { expirationTtl: 900 }
  )
  return token
}

beforeEach(async () => {
  env = createMockEnv()
  await runMigrations(env.DB)
})

describe('document upload size cap (Phase 5 O-High#2)', () => {
  it('exports MAX_DOCUMENT_SIZE_BYTES = 50 MB', () => {
    expect(MAX_DOCUMENT_SIZE_BYTES).toBe(50 * 1024 * 1024)
  })

  it('rejects with 413 when Content-Length header exceeds the cap', async () => {
    const token = await getSessionToken()
    // Seed agent so we get past the 404 check.
    const now = new Date().toISOString()
    await env.DB.prepare(
      'INSERT INTO agents (id, handle, wallet_address, chain, registered_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
    )
      .bind('agent_size', 'koda.size', WALLET.toLowerCase(), CHAIN, now, now)
      .run()

    // Body is small — but Content-Length lies oversized; pre-check trips.
    const res = await req('POST', '/v1/agents/koda.size/documents', {
      body: '{"sagaVersion":"1.0"}',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'content-length': String(MAX_DOCUMENT_SIZE_BYTES + 1),
      },
    })
    expect(res.status).toBe(413)
    const body = (await res.json()) as { code: string }
    expect(body.code).toBe('PAYLOAD_TOO_LARGE')
  })

  it('accepts a within-cap upload when Content-Length is absent (fallback path)', async () => {
    // Verifies that the absence of Content-Length does NOT itself cause a
    // rejection — small bodies still upload successfully via the post-read
    // fallback. The 413-on-oversize behavior of the fallback path is
    // structurally identical to the pre-check path (both compare to
    // MAX_DOCUMENT_SIZE_BYTES), and allocating a real 50+ MB payload in a
    // unit test is impractical. The pre-check rejection is exercised by
    // the test above.
    const token = await getSessionToken()
    const now = new Date().toISOString()
    await env.DB.prepare(
      'INSERT INTO agents (id, handle, wallet_address, chain, registered_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
    )
      .bind('agent_postread', 'koda.postread', WALLET.toLowerCase(), CHAIN, now, now)
      .run()

    const res = await req('POST', '/v1/agents/koda.postread/documents', {
      body: '{"sagaVersion":"1.0"}',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        // No content-length header — force fallback path.
      },
    })
    expect([200, 201]).toContain(res.status)
  })

  it('rejects invalid Content-Length with 400', async () => {
    const token = await getSessionToken()
    const now = new Date().toISOString()
    await env.DB.prepare(
      'INSERT INTO agents (id, handle, wallet_address, chain, registered_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
    )
      .bind('agent_inv', 'koda.inv', WALLET.toLowerCase(), CHAIN, now, now)
      .run()

    const res = await req('POST', '/v1/agents/koda.inv/documents', {
      body: '{"sagaVersion":"1.0"}',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'content-length': 'not-a-number',
      },
    })
    expect(res.status).toBe(400)
  })

  it('accepts within-cap uploads as before (no regression)', async () => {
    const token = await getSessionToken()
    const now = new Date().toISOString()
    await env.DB.prepare(
      'INSERT INTO agents (id, handle, wallet_address, chain, registered_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
    )
      .bind('agent_ok', 'koda.ok', WALLET.toLowerCase(), CHAIN, now, now)
      .run()

    const payload = JSON.stringify({ sagaVersion: '1.0', exportType: 'profile' })
    const res = await req('POST', '/v1/agents/koda.ok/documents', {
      body: payload,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'content-length': String(payload.length),
      },
    })
    expect(res.status).toBe(201)
  })
})
