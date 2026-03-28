// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { ApiError, HUB_URL, authenticatedFetch, hubAuthManager } from '../../../src/core/api/hub'

const mockFetch = jest.fn()
const originalFetch = globalThis.fetch

beforeAll(() => {
  globalThis.fetch = mockFetch as unknown as typeof fetch
})
afterAll(() => {
  globalThis.fetch = originalFetch
})
beforeEach(() => {
  mockFetch.mockReset()
  hubAuthManager.logout()
})

describe('HUB_URL', () => {
  it('points to localhost hub', () => {
    expect(HUB_URL).toBe('http://localhost:8787')
  })
})

describe('ApiError', () => {
  it('sets status and default message', () => {
    const err = new ApiError(500)
    expect(err.status).toBe(500)
    expect(err.message).toBe('Server error: 500')
    expect(err.name).toBe('ApiError')
  })

  it('uses custom message when provided', () => {
    const err = new ApiError(401, 'Not authenticated')
    expect(err.message).toBe('Not authenticated')
  })
})

describe('HubAuthManager.setToken()', () => {
  it('stores token and makes it retrievable via getToken()', () => {
    hubAuthManager.setToken('test-token-abc')
    expect(hubAuthManager.getToken()).toBe('test-token-abc')
  })
})

describe('HubAuthManager.isAuthenticated()', () => {
  it('returns false before setToken', () => {
    expect(hubAuthManager.isAuthenticated()).toBe(false)
  })

  it('returns true after setToken', () => {
    hubAuthManager.setToken('test-token-abc')
    expect(hubAuthManager.isAuthenticated()).toBe(true)
  })
})

describe('HubAuthManager.logout()', () => {
  it('clears token and isAuthenticated returns false', () => {
    hubAuthManager.setToken('test-token-abc')
    expect(hubAuthManager.isAuthenticated()).toBe(true)

    hubAuthManager.logout()

    expect(hubAuthManager.isAuthenticated()).toBe(false)
    expect(hubAuthManager.getToken()).toBeNull()
  })
})

describe('authenticatedFetch()', () => {
  it('throws ApiError(401) when not authenticated', async () => {
    const err = (await authenticatedFetch('GET', '/v1/chat/rooms').catch(e => e)) as ApiError

    expect(err).toBeInstanceOf(ApiError)
    expect(err.status).toBe(401)
    expect(err.message).toBe('Not authenticated')
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('adds Bearer auth header with token', async () => {
    hubAuthManager.setToken('test-auth-token-abc')

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ rooms: [] }),
    })

    await authenticatedFetch('GET', '/v1/chat/rooms')

    expect(mockFetch).toHaveBeenCalledTimes(1)
    const [url, opts] = mockFetch.mock.calls[0]
    expect(url).toBe(`${HUB_URL}/v1/chat/rooms`)
    expect(opts.headers.Authorization).toBe('Bearer test-auth-token-abc')
    expect(opts.headers['Content-Type']).toBe('application/json')
  })

  it('sends body when provided', async () => {
    hubAuthManager.setToken('test-auth-token-abc')

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ room: { id: 'room-1' } }),
    })

    await authenticatedFetch('POST', '/v1/chat/rooms', { name: 'test-room' })

    const [, opts] = mockFetch.mock.calls[0]
    expect(opts.method).toBe('POST')
    expect(JSON.parse(opts.body)).toEqual({ name: 'test-room' })
  })

  it('throws ApiError on non-2xx response', async () => {
    hubAuthManager.setToken('test-auth-token-abc')

    mockFetch.mockResolvedValueOnce({ ok: false, status: 403 })

    const err = (await authenticatedFetch('GET', '/v1/chat/rooms').catch(e => e)) as ApiError

    expect(err).toBeInstanceOf(ApiError)
    expect(err.status).toBe(403)
    expect(err.message).toBe('Server error: 403')
  })

  it('returns empty object for DELETE 204 responses', async () => {
    hubAuthManager.setToken('test-auth-token-abc')

    mockFetch.mockResolvedValueOnce({ ok: true, status: 204 })

    const result = await authenticatedFetch('DELETE', '/v1/chat/rooms/room-1')

    expect(result).toEqual({})
  })

  it('returns parsed JSON for successful responses', async () => {
    hubAuthManager.setToken('test-auth-token-abc')

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ rooms: [{ id: 'room-1', name: 'general' }] }),
    })

    const result = await authenticatedFetch<{ rooms: { id: string; name: string }[] }>(
      'GET',
      '/v1/chat/rooms'
    )

    expect(result.rooms).toHaveLength(1)
    expect(result.rooms[0].id).toBe('room-1')
  })
})
