// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Parse rules from .claude/rules/*.md and optionally CLAUDE.md
 * into a combined system prompt string.
 */
export function parseRules(claudeDir: string, projectRoot?: string): string | null {
  const parts: string[] = []

  // Project root CLAUDE.md
  if (projectRoot) {
    const claudeMdPath = join(projectRoot, 'CLAUDE.md')
    if (existsSync(claudeMdPath)) {
      try {
        const content = readFileSync(claudeMdPath, 'utf-8').trim()
        if (content) parts.push(content)
      } catch {
        // skip
      }
    }
  }

  // .claude/rules/*.md
  const rulesDir = join(claudeDir, 'rules')
  if (existsSync(rulesDir)) {
    try {
      const files = readdirSync(rulesDir).filter(f => f.endsWith('.md')).sort()
      for (const file of files) {
        try {
          const content = readFileSync(join(rulesDir, file), 'utf-8').trim()
          if (content) parts.push(content)
        } catch {
          // skip individual files that fail
        }
      }
    } catch {
      // skip
    }
  }

  return parts.length > 0 ? parts.join('\n\n---\n\n') : null
}
