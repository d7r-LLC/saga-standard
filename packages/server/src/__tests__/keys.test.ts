// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { beforeEach, describe, expect, it } from 'vitest'
import { drizzle } from 'drizzle-orm/d1'
import { agents, organizations } from '../db/schema'
import { app } from '../index'
import { createMockD1, createMockKV, runMigrations } from './test-helpers'
import type { Env } from '../bindings'

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

describe('GET /v1/keys/:handle', () => {
  let db: D1Database
  let env: Env

  beforeEach(async () => {
    db = createMockD1()
    await runMigrations(db)
    env = createTestEnv(db)

    const orm = drizzle(db)
    await orm.insert(agents).values({
      id: 'agent_alice',
      handle: 'alice',
      walletAddress: '0xalice',
      chain: 'eip155:8453',
      publicKey: 'YWxpY2VfeDI1NTE5X3B1YmxpY19rZXk=',
      registeredAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    await orm.insert(organizations).values({
      id: 'org_acme',
      handle: 'acme',
      name: 'Acme Corp',
      walletAddress: '0xacme',
      chain: 'eip155:8453',
      publicKey: 'YWNtZV94MjU1MTlfcHVibGljX2tleQ==',
      registeredAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
  })

  it('returns agent public key', async () => {
    const res = await app.request('/v1/keys/alice', {}, env)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({
      handle: 'alice',
      publicKey: 'YWxpY2VfeDI1NTE5X3B1YmxpY19rZXk=',
      entityType: 'agent',
    })
  })

  it('returns organization public key', async () => {
    const res = await app.request('/v1/keys/acme', {}, env)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({
      handle: 'acme',
      publicKey: 'YWNtZV94MjU1MTlfcHVibGljX2tleQ==',
      entityType: 'organization',
    })
  })

  it('returns 404 for unknown handle', async () => {
    const res = await app.request('/v1/keys/nonexistent', {}, env)
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toBe('Handle not found')
  })

  it('returns 404 when agent has no public key', async () => {
    const orm = drizzle(db)
    await orm.insert(agents).values({
      id: 'agent_bob',
      handle: 'bob',
      walletAddress: '0xbob',
      chain: 'eip155:8453',
      publicKey: null,
      registeredAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })

    const res = await app.request('/v1/keys/bob', {}, env)
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toBe('No public key registered')
  })
})
