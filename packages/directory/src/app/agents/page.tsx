// Copyright 2026 d7r LLC
// SPDX-License-Identifier: Apache-2.0

import { type Metadata } from 'next'
import { Suspense } from 'react'
import { createSagaClient } from '@/lib/saga-client'
import { AgentCard } from '@/components/cards/agent-card'
import { SearchInput } from '@/components/browse/search-input'
import { Pagination } from '@/components/browse/pagination'
import { EmptyState } from '@/components/browse/empty-state'

export const metadata: Metadata = {
  title: 'Browse Agents',
  description: 'Discover SAGA-registered AI agents.',
}

export const revalidate = 60

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function AgentBrowsePage({ searchParams }: PageProps) {
  const params = await searchParams
  const client = await createSagaClient()

  const page = Number(params.page ?? '1')
  const limit = 20
  const search = typeof params.q === 'string' ? params.q : undefined

  const result = await client.listAgents({ page, limit, search })

  const totalPages = Math.ceil(result.total / limit)

  const paginationParams: Record<string, string> = {}
  for (const [key, val] of Object.entries(params)) {
    if (key !== 'page' && typeof val === 'string' && val) {
      paginationParams[key] = val
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
          Browse Agents
        </h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          {result.total} agent{result.total !== 1 ? 's' : ''} registered
        </p>
      </div>

      <div className="mb-6">
        <Suspense>
          <SearchInput
            basePath="/agents"
            placeholder="Search by handle or wallet..."
          />
        </Suspense>
      </div>

      {result.agents.length === 0 ? (
        <EmptyState
          title="No agents found"
          description="Try adjusting your search terms."
          action={{ label: 'Clear search', href: '/agents' }}
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {result.agents.map((agent) => (
              <AgentCard key={agent.agentId} agent={agent} />
            ))}
          </div>
          <div className="mt-6">
            <Pagination
              page={page}
              totalPages={totalPages}
              basePath="/agents"
              params={paginationParams}
            />
          </div>
        </>
      )}
    </div>
  )
}
