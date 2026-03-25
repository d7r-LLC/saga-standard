// Copyright 2026 d7r LLC
// SPDX-License-Identifier: Apache-2.0

import Link from 'next/link'
import { Bot, User } from 'lucide-react'
import { AvailabilityBadge } from '../badges/availability-badge'
import { SkillBadge } from '../badges/skill-badge'
import type { AgentSummary } from '@/lib/types'

interface AgentCardProps {
  agent: AgentSummary
  companyName?: string
}

const MAX_VISIBLE_SKILLS = 5

function AgentAvatar({ agent }: { agent: AgentSummary }) {
  if (agent.avatar) {
    return (
      <img
        src={agent.avatar}
        alt={agent.name}
        className="h-12 w-12 rounded-full object-cover"
      />
    )
  }

  const Icon = agent.profileType === 'human' ? User : Bot
  return (
    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-200 dark:bg-slate-700">
      <Icon className="h-6 w-6 text-slate-500 dark:text-slate-400" />
    </div>
  )
}

export function AgentCard({ agent, companyName }: AgentCardProps) {
  const visibleSkills = agent.skills.slice(0, MAX_VISIBLE_SKILLS)
  const overflowCount = agent.skills.length - MAX_VISIBLE_SKILLS

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md dark:border-slate-700 dark:bg-slate-800">
      <div className="flex items-start gap-4">
        <AgentAvatar agent={agent} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-sm font-semibold text-slate-900 dark:text-white">
              {agent.name}
            </h3>
            <AvailabilityBadge status={agent.availabilityStatus} />
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            @{agent.handle}
          </p>
        </div>
      </div>

      {agent.headline && (
        <p className="mt-3 line-clamp-2 text-sm text-slate-600 dark:text-slate-300">
          {agent.headline}
        </p>
      )}

      {(agent.currentRole || companyName) && (
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
          {agent.currentRole}
          {agent.currentRole && companyName && ' at '}
          {companyName}
        </p>
      )}

      {visibleSkills.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1">
          {visibleSkills.map((skill) => (
            <SkillBadge key={skill} name={skill} variant="self-reported" />
          ))}
          {overflowCount > 0 && (
            <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500 dark:bg-slate-700 dark:text-slate-400">
              +{overflowCount}
            </span>
          )}
        </div>
      )}

      <div className="mt-4 flex items-center justify-between">
        {agent.baseModel && (
          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-700 dark:text-slate-300">
            {agent.baseModel}
          </span>
        )}
        <Link
          href={`/a/${agent.handle}`}
          className="text-xs font-medium text-sky-600 hover:text-sky-700 dark:text-sky-400 dark:hover:text-sky-300"
        >
          View Profile
        </Link>
      </div>
    </div>
  )
}
