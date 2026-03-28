// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import type { CollectorDetection } from '../types'

/**
 * Detect .claude/ directories in project paths and global ~/.claude/.
 */
export function detectProjectClaude(paths?: string[], homeDir?: string): CollectorDetection {
  const searchPaths = paths ?? [homeDir ?? homedir()]
  const locations: string[] = []

  for (const p of searchPaths) {
    const claudeDir = join(p, '.claude')
    if (existsSync(claudeDir)) {
      locations.push(claudeDir)
    }
  }

  return {
    source: 'project-claude',
    found: locations.length > 0,
    locations,
  }
}
