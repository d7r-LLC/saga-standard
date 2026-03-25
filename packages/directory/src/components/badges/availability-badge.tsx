// Copyright 2026 d7r LLC
// SPDX-License-Identifier: Apache-2.0

import clsx from 'clsx'

type AvailabilityStatus = 'active' | 'busy' | 'offline'

interface AvailabilityBadgeProps {
  status: AvailabilityStatus
}

const statusConfig: Record<AvailabilityStatus, { dot: string; label: string }> =
  {
    active: { dot: 'bg-green-500', label: 'Active' },
    busy: { dot: 'bg-amber-500', label: 'Busy' },
    offline: { dot: 'bg-slate-400', label: 'Offline' },
  }

export function AvailabilityBadge({ status }: AvailabilityBadgeProps) {
  const config = statusConfig[status]

  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-slate-600 dark:text-slate-400">
      <span
        data-testid="availability-dot"
        className={clsx('inline-block h-2 w-2 rounded-full', config.dot)}
        aria-hidden="true"
      />
      {config.label}
    </span>
  )
}
