// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FlowstateMemoryCollector } from '../extractor'

let collector: FlowstateMemoryCollector

beforeEach(() => {
  collector = new FlowstateMemoryCollector('http://localhost:7090')
})

afterEach(() => {
  vi.restoreAllMocks()
})

function mockSearchResponse(observations: unknown[]) {
  return new Response(
    JSON.stringify({ results: observations, total: observations.length }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  )
}

function mockHealthOk() {
  return new Response('OK', { status: 200 })
}

describe('FlowstateMemoryCollector', () => {
  it('has source "flowstate-memory"', () => {
    expect(collector.source).toBe('flowstate-memory')
  })

  it('extracts memory layer from observations', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(mockHealthOk()) // detect health check
      .mockResolvedValueOnce(mockSearchResponse([
        { id: 1, type: 'discovery', title: 'Redis pattern', narrative: 'Found caching', facts: ['cache works'], concepts: ['redis'], created_at: '2026-03-01T00:00:00Z' },
        { id: 2, type: 'pattern', title: 'TDD flow', narrative: 'Test first', facts: ['Red green refactor'], concepts: ['testing'], created_at: '2026-03-02T00:00:00Z' },
      ]))

    const result = await collector.extract({})
    expect(result.source).toBe('flowstate-memory')
    expect(result.layers.memory?.episodic?.events?.length).toBe(1) // discovery
    expect(result.layers.memory?.procedural?.workflows?.length).toBe(1) // pattern
    expect(result.layers.memory?.semantic?.knowledgeDomains).toContain('redis')
  })

  it('returns empty layers when service unreachable', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'))

    const result = await collector.extract({})
    expect(result.layers).toEqual({})
  })

  it('filters by requested layers', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(mockHealthOk())
      .mockResolvedValueOnce(mockSearchResponse([
        { id: 1, type: 'discovery', title: 'Test', narrative: 'Details', facts: [], concepts: ['ts'], created_at: '2026-03-01T00:00:00Z' },
      ]))

    const result = await collector.extract({ layers: ['memory'] })
    expect(result.layers.memory).toBeDefined()
    expect(result.layers.taskHistory).toBeUndefined()
  })
})
