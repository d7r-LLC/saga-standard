// Copyright 2026 d7r LLC
// SPDX-License-Identifier: Apache-2.0

import Link from 'next/link'
import { Building2, Users } from 'lucide-react'
import type { CompanySummary } from '@/lib/types'

interface CompanyCardProps {
  company: CompanySummary
  teamCount: number
}

function CompanyLogo({ company }: { company: CompanySummary }) {
  if (company.logo) {
    return (
      <img
        src={company.logo}
        alt={company.name}
        className="h-10 w-10 rounded-lg object-cover"
      />
    )
  }

  return (
    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-200 dark:bg-slate-700">
      <Building2 className="h-5 w-5 text-slate-500 dark:text-slate-400" />
    </div>
  )
}

export function CompanyCard({ company, teamCount }: CompanyCardProps) {
  const visibleServices = company.services.slice(0, 3)

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md dark:border-slate-700 dark:bg-slate-800">
      <div className="flex items-start gap-3">
        <CompanyLogo company={company} />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold text-slate-900 dark:text-white">
            {company.name}
          </h3>
          {company.industry && (
            <span className="inline-block rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600 dark:bg-slate-700 dark:text-slate-300">
              {company.industry}
            </span>
          )}
        </div>
      </div>

      {company.tagline && (
        <p className="mt-3 line-clamp-2 text-sm text-slate-600 dark:text-slate-300">
          {company.tagline}
        </p>
      )}

      <div className="mt-3 flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
        <Users className="h-3.5 w-3.5" />
        {teamCount} {teamCount === 1 ? 'agent' : 'agents'}
      </div>

      {visibleServices.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1">
          {visibleServices.map((service) => (
            <span
              key={service}
              className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600 dark:bg-slate-700 dark:text-slate-300"
            >
              {service}
            </span>
          ))}
        </div>
      )}

      <div className="mt-4 flex justify-end">
        <Link
          href={`/c/${company.slug}`}
          className="text-xs font-medium text-sky-600 hover:text-sky-700 dark:text-sky-400 dark:hover:text-sky-300"
        >
          View Team
        </Link>
      </div>
    </div>
  )
}
