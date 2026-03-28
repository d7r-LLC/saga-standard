// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { renderHook, waitFor } from '@testing-library/react-native'
import { useEntityDetail } from '../../../../src/features/directory/hooks/useEntityDetail'

const mockGetAgent = jest.fn()
const mockGetOrg = jest.fn()

jest.mock('../../../../src/features/directory/api/directory', () => ({
  getAgent: (...args: unknown[]) => mockGetAgent(...args),
  getOrg: (...args: unknown[]) => mockGetOrg(...args),
}))

describe('useEntityDetail', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('fetches agent detail on mount', async () => {
    const agent = { handle: 'alice', entityType: 'agent', walletAddress: '0x1' }
    mockGetAgent.mockResolvedValue(agent)

    const { result } = renderHook(() => useEntityDetail('alice', 'agent'))

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(mockGetAgent).toHaveBeenCalledWith('alice')
    expect(result.current.entity).toEqual(agent)
    expect(result.current.error).toBeNull()
  })

  it('fetches org detail on mount', async () => {
    const org = { handle: 'acme', entityType: 'org', name: 'Acme Corp' }
    mockGetOrg.mockResolvedValue(org)

    const { result } = renderHook(() => useEntityDetail('acme', 'org'))

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(mockGetOrg).toHaveBeenCalledWith('acme')
    expect(result.current.entity).toEqual(org)
  })

  it('starts in loading state', () => {
    mockGetAgent.mockReturnValue(new Promise(() => {}))
    const { result } = renderHook(() => useEntityDetail('alice', 'agent'))
    expect(result.current.loading).toBe(true)
    expect(result.current.entity).toBeNull()
  })

  it('sets error on fetch failure', async () => {
    mockGetAgent.mockRejectedValue(new Error('Server error: 404'))

    const { result } = renderHook(() => useEntityDetail('unknown', 'agent'))

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBe('Server error: 404')
    expect(result.current.entity).toBeNull()
  })
})
