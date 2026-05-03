// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { and, asc, eq, gt } from 'drizzle-orm'
import { getDb } from '../db'
import { memoryEnvelopes } from '../db/schema'
import type { RelayEnvelope } from './types'

export interface CanonicalMemoryStore {
  /** Store a memory-sync envelope in the canonical store */
  store(agentHandle: string, envelope: RelayEnvelope): Promise<void>
  /** Query envelopes since a checkpoint, returns batch + pagination info */
  querySince(
    agentHandle: string,
    since: string,
    limit: number
  ): Promise<{ envelopes: RelayEnvelope[]; checkpoint: string; hasMore: boolean }>
}

export function createCanonicalMemoryStore(db: D1Database): CanonicalMemoryStore {
  const orm = getDb(db)

  return {
    async store(agentHandle, envelope) {
      const now = new Date().toISOString()
      // Use INSERT OR IGNORE for dedup by envelope id
      await db
        .prepare(
          `INSERT OR IGNORE INTO memory_envelopes (id, agent_handle, envelope_json, stored_at, envelope_ts)
           VALUES (?, ?, ?, ?, ?)`
        )
        .bind(envelope.id, agentHandle, JSON.stringify(envelope), now, envelope.ts)
        .run()
    },

    async querySince(agentHandle, since, limit) {
      const rows = await orm
        .select()
        .from(memoryEnvelopes)
        .where(
          and(eq(memoryEnvelopes.agentHandle, agentHandle), gt(memoryEnvelopes.storedAt, since))
        )
        .orderBy(asc(memoryEnvelopes.storedAt), asc(memoryEnvelopes.id))
        .limit(limit + 1)

      const hasMore = rows.length > limit
      const batch = hasMore ? rows.slice(0, limit) : rows
      const envelopes = batch.map(row => JSON.parse(row.envelopeJson) as RelayEnvelope)
      const checkpoint = batch.length > 0 ? batch[batch.length - 1].storedAt : since

      return { envelopes, checkpoint, hasMore }
    },
  }
}
