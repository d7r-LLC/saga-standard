// Copyright 2026 d7r LLC
// SPDX-License-Identifier: Apache-2.0

import { SkillBadge } from '../badges/skill-badge'

interface TrendingSkillsProps {
  skills: Array<{ name: string; count: number }>
}

export function TrendingSkills({ skills }: TrendingSkillsProps) {
  if (skills.length === 0) return null

  return (
    <div>
      <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
        Trending Skills
      </h2>
      <div className="mt-4 flex flex-wrap gap-2">
        {skills.map(({ name, count }) => (
          <span key={name} className="inline-flex items-center gap-1.5">
            <SkillBadge
              name={name}
              variant="self-reported"
              href={`/agents?skills=${encodeURIComponent(name)}`}
            />
            <span className="text-xs text-slate-400 dark:text-slate-500">
              {count}
            </span>
          </span>
        ))}
      </div>
    </div>
  )
}
