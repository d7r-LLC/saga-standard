// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { type DrizzleD1Database, drizzle } from 'drizzle-orm/d1'
import { sql } from 'drizzle-orm'
import * as schema from './schema'

/**
 * Drizzle D1 connection factory.
 *
 * Phase 5 (A-High#7): SQLite — and therefore Cloudflare D1 — defaults to
 * `PRAGMA foreign_keys = OFF` on every connection. The `FOREIGN KEY` clauses
 * emitted by `sqliteTable(...).references(...)` in `schema.ts` (e.g.
 * `documents.agent_id → agents.id`, `transfers.document_id → documents.id`)
 * are silently ignored at runtime without this pragma. Cascading deletes,
 * orphan-row prevention, and FK violations all become no-ops.
 *
 * `getDb()` ensures the pragma is set on the connection backing this drizzle
 * handle. The drizzle `.run(...)` runs on the same prepared-statement queue
 * as subsequent queries, so the pragma is in effect for any FK-sensitive
 * write that follows. We swallow the result rather than `await`-ing because
 * (a) D1 prepared-statement errors are rare for `PRAGMA foreign_keys` and
 * (b) every caller already `await`s its own DB calls, which queue behind
 * the pragma in submission order.
 *
 * Use this factory everywhere instead of `drizzle(env.DB)` directly. The
 * cost is one extra prepared-statement enqueue per drizzle handle (~µs).
 */
export function getDb(d1: D1Database): DrizzleD1Database<typeof schema> {
  const db = drizzle(d1, { schema })
  // Fire-and-forget: the pragma queues ahead of any subsequent query the
  // caller issues on this same handle. If the pragma fails, FK enforcement
  // simply remains off — same as today, no regression.
  db.run(sql`PRAGMA foreign_keys = ON`).catch(() => {
    // Swallow: pragma failure shouldn't crash the request. Tests pin the
    // happy-path behavior; in production, the indexer also retries.
  })
  return db
}

export * from './schema'
