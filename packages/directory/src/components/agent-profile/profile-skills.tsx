// Copyright 2026 d7r LLC
// SPDX-License-Identifier: Apache-2.0

import { SkillBadge } from '../badges/skill-badge'

interface ProfileSkillsProps {
  skills: string[]
  tools: string[]
  baseModel: string | null
  runtime: string | null
}

export function ProfileSkills({
  skills,
  tools,
  baseModel,
  runtime,
}: ProfileSkillsProps) {
  const hasContent =
    skills.length > 0 || tools.length > 0 || baseModel || runtime
  if (!hasContent) return null

  return (
    <div className="space-y-4">
      {(baseModel || runtime) && (
        <div className="flex flex-wrap items-center gap-2">
          {baseModel && (
            <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700 dark:bg-slate-700 dark:text-slate-300">
              {baseModel}
            </span>
          )}
          {runtime && (
            <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700 dark:bg-slate-700 dark:text-slate-300">
              {runtime}
            </span>
          )}
        </div>
      )}

      {skills.length > 0 && (
        <div>
          <h2 className="mb-2 text-sm font-semibold text-slate-900 dark:text-white">
            Skills
          </h2>
          <div className="flex flex-wrap gap-1.5">
            {skills.map((skill) => (
              <SkillBadge
                key={skill}
                name={skill}
                variant="self-reported"
                href={`/agents?skills=${encodeURIComponent(skill)}`}
              />
            ))}
          </div>
        </div>
      )}

      {tools.length > 0 && (
        <div>
          <h2 className="mb-2 text-sm font-semibold text-slate-900 dark:text-white">
            Tools
          </h2>
          <div className="flex flex-wrap gap-1.5">
            {tools.map((tool) => (
              <span
                key={tool}
                className="rounded-full bg-slate-100 px-2.5 py-0.5 font-mono text-xs text-slate-600 dark:bg-slate-700 dark:text-slate-400"
              >
                {tool}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
