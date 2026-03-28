// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { act, renderHook, waitFor } from '@testing-library/react-native'
import { useDirectories } from '../../../../src/features/directory/hooks/useDirectories'

const mockGetDirectories = jest.fn()

jest.mock('../../../../src/features/directory/api/directory', () => ({
  getDirectories: (...args: unknown[]) => mockGetDirectories(...args),
  PAGE_SIZE: 20,
}))

const dir1 = { directoryId: 'd1', url: 'https://dir1.test', status: 'active' }
const dir2 = { directoryId: 'd2', url: 'https://dir2.test', status: 'suspended' }

describe('useDirectories', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('fetches directories on mount', async () => {
    mockGetDirectories.mockResolvedValue({ directories: [dir1], total: 1 })

    const { result } = renderHook(() => useDirectories())

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(mockGetDirectories).toHaveBeenCalledWith(1)
    expect(result.current.directories).toEqual([dir1])
    expect(result.current.hasMore).toBe(false)
  })

  it('sets hasMore when more pages exist', async () => {
    const dirs = Array.from({ length: 20 }, (_, i) => ({ ...dir1, directoryId: `d${i}` }))
    mockGetDirectories.mockResolvedValue({ directories: dirs, total: 50 })

    const { result } = renderHook(() => useDirectories())

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.hasMore).toBe(true)
  })

  it('appends results on loadMore', async () => {
    const page1 = Array.from({ length: 20 }, (_, i) => ({ ...dir1, directoryId: `d${i}` }))
    mockGetDirectories.mockResolvedValueOnce({ directories: page1, total: 25 })

    const { result } = renderHook(() => useDirectories())

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.directories).toHaveLength(20)

    mockGetDirectories.mockResolvedValueOnce({ directories: [dir2], total: 25 })
    await act(async () => {
      result.current.loadMore()
    })

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.directories).toHaveLength(21)
    expect(mockGetDirectories).toHaveBeenLastCalledWith(2)
  })

  it('resets to page 1 on refresh', async () => {
    mockGetDirectories.mockResolvedValue({ directories: [dir1], total: 1 })

    const { result } = renderHook(() => useDirectories())

    await waitFor(() => expect(result.current.loading).toBe(false))

    mockGetDirectories.mockResolvedValue({ directories: [dir2], total: 1 })
    await act(async () => {
      result.current.refresh()
    })

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.directories).toEqual([dir2])
    expect(mockGetDirectories).toHaveBeenLastCalledWith(1)
  })

  it('sets error on fetch failure', async () => {
    mockGetDirectories.mockRejectedValue(new Error('Network error'))

    const { result } = renderHook(() => useDirectories())

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBe('Network error')
  })
})
