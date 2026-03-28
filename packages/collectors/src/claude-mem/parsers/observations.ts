// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { existsSync } from 'node:fs'
import Database from 'better-sqlite3'
import type { EpisodicEvent, ProceduralWorkflow } from '@epicdm/saga-sdk'

interface ObservationRow {
  id: number
  type: string
  title: string | null
  narrative: string | null
  facts: string | null
  concepts: string | null
  created_at: string
  project: string | null
  session_id: string | null
}

export interface ParsedObservations {
  episodic: EpisodicEvent[]
  procedural: ProceduralWorkflow[]
  concepts: string[]
}

interface ParseOptions {
  since?: Date
  maxEntries?: number
}

function toEpisodicType(obsType: string): EpisodicEvent['type'] {
  switch (obsType) {
    case 'discovery':
    case 'refactor':
      return 'learning' as EpisodicEvent['type']
    case 'bugfix':
      return 'error-recovery' as EpisodicEvent['type']
    case 'feature':
      return 'task-completion' as EpisodicEvent['type']
    case 'decision':
      return 'milestone' as EpisodicEvent['type']
    default:
      return 'observation' as EpisodicEvent['type']
  }
}

function classifyScope(obsType: string): 'agent-portable' | 'org-internal' {
  if (obsType === 'discovery' || obsType === 'pattern') return 'agent-portable'
  return 'org-internal'
}

export function parseObservations(dbPath: string, options?: ParseOptions): ParsedObservations {
  if (!existsSync(dbPath)) {
    return { episodic: [], procedural: [], concepts: [] }
  }

  let db: Database.Database | null = null
  try {
    db = new Database(dbPath, { readonly: true })

    let query =
      'SELECT id, type, title, narrative, facts, concepts, created_at, project, session_id FROM observations'
    const params: unknown[] = []

    if (options?.since) {
      query += ' WHERE created_at >= ?'
      params.push(options.since.toISOString())
    }

    query += ' ORDER BY created_at DESC'

    if (options?.maxEntries) {
      query += ' LIMIT ?'
      params.push(options.maxEntries)
    }

    const rows = db.prepare(query).all(...params) as ObservationRow[]

    const episodic: EpisodicEvent[] = []
    const procedural: ProceduralWorkflow[] = []
    const allConcepts: string[] = []

    for (const row of rows) {
      if (row.concepts) {
        try {
          const parsed = JSON.parse(row.concepts) as string[]
          allConcepts.push(...parsed)
        } catch {
          // skip malformed concepts
        }
      }

      if (row.type === 'pattern') {
        procedural.push({
          name: row.title ?? `pattern-${row.id}`,
          description: row.narrative ?? undefined,
          steps: row.facts ? tryParseArray(row.facts) : undefined,
          classification: classifyScope(row.type) === 'agent-portable' ? 'public' : 'org-internal',
        } as ProceduralWorkflow)
      } else {
        episodic.push({
          eventId: `claude-mem-${row.id}`,
          type: toEpisodicType(row.type),
          timestamp: row.created_at,
          summary: row.title ?? undefined,
          learnings: row.narrative ?? undefined,
          classification: classifyScope(row.type) === 'agent-portable' ? 'public' : 'org-internal',
        } as EpisodicEvent)
      }
    }

    const uniqueConcepts = [...new Set(allConcepts)]

    return { episodic, procedural, concepts: uniqueConcepts }
  } catch {
    return { episodic: [], procedural: [], concepts: [] }
  } finally {
    db?.close()
  }
}

function tryParseArray(json: string): string[] | undefined {
  try {
    const parsed = JSON.parse(json)
    return Array.isArray(parsed) ? parsed : undefined
  } catch {
    return undefined
  }
}
