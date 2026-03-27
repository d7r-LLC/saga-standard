// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { beforeEach, describe, expect, it } from 'vitest'
import { app } from '../index'
import { createMockEnv, runMigrations } from './test-helpers'
import type { Env } from '../bindings'

let env: Env
const now = new Date().toISOString()

beforeEach(async () => {
  env = createMockEnv()
  await runMigrations(env.DB)
})

// -- Seed helpers --

async function seedAgent(
  db: D1Database,
  opts: {
    id: string
    handle: string
    wallet?: string
    chain?: string
    directoryId?: string | null
  }
) {
  await db
    .prepare(
      'INSERT INTO agents (id, handle, wallet_address, chain, registered_at, updated_at, directory_id) VALUES (?, ?, ?, ?, ?, ?, ?)'
    )
    .bind(
      opts.id,
      opts.handle,
      opts.wallet ?? '0xwallet',
      opts.chain ?? 'eip155:84532',
      now,
      now,
      opts.directoryId ?? null
    )
    .run()
}

async function seedDirectory(
  db: D1Database,
  opts: {
    id: string
    directoryId: string
    url?: string
    operatorWallet?: string
    chain?: string
    status?: string
  }
) {
  await db
    .prepare(
      'INSERT INTO directories (id, directory_id, url, operator_wallet, conformance_level, status, chain, registered_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    )
    .bind(
      opts.id,
      opts.directoryId,
      opts.url ?? 'https://epic.example.com',
      opts.operatorWallet ?? '0xop',
      'full',
      opts.status ?? 'active',
      opts.chain ?? 'eip155:84532',
      now,
      now
    )
    .run()
}

// -- Tests --

describe('GET /v1/resolve/:identity — plain handle (backward compat)', () => {
  it('resolves a plain agent handle', async () => {
    await seedAgent(env.DB, { id: 'agent_alice', handle: 'alice' })

    const res = await app.request('http://localhost/v1/resolve/alice', {}, env)
    expect(res.status).toBe(200)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.entityType).toBe('agent')
    expect(body.handle).toBe('alice')
  })

  it('returns 404 for unknown plain handle', async () => {
    const res = await app.request('http://localhost/v1/resolve/unknown', {}, env)
    expect(res.status).toBe(404)
    const body = (await res.json()) as { code: string }
    expect(body.code).toBe('NOT_FOUND')
  })

  it('resolves a plain handle that matches a directory (returns directory entityType)', async () => {
    await seedDirectory(env.DB, {
      id: 'dir_epic',
      directoryId: 'epic-hub',
      url: 'https://epic.example.com',
      operatorWallet: '0xop',
    })

    const res = await app.request('http://localhost/v1/resolve/epic-hub', {}, env)
    expect(res.status).toBe(200)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.entityType).toBe('directory')
    expect(body.directoryId).toBe('epic-hub')
    expect(body.url).toBe('https://epic.example.com')
    expect(body.operatorWallet).toBe('0xop')
  })
})

describe('GET /v1/resolve/:identity — handle@directoryId format', () => {
  it('resolves handle@directoryId when agent and directory both exist', async () => {
    await seedDirectory(env.DB, {
      id: 'dir_epic',
      directoryId: 'epic-hub',
    })
    await seedAgent(env.DB, {
      id: 'agent_bob',
      handle: 'bob',
      directoryId: 'epic-hub',
    })

    const res = await app.request('http://localhost/v1/resolve/bob@epic-hub', {}, env)
    expect(res.status).toBe(200)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.entityType).toBe('agent')
    expect(body.handle).toBe('bob')
    expect(body.directoryId).toBe('epic-hub')
  })

  it('returns 404 when the directory does not exist', async () => {
    await seedAgent(env.DB, { id: 'agent_bob', handle: 'bob', directoryId: 'nonexistent-hub' })

    const res = await app.request('http://localhost/v1/resolve/bob@nonexistent-hub', {}, env)
    expect(res.status).toBe(404)
    const body = (await res.json()) as { code: string }
    expect(body.code).toBe('NOT_FOUND')
  })

  it('returns 404 when directory exists but handle is not in that directory', async () => {
    await seedDirectory(env.DB, {
      id: 'dir_epic',
      directoryId: 'epic-hub',
    })
    // alice is not associated with epic-hub
    await seedAgent(env.DB, { id: 'agent_alice', handle: 'alice', directoryId: null })

    const res = await app.request('http://localhost/v1/resolve/alice@epic-hub', {}, env)
    expect(res.status).toBe(404)
    const body = (await res.json()) as { code: string }
    expect(body.code).toBe('NOT_FOUND')
  })

  it('returns 404 when handle exists globally but is in a different directory', async () => {
    await seedDirectory(env.DB, { id: 'dir_epic', directoryId: 'epic-hub' })
    await seedDirectory(env.DB, { id: 'dir_other', directoryId: 'other-hub' })
    await seedAgent(env.DB, { id: 'agent_bob', handle: 'bob', directoryId: 'other-hub' })

    const res = await app.request('http://localhost/v1/resolve/bob@epic-hub', {}, env)
    expect(res.status).toBe(404)
    const body = (await res.json()) as { code: string }
    expect(body.code).toBe('NOT_FOUND')
  })

  it('resolves bob@epic-hub and includes all expected agent fields', async () => {
    await seedDirectory(env.DB, {
      id: 'dir_epic',
      directoryId: 'epic-hub',
      url: 'https://epic.example.com',
      operatorWallet: '0xop',
      chain: 'eip155:84532',
    })
    await seedAgent(env.DB, {
      id: 'agent_bob',
      handle: 'bob',
      wallet: '0xbobwallet',
      chain: 'eip155:84532',
      directoryId: 'epic-hub',
    })

    const res = await app.request('http://localhost/v1/resolve/bob@epic-hub', {}, env)
    expect(res.status).toBe(200)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.entityType).toBe('agent')
    expect(body.handle).toBe('bob')
    expect(body.walletAddress).toBe('0xbobwallet')
    expect(body.chain).toBe('eip155:84532')
    expect(body.directoryId).toBe('epic-hub')
    // Nullable fields should be present
    expect('tokenId' in body).toBe(true)
    expect('tbaAddress' in body).toBe(true)
    expect('homeHubUrl' in body).toBe(true)
    expect('contractAddress' in body).toBe(true)
    expect('mintTxHash' in body).toBe(true)
    expect('registeredAt' in body).toBe(true)
  })

  it('returns 400 for @directoryId (empty handle)', async () => {
    const res = await app.request('http://localhost/v1/resolve/@epic-hub', {}, env)
    expect(res.status).toBe(400)
    const body = (await res.json()) as { code: string }
    expect(body.code).toBe('BAD_REQUEST')
  })

  it('returns 400 for handle@ (empty directoryId)', async () => {
    const res = await app.request('http://localhost/v1/resolve/bob@', {}, env)
    expect(res.status).toBe(400)
    const body = (await res.json()) as { code: string }
    expect(body.code).toBe('BAD_REQUEST')
  })
})
