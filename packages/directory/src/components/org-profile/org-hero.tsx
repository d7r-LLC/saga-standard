// Copyright 2026 d7r LLC
// SPDX-License-Identifier: Apache-2.0

import { ChainBadge } from '@/components/badges/chain-badge'
import { WalletAddress } from '@/components/badges/wallet-address'
import type { OrgRecord } from '@d7r/saga-client'

export function OrgHero({ org }: { org: OrgRecord }) {
  return (
    <div className="border-b border-slate-200 pb-6 dark:border-slate-700">
      <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
        {org.name}
      </h1>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        @{org.handle}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <WalletAddress address={org.walletAddress} />
        <ChainBadge chain={org.chain} />
      </div>
    </div>
  )
}
