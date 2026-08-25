// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { SagaLayerName } from '@d7r/saga-sdk'
import type { CollectorScan } from '../types'

/**
 * Scan .claude/ directories and count available resources.
 */
export function scanProjectClaude(paths: string[]): CollectorScan {
  const layers: SagaLayerName[] = []
  let projectCount = 0
  let skillCount = 0

  for (const p of paths) {
    const claudeDir = join(p, '.claude')
    if (!existsSync(claudeDir)) continue
    projectCount++

    const agentsDir = join(claudeDir, 'agents')
    if (existsSync(agentsDir)) {
      layers.push('persona', 'relationships')
    }

    const rulesDir = join(claudeDir, 'rules')
    if (existsSync(rulesDir)) {
      layers.push('cognitive')
    }

    const commandsDir = join(claudeDir, 'commands')
    if (existsSync(commandsDir)) {
      try {
        skillCount += readdirSync(commandsDir).filter(f => f.endsWith('.md')).length
      } catch {
        // skip
      }
      if (skillCount > 0) layers.push('skills')
    }
  }

  return {
    sessionCount: 0,
    projectCount,
    memoryEntries: 0,
    skillCount,
    estimatedExportSizeBytes: 0,
    layers: [...new Set(layers)],
  }
}
