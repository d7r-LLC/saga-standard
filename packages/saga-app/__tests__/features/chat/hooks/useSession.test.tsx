// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { act, renderHook } from '@testing-library/react-native'
import { useSession } from '../../../../src/features/chat/hooks/useSession'
import { hubAuthManager } from '../../../../src/core/api/hub'

const mockRequestChallenge = jest.fn()
const mockVerifyChallenge = jest.fn()
const mockGetWalletClient = jest.fn()
const mockSignMessage = jest.fn()

jest.mock('../../../../src/features/chat/api/session', () => ({
  requestChallenge: (...args: unknown[]) => mockRequestChallenge(...args),
  verifyChallenge: (...args: unknown[]) => mockVerifyChallenge(...args),
}))

jest.mock('../../../../src/core/providers/StorageProvider', () => ({
  useStorage: () => ({
    wallets: [{ id: 'w1', address: '0xabc', chain: 'base-sepolia', type: 'self-custody' }],
    activeWalletId: 'w1',
  }),
}))

jest.mock('../../../../src/features/wallet/hooks/useWalletSigner', () => ({
  useWalletSigner: () => ({
    getWalletClient: mockGetWalletClient,
    signing: false,
    error: null,
  }),
}))

describe('useSession', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    hubAuthManager.logout()
    mockGetWalletClient.mockResolvedValue({ signMessage: mockSignMessage })
    mockSignMessage.mockResolvedValue('0xsig123')
    mockRequestChallenge.mockResolvedValue({
      challenge: 'Sign this to prove you own 0xabc: nonce=nonce_123 ts=2026-03-28T00:00:00Z',
      expiresAt: '2026-03-28T00:05:00Z',
    })
    mockVerifyChallenge.mockResolvedValue({
      token: 'saga_sess_tok_abc123',
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
      walletAddress: '0xabc',
    })
  })

  it('returns null token initially', () => {
    const { result } = renderHook(() => useSession())
    expect(result.current.token).toBeNull()
    expect(result.current.isAuthenticated).toBe(false)
  })

  it('completes challenge-response flow via getToken', async () => {
    const { result } = renderHook(() => useSession())

    let token: string | undefined
    await act(async () => {
      token = await result.current.getToken()
    })

    expect(token).toBe('saga_sess_tok_abc123')
    expect(mockRequestChallenge).toHaveBeenCalledWith('0xabc', 'base-sepolia')
    expect(mockSignMessage).toHaveBeenCalledWith({
      message: 'Sign this to prove you own 0xabc: nonce=nonce_123 ts=2026-03-28T00:00:00Z',
    })
    expect(mockVerifyChallenge).toHaveBeenCalledWith(
      '0xabc',
      'base-sepolia',
      '0xsig123',
      'Sign this to prove you own 0xabc: nonce=nonce_123 ts=2026-03-28T00:00:00Z'
    )
  })

  it('returns cached token on subsequent calls', async () => {
    const { result } = renderHook(() => useSession())

    await act(async () => {
      await result.current.getToken()
    })
    mockRequestChallenge.mockClear()

    let token: string | undefined
    await act(async () => {
      token = await result.current.getToken()
    })

    expect(token).toBe('saga_sess_tok_abc123')
    expect(mockRequestChallenge).not.toHaveBeenCalled()
  })

  it('refreshes expired token', async () => {
    mockVerifyChallenge
      .mockResolvedValueOnce({
        token: 'saga_sess_tok_expired',
        expiresAt: new Date(Date.now() - 1000).toISOString(),
        walletAddress: '0xabc',
      })
      .mockResolvedValueOnce({
        token: 'saga_sess_tok_fresh',
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
        walletAddress: '0xabc',
      })

    const { result } = renderHook(() => useSession())

    await act(async () => {
      await result.current.getToken()
    })

    let token: string | undefined
    await act(async () => {
      token = await result.current.getToken()
    })

    expect(token).toBe('saga_sess_tok_fresh')
    expect(mockRequestChallenge).toHaveBeenCalledTimes(2)
  })

  it('sets error on auth failure', async () => {
    mockRequestChallenge.mockRejectedValue(new Error('Network error'))

    const { result } = renderHook(() => useSession())

    await act(async () => {
      try {
        await result.current.getToken()
      } catch {
        // expected
      }
    })

    expect(result.current.error).toBe('Network error')
  })
})
