// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import type { CollectorDetection } from '../types'

/**
 * Detect Claude Code installation on disk.
 * Looks for ~/.claude/ with known files.
 */
export function detectClaudeCode(homeDir?: string): CollectorDetection {
  const home = homeDir ?? homedir()
  const claudeDir = join(home, '.claude')
  const locations: string[] = []

  if (!existsSync(claudeDir)) {
    return { source: 'claude-code', found: false, locations }
  }
  locations.push(claudeDir)

  // Check for projects directory
  const projectsDir = join(claudeDir, 'projects')
  if (existsSync(projectsDir)) {
    locations.push(projectsDir)
  }

  return {
    source: 'claude-code',
    found: true,
    locations,
  }
}
