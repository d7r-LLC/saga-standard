// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { describe, expect, it, vi } from 'vitest'
import { createKeyResolver } from '../key-resolver'

function createMockFetch(responses: Record<string, unknown>): typeof fetch {
  return vi.fn(async (input: string | URL | Request) => {
    const url =
      typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
    const body = responses[url]
    if (body === undefined) {
      return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 })
    }
    return new Response(JSON.stringify(body), { status: 200 })
  }) as unknown as typeof fetch
}

describe('Cross-directory key resolution', () => {
  const hubUrl = 'wss://local-hub.example.com/v1/relay'

  it('resolves local handle via local hub', async () => {
    const publicKey = btoa(String.fromCharCode(...new Uint8Array([1, 2, 3])))
    const mockFetch = createMockFetch({
      'https://local-hub.example.com/v1/keys/alice': { publicKey, entityType: 'agent' },
    })

    const resolver = createKeyResolver(hubUrl, mockFetch)
    const key = await resolver.resolve('alice')
    expect(key).toEqual(new Uint8Array([1, 2, 3]))
  })

  it('resolves handle@localDirectory via local hub', async () => {
    const publicKey = btoa(String.fromCharCode(...new Uint8Array([1, 2, 3])))
    const mockFetch = createMockFetch({
      'https://local-hub.example.com/v1/keys/alice': { publicKey, entityType: 'agent' },
    })

    // Without localDirectoryId set, all identities resolve via local hub
    const resolver = createKeyResolver(hubUrl, mockFetch)
    const key = await resolver.resolve('alice@local-dir')
    expect(key).toEqual(new Uint8Array([1, 2, 3]))
  })

  it('resolves handle@remoteDirectory by fetching directory URL then remote key', async () => {
    const remotePublicKey = btoa(String.fromCharCode(...new Uint8Array([4, 5, 6])))
    const mockFetch = createMockFetch({
      'https://local-hub.example.com/v1/directories/remote-hub': {
        directory: {
          directoryId: 'remote-hub',
          url: 'https://remote-hub.example.com',
          status: 'active',
        },
      },
      'https://remote-hub.example.com/v1/keys/bob': {
        publicKey: remotePublicKey,
        entityType: 'agent',
      },
    })

    const resolver = createKeyResolver(hubUrl, mockFetch, 'local-dir')
    const key = await resolver.resolve('bob@remote-hub')
    expect(key).toEqual(new Uint8Array([4, 5, 6]))
  })

  it('caches cross-directory keys', async () => {
    const remotePublicKey = btoa(String.fromCharCode(...new Uint8Array([4, 5, 6])))
    const mockFetch = createMockFetch({
      'https://local-hub.example.com/v1/directories/remote-hub': {
        directory: {
          directoryId: 'remote-hub',
          url: 'https://remote-hub.example.com',
          status: 'active',
        },
      },
      'https://remote-hub.example.com/v1/keys/bob': {
        publicKey: remotePublicKey,
        entityType: 'agent',
      },
    })

    const resolver = createKeyResolver(hubUrl, mockFetch, 'local-dir')
    await resolver.resolve('bob@remote-hub')
    await resolver.resolve('bob@remote-hub')

    // Should have fetched the key only once (cached)
    expect(mockFetch).toHaveBeenCalledTimes(2) // directory lookup + key fetch (first call only)
  })

  it('caches directory URL separately from keys', async () => {
    const key1 = btoa(String.fromCharCode(...new Uint8Array([4, 5, 6])))
    const key2 = btoa(String.fromCharCode(...new Uint8Array([7, 8, 9])))
    const mockFetch = createMockFetch({
      'https://local-hub.example.com/v1/directories/remote-hub': {
        directory: {
          directoryId: 'remote-hub',
          url: 'https://remote-hub.example.com',
          status: 'active',
        },
      },
      'https://remote-hub.example.com/v1/keys/bob': { publicKey: key1, entityType: 'agent' },
      'https://remote-hub.example.com/v1/keys/carol': { publicKey: key2, entityType: 'agent' },
    })

    const resolver = createKeyResolver(hubUrl, mockFetch, 'local-dir')
    await resolver.resolve('bob@remote-hub')
    await resolver.resolve('carol@remote-hub')

    // Directory URL should be fetched only once for two keys in same directory
    const calls = (mockFetch as ReturnType<typeof vi.fn>).mock.calls.map(c => c[0])
    const dirCalls = calls.filter((url: string) => url.includes('/v1/directories/'))
    expect(dirCalls.length).toBe(1)
  })

  it('throws when remote directory not found', async () => {
    const mockFetch = createMockFetch({}) // empty: all 404s

    const resolver = createKeyResolver(hubUrl, mockFetch, 'local-dir')
    await expect(resolver.resolve('bob@nonexistent-hub')).rejects.toThrow()
  })

  it('throws when remote key not found', async () => {
    const mockFetch = createMockFetch({
      'https://local-hub.example.com/v1/directories/remote-hub': {
        directory: {
          directoryId: 'remote-hub',
          url: 'https://remote-hub.example.com',
          status: 'active',
        },
      },
      // No key for bob at remote hub
    })

    const resolver = createKeyResolver(hubUrl, mockFetch, 'local-dir')
    await expect(resolver.resolve('bob@remote-hub')).rejects.toThrow()
  })

  it('manual register overrides cross-directory resolution', async () => {
    const manualKey = new Uint8Array([10, 11, 12])
    const mockFetch = createMockFetch({})

    const resolver = createKeyResolver(hubUrl, mockFetch, 'local-dir')
    resolver.register('bob@remote-hub', manualKey)

    const key = await resolver.resolve('bob@remote-hub')
    expect(key).toEqual(manualKey)
    // No fetch calls made
    expect(mockFetch).not.toHaveBeenCalled()
  })
})
