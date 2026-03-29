> **FlowState Document:** `docu_PJPFgrdrTd`

# Phase 5: Directory + Discovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a functional directory browser to the SAGA app so users can search for agents and orgs by handle, view on-chain identity details, and browse federated directories.

**Architecture:** New `features/directory/` module following the existing feature-module pattern (api, hooks, screens, components). Three screens replace the DirectoryStack placeholder. A thin API client wraps the server REST endpoints. Three hooks manage search/pagination/detail state.

**Tech Stack:** React Native 0.84, React 19, TypeScript, Jest + React Native Testing Library, React Navigation 7.x native stack

---

## File Structure

```
Create: src/features/directory/types.ts                    — Type definitions for all directory entities
Create: src/features/directory/api/directory.ts             — HTTP client wrapping server REST endpoints
Create: src/features/directory/hooks/useEntityDetail.ts     — Fetch single agent/org by handle
Create: src/features/directory/hooks/useDirectories.ts      — Fetch federated directories with pagination
Create: src/features/directory/hooks/useDirectorySearch.ts  — Debounced search with filter tabs + pagination
Create: src/features/directory/components/EntityCard.tsx    — Pressable card for search results
Create: src/features/directory/screens/DirectoryHome.tsx    — Main search screen with results list
Create: src/features/directory/screens/EntityDetail.tsx     — Agent/org detail view
Create: src/features/directory/screens/DirectoryList.tsx    — Federated directories browser
Modify: src/navigation/types.ts:7-9                        — Expand DirectoryStackParamList
Modify: src/navigation/stacks/DirectoryStack.tsx            — Replace placeholder with real screens

Tests:
Create: __tests__/features/directory/api/directory.test.ts
Create: __tests__/features/directory/hooks/useEntityDetail.test.tsx
Create: __tests__/features/directory/hooks/useDirectories.test.tsx
Create: __tests__/features/directory/hooks/useDirectorySearch.test.tsx
```

All paths relative to `packages/saga-app/`.

---

### Task 1: Types and API Client

**Files:**

- Create: `src/features/directory/types.ts`
- Create: `src/features/directory/api/directory.ts`
- Test: `__tests__/features/directory/api/directory.test.ts`

- [ ] **Step 1: Create type definitions**

Create `src/features/directory/types.ts`:

```typescript
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

export interface AgentSummary {
  handle: string
  walletAddress: string
  chain: string
  entityType: 'agent'
  tokenId: string | null
  registeredAt: string
}

export interface OrgSummary {
  handle: string
  name: string
  walletAddress: string
  chain: string
  entityType: 'org'
  tokenId: string | null
  registeredAt: string
}

export type EntityCardData = AgentSummary | OrgSummary

export interface AgentDetail extends AgentSummary {
  publicKey: string | null
  homeHubUrl: string | null
  tbaAddress: string | null
  contractAddress: string | null
  mintTxHash: string | null
  updatedAt: string
}

export interface OrgDetail extends OrgSummary {
  publicKey: string | null
  tbaAddress: string | null
  contractAddress: string | null
  mintTxHash: string | null
  updatedAt: string
}

export interface DirectorySummary {
  directoryId: string
  url: string
  operatorWallet: string
  conformanceLevel: string
  status: 'active' | 'suspended' | 'flagged' | 'revoked'
  chain: string
  tokenId: number | null
  registeredAt: string
}

export type SearchFilter = 'all' | 'agents' | 'orgs'

export interface SearchResult {
  agents: AgentSummary[]
  orgs: OrgSummary[]
  totalAgents: number
  totalOrgs: number
}

export interface DirectoriesResult {
  directories: DirectorySummary[]
  total: number
}

export type ResolvedEntity = AgentDetail | OrgDetail
```

- [ ] **Step 2: Write failing API client tests**

Create `__tests__/features/directory/api/directory.test.ts`:

```typescript
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import {
  searchDirectory,
  getAgent,
  getOrg,
  getDirectories,
  resolveHandle,
  HUB_URL,
} from '../../../../src/features/directory/api/directory'

const mockFetch = jest.fn()
const originalFetch = global.fetch

beforeAll(() => {
  global.fetch = mockFetch as unknown as typeof fetch
})
afterAll(() => {
  global.fetch = originalFetch
})
beforeEach(() => {
  mockFetch.mockReset()
})

describe('searchDirectory', () => {
  it('calls /v1/agents when filter is agents', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ agents: [{ handle: 'alice', entityType: 'agent' }], total: 1 }),
    })

    const result = await searchDirectory('alice', 'agents', 1)

    expect(mockFetch).toHaveBeenCalledTimes(1)
    expect(mockFetch.mock.calls[0][0]).toContain('/v1/agents?')
    expect(mockFetch.mock.calls[0][0]).toContain('search=alice')
    expect(result.agents).toHaveLength(1)
    expect(result.orgs).toHaveLength(0)
    expect(result.totalAgents).toBe(1)
    expect(result.totalOrgs).toBe(0)
  })

  it('calls /v1/orgs when filter is orgs', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ organizations: [{ handle: 'acme', name: 'Acme' }], total: 1 }),
    })

    const result = await searchDirectory('acme', 'orgs', 1)

    expect(mockFetch).toHaveBeenCalledTimes(1)
    expect(mockFetch.mock.calls[0][0]).toContain('/v1/orgs?')
    expect(result.orgs).toHaveLength(1)
    expect(result.orgs[0].entityType).toBe('org')
    expect(result.agents).toHaveLength(0)
  })

  it('calls both endpoints when filter is all', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ agents: [{ handle: 'alice' }], total: 1 }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ organizations: [{ handle: 'acme' }], total: 1 }),
      })

    const result = await searchDirectory('', 'all', 1)

    expect(mockFetch).toHaveBeenCalledTimes(2)
    expect(result.agents).toHaveLength(1)
    expect(result.orgs).toHaveLength(1)
  })

  it('omits search param when query is empty', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ agents: [], total: 0 }),
    })

    await searchDirectory('', 'agents', 1)

    expect(mockFetch.mock.calls[0][0]).not.toContain('search=')
  })

  it('throws on server error', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 })

    await expect(searchDirectory('x', 'agents', 1)).rejects.toThrow('Server error: 500')
  })
})

describe('getAgent', () => {
  it('returns agent detail', async () => {
    const agent = {
      handle: 'alice',
      walletAddress: '0x1',
      entityType: 'agent',
      homeHubUrl: 'https://hub.test',
    }
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ agent }),
    })

    const result = await getAgent('alice')

    expect(mockFetch.mock.calls[0][0]).toContain('/v1/agents/alice')
    expect(result.handle).toBe('alice')
  })

  it('throws on 404', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404 })

    await expect(getAgent('unknown')).rejects.toThrow('Server error: 404')
  })
})

describe('getOrg', () => {
  it('returns org detail with entityType', async () => {
    const org = { handle: 'acme', name: 'Acme Corp', walletAddress: '0x2' }
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ organization: org }),
    })

    const result = await getOrg('acme')

    expect(result.handle).toBe('acme')
    expect(result.entityType).toBe('org')
  })
})

describe('getDirectories', () => {
  it('returns paginated directories', async () => {
    const dirs = [{ directoryId: 'd1', url: 'https://dir.test', status: 'active' }]
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ directories: dirs, total: 1 }),
    })

    const result = await getDirectories(1)

    expect(mockFetch.mock.calls[0][0]).toContain('/v1/directories?')
    expect(mockFetch.mock.calls[0][0]).toContain('page=1')
    expect(result.directories).toHaveLength(1)
    expect(result.total).toBe(1)
  })
})

describe('resolveHandle', () => {
  it('returns resolved entity', async () => {
    const entity = { handle: 'alice', entityType: 'agent', walletAddress: '0x1' }
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(entity),
    })

    const result = await resolveHandle('alice')

    expect(result).toEqual(entity)
  })

  it('returns null on 404', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404 })

    const result = await resolveHandle('unknown')

    expect(result).toBeNull()
  })

  it('throws on non-404 errors', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 })

    await expect(resolveHandle('x')).rejects.toThrow('Server error: 500')
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd packages/saga-app && npx jest __tests__/features/directory/api/directory.test.ts --no-coverage`
Expected: FAIL — `Cannot find module '../../../../src/features/directory/api/directory'`

- [ ] **Step 4: Implement the API client**

Create `src/features/directory/api/directory.ts`:

```typescript
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import type {
  AgentDetail,
  AgentSummary,
  DirectoriesResult,
  DirectorySummary,
  OrgDetail,
  OrgSummary,
  ResolvedEntity,
  SearchFilter,
  SearchResult,
} from '../types'

export const HUB_URL = 'https://saga-hub.d7r-LLC.workers.dev'
export const PAGE_SIZE = 20

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Server error: ${res.status}`)
  return res.json() as Promise<T>
}

export async function searchDirectory(
  query: string,
  filter: SearchFilter,
  page: number
): Promise<SearchResult> {
  const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) })
  if (query) params.set('search', query)

  if (filter === 'agents') {
    const data = await fetchJson<{ agents: AgentSummary[]; total: number }>(
      `${HUB_URL}/v1/agents?${params}`
    )
    return { agents: data.agents, orgs: [], totalAgents: data.total, totalOrgs: 0 }
  }

  if (filter === 'orgs') {
    const data = await fetchJson<{ organizations: OrgSummary[]; total: number }>(
      `${HUB_URL}/v1/orgs?${params}`
    )
    return {
      agents: [],
      orgs: data.organizations.map(o => ({ ...o, entityType: 'org' as const })),
      totalAgents: 0,
      totalOrgs: data.total,
    }
  }

  const [agentsData, orgsData] = await Promise.all([
    fetchJson<{ agents: AgentSummary[]; total: number }>(`${HUB_URL}/v1/agents?${params}`),
    fetchJson<{ organizations: OrgSummary[]; total: number }>(`${HUB_URL}/v1/orgs?${params}`),
  ])

  return {
    agents: agentsData.agents,
    orgs: orgsData.organizations.map(o => ({ ...o, entityType: 'org' as const })),
    totalAgents: agentsData.total,
    totalOrgs: orgsData.total,
  }
}

export async function getAgent(handle: string): Promise<AgentDetail> {
  const data = await fetchJson<{ agent: AgentDetail }>(
    `${HUB_URL}/v1/agents/${encodeURIComponent(handle)}`
  )
  return data.agent
}

export async function getOrg(handle: string): Promise<OrgDetail> {
  const data = await fetchJson<{ organization: OrgDetail }>(
    `${HUB_URL}/v1/orgs/${encodeURIComponent(handle)}`
  )
  return { ...data.organization, entityType: 'org' as const }
}

export async function getDirectories(page: number): Promise<DirectoriesResult> {
  const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) })
  const data = await fetchJson<{ directories: DirectorySummary[]; total: number }>(
    `${HUB_URL}/v1/directories?${params}`
  )
  return { directories: data.directories, total: data.total }
}

export async function resolveHandle(handle: string): Promise<ResolvedEntity | null> {
  try {
    return await fetchJson<ResolvedEntity>(`${HUB_URL}/v1/resolve/${encodeURIComponent(handle)}`)
  } catch (err) {
    if (err instanceof Error && err.message === 'Server error: 404') return null
    throw err
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd packages/saga-app && npx jest __tests__/features/directory/api/directory.test.ts --no-coverage`
Expected: PASS (10 tests)

- [ ] **Step 6: Commit**

```bash
git add src/features/directory/types.ts src/features/directory/api/directory.ts __tests__/features/directory/api/directory.test.ts
git commit -m "feat(saga-app): add directory types and API client

Built with Epic Flowstate"
```

---

### Task 2: useEntityDetail Hook

**Files:**

- Create: `src/features/directory/hooks/useEntityDetail.ts`
- Test: `__tests__/features/directory/hooks/useEntityDetail.test.tsx`

- [ ] **Step 1: Write failing tests**

Create `__tests__/features/directory/hooks/useEntityDetail.test.tsx`:

```typescript
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { renderHook, act, waitFor } from '@testing-library/react-native'
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/saga-app && npx jest __tests__/features/directory/hooks/useEntityDetail.test.tsx --no-coverage`
Expected: FAIL — `Cannot find module '../../../../src/features/directory/hooks/useEntityDetail'`

- [ ] **Step 3: Implement the hook**

Create `src/features/directory/hooks/useEntityDetail.ts`:

```typescript
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { useCallback, useEffect, useState } from 'react'
import { getAgent, getOrg } from '../api/directory'
import type { AgentDetail, OrgDetail } from '../types'

export interface UseEntityDetailResult {
  entity: AgentDetail | OrgDetail | null
  loading: boolean
  error: string | null
}

export function useEntityDetail(
  handle: string,
  entityType: 'agent' | 'org'
): UseEntityDetailResult {
  const [entity, setEntity] = useState<AgentDetail | OrgDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchEntity = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = entityType === 'agent' ? await getAgent(handle) : await getOrg(handle)
      setEntity(result)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [handle, entityType])

  useEffect(() => {
    fetchEntity()
  }, [fetchEntity])

  return { entity, loading, error }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/saga-app && npx jest __tests__/features/directory/hooks/useEntityDetail.test.tsx --no-coverage`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/features/directory/hooks/useEntityDetail.ts __tests__/features/directory/hooks/useEntityDetail.test.tsx
git commit -m "feat(saga-app): add useEntityDetail hook

Built with Epic Flowstate"
```

---

### Task 3: useDirectories Hook

**Files:**

- Create: `src/features/directory/hooks/useDirectories.ts`
- Test: `__tests__/features/directory/hooks/useDirectories.test.tsx`

- [ ] **Step 1: Write failing tests**

Create `__tests__/features/directory/hooks/useDirectories.test.tsx`:

```typescript
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { renderHook, act, waitFor } from '@testing-library/react-native'
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/saga-app && npx jest __tests__/features/directory/hooks/useDirectories.test.tsx --no-coverage`
Expected: FAIL — `Cannot find module '../../../../src/features/directory/hooks/useDirectories'`

- [ ] **Step 3: Implement the hook**

Create `src/features/directory/hooks/useDirectories.ts`:

```typescript
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { useCallback, useEffect, useRef, useState } from 'react'
import { getDirectories, PAGE_SIZE } from '../api/directory'
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/saga-app && npx jest __tests__/features/directory/hooks/useDirectories.test.tsx --no-coverage`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/features/directory/hooks/useDirectories.ts __tests__/features/directory/hooks/useDirectories.test.tsx
git commit -m "feat(saga-app): add useDirectories hook

Built with Epic Flowstate"
```

---

### Task 4: useDirectorySearch Hook

**Files:**

- Create: `src/features/directory/hooks/useDirectorySearch.ts`
- Test: `__tests__/features/directory/hooks/useDirectorySearch.test.tsx`

- [ ] **Step 1: Write failing tests**

Create `__tests__/features/directory/hooks/useDirectorySearch.test.tsx`:

```typescript
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { renderHook, act, waitFor } from '@testing-library/react-native'
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/saga-app && npx jest __tests__/features/directory/hooks/useDirectorySearch.test.tsx --no-coverage`
Expected: FAIL — `Cannot find module '../../../../src/features/directory/hooks/useDirectorySearch'`

- [ ] **Step 3: Implement the hook**

Create `src/features/directory/hooks/useDirectorySearch.ts`:

```typescript
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { useCallback, useEffect, useRef, useState } from 'react'
import { searchDirectory, PAGE_SIZE } from '../api/directory'
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/saga-app && npx jest __tests__/features/directory/hooks/useDirectorySearch.test.tsx --no-coverage`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add src/features/directory/hooks/useDirectorySearch.ts __tests__/features/directory/hooks/useDirectorySearch.test.tsx
git commit -m "feat(saga-app): add useDirectorySearch hook with debounce

Built with Epic Flowstate"
```

---

### Task 5: EntityCard Component

**Files:**

- Create: `src/features/directory/components/EntityCard.tsx`

- [ ] **Step 1: Create the component**

Create `src/features/directory/components/EntityCard.tsx`:

```typescript
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import React from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { Card } from '../../../components/Card'
import { Badge } from '../../../components/Badge'
import { colors, spacing, typography } from '../../../core/theme'
import type { EntityCardData } from '../types'

interface EntityCardProps {
  entity: EntityCardData
  onPress: () => void
}

function truncateAddress(addr: string): string {
  if (addr.length <= 12) return addr
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`
}

export function EntityCard({ entity, onPress }: EntityCardProps): React.JSX.Element {
  return (
    <Card onPress={onPress} style={styles.card}>
      <View style={styles.topRow}>
        <Badge label={entity.entityType === 'agent' ? 'AGENT' : 'ORG'} variant={entity.entityType} />
        <Text style={styles.chain}>{entity.chain}</Text>
      </View>
      <Text style={styles.handle}>@{entity.handle}</Text>
      <Text style={styles.wallet}>{truncateAddress(entity.walletAddress)}</Text>
    </Card>
  )
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  handle: {
    ...typography.h3,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  wallet: {
    ...typography.bodySmall,
    color: colors.textTertiary,
  },
  chain: {
    ...typography.caption,
    color: colors.textSecondary,
  },
})
```

- [ ] **Step 2: Commit**

```bash
git add src/features/directory/components/EntityCard.tsx
git commit -m "feat(saga-app): add EntityCard component

Built with Epic Flowstate"
```

---

### Task 6: Navigation Types + DirectoryHome Screen

**Files:**

- Modify: `src/navigation/types.ts` (lines 7-9)
- Create: `src/features/directory/screens/DirectoryHome.tsx`
- Modify: `src/navigation/stacks/DirectoryStack.tsx`

- [ ] **Step 1: Update navigation types**

In `src/navigation/types.ts`, replace the `DirectoryStackParamList` (lines 7-9):

```typescript
// BEFORE:
export type DirectoryStackParamList = {
  DirectorySearch: undefined
}

// AFTER:
export type DirectoryStackParamList = {
  DirectoryHome: undefined
  EntityDetail: { handle: string; entityType: 'agent' | 'org' }
  DirectoryList: undefined
}
```

- [ ] **Step 2: Create DirectoryHome screen**

Create `src/features/directory/screens/DirectoryHome.tsx`:

```typescript
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import React from 'react'
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { SafeArea } from '../../../components/SafeArea'
import { Header } from '../../../components/Header'
import { TextInput } from '../../../components/TextInput'
import { LoadingSpinner } from '../../../components/LoadingSpinner'
import { EntityCard } from '../components/EntityCard'
import { useDirectorySearch } from '../hooks/useDirectorySearch'
import { colors, spacing, typography } from '../../../core/theme'
import type { DirectoryStackParamList } from '../../../navigation/types'
import type { EntityCardData, SearchFilter } from '../types'

type Props = NativeStackScreenProps<DirectoryStackParamList, 'DirectoryHome'>

const FILTERS: SearchFilter[] = ['all', 'agents', 'orgs']

export function DirectoryHome({ navigation }: Props): React.JSX.Element {
  const {
    query, setQuery, filter, setFilter,
    results, loading, error, hasMore, loadMore, refresh,
  } = useDirectorySearch()

  const renderItem = ({ item }: { item: EntityCardData }) => (
    <EntityCard
      entity={item}
      onPress={() => navigation.navigate('EntityDetail', {
        handle: item.handle,
        entityType: item.entityType,
      })}
    />
  )

  return (
    <SafeArea>
      <Header
        title="Directory"
        rightAction={{ label: 'Hubs', onPress: () => navigation.navigate('DirectoryList') }}
      />
      <View style={styles.searchContainer}>
        <TextInput
          placeholder="Search by handle..."
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
        />
      </View>
      <View style={styles.filterRow}>
        {FILTERS.map(f => (
          <TouchableOpacity
            key={f}
            style={[styles.filterTab, filter === f && styles.filterTabActive]}
            onPress={() => setFilter(f)}
          >
            <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      {error ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : loading && results.length === 0 ? (
        <LoadingSpinner message="Loading..." />
      ) : results.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>
            {query ? `No identities found for "${query}".` : 'Search for agents and orgs by handle.'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={item => `${item.entityType}-${item.handle}`}
          renderItem={renderItem}
          onEndReached={hasMore ? loadMore : undefined}
          onEndReachedThreshold={0.5}
          refreshing={loading && results.length > 0}
          onRefresh={refresh}
          ListFooterComponent={loading ? <LoadingSpinner size="small" /> : null}
          contentContainerStyle={styles.list}
        />
      )}
    </SafeArea>
  )
}

const styles = StyleSheet.create({
  searchContainer: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  filterTab: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterTabActive: {
    backgroundColor: `${colors.primary}20`,
    borderColor: colors.primary,
  },
  filterText: {
    ...typography.bodySmall,
    color: colors.textTertiary,
  },
  filterTextActive: {
    color: colors.primary,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  emptyText: {
    ...typography.body,
    color: colors.textTertiary,
    textAlign: 'center',
  },
  errorText: {
    ...typography.body,
    color: colors.error,
    textAlign: 'center',
  },
  list: {
    paddingTop: spacing.sm,
  },
})
```

- [ ] **Step 3: Update DirectoryStack**

Replace the entire contents of `src/navigation/stacks/DirectoryStack.tsx`:

```typescript
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import React from 'react'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { DirectoryHome } from '../../features/directory/screens/DirectoryHome'
import { EntityDetail } from '../../features/directory/screens/EntityDetail'
import { DirectoryList } from '../../features/directory/screens/DirectoryList'
import type { DirectoryStackParamList } from '../types'

const Stack = createNativeStackNavigator<DirectoryStackParamList>()

export function DirectoryStack(): React.JSX.Element {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="DirectoryHome" component={DirectoryHome} />
      <Stack.Screen name="EntityDetail" component={EntityDetail} />
      <Stack.Screen name="DirectoryList" component={DirectoryList} />
    </Stack.Navigator>
  )
}
```

Note: This step will have TypeScript errors until Task 7 and Task 8 create the EntityDetail and DirectoryList screens. That is expected — proceed to the next tasks.

- [ ] **Step 4: Commit**

```bash
git add src/navigation/types.ts src/features/directory/screens/DirectoryHome.tsx src/navigation/stacks/DirectoryStack.tsx
git commit -m "feat(saga-app): add DirectoryHome screen and update navigation

Built with Epic Flowstate"
```

---

### Task 7: EntityDetail Screen

**Files:**

- Create: `src/features/directory/screens/EntityDetail.tsx`

- [ ] **Step 1: Create the screen**

Create `src/features/directory/screens/EntityDetail.tsx`:

```typescript
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import React from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import Clipboard from '@react-native-clipboard/clipboard'
import { SafeArea } from '../../../components/SafeArea'
import { Header } from '../../../components/Header'
import { Badge } from '../../../components/Badge'
import { ListItem } from '../../../components/ListItem'
import { LoadingSpinner } from '../../../components/LoadingSpinner'
import { useEntityDetail } from '../hooks/useEntityDetail'
import { colors, spacing, typography } from '../../../core/theme'
import type { DirectoryStackParamList } from '../../../navigation/types'
import type { AgentDetail as AgentDetailType, OrgDetail as OrgDetailType } from '../types'

type Props = NativeStackScreenProps<DirectoryStackParamList, 'EntityDetail'>

export function EntityDetail({ route, navigation }: Props): React.JSX.Element {
  const { handle, entityType } = route.params
  const { entity, loading, error } = useEntityDetail(handle, entityType)

  const goBack = () => navigation.goBack()

  if (loading) {
    return (
      <SafeArea>
        <Header title="Details" leftAction={{ label: 'Back', onPress: goBack }} />
        <LoadingSpinner message="Loading identity..." />
      </SafeArea>
    )
  }

  if (error || !entity) {
    return (
      <SafeArea>
        <Header title="Details" leftAction={{ label: 'Back', onPress: goBack }} />
        <View style={styles.center}>
          <Text style={styles.errorText}>{error ?? 'Identity not found.'}</Text>
        </View>
      </SafeArea>
    )
  }

  return (
    <SafeArea>
      <Header title="Details" leftAction={{ label: 'Back', onPress: goBack }} />
      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        <View style={styles.headerSection}>
          <Badge
            label={entityType === 'agent' ? 'AGENT' : 'ORG'}
            variant={entityType}
          />
          <Text style={styles.handle}>@{entity.handle}</Text>
        </View>

        {entityType === 'org' && (
          <ListItem title="Organization" subtitle={(entity as OrgDetailType).name} />
        )}

        <ListItem
          title="Wallet Address"
          subtitle={entity.walletAddress}
          rightText="Copy"
          onPress={() => Clipboard.setString(entity.walletAddress)}
        />
        <ListItem title="Chain" subtitle={entity.chain} />

        {entity.tokenId && (
          <ListItem title="Token ID" subtitle={entity.tokenId} />
        )}
        {entity.contractAddress && (
          <ListItem
            title="Contract Address"
            subtitle={entity.contractAddress}
            rightText="Copy"
            onPress={() => Clipboard.setString(entity.contractAddress!)}
          />
        )}
        {entity.tbaAddress && (
          <ListItem
            title="TBA Address"
            subtitle={entity.tbaAddress}
            rightText="Copy"
            onPress={() => Clipboard.setString(entity.tbaAddress!)}
          />
        )}
        {entity.mintTxHash && (
          <ListItem title="Mint TX Hash" subtitle={entity.mintTxHash} />
        )}

        {entityType === 'agent' && (entity as AgentDetailType).homeHubUrl && (
          <ListItem title="Home Hub" subtitle={(entity as AgentDetailType).homeHubUrl!} />
        )}

        <ListItem
          title="Registered"
          subtitle={new Date(entity.registeredAt).toLocaleDateString()}
        />
      </ScrollView>
    </SafeArea>
  )
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: spacing.lg,
  },
  headerSection: {
    alignItems: 'center',
    marginBottom: spacing.xl,
    gap: spacing.md,
  },
  handle: {
    ...typography.h2,
    color: colors.textPrimary,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  errorText: {
    ...typography.body,
    color: colors.error,
    textAlign: 'center',
  },
})
```

- [ ] **Step 2: Run typecheck**

Run: `cd packages/saga-app && npx tsc --noEmit`
Expected: No errors (or only pre-existing ones unrelated to directory feature)

- [ ] **Step 3: Commit**

```bash
git add src/features/directory/screens/EntityDetail.tsx
git commit -m "feat(saga-app): add EntityDetail screen

Built with Epic Flowstate"
```

---

### Task 8: DirectoryList Screen

**Files:**

- Create: `src/features/directory/screens/DirectoryList.tsx`

- [ ] **Step 1: Create the screen**

Create `src/features/directory/screens/DirectoryList.tsx`:

```typescript
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import React from 'react'
import { FlatList, StyleSheet, Text, View } from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { SafeArea } from '../../../components/SafeArea'
import { Header } from '../../../components/Header'
import { Card } from '../../../components/Card'
import { Badge } from '../../../components/Badge'
import { StatusIndicator } from '../../../components/StatusIndicator'
import { LoadingSpinner } from '../../../components/LoadingSpinner'
import { useDirectories } from '../hooks/useDirectories'
import { colors, spacing, typography } from '../../../core/theme'
import type { DirectoryStackParamList } from '../../../navigation/types'
import type { DirectorySummary } from '../types'

type Props = NativeStackScreenProps<DirectoryStackParamList, 'DirectoryList'>

const STATUS_MAP: Record<string, 'connected' | 'disconnected' | 'error' | 'syncing'> = {
  active: 'connected',
  suspended: 'syncing',
  flagged: 'error',
  revoked: 'disconnected',
}

function truncateAddress(addr: string): string {
  if (addr.length <= 12) return addr
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`
}

export function DirectoryList({ navigation }: Props): React.JSX.Element {
  const { directories, loading, error, hasMore, loadMore, refresh } = useDirectories()

  const renderItem = ({ item }: { item: DirectorySummary }) => (
    <Card style={styles.card}>
      <View style={styles.topRow}>
        <Text style={styles.dirId}>{item.directoryId}</Text>
        <StatusIndicator status={STATUS_MAP[item.status] ?? 'disconnected'} />
      </View>
      <Text style={styles.url} numberOfLines={1}>{item.url}</Text>
      <View style={styles.bottomRow}>
        <Badge label={item.conformanceLevel} variant="directory" />
        <Text style={styles.wallet}>{truncateAddress(item.operatorWallet)}</Text>
      </View>
    </Card>
  )

  return (
    <SafeArea>
      <Header
        title="Federated Directories"
        leftAction={{ label: 'Back', onPress: () => navigation.goBack() }}
      />
      {error ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : loading && directories.length === 0 ? (
        <LoadingSpinner message="Loading directories..." />
      ) : directories.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>No directories found.</Text>
        </View>
      ) : (
        <FlatList
          data={directories}
          keyExtractor={item => item.directoryId}
          renderItem={renderItem}
          onEndReached={hasMore ? loadMore : undefined}
          onEndReachedThreshold={0.5}
          refreshing={loading && directories.length > 0}
          onRefresh={refresh}
          ListFooterComponent={loading ? <LoadingSpinner size="small" /> : null}
          contentContainerStyle={styles.list}
        />
      )}
    </SafeArea>
  )
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  dirId: {
    ...typography.h3,
    color: colors.textPrimary,
  },
  url: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  wallet: {
    ...typography.caption,
    color: colors.textTertiary,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  emptyText: {
    ...typography.body,
    color: colors.textTertiary,
    textAlign: 'center',
  },
  errorText: {
    ...typography.body,
    color: colors.error,
    textAlign: 'center',
  },
  list: {
    paddingTop: spacing.sm,
  },
})
```

- [ ] **Step 2: Run typecheck**

Run: `cd packages/saga-app && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/features/directory/screens/DirectoryList.tsx
git commit -m "feat(saga-app): add DirectoryList screen

Built with Epic Flowstate"
```

---

### Task 9: Final Verification

**Files:** None (verification only)

- [ ] **Step 1: Run all tests**

Run: `cd packages/saga-app && npx jest --no-coverage`
Expected: All tests pass (previous 64 + new ~26 = ~90 tests)

- [ ] **Step 2: Run typecheck**

Run: `cd packages/saga-app && npx tsc --noEmit`
Expected: Clean — no errors

- [ ] **Step 3: Verify SPDX headers**

Run: `grep -rL "SPDX-License-Identifier" packages/saga-app/src/features/directory/`
Expected: No output (all files have SPDX headers)

- [ ] **Step 4: Run git status**

Run: `git status`
Expected: Clean working tree — all changes committed
