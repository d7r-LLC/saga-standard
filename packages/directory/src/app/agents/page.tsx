// Copyright 2026 d7r LLC
// SPDX-License-Identifier: Apache-2.0

import { type Metadata } from 'next'
import { Suspense } from 'react'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { getDb } from '@/db'
import { searchAgents } from '@/db/queries/agents'
import { AgentCard } from '@/components/cards/agent-card'
import { SearchInput } from '@/components/browse/search-input'
import { AgentFilterPanel } from '@/components/browse/agent-filter-panel'
import { Pagination } from '@/components/browse/pagination'
import { EmptyState } from '@/components/browse/empty-state'
import type { AgentSummary } from '@/lib/types'

export const metadata: Metadata = {
  title: 'Browse Agents',
  description: 'Find AI agents by skills, availability, model, and more.',
}

export const revalidate = 60

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function AgentBrowsePage({ searchParams }: PageProps) {
  const params = await searchParams
  const { env } = await getCloudflareContext()
  const db = getDb(env.DB)

  const page = Number(params.page ?? '1')
  const limit = 20

  const minPriceRaw =
    typeof params.minPrice === 'string' && params.minPrice
      ? Number(params.minPrice)
      : undefined
  const maxPriceRaw =
    typeof params.maxPrice === 'string' && params.maxPrice
      ? Number(params.maxPrice)
      : undefined

  const result = await searchAgents(db, {
    q: typeof params.q === 'string' ? params.q : undefined,
    skills:
      typeof params.skills === 'string'
        ? params.skills
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        : undefined,
    model: typeof params.model === 'string' ? params.model : undefined,
    availability:
      typeof params.availability === 'string' ? params.availability : 'any',
    verifiedOnly: params.verifiedOnly === 'true',
    minPrice:
      minPriceRaw !== undefined && !isNaN(minPriceRaw)
        ? minPriceRaw
        : undefined,
    maxPrice:
      maxPriceRaw !== undefined && !isNaN(maxPriceRaw)
        ? maxPriceRaw
        : undefined,
    page,
    limit,
  })

  const agents: AgentSummary[] = result.agents.map(
    (a: Record<string, unknown>) => ({
      ...a,
      skills: (a.skills as string[]) ?? [],
      tools: (a.tools as string[]) ?? [],
    }),
  )

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

      <div className="flex flex-col gap-6 lg:flex-row">
        <aside className="w-full shrink-0 lg:w-56">
          <Suspense>
            <SearchInput basePath="/agents" placeholder="Search agents..." />
          </Suspense>
          <div className="mt-4">
            <Suspense>
              <AgentFilterPanel />
            </Suspense>
          </div>
        </aside>

        <div className="flex-1">
          {agents.length === 0 ? (
            <EmptyState
              title="No agents found"
              description="Try adjusting your filters or search terms."
              action={{ label: 'Clear filters', href: '/agents' }}
            />
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {agents.map((agent) => (
                  <AgentCard key={agent.id} agent={agent} />
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
      </div>
    </div>
  )
}
