// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FlowstateMemoryClient } from '../client'

let client: FlowstateMemoryClient

beforeEach(() => {
  client = new FlowstateMemoryClient('http://localhost:7090')
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('FlowstateMemoryClient', () => {
  it('health check returns true on 200', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('OK', { status: 200 })
    )
    const result = await client.healthCheck()
    expect(result).toBe(true)
  })

  it('health check returns false on error', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('ECONNREFUSED'))
    const result = await client.healthCheck()
    expect(result).toBe(false)
  })

  it('search returns observations', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({
        results: [
          { id: 1, type: 'discovery', title: 'Found pattern', narrative: 'Details', facts: ['fact1'], concepts: ['ts'], created_at: '2026-03-01T00:00:00Z' },
        ],
        total: 1,
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    )

    const result = await client.search({ limit: 10 })
    expect(result.results).toHaveLength(1)
    expect(result.results[0].type).toBe('discovery')
  })

  it('search passes query parameters', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ results: [], total: 0 }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    )

    await client.search({ limit: 5, offset: 10, type: 'bugfix' })
    const calledUrl = fetchSpy.mock.calls[0][0] as string
    expect(calledUrl).toContain('/api/memory/search')
  })

  it('getObservations fetches by ids', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({
        observations: [
          { id: 1, type: 'discovery', title: 'Test', created_at: '2026-03-01T00:00:00Z' },
        ],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    )

    const result = await client.getObservations([1])
    expect(result).toHaveLength(1)
  })
})
