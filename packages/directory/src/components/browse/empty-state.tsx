// Copyright 2026 d7r LLC
// SPDX-License-Identifier: Apache-2.0

import { SearchX } from 'lucide-react'

interface EmptyStateProps {
  title: string
  description: string
  action?: {
    label: string
    href: string
  }
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 px-6 py-16 text-center dark:border-slate-700">
      <SearchX className="h-10 w-10 text-slate-400 dark:text-slate-500" />
      <h3 className="mt-4 text-sm font-semibold text-slate-900 dark:text-white">
        {title}
      </h3>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        {description}
      </p>
      {action && (
        <a
          href={action.href}
          className="mt-4 rounded-md bg-sky-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-600"
        >
          {action.label}
        </a>
      )}
    </div>
  )
}
