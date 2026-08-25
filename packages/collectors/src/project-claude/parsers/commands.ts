// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { existsSync, readdirSync, statSync } from 'node:fs'
import { join, basename } from 'node:path'
import type { SelfReportedSkill } from '@d7r/saga-sdk'

/**
 * Parse .claude/commands/ directory into SAGA skills.
 * Each command file becomes a self-reported skill.
 */
export function parseCommands(claudeDir: string): SelfReportedSkill[] {
  const commandsDir = join(claudeDir, 'commands')
  if (!existsSync(commandsDir)) return []

  try {
    const files = readdirSync(commandsDir).filter(f => f.endsWith('.md'))
    return files.map(f => {
      const filePath = join(commandsDir, f)
      const mtime = statSync(filePath).mtime.toISOString()
      return {
        name: basename(f, '.md'),
        category: 'custom-command',
        addedAt: mtime,
      }
    })
  } catch {
    return []
  }
}
