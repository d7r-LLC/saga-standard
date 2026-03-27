// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { beforeEach, describe, expect, it } from 'vitest'
import { app } from '../index'
import { createMockD1, createMockKV, runMigrations } from './test-helpers'
import type { Env } from '../bindings'

const TEST_TOKEN = 'test-session-token'

function createTestEnv(db: D1Database): Env {
  return {
    DB: db,
    STORAGE: {} as R2Bucket,
    SESSIONS: createMockKV(),
    INDEXER_STATE: createMockKV(),
    RELAY_MAILBOX: createMockKV(),
    RELAY_ROOM: {} as DurableObjectNamespace,
  }
}

function authHeaders(): Record<string, string> {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${TEST_TOKEN}` }
}

describe('Policy management API', () => {
  let db: D1Database
  let env: Env

  beforeEach(async () => {
    db = createMockD1()
    await runMigrations(db)
    env = createTestEnv(db)
    await (env.SESSIONS as KVNamespace).put(
      TEST_TOKEN,
      JSON.stringify({
        walletAddress: '0xtest',
        chain: 'eip155:8453',
        expiresAt: new Date(Date.now() + 3600_000).toISOString(),
      })
    )
  })

  it('GET /v1/orgs/:orgId/policy returns 404 when no policy exists', async () => {
    const res = await app.request('/v1/orgs/acme-corp/policy', { headers: authHeaders() }, env)
    expect(res.status).toBe(404)
  })

  it('PUT /v1/orgs/:orgId/policy stores a policy', async () => {
    const policy = {
      orgId: 'acme-corp',
      defaultScope: 'mutual',
      restricted: { memoryTypes: ['procedural'] },
      retention: { mutualTtlDays: 90 },
    }
    const res = await app.request(
      '/v1/orgs/acme-corp/policy',
      {
        method: 'PUT',
        body: JSON.stringify(policy),
        headers: authHeaders(),
      },
      env
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.orgId).toBe('acme-corp')
  })

  it('GET /v1/orgs/:orgId/policy returns stored policy', async () => {
    const policy = {
      orgId: 'acme-corp',
      defaultScope: 'agent-portable',
      restricted: { domains: ['finance'] },
      retention: {},
    }
    await app.request(
      '/v1/orgs/acme-corp/policy',
      {
        method: 'PUT',
        body: JSON.stringify(policy),
        headers: authHeaders(),
      },
      env
    )

    const res = await app.request('/v1/orgs/acme-corp/policy', { headers: authHeaders() }, env)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.policy.defaultScope).toBe('agent-portable')
    expect(body.policy.restricted.domains).toEqual(['finance'])
  })

  it('PUT /v1/orgs/:orgId/policy updates existing policy', async () => {
    const policy1 = {
      orgId: 'acme-corp',
      defaultScope: 'mutual',
      restricted: {},
      retention: {},
    }
    await app.request(
      '/v1/orgs/acme-corp/policy',
      {
        method: 'PUT',
        body: JSON.stringify(policy1),
        headers: authHeaders(),
      },
      env
    )

    const policy2 = {
      orgId: 'acme-corp',
      defaultScope: 'org-internal',
      restricted: { contentPatterns: ['confidential'] },
      retention: { portableLimit: 100 },
    }
    await app.request(
      '/v1/orgs/acme-corp/policy',
      {
        method: 'PUT',
        body: JSON.stringify(policy2),
        headers: authHeaders(),
      },
      env
    )

    const res = await app.request('/v1/orgs/acme-corp/policy', { headers: authHeaders() }, env)
    const body = await res.json()
    expect(body.policy.defaultScope).toBe('org-internal')
    expect(body.policy.restricted.contentPatterns).toEqual(['confidential'])
  })

  it('PUT /v1/orgs/:orgId/policy rejects unauthenticated requests', async () => {
    const res = await app.request(
      '/v1/orgs/acme-corp/policy',
      {
        method: 'PUT',
        body: JSON.stringify({
          orgId: 'acme-corp',
          defaultScope: 'mutual',
          restricted: {},
          retention: {},
        }),
        headers: { 'Content-Type': 'application/json' },
      },
      env
    )
    expect(res.status).toBe(401)
  })

  it('PUT /v1/orgs/:orgId/policy validates required fields', async () => {
    const res = await app.request(
      '/v1/orgs/acme-corp/policy',
      {
        method: 'PUT',
        body: JSON.stringify({ orgId: 'acme-corp' }), // missing defaultScope, restricted, retention
        headers: authHeaders(),
      },
      env
    )
    expect(res.status).toBe(400)
  })
})
