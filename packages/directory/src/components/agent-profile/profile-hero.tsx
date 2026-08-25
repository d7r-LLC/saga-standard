// Copyright 2026 d7r LLC
// SPDX-License-Identifier: Apache-2.0

import { ChainBadge } from '@/components/badges/chain-badge'
import { WalletAddress } from '@/components/badges/wallet-address'
import type { AgentRecord } from '@d7r/saga-client'

export function ProfileHero({ agent }: { agent: AgentRecord }) {
  return (
    <div className="border-b border-slate-200 pb-6 dark:border-slate-700">
      <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
        @{agent.handle}
      </h1>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <WalletAddress address={agent.walletAddress} />
        <ChainBadge chain={agent.chain} />
      </div>
      {agent.entityType && agent.entityType !== 'agent' && (
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          Type: {agent.entityType}
        </p>
      )}
    </div>
  )
}
