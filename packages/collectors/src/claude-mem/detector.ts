// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import type { CollectorDetection } from '../types'

/**
 * Detect claude-mem SQLite database on disk.
 * Looks for ~/.claude-mem/claude-mem.db.
 */
export function detectClaudeMem(homeDir?: string): CollectorDetection {
  const home = homeDir ?? homedir()
  const dbPath = join(home, '.claude-mem', 'claude-mem.db')

  if (!existsSync(dbPath)) {
    return { source: 'claude-mem', found: false, locations: [] }
  }

  return {
    source: 'claude-mem',
    found: true,
    locations: [dbPath],
  }
}
