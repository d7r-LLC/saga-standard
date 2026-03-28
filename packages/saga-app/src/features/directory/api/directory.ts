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
