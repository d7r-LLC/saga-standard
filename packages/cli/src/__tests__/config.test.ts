// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const TEST_HOME = join(tmpdir(), `saga-test-${Date.now()}`)

vi.mock('node:os', async importOriginal => {
  const actual = await importOriginal<typeof import('node:os')>()
  return { ...actual, homedir: () => TEST_HOME }
})

const { loadConfig, saveConfig, getCachedSession, cacheSession, ensureSagaDirs } =
  await import('../config')

describe('config', () => {
  beforeEach(() => {
    mkdirSync(TEST_HOME, { recursive: true })
  })

  afterEach(() => {
    if (existsSync(TEST_HOME)) {
      rmSync(TEST_HOME, { recursive: true })
    }
  })

  it('creates default config on first load', () => {
    const config = loadConfig()
    expect(config.servers).toEqual({})
    expect(existsSync(join(TEST_HOME, '.saga', 'config.json'))).toBe(true)
  })

  it('persists config across loads', () => {
    const config = loadConfig()
    config.defaultServer = 'https://test.saga.dev'
    config.servers['https://test.saga.dev'] = {
      name: 'Test Server',
      addedAt: '2026-03-21T10:00:00Z',
    }
    saveConfig(config)

    const reloaded = loadConfig()
    expect(reloaded.defaultServer).toBe('https://test.saga.dev')
    expect(reloaded.servers['https://test.saga.dev'].name).toBe('Test Server')
  })

  it('caches and retrieves session tokens', () => {
    const session = {
      token: 'test-session-token',
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      walletAddress: '0xaabb',
    }

    cacheSession('https://test.saga.dev', session)
    const cached = getCachedSession('https://test.saga.dev')

    expect(cached).not.toBeNull()
    expect(cached!.token).toBe('test-session-token')
  })

  it('returns null for expired sessions', () => {
    const session = {
      token: 'expired-token',
      expiresAt: new Date(Date.now() - 60_000).toISOString(),
      walletAddress: '0xaabb',
    }

    cacheSession('https://test.saga.dev', session)
    const cached = getCachedSession('https://test.saga.dev')

    expect(cached).toBeNull()
  })

  it('creates directory structure', () => {
    ensureSagaDirs()
    expect(existsSync(join(TEST_HOME, '.saga'))).toBe(true)
    expect(existsSync(join(TEST_HOME, '.saga', 'wallets'))).toBe(true)
    expect(existsSync(join(TEST_HOME, '.saga', 'auth'))).toBe(true)
    expect(existsSync(join(TEST_HOME, '.saga', 'exports'))).toBe(true)
  })
})
