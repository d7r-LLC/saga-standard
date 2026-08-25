// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import type { SagaLayerName } from '@d7r/saga-sdk'
import type { CollectorScan } from '../types'

/**
 * Scan Claude Code data directory and report available data.
 */
export function scanClaudeCode(homeDir?: string): CollectorScan {
  const home = homeDir ?? homedir()
  const claudeDir = join(home, '.claude')

  let sessionCount = 0
  let projectCount = 0
  let memoryEntries = 0
  let estimatedExportSizeBytes = 0
  const layers: SagaLayerName[] = []

  // Count sessions from projects
  const projectsDir = join(claudeDir, 'projects')
  if (existsSync(projectsDir)) {
    try {
      const projects = readdirSync(projectsDir).filter(d => {
        try {
          return statSync(join(projectsDir, d)).isDirectory()
        } catch {
          return false
        }
      })
      projectCount = projects.length

      for (const project of projects) {
        const projectPath = join(projectsDir, project)
        // Count JSONL session files
        try {
          const files = readdirSync(projectPath).filter(f => f.endsWith('.jsonl'))
          sessionCount += files.length
          for (const f of files) {
            try {
              const stat = statSync(join(projectPath, f))
              estimatedExportSizeBytes += stat.size
            } catch {
              // skip
            }
          }
        } catch {
          // skip
        }

        // Count memory files
        const memoryDir = join(projectPath, 'memory')
        if (existsSync(memoryDir)) {
          try {
            const memFiles = readdirSync(memoryDir)
            memoryEntries += memFiles.length
          } catch {
            // skip
          }
        }
      }
    } catch {
      // skip
    }
  }

  // Check history.jsonl
  const historyFile = join(claudeDir, 'history.jsonl')
  if (existsSync(historyFile)) {
    try {
      const content = readFileSync(historyFile, 'utf-8')
      const lines = content.split('\n').filter(l => l.trim().length > 0)
      sessionCount = Math.max(sessionCount, lines.length)
      estimatedExportSizeBytes += statSync(historyFile).size
    } catch {
      // skip
    }
  }

  // Determine which layers we can populate
  if (sessionCount > 0) {
    layers.push('taskHistory', 'memory')
  }
  if (memoryEntries > 0) {
    layers.push('cognitive')
  }
  if (existsSync(join(claudeDir, 'settings.json'))) {
    if (!layers.includes('cognitive')) layers.push('cognitive')
  }

  // Plans directory
  const plansDir = join(claudeDir, 'plans')
  if (existsSync(plansDir)) {
    if (!layers.includes('memory')) layers.push('memory')
  }

  return {
    sessionCount,
    projectCount,
    memoryEntries,
    skillCount: 0, // Claude Code doesn't explicitly track skills
    estimatedExportSizeBytes,
    layers: [...new Set(layers)],
  }
}
