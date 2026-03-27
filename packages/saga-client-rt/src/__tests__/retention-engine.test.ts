// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runRetention } from '../retention-engine'
import type { CompanyReplicationPolicy, SagaMemory } from '../types'

interface MockStore {
  _data: Map<string, unknown>
  put(key: string, value: unknown): Promise<void>
  get<T = unknown>(key: string): Promise<T | null>
  delete(key: string): Promise<void>
  query(filter: { prefix?: string }): Promise<Array<{ key: string; value: unknown }>>
}

function createMockStore(): MockStore {
  const data = new Map<string, unknown>()
  return {
    _data: data,
    async put(key: string, value: unknown) {
      data.set(key, value)
    },
    async get<T = unknown>(key: string): Promise<T | null> {
      return (data.get(key) as T) ?? null
    },
    async delete(key: string) {
      data.delete(key)
    },
    async query(filter: { prefix?: string }) {
      const entries: Array<{ key: string; value: unknown }> = []
      for (const [key, value] of data) {
        if (!filter.prefix || key.startsWith(filter.prefix)) {
          entries.push({ key, value })
        }
      }
      return entries
    },
  }
}

function makeMemory(overrides: Partial<SagaMemory>): SagaMemory {
  return {
    id: 'mem-1',
    type: 'episodic',
    content: 'test',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('runRetention', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-01T00:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('reclassifies mutual memories older than mutualTtlDays to org-internal', async () => {
    const agentStore = createMockStore()
    const companyStore = createMockStore()
    const auditFn = vi.fn()

    // Mutual memory created 100 days ago
    const oldMemory = makeMemory({
      id: 'mem-old-mutual',
      scope: 'mutual',
      createdAt: '2026-02-01T00:00:00Z',
    })
    agentStore._data.set('memory:mem-old-mutual', oldMemory)

    // Mutual memory created 10 days ago (within TTL)
    const recentMemory = makeMemory({
      id: 'mem-recent-mutual',
      scope: 'mutual',
      createdAt: '2026-05-22T00:00:00Z',
    })
    agentStore._data.set('memory:mem-recent-mutual', recentMemory)

    const policy: CompanyReplicationPolicy = {
      orgId: 'acme',
      defaultScope: 'mutual',
      restricted: {},
      retention: { mutualTtlDays: 90 },
    }

    const result = await runRetention(agentStore, companyStore, policy, auditFn)

    expect(result.mutualDowngraded).toBe(1)
    expect(companyStore._data.has('memory:mem-old-mutual')).toBe(true)
    expect(agentStore._data.has('memory:mem-old-mutual')).toBe(false)
    expect(agentStore._data.has('memory:mem-recent-mutual')).toBe(true)
    expect(auditFn).toHaveBeenCalledTimes(1)
    expect(auditFn).toHaveBeenCalledWith(
      expect.objectContaining({
        memoryId: 'mem-old-mutual',
        appliedScope: 'org-internal',
      })
    )
  })

  it('downgrades oldest portable memories when portableLimit exceeded', async () => {
    const agentStore = createMockStore()
    const companyStore = createMockStore()
    const auditFn = vi.fn()

    for (let i = 1; i <= 5; i++) {
      agentStore._data.set(
        `memory:mem-p${i}`,
        makeMemory({
          id: `mem-p${i}`,
          scope: 'agent-portable',
          createdAt: `2026-05-0${i}T00:00:00Z`,
        })
      )
    }

    const policy: CompanyReplicationPolicy = {
      orgId: 'acme',
      defaultScope: 'agent-portable',
      restricted: {},
      retention: { portableLimit: 3 },
    }

    const result = await runRetention(agentStore, companyStore, policy, auditFn)

    expect(result.portableDowngraded).toBe(2)
    const remaining = await agentStore.query({ prefix: 'memory:' })
    const portableRemaining = remaining
      .map(e => e.value as SagaMemory)
      .filter(m => m.scope === 'agent-portable')
    expect(portableRemaining).toHaveLength(3)
    const mutualMemories = remaining
      .map(e => e.value as SagaMemory)
      .filter(m => m.scope === 'mutual')
    expect(mutualMemories).toHaveLength(2)
    expect(auditFn).toHaveBeenCalledTimes(2)
  })

  it('does nothing when no retention rules are set', async () => {
    const agentStore = createMockStore()
    const companyStore = createMockStore()
    const auditFn = vi.fn()

    agentStore._data.set('memory:mem-1', makeMemory({ id: 'mem-1', scope: 'mutual' }))

    const policy: CompanyReplicationPolicy = {
      orgId: 'acme',
      defaultScope: 'mutual',
      restricted: {},
      retention: {},
    }

    const result = await runRetention(agentStore, companyStore, policy, auditFn)

    expect(result.mutualDowngraded).toBe(0)
    expect(result.portableDowngraded).toBe(0)
    expect(auditFn).not.toHaveBeenCalled()
  })

  it('skips non-memory entries in the store', async () => {
    const agentStore = createMockStore()
    const companyStore = createMockStore()
    const auditFn = vi.fn()

    agentStore._data.set('checkpoint:sync', { checkpoint: '2026-01-01T00:00:00Z' })
    agentStore._data.set('audit:mem-1', { memoryId: 'mem-1' })
    agentStore._data.set(
      'memory:mem-1',
      makeMemory({ id: 'mem-1', scope: 'mutual', createdAt: '2026-01-01T00:00:00Z' })
    )

    const policy: CompanyReplicationPolicy = {
      orgId: 'acme',
      defaultScope: 'mutual',
      restricted: {},
      retention: { mutualTtlDays: 30 },
    }

    const result = await runRetention(agentStore, companyStore, policy, auditFn)
    expect(result.mutualDowngraded).toBe(1)
  })
})
