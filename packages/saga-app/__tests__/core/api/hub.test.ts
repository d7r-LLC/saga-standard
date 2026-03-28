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

describe('HubAuthManager.authenticate()', () => {
  it('calls challenge then verify endpoints with correct payloads', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({ challenge: 'sign-this-message', expiresAt: '2026-03-28T00:00:00Z' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ token: 'test-session-token-123' }),
      })

    const signMessage = jest.fn().mockResolvedValue('fake-wallet-signature')

    await hubAuthManager.authenticate('0xWalletAddress', signMessage)

    expect(mockFetch).toHaveBeenCalledTimes(2)

    const [challengeUrl, challengeOpts] = mockFetch.mock.calls[0]
    expect(challengeUrl).toBe(`${HUB_URL}/v1/auth/challenge`)
    expect(challengeOpts.method).toBe('POST')
    expect(JSON.parse(challengeOpts.body)).toEqual({
      walletAddress: '0xWalletAddress',
      chain: 'eip155:8453',
    })

    expect(signMessage).toHaveBeenCalledWith('sign-this-message')

    const [verifyUrl, verifyOpts] = mockFetch.mock.calls[1]
    expect(verifyUrl).toBe(`${HUB_URL}/v1/auth/verify`)
    expect(verifyOpts.method).toBe('POST')
    expect(JSON.parse(verifyOpts.body)).toEqual({
      walletAddress: '0xWalletAddress',
      chain: 'eip155:8453',
      signature: 'fake-wallet-signature',
      challenge: 'sign-this-message',
    })
  })

  it('throws ApiError when challenge endpoint fails', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 503 })

    const err = await hubAuthManager.authenticate('0xWalletAddress', jest.fn()).catch(e => e)

    expect(err).toBeInstanceOf(ApiError)
    expect(err.status).toBe(503)
  })

  it('throws ApiError when verify endpoint fails', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ challenge: 'sign-this', expiresAt: '2026-03-28T00:00:00Z' }),
      })
      .mockResolvedValueOnce({ ok: false, status: 401 })

    const err = await hubAuthManager
      .authenticate('0xWalletAddress', jest.fn().mockResolvedValue('sig'))
      .catch(e => e)

    expect(err).toBeInstanceOf(ApiError)
    expect(err.status).toBe(401)
  })
})

describe('HubAuthManager.isAuthenticated()', () => {
  it('returns false before authenticate', () => {
    expect(hubAuthManager.isAuthenticated()).toBe(false)
  })

  it('returns true after successful authenticate', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ challenge: 'sign-this', expiresAt: '2026-03-28T00:00:00Z' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ token: 'test-session-token-123' }),
      })

    await hubAuthManager.authenticate('0xWalletAddress', jest.fn().mockResolvedValue('sig'))

    expect(hubAuthManager.isAuthenticated()).toBe(true)
  })
})

describe('HubAuthManager.logout()', () => {
  it('clears token and isAuthenticated returns false', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ challenge: 'sign-this', expiresAt: '2026-03-28T00:00:00Z' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ token: 'test-session-token-123' }),
      })

    await hubAuthManager.authenticate('0xWalletAddress', jest.fn().mockResolvedValue('sig'))
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
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ challenge: 'sign-this', expiresAt: '2026-03-28T00:00:00Z' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ token: 'test-auth-token-abc' }),
      })

    await hubAuthManager.authenticate('0xWallet', jest.fn().mockResolvedValue('sig'))
    mockFetch.mockReset()

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
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ challenge: 'sign-this', expiresAt: '2026-03-28T00:00:00Z' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ token: 'test-auth-token-abc' }),
      })

    await hubAuthManager.authenticate('0xWallet', jest.fn().mockResolvedValue('sig'))
    mockFetch.mockReset()

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
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ challenge: 'sign-this', expiresAt: '2026-03-28T00:00:00Z' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ token: 'test-auth-token-abc' }),
      })

    await hubAuthManager.authenticate('0xWallet', jest.fn().mockResolvedValue('sig'))
    mockFetch.mockReset()

    mockFetch.mockResolvedValueOnce({ ok: false, status: 403 })

    const err = (await authenticatedFetch('GET', '/v1/chat/rooms').catch(e => e)) as ApiError

    expect(err).toBeInstanceOf(ApiError)
    expect(err.status).toBe(403)
    expect(err.message).toBe('Server error: 403')
  })

  it('returns empty object for DELETE 204 responses', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ challenge: 'sign-this', expiresAt: '2026-03-28T00:00:00Z' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ token: 'test-auth-token-abc' }),
      })

    await hubAuthManager.authenticate('0xWallet', jest.fn().mockResolvedValue('sig'))
    mockFetch.mockReset()

    mockFetch.mockResolvedValueOnce({ ok: true, status: 204 })

    const result = await authenticatedFetch('DELETE', '/v1/chat/rooms/room-1')

    expect(result).toEqual({})
  })

  it('returns parsed JSON for successful responses', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ challenge: 'sign-this', expiresAt: '2026-03-28T00:00:00Z' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ token: 'test-auth-token-abc' }),
      })

    await hubAuthManager.authenticate('0xWallet', jest.fn().mockResolvedValue('sig'))
    mockFetch.mockReset()

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
