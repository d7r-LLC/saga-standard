// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { act, renderHook } from '@testing-library/react-native'
import { useMint } from '../../../../src/features/identity/hooks/useMint'

jest.mock('../../../../src/features/identity/chain', () => ({
  mintAgent: jest.fn(),
  mintOrg: jest.fn(),
}))

jest.mock('../../../../src/core/providers/ChainProvider', () => ({
  useChain: () => ({ chainId: 'base-sepolia', publicClient: {} }),
}))

jest.mock('../../../../src/core/providers/StorageProvider', () => ({
  useStorage: () => ({
    addIdentity: jest.fn(),
    setActiveIdentity: jest.fn(),
    identities: [],
  }),
}))

describe('useMint', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('starts at type selection step', () => {
    const { result } = renderHook(() => useMint())
    expect(result.current.state.step).toBe('type')
    expect(result.current.state.entityType).toBeNull()
  })

  it('advances through wizard steps', () => {
    const { result } = renderHook(() => useMint())
    act(() => {
      result.current.selectType('agent')
    })
    expect(result.current.state.step).toBe('handle')
    expect(result.current.state.entityType).toBe('agent')
  })

  it('resets state on cancel', () => {
    const { result } = renderHook(() => useMint())
    act(() => {
      result.current.selectType('agent')
    })
    act(() => {
      result.current.reset()
    })
    expect(result.current.state.step).toBe('type')
    expect(result.current.state.entityType).toBeNull()
  })

  it('transitions to confirm after handle entry', () => {
    const { result } = renderHook(() => useMint())
    act(() => {
      result.current.selectType('agent')
    })
    act(() => {
      result.current.setHandle('myagent')
      result.current.setHubUrl('https://hub.example.com')
      result.current.confirmHandle()
    })
    expect(result.current.state.step).toBe('confirm')
    expect(result.current.state.handle).toBe('myagent')
  })
})
