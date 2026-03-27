// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { act, renderHook } from '@testing-library/react-native'
import { useHandle } from '../../../../src/features/identity/hooks/useHandle'

const mockCheckAvailability = jest.fn()
const mockResolve = jest.fn()

jest.mock('../../../../src/features/identity/chain', () => ({
  checkHandleAvailability: (...args: unknown[]) => mockCheckAvailability(...args),
  resolveHandle: (...args: unknown[]) => mockResolve(...args),
}))

jest.mock('../../../../src/core/providers/ChainProvider', () => ({
  useChain: () => ({
    chainId: 'base-sepolia',
    publicClient: {},
  }),
}))

describe('useHandle', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('checks handle availability', async () => {
    mockCheckAvailability.mockResolvedValue(true)
    const { result } = renderHook(() => useHandle())
    await act(async () => {
      await result.current.checkAvailability('myhandle')
    })
    expect(result.current.status.available).toBe(true)
    expect(result.current.status.handle).toBe('myhandle')
  })

  it('reports unavailable handle', async () => {
    mockCheckAvailability.mockResolvedValue(false)
    const { result } = renderHook(() => useHandle())
    await act(async () => {
      await result.current.checkAvailability('taken')
    })
    expect(result.current.status.available).toBe(false)
  })

  it('handles check errors', async () => {
    mockCheckAvailability.mockRejectedValue(new Error('Network error'))
    const { result } = renderHook(() => useHandle())
    await act(async () => {
      await result.current.checkAvailability('test')
    })
    expect(result.current.status.error).toBe('Network error')
    expect(result.current.status.available).toBeNull()
  })
})
