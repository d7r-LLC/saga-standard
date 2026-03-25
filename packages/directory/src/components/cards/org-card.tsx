// Copyright 2026 d7r LLC
// SPDX-License-Identifier: Apache-2.0

import Link from 'next/link'
import { ChainBadge } from '@/components/badges/chain-badge'
import type { OrgSummary } from '@/lib/types'

function truncateAddress(address: string): string {
  if (address.length <= 10) return address
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

export function OrgCard({ org }: { org: OrgSummary }) {
  return (
    <Link
      href={`/o/${org.handle}`}
      className="group block rounded-lg border border-slate-200 p-5 transition-shadow hover:shadow-md dark:border-slate-700"
    >
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-semibold text-slate-900 group-hover:text-sky-600 dark:text-white dark:group-hover:text-sky-400">
            {org.name}
          </h3>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
            @{org.handle}
          </p>
          <p className="mt-1 font-mono text-xs text-slate-500 dark:text-slate-400">
            {truncateAddress(org.walletAddress)}
          </p>
        </div>
        <ChainBadge chain={org.chain} />
      </div>
    </Link>
  )
}
