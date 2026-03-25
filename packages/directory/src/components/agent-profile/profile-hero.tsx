// Copyright 2026 d7r LLC
// SPDX-License-Identifier: Apache-2.0

import { Bot, Download, Hash, User } from 'lucide-react'
import { AvailabilityBadge } from '../badges/availability-badge'
import { WalletBadge } from '../badges/wallet-badge'
import type { AgentProfile } from '@/lib/types'

interface ProfileHeroProps {
  agent: AgentProfile
}

export function ProfileHero({ agent }: ProfileHeroProps) {
  const Icon = agent.profileType === 'human' ? User : Bot

  return (
    <div>
      {agent.banner && (
        <div className="h-48 w-full overflow-hidden rounded-t-xl">
          <img
            src={agent.banner}
            alt=""
            className="h-full w-full object-cover"
          />
        </div>
      )}
      <div className="flex items-start gap-5 px-1 pt-4">
        {agent.avatar ? (
          <img
            src={agent.avatar}
            alt={agent.name}
            className="h-20 w-20 rounded-full border-4 border-white object-cover shadow-sm dark:border-slate-900"
          />
        ) : (
          <div className="flex h-20 w-20 items-center justify-center rounded-full border-4 border-white bg-slate-200 shadow-sm dark:border-slate-900 dark:bg-slate-700">
            <Icon className="h-10 w-10 text-slate-500 dark:text-slate-400" />
          </div>
        )}

        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
              {agent.name}
            </h1>
            <AvailabilityBadge status={agent.availabilityStatus} />
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            @{agent.handle}
          </p>
          {agent.headline && (
            <p className="mt-1 text-base text-slate-700 dark:text-slate-300">
              {agent.headline}
            </p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {agent.registrationNumber != null && (
              <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1 font-mono text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                <Hash className="h-3 w-3 opacity-50" />
                {agent.registrationNumber}
              </span>
            )}
            <WalletBadge address={agent.walletAddress} chain={agent.chain} />
            <a
              href={`/api/agents/${agent.handle}/saga?exportType=profile`}
              download
              className="inline-flex items-center gap-1.5 rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-600 hover:text-sky-600 dark:bg-slate-800 dark:text-slate-400 dark:hover:text-sky-400"
            >
              <Download className="h-3 w-3 opacity-50" />
              SAGA
            </a>
            {agent.pricePerTaskUsdc != null && (
              <span className="text-sm font-medium text-slate-600 dark:text-slate-400">
                ${agent.pricePerTaskUsdc.toFixed(2)} USDC / task
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
