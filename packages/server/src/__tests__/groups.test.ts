// packages/server/src/__tests__/groups.test.ts
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { beforeEach, describe, expect, it } from 'vitest'
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

describe('Group management API', () => {
  let db: D1Database
  let env: Env

  beforeEach(async () => {
    db = createMockD1()
    await runMigrations(db)
    env = createTestEnv(db)
  })

  it('POST /v1/groups creates a group with members', async () => {
    const res = await app.request(
      '/v1/groups',
      {
        method: 'POST',
        body: JSON.stringify({
          groupId: 'team-alpha',
          members: ['alice', 'bob'],
        }),
        headers: { 'Content-Type': 'application/json' },
      },
      env
    )
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.groupId).toBe('team-alpha')
    expect(body.members).toEqual(['alice', 'bob'])
  })

  it('GET /v1/groups/:groupId/members returns member list', async () => {
    // Create group first
    await app.request(
      '/v1/groups',
      {
        method: 'POST',
        body: JSON.stringify({ groupId: 'team-alpha', members: ['alice', 'bob'] }),
        headers: { 'Content-Type': 'application/json' },
      },
      env
    )

    const res = await app.request('/v1/groups/team-alpha/members', {}, env)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.members).toContain('alice')
    expect(body.members).toContain('bob')
  })

  it('PUT /v1/groups/:groupId/members adds new members', async () => {
    await app.request(
      '/v1/groups',
      {
        method: 'POST',
        body: JSON.stringify({ groupId: 'team-alpha', members: ['alice'] }),
        headers: { 'Content-Type': 'application/json' },
      },
      env
    )

    const res = await app.request(
      '/v1/groups/team-alpha/members',
      {
        method: 'PUT',
        body: JSON.stringify({ add: ['bob', 'carol'] }),
        headers: { 'Content-Type': 'application/json' },
      },
      env
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.members).toHaveLength(3)
  })

  it('DELETE /v1/groups/:groupId/members removes members', async () => {
    await app.request(
      '/v1/groups',
      {
        method: 'POST',
        body: JSON.stringify({ groupId: 'team-alpha', members: ['alice', 'bob', 'carol'] }),
        headers: { 'Content-Type': 'application/json' },
      },
      env
    )

    const res = await app.request(
      '/v1/groups/team-alpha/members',
      {
        method: 'DELETE',
        body: JSON.stringify({ remove: ['bob'] }),
        headers: { 'Content-Type': 'application/json' },
      },
      env
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.members).toEqual(['alice', 'carol'])
  })

  it('returns 404 for unknown group', async () => {
    const res = await app.request('/v1/groups/nonexistent/members', {}, env)
    expect(res.status).toBe(404)
  })
})
