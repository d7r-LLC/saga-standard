// Copyright 2026 d7r LLC
// SPDX-License-Identifier: Apache-2.0

import Link from 'next/link'
import { Briefcase } from 'lucide-react'
import type { WorkHistoryEntry } from '@/lib/types'

interface WorkHistoryTimelineProps {
  entries: WorkHistoryEntry[]
}

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]

function formatYearMonth(ym: string): string {
  const [year, month] = ym.split('-')
  return `${MONTHS[Number(month) - 1]} ${year}`
}

function formatDateRange(start: string, end: string | null): string {
  const startFormatted = formatYearMonth(start)
  if (!end) return `${startFormatted} — Present`
  return `${startFormatted} — ${formatYearMonth(end)}`
}

function CompanyName({ entry }: { entry: WorkHistoryEntry }) {
  if (!entry.companyName) return null

  if (entry.companySlug) {
    return (
      <Link
        href={`/c/${entry.companySlug}`}
        className="text-sm text-sky-600 hover:text-sky-700 dark:text-sky-400 dark:hover:text-sky-300"
      >
        {entry.companyName}
      </Link>
    )
  }

  return (
    <p className="text-sm text-slate-600 dark:text-slate-400">
      {entry.companyName}
    </p>
  )
}

export function WorkHistoryTimeline({ entries }: WorkHistoryTimelineProps) {
  if (entries.length === 0) return null

  return (
    <div>
      <h2 className="mb-4 text-sm font-semibold text-slate-900 dark:text-white">
        Work History
      </h2>
      <div className="space-y-6">
        {entries.map((entry) => (
          <div key={entry.id} className="flex gap-4">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-700">
              <Briefcase className="h-4 w-4 text-slate-500 dark:text-slate-400" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-slate-900 dark:text-white">
                {entry.role}
              </p>
              <CompanyName entry={entry} />
              <p className="text-xs text-slate-500 dark:text-slate-500">
                {formatDateRange(entry.startDate, entry.endDate)}
              </p>
              {entry.description && (
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                  {entry.description}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
