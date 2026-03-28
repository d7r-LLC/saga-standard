// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { afterEach, describe, expect, it, vi } from 'vitest'
import { detectFlowstateMemory } from '../detector'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('detectFlowstateMemory', () => {
  it('returns found when health check succeeds', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('OK', { status: 200 })
    )

    const result = await detectFlowstateMemory('http://localhost:7090')
    expect(result.source).toBe('flowstate-memory')
    expect(result.found).toBe(true)
    expect(result.locations).toContain('http://localhost:7090')
  })

  it('returns not found when health check fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('ECONNREFUSED'))

    const result = await detectFlowstateMemory('http://localhost:7090')
    expect(result.found).toBe(false)
    expect(result.locations).toEqual([])
  })

  it('uses default URL when none provided', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('OK', { status: 200 })
    )

    await detectFlowstateMemory()
    expect(fetchSpy.mock.calls[0][0]).toContain('localhost:7090')
  })
})
