// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { basename, join } from 'node:path'
import type { EpisodicEvent, SemanticMemory } from '@epicdm/saga-sdk'

/**
 * Parse Claude Code project memory files into semantic memory.
 * Memory files live in ~/.claude/projects/{slug}/memory/
 */
export function parseProjectMemory(projectsDir: string): {
  semantic: Partial<SemanticMemory>
  episodicEvents: EpisodicEvent[]
} {
  const knowledgeDomains: string[] = []
  const episodicEvents: EpisodicEvent[] = []

  if (!existsSync(projectsDir)) {
    return { semantic: {}, episodicEvents: [] }
  }

  try {
    const projects = readdirSync(projectsDir).filter(d => {
      try {
        return statSync(join(projectsDir, d)).isDirectory()
      } catch {
        return false
      }
    })

    for (const project of projects) {
      const memoryDir = join(projectsDir, project, 'memory')
      if (!existsSync(memoryDir)) continue

      try {
        const memFiles = readdirSync(memoryDir).filter(f => f.endsWith('.md'))
        for (const file of memFiles) {
          try {
            const content = readFileSync(join(memoryDir, file), 'utf-8').trim()
            if (content.length === 0) continue

            // Extract knowledge domain from filename
            const domain = basename(file, '.md').replace(/[-_]/g, ' ')
            if (!knowledgeDomains.includes(domain)) {
              knowledgeDomains.push(domain)
            }

            // Extract dated entries as episodic events
            const datePattern = /^###?\s+(\w+\s+\d{1,2},?\s+\d{4}|\d{4}-\d{2}-\d{2})/gm
            let match
            while ((match = datePattern.exec(content)) !== null) {
              const dateStr = match[1]
              try {
                const date = new Date(dateStr)
                if (!isNaN(date.getTime())) {
                  episodicEvents.push({
                    eventId: `cc_mem_${project}_${date.getTime()}`,
                    type: 'interaction',
                    timestamp: date.toISOString(),
                    summary: `Memory entry from ${project}: ${file}`,
                  })
                }
              } catch {
                // skip unparseable dates
              }
            }
          } catch {
            // skip unreadable files
          }
        }
      } catch {
        // skip unreadable dirs
      }
    }
  } catch {
    // skip
  }

  return {
    semantic: {
      ...(knowledgeDomains.length > 0 ? { knowledgeDomains } : {}),
    },
    episodicEvents,
  }
}
