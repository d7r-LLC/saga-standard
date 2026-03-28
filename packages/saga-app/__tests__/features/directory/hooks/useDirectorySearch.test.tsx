// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { act, renderHook, waitFor } from '@testing-library/react-native'
import { useDirectorySearch } from '../../../../src/features/directory/hooks/useDirectorySearch'

const mockSearchDirectory = jest.fn()

jest.mock('../../../../src/features/directory/api/directory', () => ({
  searchDirectory: (...args: unknown[]) => mockSearchDirectory(...args),
  PAGE_SIZE: 20,
}))

const emptyResult = { agents: [], orgs: [], totalAgents: 0, totalOrgs: 0 }

describe('useDirectorySearch', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.useFakeTimers()
    mockSearchDirectory.mockResolvedValue(emptyResult)
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('fetches on mount with empty query', async () => {
    const { result } = renderHook(() => useDirectorySearch())

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(mockSearchDirectory).toHaveBeenCalledWith('', 'all', 1)
  })

  it('debounces query changes by 300ms', async () => {
    const { result } = renderHook(() => useDirectorySearch())

    await waitFor(() => expect(result.current.loading).toBe(false))
    mockSearchDirectory.mockClear()

    act(() => {
      result.current.setQuery('alice')
    })

    // Not called immediately
    expect(mockSearchDirectory).not.toHaveBeenCalled()

    // Advance past debounce
    await act(async () => {
      jest.advanceTimersByTime(300)
    })

    await waitFor(() => expect(mockSearchDirectory).toHaveBeenCalledWith('alice', 'all', 1))
  })

  it('fetches immediately on filter change', async () => {
    const { result } = renderHook(() => useDirectorySearch())

    await waitFor(() => expect(result.current.loading).toBe(false))
    mockSearchDirectory.mockClear()

    await act(async () => {
      result.current.setFilter('agents')
    })

    await waitFor(() => expect(mockSearchDirectory).toHaveBeenCalledWith('', 'agents', 1))
  })

  it('merges agents and orgs into results', async () => {
    mockSearchDirectory.mockResolvedValue({
      agents: [{ handle: 'alice', entityType: 'agent' }],
      orgs: [{ handle: 'acme', entityType: 'org' }],
      totalAgents: 1,
      totalOrgs: 1,
    })

    const { result } = renderHook(() => useDirectorySearch())

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.results).toHaveLength(2)
  })

  it('appends results on loadMore', async () => {
    const page1Agents = Array.from({ length: 20 }, (_, i) => ({
      handle: `agent${i}`,
      entityType: 'agent' as const,
    }))
    mockSearchDirectory.mockResolvedValueOnce({
      agents: page1Agents,
      orgs: [],
      totalAgents: 30,
      totalOrgs: 0,
    })

    const { result } = renderHook(() => useDirectorySearch())

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.hasMore).toBe(true)

    mockSearchDirectory.mockResolvedValueOnce({
      agents: [{ handle: 'agent20', entityType: 'agent' }],
      orgs: [],
      totalAgents: 30,
      totalOrgs: 0,
    })

    await act(async () => {
      result.current.loadMore()
    })

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.results).toHaveLength(21)
    expect(mockSearchDirectory).toHaveBeenLastCalledWith('', 'all', 2)
  })

  it('resets to page 1 on refresh', async () => {
    mockSearchDirectory.mockResolvedValue(emptyResult)

    const { result } = renderHook(() => useDirectorySearch())

    await waitFor(() => expect(result.current.loading).toBe(false))
    mockSearchDirectory.mockClear()

    await act(async () => {
      result.current.refresh()
    })

    await waitFor(() => expect(mockSearchDirectory).toHaveBeenCalledWith('', 'all', 1))
  })

  it('sets error on fetch failure', async () => {
    mockSearchDirectory.mockRejectedValue(new Error('Network error'))

    const { result } = renderHook(() => useDirectorySearch())

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBe('Network error')
  })
})
