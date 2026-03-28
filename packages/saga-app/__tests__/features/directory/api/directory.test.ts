// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import {
  HUB_URL,
  getAgent,
  getDirectories,
  getOrg,
  resolveHandle,
  searchDirectory,
} from '../../../../src/features/directory/api/directory'

const mockFetch = jest.fn()
const originalFetch = globalThis.fetch

beforeAll(() => {
  globalThis.fetch = mockFetch as unknown as typeof fetch
})
afterAll(() => {
  globalThis.fetch = originalFetch
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

describe('HUB_URL', () => {
  it('points to the hub worker', () => {
    expect(HUB_URL).toMatch(/^https:\/\//)
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
