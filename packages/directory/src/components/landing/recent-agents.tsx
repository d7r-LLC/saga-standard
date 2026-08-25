// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { AgentCard } from '@/components/cards/agent-card'
import type { AgentRecord } from '@d7r/saga-client'
import Link from 'next/link'

export function RecentAgents({ agents }: { agents: AgentRecord[] }) {
  if (agents.length === 0) return null

  return (
    <section className="py-12">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">
            Recent Agents
          </h2>
          <Link
            href="/agents"
            className="text-sm font-medium text-sky-600 hover:text-sky-700 dark:text-sky-400"
          >
            View all &rarr;
          </Link>
        </div>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {agents.map((agent) => (
            <AgentCard key={agent.agentId} agent={agent} />
          ))}
        </div>
      </div>
    </section>
  )
}
