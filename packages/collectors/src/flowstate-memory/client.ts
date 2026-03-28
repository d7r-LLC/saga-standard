// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

export interface MemoryObservation {
  id: number
  type: string
  title: string
  narrative?: string
  facts?: string[]
  concepts?: string[]
  created_at: string
  updated_at?: string
  project?: string
  session_id?: string
  embedding?: number[]
  sagaScope?: {
    syncPolicy: string
    originOrgId?: string
  }
}

export interface SearchResult {
  results: MemoryObservation[]
  total: number
}

export interface SearchParams {
  limit?: number
  offset?: number
  type?: string
  since?: string
}

/**
 * HTTP client for the flowstate-agent-memory API.
 */
export class FlowstateMemoryClient {
  constructor(private baseUrl: string) {}

  async healthCheck(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/api/health`)
      return res.ok
    } catch {
      return false
    }
  }

  async search(params: SearchParams): Promise<SearchResult> {
    const body = {
      query: '*',
      limit: params.limit ?? 100,
      offset: params.offset ?? 0,
      ...(params.type ? { type: params.type } : {}),
      ...(params.since ? { since: params.since } : {}),
    }

    const res = await fetch(`${this.baseUrl}/api/memory/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (!res.ok) throw new Error(`Search failed: ${res.status}`)
    return res.json() as Promise<SearchResult>
  }

  async getObservations(ids: number[]): Promise<MemoryObservation[]> {
    const res = await fetch(`${this.baseUrl}/api/memory/get`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    })

    if (!res.ok) throw new Error(`Get observations failed: ${res.status}`)
    const data = await res.json() as { observations: MemoryObservation[] }
    return data.observations
  }

  async getSessionTimeline(): Promise<MemoryObservation[]> {
    const res = await fetch(`${this.baseUrl}/api/memory/timeline`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ depth_before: 50, depth_after: 0 }),
    })

    if (!res.ok) throw new Error(`Timeline failed: ${res.status}`)
    const data = await res.json() as { observations: MemoryObservation[] }
    return data.observations
  }
}
