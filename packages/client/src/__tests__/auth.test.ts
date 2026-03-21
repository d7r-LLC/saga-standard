// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { describe, expect, it, vi } from 'vitest'
import { SagaAuthError, authenticateWithServer, isSessionValid, refreshSession } from '../auth'
import type { WalletSigner } from '../auth'
import type { ChainId } from '@epicdm/saga-sdk'

// ── Helpers ───────────────────────────────────────────────────────────

const WALLET_ADDRESS = '0xaabbccddee1234567890aabbccddee1234567890'
const CHAIN: ChainId = 'eip155:8453'
const SERVER_URL = 'https://saga.example.com'
const CHALLENGE = 'Sign this to prove you own 0xaabb...: nonce=abc123 ts=2026-03-21T10:00:00Z'
const SIGNATURE = 'fake-sig-for-testing'
const SESSION_TOKEN = 'saga-sess-test-token-xyz'

function createMockSigner(overrides?: Partial<WalletSigner>): WalletSigner {
  return {
    signMessage: vi.fn().mockResolvedValue(SIGNATURE),
    getAddress: vi.fn().mockResolvedValue(WALLET_ADDRESS),
    getChain: vi.fn().mockReturnValue(CHAIN),
    ...overrides,
  }
}

function futureIso(minutesFromNow = 5): string {
  return new Date(Date.now() + minutesFromNow * 60_000).toISOString()
}

function pastIso(minutesAgo = 5): string {
  return new Date(Date.now() - minutesAgo * 60_000).toISOString()
}

/** Build a mock fetch that responds to challenge and verify endpoints */
function createMockFetch(options?: {
  challengeStatus?: number
  challengeBody?: unknown
  verifyStatus?: number
  verifyBody?: unknown
  challengeExpiry?: string
}) {
  const { challengeStatus = 200, verifyStatus = 200, challengeExpiry = futureIso() } = options ?? {}

  const challengeBody = options?.challengeBody ?? {
    challenge: CHALLENGE,
    expiresAt: challengeExpiry,
  }

  const verifyBody = options?.verifyBody ?? {
    token: SESSION_TOKEN,
    expiresAt: futureIso(60),
    walletAddress: WALLET_ADDRESS,
  }

  return vi.fn().mockImplementation(async (url: string) => {
    if (url.includes('/v1/auth/challenge')) {
      return {
        ok: challengeStatus >= 200 && challengeStatus < 300,
        status: challengeStatus,
        json: async () => challengeBody,
      }
    }
    if (url.includes('/v1/auth/verify')) {
      return {
        ok: verifyStatus >= 200 && verifyStatus < 300,
        status: verifyStatus,
        json: async () => verifyBody,
      }
    }
    throw new Error(`Unexpected URL: ${url}`)
  })
}

// ── Tests ─────────────────────────────────────────────────────────────

describe('authenticateWithServer', () => {
  it('completes the full challenge-response flow', async () => {
    const signer = createMockSigner()
    const mockFetch = createMockFetch()

    const session = await authenticateWithServer({
      serverUrl: SERVER_URL,
      signer,
      fetch: mockFetch as unknown as typeof globalThis.fetch,
    })

    // Verify challenge was requested
    expect(mockFetch).toHaveBeenCalledTimes(2)
    const [challengeUrl, challengeOpts] = mockFetch.mock.calls[0]
    expect(challengeUrl).toBe(`${SERVER_URL}/v1/auth/challenge`)
    expect(JSON.parse(challengeOpts.body)).toEqual({
      walletAddress: WALLET_ADDRESS,
      chain: CHAIN,
    })

    // Verify signature was sent
    expect(signer.signMessage).toHaveBeenCalledWith(CHALLENGE)

    const [verifyUrl, verifyOpts] = mockFetch.mock.calls[1]
    expect(verifyUrl).toBe(`${SERVER_URL}/v1/auth/verify`)
    expect(JSON.parse(verifyOpts.body)).toEqual({
      walletAddress: WALLET_ADDRESS,
      chain: CHAIN,
      signature: SIGNATURE,
      challenge: CHALLENGE,
    })

    // Verify session returned
    expect(session.token).toBe(SESSION_TOKEN)
    expect(session.walletAddress).toBe(WALLET_ADDRESS)
    expect(session.serverUrl).toBe(SERVER_URL)
    expect(session.expiresAt).toBeInstanceOf(Date)
  })

  it('strips trailing slash from server URL', async () => {
    const mockFetch = createMockFetch()

    const session = await authenticateWithServer({
      serverUrl: `${SERVER_URL}/`,
      signer: createMockSigner(),
      fetch: mockFetch as unknown as typeof globalThis.fetch,
    })

    expect(session.serverUrl).toBe(SERVER_URL)
    expect(mockFetch.mock.calls[0][0]).toBe(`${SERVER_URL}/v1/auth/challenge`)
  })

  it('throws SagaAuthError when challenge request fails', async () => {
    const mockFetch = createMockFetch({
      challengeStatus: 429,
      challengeBody: { error: 'Rate limited', code: 'RATE_LIMITED' },
    })

    await expect(
      authenticateWithServer({
        serverUrl: SERVER_URL,
        signer: createMockSigner(),
        fetch: mockFetch as unknown as typeof globalThis.fetch,
      })
    ).rejects.toThrow(SagaAuthError)

    try {
      await authenticateWithServer({
        serverUrl: SERVER_URL,
        signer: createMockSigner(),
        fetch: mockFetch as unknown as typeof globalThis.fetch,
      })
    } catch (err) {
      const authErr = err as SagaAuthError
      expect(authErr.code).toBe('RATE_LIMITED')
      expect(authErr.statusCode).toBe(429)
      expect(authErr.message).toBe('Rate limited')
    }
  })

  it('throws when challenge is already expired', async () => {
    const mockFetch = createMockFetch({
      challengeExpiry: pastIso(5),
    })

    await expect(
      authenticateWithServer({
        serverUrl: SERVER_URL,
        signer: createMockSigner(),
        fetch: mockFetch as unknown as typeof globalThis.fetch,
      })
    ).rejects.toThrow('Challenge already expired')
  })

  it('throws SagaAuthError when verification fails', async () => {
    const mockFetch = createMockFetch({
      verifyStatus: 401,
      verifyBody: { error: 'Invalid signature', code: 'INVALID_SIGNATURE' },
    })

    await expect(
      authenticateWithServer({
        serverUrl: SERVER_URL,
        signer: createMockSigner(),
        fetch: mockFetch as unknown as typeof globalThis.fetch,
      })
    ).rejects.toThrow(SagaAuthError)

    try {
      await authenticateWithServer({
        serverUrl: SERVER_URL,
        signer: createMockSigner(),
        fetch: mockFetch as unknown as typeof globalThis.fetch,
      })
    } catch (err) {
      const authErr = err as SagaAuthError
      expect(authErr.code).toBe('INVALID_SIGNATURE')
      expect(authErr.statusCode).toBe(401)
    }
  })

  it('handles non-JSON error responses gracefully', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => {
        throw new Error('not JSON')
      },
    })

    await expect(
      authenticateWithServer({
        serverUrl: SERVER_URL,
        signer: createMockSigner(),
        fetch: mockFetch as unknown as typeof globalThis.fetch,
      })
    ).rejects.toThrow(SagaAuthError)

    try {
      await authenticateWithServer({
        serverUrl: SERVER_URL,
        signer: createMockSigner(),
        fetch: mockFetch as unknown as typeof globalThis.fetch,
      })
    } catch (err) {
      const authErr = err as SagaAuthError
      expect(authErr.code).toBe('CHALLENGE_FAILED')
      expect(authErr.statusCode).toBe(500)
    }
  })

  it('propagates signer errors', async () => {
    const failingSigner = createMockSigner({
      signMessage: vi.fn().mockRejectedValue(new Error('User rejected signing')),
    })

    const mockFetch = createMockFetch()

    await expect(
      authenticateWithServer({
        serverUrl: SERVER_URL,
        signer: failingSigner,
        fetch: mockFetch as unknown as typeof globalThis.fetch,
      })
    ).rejects.toThrow('User rejected signing')
  })
})

describe('isSessionValid', () => {
  it('returns true for a session expiring in the future', () => {
    expect(
      isSessionValid({
        token: SESSION_TOKEN,
        expiresAt: new Date(Date.now() + 60_000),
        walletAddress: WALLET_ADDRESS,
        serverUrl: SERVER_URL,
      })
    ).toBe(true)
  })

  it('returns false for an expired session', () => {
    expect(
      isSessionValid({
        token: SESSION_TOKEN,
        expiresAt: new Date(Date.now() - 60_000),
        walletAddress: WALLET_ADDRESS,
        serverUrl: SERVER_URL,
      })
    ).toBe(false)
  })
})

describe('refreshSession', () => {
  it('re-authenticates using the session serverUrl', async () => {
    const signer = createMockSigner()
    const mockFetch = createMockFetch()

    const oldSession = {
      token: 'old-token',
      expiresAt: new Date(Date.now() - 60_000),
      walletAddress: WALLET_ADDRESS,
      serverUrl: SERVER_URL,
    }

    const newSession = await refreshSession({
      session: oldSession,
      signer,
      fetch: mockFetch as unknown as typeof globalThis.fetch,
    })

    expect(newSession.token).toBe(SESSION_TOKEN)
    expect(newSession.serverUrl).toBe(SERVER_URL)
    expect(mockFetch.mock.calls[0][0]).toBe(`${SERVER_URL}/v1/auth/challenge`)
  })
})
