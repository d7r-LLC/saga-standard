// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { basename, join } from 'node:path'
import type { ProceduralWorkflow } from '@d7r/saga-sdk'

/**
 * Parse Claude Code plans/ directory into procedural workflows.
 */
export function parsePlans(plansDir: string): ProceduralWorkflow[] {
  if (!existsSync(plansDir)) return []

  const workflows: ProceduralWorkflow[] = []

  try {
    const files = readdirSync(plansDir).filter(f => f.endsWith('.json') || f.endsWith('.md'))

    for (const file of files) {
      try {
        const content = readFileSync(join(plansDir, file), 'utf-8')
        const name = basename(file, file.endsWith('.json') ? '.json' : '.md')

        if (file.endsWith('.json')) {
          const plan = JSON.parse(content)
          workflows.push({
            name: plan.title ?? plan.name ?? name,
            description: plan.description ?? plan.summary,
            steps: Array.isArray(plan.steps)
              ? plan.steps.map((s: unknown) =>
                  typeof s === 'string'
                    ? s
                    : ((s as { title?: string })?.title ?? JSON.stringify(s))
                )
              : [],
            learnedFrom: 'claude-code/plans',
          })
        } else {
          // Markdown plan — extract headers as steps
          const lines = content.split('\n')
          const title = lines.find(l => l.startsWith('#'))?.replace(/^#+\s*/, '') ?? name
          const steps = lines
            .filter(l => /^[-*]\s/.test(l) || /^\d+\.\s/.test(l))
            .map(l => l.replace(/^[-*\d.]+\s*/, '').trim())
            .filter(Boolean)

          workflows.push({
            name: title,
            steps: steps.length > 0 ? steps : undefined,
            learnedFrom: 'claude-code/plans',
          })
        }
      } catch {
        // skip malformed files
      }
    }
  } catch {
    // skip
  }

  return workflows
}
