// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import type { SagaLayerName } from '@epicdm/saga-sdk'
import type { CollectorScan } from '../types'
import { resolveOpenClawStateDir, resolveOpenClawWorkspaceDir } from './detector'

/**
 * Scan OpenClaw data directories and report available data.
 */
export function scanOpenClaw(homeDir?: string): CollectorScan {
  const home = homeDir ?? homedir()
  const stateDir = resolveOpenClawStateDir(home)
  if (!stateDir) {
    return {
      sessionCount: 0,
      projectCount: 0,
      memoryEntries: 0,
      skillCount: 0,
      estimatedExportSizeBytes: 0,
      layers: [],
    }
  }

  const layers: SagaLayerName[] = []
  let sessionCount = 0
  let memoryEntries = 0
  let skillCount = 0
  let estimatedExportSizeBytes = 0

  const wsDir = resolveOpenClawWorkspaceDir(stateDir)

  // Count workspace files (persona, cognitive)
  if (wsDir) {
    const workspaceFiles = [
      'AGENTS.md',
      'SOUL.md',
      'IDENTITY.md',
      'TOOLS.md',
      'USER.md',
      'MEMORY.md',
      'BOOTSTRAP.md',
      'HEARTBEAT.md',
    ]
    for (const file of workspaceFiles) {
      const filePath = join(wsDir, file)
      if (existsSync(filePath)) {
        try {
          const stat = statSync(filePath)
          estimatedExportSizeBytes += stat.size
        } catch {
          // skip
        }
      }
    }

    // Identity file → persona layer
    if (existsSync(join(wsDir, 'IDENTITY.md'))) {
      layers.push('persona')
    }

    // SOUL.md, AGENTS.md, BOOTSTRAP.md → cognitive layer
    if (
      existsSync(join(wsDir, 'SOUL.md')) ||
      existsSync(join(wsDir, 'AGENTS.md')) ||
      existsSync(join(wsDir, 'BOOTSTRAP.md'))
    ) {
      layers.push('cognitive')
    }

    // TOOLS.md → environment layer
    if (existsSync(join(wsDir, 'TOOLS.md'))) {
      layers.push('environment')
    }

    // Memory files
    if (existsSync(join(wsDir, 'MEMORY.md'))) {
      layers.push('memory')
    }
    const memoryDir = join(wsDir, 'memory')
    if (existsSync(memoryDir)) {
      try {
        const memFiles = readdirSync(memoryDir).filter(f => f.endsWith('.md'))
        memoryEntries += memFiles.length
      } catch {
        // skip
      }
    }

    // Memory index.sqlite
    const indexPath = join(wsDir, 'index.sqlite')
    if (existsSync(indexPath)) {
      try {
        const stat = statSync(indexPath)
        estimatedExportSizeBytes += stat.size
        memoryEntries += 1 // At least the db exists
      } catch {
        // skip
      }
    }
  }

  // Count skills
  const skillsDir = join(stateDir, 'skills')
  if (existsSync(skillsDir)) {
    try {
      const skillDirs = readdirSync(skillsDir).filter(d => {
        try {
          return statSync(join(skillsDir, d)).isDirectory()
        } catch {
          return false
        }
      })
      skillCount = skillDirs.length
      if (skillCount > 0) {
        layers.push('skills')
      }
    } catch {
      // skip
    }
  }

  // Count sessions
  const sessionsDir = join(stateDir, 'sessions')
  if (existsSync(sessionsDir)) {
    try {
      const sessionFiles = readdirSync(sessionsDir).filter(f => f.endsWith('.jsonl'))
      sessionCount = sessionFiles.length
      if (sessionCount > 0) {
        layers.push('taskHistory')
      }
    } catch {
      // skip
    }
  }

  // Agent-level sessions
  const agentsDir = join(stateDir, 'agents')
  if (existsSync(agentsDir)) {
    try {
      const agents = readdirSync(agentsDir).filter(d => {
        try {
          return statSync(join(agentsDir, d)).isDirectory()
        } catch {
          return false
        }
      })
      for (const agent of agents) {
        const agentSessionsDir = join(agentsDir, agent, 'sessions')
        if (existsSync(agentSessionsDir)) {
          try {
            const files = readdirSync(agentSessionsDir).filter(f => f.endsWith('.jsonl'))
            sessionCount += files.length
          } catch {
            // skip
          }
        }
      }
    } catch {
      // skip
    }
  }

  return {
    sessionCount,
    projectCount: 1, // OpenClaw is workspace-scoped, so 1 project per workspace
    memoryEntries,
    skillCount,
    estimatedExportSizeBytes,
    layers: [...new Set(layers)],
  }
}
