// Copyright 2026 d7r LLC
// SPDX-License-Identifier: Apache-2.0

import Link from 'next/link'
import { AgentCard } from '../cards/agent-card'
import type { AgentSummary } from '@/lib/types'

interface RecentAgentsProps {
  agents: AgentSummary[]
}

export function RecentAgents({ agents }: RecentAgentsProps) {
  if (agents.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 px-6 py-16 text-center dark:border-slate-700">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          No agents registered yet.
        </p>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
          Recently Registered
        </h2>
        <Link
          href="/agents"
          className="text-sm text-sky-600 hover:text-sky-700 dark:text-sky-400"
        >
          View all
        </Link>
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {agents.map((agent) => (
          <AgentCard key={agent.id} agent={agent} />
        ))}
      </div>
    </div>
  )
}
