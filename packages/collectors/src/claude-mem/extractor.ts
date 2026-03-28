// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { join } from 'node:path'
import { homedir } from 'node:os'
import type { PartialSagaDocument } from '@epicdm/saga-sdk'
import type { CollectorDetection, CollectorScan, ExtractOptions, SagaCollector } from '../types'
import { detectClaudeMem } from './detector'
import { scanClaudeMem } from './scanner'
import { parseObservations } from './parsers/observations'
import { parseSessions } from './parsers/sessions'
import { aggregateKnowledge } from './parsers/knowledge'

/**
 * claude-mem collector: extracts agent state from ~/.claude-mem/claude-mem.db
 * into a PartialSagaDocument.
 *
 * Layers populated:
 *  - memory: episodic (observations), procedural (patterns),
 *            semantic (concepts aggregated into knowledge domains)
 *  - taskHistory: sessions as task entries
 */
export class ClaudeMemCollector implements SagaCollector {
  readonly source = 'claude-mem'

  async detect(homeDir?: string): Promise<CollectorDetection> {
    return detectClaudeMem(homeDir)
  }

  async scan(homeDir?: string): Promise<CollectorScan> {
    return scanClaudeMem(homeDir)
  }

  async extract(options?: ExtractOptions): Promise<PartialSagaDocument> {
    const home = options?.homeDir ?? homedir()
    const dbPath = join(home, '.claude-mem', 'claude-mem.db')

    const detection = detectClaudeMem(home)
    if (!detection.found) {
      return { source: this.source, layers: {} }
    }

    const requestedLayers = options?.layers
    const shouldInclude = (layer: string) =>
      !requestedLayers || requestedLayers.includes(layer as never)

    const partial: PartialSagaDocument = {
      source: this.source,
      layers: {},
    }

    // Memory layer
    if (shouldInclude('memory')) {
      const obs = parseObservations(dbPath, {
        since: options?.since,
        maxEntries: options?.maxMemoryEntries,
      })

      const hasEpisodic = obs.episodic.length > 0
      const hasProcedural = obs.procedural.length > 0
      const hasConcepts = obs.concepts.length > 0

      if (hasEpisodic || hasProcedural || hasConcepts) {
        const semantic = hasConcepts ? aggregateKnowledge(obs.concepts) : undefined

        partial.layers.memory = {
          ...(hasEpisodic ? { episodic: { events: obs.episodic } } : {}),
          ...(hasProcedural ? { procedural: { workflows: obs.procedural } } : {}),
          ...(semantic ? { semantic } : {}),
        }
      }
    }

    // Task history layer
    if (shouldInclude('taskHistory')) {
      const sessions = parseSessions(dbPath)
      if (sessions.recentTasks.length > 0) {
        const limit = options?.maxMemoryEntries ?? 100
        partial.layers.taskHistory = {
          summary: sessions.summary,
          recentTasks: sessions.recentTasks.slice(0, limit),
          recentTasksLimit: limit,
        }
      }
    }

    return partial
  }
}
