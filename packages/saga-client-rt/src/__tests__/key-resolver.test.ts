// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createKeyResolver } from '../key-resolver'

function base64Encode(str: string): string {
  return btoa(str)
}

describe('createKeyResolver', () => {
  const mockFetch = vi.fn()

  beforeEach(() => {
    mockFetch.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('fetches public key from hub and returns Uint8Array', async () => {
    const keyBase64 = base64Encode('test-public-key-32-bytes-padding!')
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ handle: 'bob', publicKey: keyBase64, entityType: 'agent' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )

    const resolver = createKeyResolver('wss://hub.example.com/v1/relay', mockFetch)
    const key = await resolver.resolve('bob@epicflow')

    expect(mockFetch).toHaveBeenCalledWith('https://hub.example.com/v1/keys/bob')
    expect(key).toBeInstanceOf(Uint8Array)
  })

  it('caches resolved keys and does not re-fetch', async () => {
    const keyBase64 = base64Encode('test-public-key-32-bytes-padding!')
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ handle: 'bob', publicKey: keyBase64, entityType: 'agent' }), {
        status: 200,
      })
    )

    const resolver = createKeyResolver('wss://hub.example.com/v1/relay', mockFetch)
    await resolver.resolve('bob@epicflow')
    await resolver.resolve('bob@epicflow')

    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('throws on 404 (unknown handle)', async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ error: 'Handle not found' }), { status: 404 })
    )

    const resolver = createKeyResolver('wss://hub.example.com/v1/relay', mockFetch)
    await expect(resolver.resolve('unknown@epicflow')).rejects.toThrow(
      'No public key found for unknown'
    )
  })

  it('allows manual registration that overrides cache', async () => {
    const resolver = createKeyResolver('wss://hub.example.com/v1/relay', mockFetch)
    const manualKey = new Uint8Array(32).fill(42)
    resolver.register('bob@epicflow', manualKey)

    const key = await resolver.resolve('bob@epicflow')
    expect(key).toBe(manualKey)
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('derives HTTP base URL from various WSS URL formats', async () => {
    const keyBase64 = base64Encode('key')
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ handle: 'bob', publicKey: keyBase64, entityType: 'agent' }), {
        status: 200,
      })
    )

    const resolver = createKeyResolver('wss://api.saga.dev/v1/relay', mockFetch)
    await resolver.resolve('bob@dir')

    expect(mockFetch).toHaveBeenCalledWith('https://api.saga.dev/v1/keys/bob')
  })
})
