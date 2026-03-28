// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import type { EpisodicEvent, PartialSagaDocument, ProceduralWorkflow } from '@epicdm/saga-sdk'
import type { CollectorDetection, CollectorScan, ExtractOptions, SagaCollector } from '../types'
import { detectFlowstateMemory } from './detector'
import { scanFlowstateMemory } from './scanner'
import { FlowstateMemoryClient, type MemoryObservation } from './client'
import { aggregateKnowledge } from '../claude-mem/parsers/knowledge'

const DEFAULT_URL = 'http://localhost:7090'

/** Map flowstate observation types to SAGA episodic event types */
function toEpisodicType(obsType: string): EpisodicEvent['type'] {
  switch (obsType) {
    case 'discovery':
    case 'refactor':
      return 'learning'
    case 'bugfix':
      return 'error-recovery'
    case 'feature':
      return 'task-completion'
    case 'decision':
      return 'milestone'
    default:
      return 'observation'
  }
}

/**
 * FlowState agent memory collector: extracts agent state from
 * the flowstate-agent-memory HTTP API into a PartialSagaDocument.
 *
 * Layers populated:
 *  - memory: episodic, procedural, semantic (from observations)
 */
export class FlowstateMemoryCollector implements SagaCollector {
  readonly source = 'flowstate-memory'
  private client: FlowstateMemoryClient

  constructor(url?: string) {
    this.client = new FlowstateMemoryClient(url ?? DEFAULT_URL)
  }

  async detect(homeDir?: string): Promise<CollectorDetection> {
    return detectFlowstateMemory(this.client['baseUrl'])
  }

  async scan(homeDir?: string): Promise<CollectorScan> {
    return scanFlowstateMemory(this.client['baseUrl'])
  }

  async extract(options?: ExtractOptions): Promise<PartialSagaDocument> {
    const detection = await this.detect()
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

    if (shouldInclude('memory')) {
      try {
        const limit = options?.maxMemoryEntries ?? 500
        const searchResult = await this.client.search({
          limit,
          ...(options?.since ? { since: options.since.toISOString() } : {}),
        })

        const observations = searchResult.results
        const { episodic, procedural, concepts } = categorizeObservations(observations)

        const hasEpisodic = episodic.length > 0
        const hasProcedural = procedural.length > 0
        const hasConcepts = concepts.length > 0

        if (hasEpisodic || hasProcedural || hasConcepts) {
          const semantic = hasConcepts ? aggregateKnowledge(concepts) : undefined

          partial.layers.memory = {
            ...(hasEpisodic ? { episodic: { events: episodic } } : {}),
            ...(hasProcedural ? { procedural: { workflows: procedural } } : {}),
            ...(semantic ? { semantic } : {}),
          }
        }
      } catch {
        // API failure: return what we have
      }
    }

    return partial
  }
}

function categorizeObservations(observations: MemoryObservation[]) {
  const episodic: EpisodicEvent[] = []
  const procedural: ProceduralWorkflow[] = []
  const concepts: string[] = []

  for (const obs of observations) {
    if (obs.concepts) concepts.push(...obs.concepts)

    if (obs.type === 'pattern') {
      procedural.push({
        name: obs.title,
        description: obs.narrative,
        steps: obs.facts,
      })
    } else {
      episodic.push({
        eventId: `flowstate-mem-${obs.id}`,
        type: toEpisodicType(obs.type),
        timestamp: obs.created_at,
        summary: obs.title,
        learnings: obs.narrative,
      })
    }
  }

  return { episodic, procedural, concepts }
}
