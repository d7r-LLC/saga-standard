// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { act, renderHook } from '@testing-library/react-native'
import { useIdentity } from '../../../../src/features/identity/hooks/useIdentity'

const mockStorage = {
  identities: [
    {
      id: 'agent-1',
      type: 'agent' as const,
      handle: 'alice',
      tokenId: '1',
      contractAddress: '0x1234',
      tbaAddress: '0xTBA1',
      hubUrl: 'https://hub.example.com',
    },
  ],
  activeIdentityId: 'agent-1',
  setActiveIdentity: jest.fn(),
}

jest.mock('../../../../src/core/providers/StorageProvider', () => ({
  useStorage: () => mockStorage,
}))

describe('useIdentity', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('returns identities from storage', () => {
    const { result } = renderHook(() => useIdentity())
    expect(result.current.identities).toHaveLength(1)
    expect(result.current.identities[0].handle).toBe('alice')
  })

  it('returns active identity', () => {
    const { result } = renderHook(() => useIdentity())
    expect(result.current.activeIdentity?.handle).toBe('alice')
  })

  it('allows setting active identity', () => {
    const { result } = renderHook(() => useIdentity())
    act(() => {
      result.current.setActive('agent-1')
    })
    expect(mockStorage.setActiveIdentity).toHaveBeenCalledWith('agent-1')
  })
})
