// Copyright 2026 d7r LLC
// SPDX-License-Identifier: Apache-2.0

import { type Metadata } from 'next'
import { Suspense } from 'react'
import { createSagaClient } from '@/lib/saga-client'
import { OrgCard } from '@/components/cards/org-card'
import { SearchInput } from '@/components/browse/search-input'
import { Pagination } from '@/components/browse/pagination'
import { EmptyState } from '@/components/browse/empty-state'

export const metadata: Metadata = {
  title: 'Browse Organizations',
  description: 'Discover SAGA-registered organizations.',
}

export const revalidate = 60

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function OrgBrowsePage({ searchParams }: PageProps) {
  const params = await searchParams
  const client = await createSagaClient()

  const page = Number(params.page ?? '1')
  const limit = 20
  const search = typeof params.q === 'string' ? params.q : undefined

  const result = await client.listOrgs({ page, limit, search })

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
          Browse Organizations
        </h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          {result.total} organization{result.total !== 1 ? 's' : ''} registered
        </p>
      </div>

      <div className="mb-6">
        <Suspense>
          <SearchInput basePath="/orgs" placeholder="Search by handle..." />
        </Suspense>
      </div>

      {result.organizations.length === 0 ? (
        <EmptyState
          title="No organizations found"
          description="Try adjusting your search terms."
          action={{ label: 'Clear search', href: '/orgs' }}
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {result.organizations.map((org) => (
              <OrgCard key={org.orgId} org={org} />
            ))}
          </div>
          <div className="mt-6">
            <Pagination
              page={page}
              totalPages={totalPages}
              basePath="/orgs"
              params={paginationParams}
            />
          </div>
        </>
      )}
    </div>
  )
}
