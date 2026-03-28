// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { useCallback, useEffect, useRef, useState } from 'react'
import { PAGE_SIZE, getDirectories } from '../api/directory'
import type { DirectorySummary } from '../types'

export interface UseDirectoriesResult {
  directories: DirectorySummary[]
  loading: boolean
  error: string | null
  hasMore: boolean
  loadMore: () => void
  refresh: () => void
}

export function useDirectories(): UseDirectoriesResult {
  const [directories, setDirectories] = useState<DirectorySummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const pageRef = useRef(1)

  const fetchPage = useCallback(async (page: number, append: boolean) => {
    setLoading(true)
    setError(null)
    try {
      const result = await getDirectories(page)
      setDirectories(prev => (append ? [...prev, ...result.directories] : result.directories))
      setHasMore(page * PAGE_SIZE < result.total)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchPage(1, false)
  }, [fetchPage])

  const loadMore = useCallback(() => {
    if (loading || !hasMore) return
    const next = pageRef.current + 1
    pageRef.current = next
    fetchPage(next, true)
  }, [loading, hasMore, fetchPage])

  const refresh = useCallback(() => {
    pageRef.current = 1
    fetchPage(1, false)
  }, [fetchPage])

  return { directories, loading, error, hasMore, loadMore, refresh }
}
