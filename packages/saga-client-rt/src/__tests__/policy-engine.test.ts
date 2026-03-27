// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { describe, expect, it } from 'vitest'
import { classifyMemory } from '../policy-engine'
import type { CompanyReplicationPolicy, SagaMemory } from '../types'

function makePolicy(overrides?: Partial<CompanyReplicationPolicy>): CompanyReplicationPolicy {
  return {
    orgId: 'acme-corp',
    defaultScope: 'agent-portable',
    restricted: {},
    retention: {},
    ...overrides,
  }
}

function makeMemory(overrides?: Partial<SagaMemory>): SagaMemory {
  return {
    id: 'mem-1',
    type: 'episodic',
    content: { text: 'learned something' },
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('classifyMemory', () => {
  it('returns defaultScope when no restrictions match', () => {
    const result = classifyMemory(makeMemory(), makePolicy())
    expect(result.scope).toBe('agent-portable')
    expect(result.reason).toContain('default')
  })

  it('returns org-internal when memory type is restricted', () => {
    const policy = makePolicy({
      restricted: { memoryTypes: ['procedural'] },
    })
    const memory = makeMemory({ type: 'procedural' })
    const result = classifyMemory(memory, policy)
    expect(result.scope).toBe('org-internal')
    expect(result.reason).toContain('memoryType')
  })

  it('does not restrict non-matching memory types', () => {
    const policy = makePolicy({
      restricted: { memoryTypes: ['procedural'] },
    })
    const memory = makeMemory({ type: 'episodic' })
    const result = classifyMemory(memory, policy)
    expect(result.scope).toBe('agent-portable')
  })

  it('returns org-internal when domain is restricted', () => {
    const policy = makePolicy({
      restricted: { domains: ['finance', 'legal'] },
    })
    const memory = makeMemory({ metadata: { domain: 'finance' } })
    const result = classifyMemory(memory, policy)
    expect(result.scope).toBe('org-internal')
    expect(result.reason).toContain('domain')
  })

  it('does not restrict when memory has no domain metadata', () => {
    const policy = makePolicy({
      restricted: { domains: ['finance'] },
    })
    const memory = makeMemory() // no metadata.domain
    const result = classifyMemory(memory, policy)
    expect(result.scope).toBe('agent-portable')
  })

  it('returns org-internal when content matches a restricted pattern', () => {
    const policy = makePolicy({
      restricted: { contentPatterns: ['confidential', 'secret\\s+project'] },
    })
    const memory = makeMemory({ content: { text: 'this is confidential data' } })
    const result = classifyMemory(memory, policy)
    expect(result.scope).toBe('org-internal')
    expect(result.reason).toContain('contentPattern')
  })

  it('does not restrict when content does not match patterns', () => {
    const policy = makePolicy({
      restricted: { contentPatterns: ['confidential'] },
    })
    const memory = makeMemory({ content: { text: 'public info' } })
    const result = classifyMemory(memory, policy)
    expect(result.scope).toBe('agent-portable')
  })

  it('checks restrictions in priority order: memoryType > domain > contentPattern', () => {
    const policy = makePolicy({
      restricted: {
        memoryTypes: ['procedural'],
        domains: ['finance'],
        contentPatterns: ['secret'],
      },
    })
    const memory = makeMemory({
      type: 'procedural',
      metadata: { domain: 'finance' },
      content: { text: 'secret' },
    })
    const result = classifyMemory(memory, policy)
    expect(result.scope).toBe('org-internal')
    expect(result.reason).toContain('memoryType')
  })

  it('uses mutual as defaultScope when configured', () => {
    const policy = makePolicy({ defaultScope: 'mutual' })
    const result = classifyMemory(makeMemory(), policy)
    expect(result.scope).toBe('mutual')
  })

  it('handles empty restricted object gracefully', () => {
    const policy = makePolicy({ restricted: {} })
    const result = classifyMemory(makeMemory(), policy)
    expect(result.scope).toBe('agent-portable')
  })
})
