// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { useCallback, useEffect, useRef, useState } from 'react'
import { PAGE_SIZE, searchDirectory } from '../api/directory'
import type { EntityCardData, SearchFilter } from '../types'

export interface UseDirectorySearchResult {
  query: string
  setQuery: (q: string) => void
  filter: SearchFilter
  setFilter: (f: SearchFilter) => void
  results: EntityCardData[]
  loading: boolean
  error: string | null
  hasMore: boolean
  loadMore: () => void
  refresh: () => void
}

export function useDirectorySearch(): UseDirectorySearchResult {
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [filter, setFilter] = useState<SearchFilter>('all')
  const [results, setResults] = useState<EntityCardData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const pageRef = useRef(1)

  // Debounce query by 300ms
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 300)
    return () => clearTimeout(timer)
  }, [query])

  const fetchResults = useCallback(
    async (q: string, f: SearchFilter, page: number, append: boolean) => {
      setLoading(true)
      setError(null)
      try {
        const result = await searchDirectory(q, f, page)
        const items: EntityCardData[] = [...result.agents, ...result.orgs]
        setResults(prev => (append ? [...prev, ...items] : items))
        setHasMore(page * PAGE_SIZE < Math.max(result.totalAgents, result.totalOrgs))
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        setLoading(false)
      }
    },
    []
  )

  // Fetch when debounced query or filter changes
  useEffect(() => {
    pageRef.current = 1
    fetchResults(debouncedQuery, filter, 1, false)
  }, [debouncedQuery, filter, fetchResults])

  const loadMore = useCallback(() => {
    if (loading || !hasMore) return
    const next = pageRef.current + 1
    pageRef.current = next
    fetchResults(debouncedQuery, filter, next, true)
  }, [loading, hasMore, debouncedQuery, filter, fetchResults])

  const refresh = useCallback(() => {
    pageRef.current = 1
    fetchResults(debouncedQuery, filter, 1, false)
  }, [debouncedQuery, filter, fetchResults])

  return { query, setQuery, filter, setFilter, results, loading, error, hasMore, loadMore, refresh }
}
