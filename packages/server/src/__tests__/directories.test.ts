// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { beforeEach, describe, expect, it } from 'vitest'
import { app } from '../index'
import { createMockEnv, runMigrations } from './test-helpers'
import type { Env } from '../bindings'

let env: Env

beforeEach(async () => {
  env = createMockEnv()
  await runMigrations(env.DB)
})

async function seedDirectory(
  db: D1Database,
  overrides: Partial<{
    id: string
    directory_id: string
    url: string
    operator_wallet: string
    conformance_level: string
    status: string
    chain: string
    registered_at: string
    updated_at: string
  }> = {}
) {
  const defaults = {
    id: `dir_${Math.random().toString(36).slice(2)}`,
    directory_id: `dir_${Math.random().toString(36).slice(2)}`,
    url: 'https://directory.example.com',
    operator_wallet: '0xaabbccddee1234567890aabbccddee1234567890',
    conformance_level: '1',
    status: 'active',
    chain: 'eip155:84532',
    registered_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
  const row = { ...defaults, ...overrides }

  await db
    .prepare(
      'INSERT INTO directories (id, directory_id, url, operator_wallet, conformance_level, status, chain, registered_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    )
    .bind(
      row.id,
      row.directory_id,
      row.url,
      row.operator_wallet,
      row.conformance_level,
      row.status,
      row.chain,
      row.registered_at,
      row.updated_at
    )
    .run()

  return row
}

describe('GET /v1/directories', () => {
  it('returns an empty list when no directories exist', async () => {
    const res = await app.request('http://localhost/v1/directories', {}, env)
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      directories: unknown[]
      total: number
      page: number
      limit: number
    }
    expect(body.directories).toEqual([])
    expect(body.total).toBe(0)
    expect(body.page).toBe(1)
    expect(body.limit).toBe(20)
  })

  it('returns a paginated list of directories', async () => {
    await seedDirectory(env.DB, { directory_id: 'dir_alpha' })
    await seedDirectory(env.DB, { directory_id: 'dir_beta' })
    await seedDirectory(env.DB, { directory_id: 'dir_gamma' })

    const res = await app.request('http://localhost/v1/directories?page=1&limit=2', {}, env)
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      directories: unknown[]
      total: number
      page: number
      limit: number
    }
    expect(body.directories.length).toBe(2)
    expect(body.total).toBe(3)
    expect(body.page).toBe(1)
    expect(body.limit).toBe(2)
  })

  it('returns second page correctly', async () => {
    await seedDirectory(env.DB, { directory_id: 'dir_alpha' })
    await seedDirectory(env.DB, { directory_id: 'dir_beta' })
    await seedDirectory(env.DB, { directory_id: 'dir_gamma' })

    const res = await app.request('http://localhost/v1/directories?page=2&limit=2', {}, env)
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      directories: unknown[]
      total: number
      page: number
      limit: number
    }
    expect(body.directories.length).toBe(1)
    expect(body.total).toBe(3)
    expect(body.page).toBe(2)
    expect(body.limit).toBe(2)
  })

  it('filters directories by status', async () => {
    await seedDirectory(env.DB, { directory_id: 'dir_active_1', status: 'active' })
    await seedDirectory(env.DB, { directory_id: 'dir_active_2', status: 'active' })
    await seedDirectory(env.DB, { directory_id: 'dir_suspended', status: 'suspended' })

    const res = await app.request('http://localhost/v1/directories?status=active', {}, env)
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      directories: { status: string }[]
      total: number
    }
    expect(body.total).toBe(2)
    expect(body.directories.every(d => d.status === 'active')).toBe(true)
  })

  it('filters directories by suspended status', async () => {
    await seedDirectory(env.DB, { directory_id: 'dir_active_1', status: 'active' })
    await seedDirectory(env.DB, { directory_id: 'dir_suspended', status: 'suspended' })

    const res = await app.request('http://localhost/v1/directories?status=suspended', {}, env)
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      directories: { status: string; directoryId: string }[]
      total: number
    }
    expect(body.total).toBe(1)
    expect(body.directories[0].directoryId).toBe('dir_suspended')
    expect(body.directories[0].status).toBe('suspended')
  })

  it('returns correct shape for a directory in the list', async () => {
    await seedDirectory(env.DB, {
      directory_id: 'dir_test',
      url: 'https://test.example.com',
      operator_wallet: '0x1234',
      conformance_level: '2',
      status: 'active',
      chain: 'eip155:8453',
    })

    const res = await app.request('http://localhost/v1/directories', {}, env)
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      directories: Record<string, unknown>[]
    }
    expect(body.directories.length).toBe(1)
    const d = body.directories[0]
    expect(d.directoryId).toBe('dir_test')
    expect(d.url).toBe('https://test.example.com')
    expect(d.operatorWallet).toBe('0x1234')
    expect(d.conformanceLevel).toBe('2')
    expect(d.status).toBe('active')
    expect(d.chain).toBe('eip155:8453')
    expect('tokenId' in d).toBe(true)
    expect('contractAddress' in d).toBe(true)
    expect('mintTxHash' in d).toBe(true)
    expect('tbaAddress' in d).toBe(true)
    expect('registeredAt' in d).toBe(true)
    expect('updatedAt' in d).toBe(true)
  })

  it('defaults to page 1, limit 20 when params are missing', async () => {
    const res = await app.request('http://localhost/v1/directories', {}, env)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { page: number; limit: number }
    expect(body.page).toBe(1)
    expect(body.limit).toBe(20)
  })

  it('clamps limit to max 100', async () => {
    const res = await app.request('http://localhost/v1/directories?limit=999', {}, env)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { limit: number }
    expect(body.limit).toBe(100)
  })

  it('returns 400 for invalid status filter', async () => {
    const res = await app.request('http://localhost/v1/directories?status=bogus', {}, env)
    expect(res.status).toBe(400)
    const body = (await res.json()) as { code: string }
    expect(body.code).toBe('BAD_REQUEST')
  })
})

describe('GET /v1/directories/:directoryId', () => {
  it('returns a directory by directoryId', async () => {
    await seedDirectory(env.DB, {
      directory_id: 'dir_known',
      url: 'https://known.example.com',
      operator_wallet: '0xdeadbeef',
      conformance_level: '1',
      status: 'active',
      chain: 'eip155:84532',
    })

    const res = await app.request('http://localhost/v1/directories/dir_known', {}, env)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { directory: Record<string, unknown> }
    expect(body.directory).toBeDefined()
    expect(body.directory.directoryId).toBe('dir_known')
    expect(body.directory.url).toBe('https://known.example.com')
    expect(body.directory.operatorWallet).toBe('0xdeadbeef')
    expect(body.directory.conformanceLevel).toBe('1')
    expect(body.directory.status).toBe('active')
    expect(body.directory.chain).toBe('eip155:84532')
    expect('tokenId' in body.directory).toBe(true)
    expect('contractAddress' in body.directory).toBe(true)
    expect('mintTxHash' in body.directory).toBe(true)
    expect('tbaAddress' in body.directory).toBe(true)
    expect('registeredAt' in body.directory).toBe(true)
    expect('updatedAt' in body.directory).toBe(true)
  })

  it('returns 404 for an unknown directoryId', async () => {
    const res = await app.request('http://localhost/v1/directories/dir_nonexistent', {}, env)
    expect(res.status).toBe(404)
    const body = (await res.json()) as { error: string; code: string }
    expect(body.code).toBe('NOT_FOUND')
  })

  it('returns 404 when no directories exist at all', async () => {
    const res = await app.request('http://localhost/v1/directories/dir_anything', {}, env)
    expect(res.status).toBe(404)
  })

  it('returns the correct directory when multiple exist', async () => {
    await seedDirectory(env.DB, { directory_id: 'dir_one' })
    await seedDirectory(env.DB, { directory_id: 'dir_two' })
    await seedDirectory(env.DB, { directory_id: 'dir_three' })

    const res = await app.request('http://localhost/v1/directories/dir_two', {}, env)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { directory: { directoryId: string } }
    expect(body.directory.directoryId).toBe('dir_two')
  })
})
