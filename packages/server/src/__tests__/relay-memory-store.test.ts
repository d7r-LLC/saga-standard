// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createCanonicalMemoryStore } from '../relay/memory-store'
import { createMockD1, runMigrations } from './test-helpers'
import type { RelayEnvelope } from '../relay/types'

function makeEnvelope(overrides: Partial<RelayEnvelope> = {}): RelayEnvelope {
  return {
    v: 1,
    type: 'memory-sync',
    scope: 'private',
    from: 'alice@epicflow',
    to: 'alice@epicflow',
    ct: 'encrypted-data',
    ts: new Date().toISOString(),
    id: `msg_${crypto.randomUUID()}`,
    ...overrides,
  }
}

describe('CanonicalMemoryStore', () => {
  let db: D1Database
  let store: ReturnType<typeof createCanonicalMemoryStore>

  beforeEach(async () => {
    vi.useFakeTimers({ now: new Date('2026-03-26T00:00:00.000Z') })
    db = createMockD1()
    await runMigrations(db)
    store = createCanonicalMemoryStore(db)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('stores and retrieves an envelope', async () => {
    const env = makeEnvelope()
    await store.store('alice', env)
    const result = await store.querySince('alice', '1970-01-01T00:00:00.000Z', 50)
    expect(result.envelopes).toHaveLength(1)
    expect(result.envelopes[0].id).toBe(env.id)
  })

  it('returns envelopes only after checkpoint', async () => {
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
    const old = makeEnvelope()
    await store.store('alice', old)

    vi.setSystemTime(new Date('2026-03-01T00:00:00.000Z'))
    const recent = makeEnvelope()
    await store.store('alice', recent)

    const result = await store.querySince('alice', '2026-02-01T00:00:00.000Z', 50)
    expect(result.envelopes).toHaveLength(1)
    expect(result.envelopes[0].id).toBe(recent.id)
  })

  it('does not return envelopes for other agents', async () => {
    await store.store('alice', makeEnvelope({ from: 'alice@epicflow' }))
    await store.store('bob', makeEnvelope({ from: 'bob@epicflow' }))

    const result = await store.querySince('alice', '1970-01-01T00:00:00.000Z', 50)
    expect(result.envelopes).toHaveLength(1)
  })

  it('paginates with hasMore flag', async () => {
    for (let i = 0; i < 5; i++) {
      vi.setSystemTime(new Date(`2026-03-0${i + 1}T00:00:00.000Z`))
      await store.store('alice', makeEnvelope())
    }

    const result = await store.querySince('alice', '1970-01-01T00:00:00.000Z', 3)
    expect(result.envelopes).toHaveLength(3)
    expect(result.hasMore).toBe(true)
    expect(result.checkpoint).toBeTruthy()
  })

  it('returns hasMore=false when no more results', async () => {
    await store.store('alice', makeEnvelope())
    const result = await store.querySince('alice', '1970-01-01T00:00:00.000Z', 50)
    expect(result.hasMore).toBe(false)
  })

  it('returns checkpoint as the stored_at of the last envelope', async () => {
    const env = makeEnvelope({ ts: '2026-03-15T12:00:00.000Z' })
    await store.store('alice', env)
    const result = await store.querySince('alice', '1970-01-01T00:00:00.000Z', 50)
    expect(result.checkpoint).toBeTruthy()
    expect(typeof result.checkpoint).toBe('string')
  })

  it('deduplicates by envelope id', async () => {
    const env = makeEnvelope()
    await store.store('alice', env)
    await store.store('alice', env) // same id
    const result = await store.querySince('alice', '1970-01-01T00:00:00.000Z', 50)
    expect(result.envelopes).toHaveLength(1)
  })
})
