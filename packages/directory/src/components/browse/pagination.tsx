// Copyright 2026 d7r LLC
// SPDX-License-Identifier: Apache-2.0

import Link from 'next/link'
import clsx from 'clsx'
import { ChevronLeft, ChevronRight } from 'lucide-react'

interface PaginationProps {
  page: number
  totalPages: number
  basePath: string
  params: Record<string, string>
}

function buildHref(
  basePath: string,
  params: Record<string, string>,
  page: number,
): string {
  const searchParams = new URLSearchParams(params)
  searchParams.set('page', String(page))
  return `${basePath}?${searchParams.toString()}`
}

export function Pagination({
  page,
  totalPages,
  basePath,
  params,
}: PaginationProps) {
  if (totalPages <= 1) return null

  const isFirst = page <= 1
  const isLast = page >= totalPages

  const linkClasses =
    'inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors'
  const enabledClasses =
    'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
  const disabledClasses =
    'pointer-events-none text-slate-400 dark:text-slate-600'

  return (
    <nav className="flex items-center justify-between" aria-label="Pagination">
      <Link
        href={isFirst ? '#' : buildHref(basePath, params, page - 1)}
        className={clsx(
          linkClasses,
          isFirst ? disabledClasses : enabledClasses,
        )}
        aria-disabled={isFirst}
        aria-label="Previous page"
        tabIndex={isFirst ? -1 : undefined}
      >
        <ChevronLeft className="h-4 w-4" />
        Previous
      </Link>

      <span className="text-sm text-slate-600 dark:text-slate-400">
        Page {page} of {totalPages}
      </span>

      <Link
        href={isLast ? '#' : buildHref(basePath, params, page + 1)}
        className={clsx(linkClasses, isLast ? disabledClasses : enabledClasses)}
        aria-disabled={isLast}
        aria-label="Next page"
        tabIndex={isLast ? -1 : undefined}
      >
        Next
        <ChevronRight className="h-4 w-4" />
      </Link>
    </nav>
  )
}
