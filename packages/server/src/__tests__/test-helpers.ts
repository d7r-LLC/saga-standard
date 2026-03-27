// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import type { Env } from '../bindings'

/** Strip double-quotes from SQL identifiers */
function unquote(s: string): string {
  return s.replace(/"/g, '').trim()
}

/**
 * In-memory D1 mock that properly supports drizzle-orm/d1.
 *
 * Drizzle's D1 driver:
 * - Uses run() for INSERT/UPDATE/DELETE
 * - Uses raw() for SELECT (returns { results: [[v1,v2,...], ...] })
 * - Uses double-quoted identifiers: "table_name", "column_name"
 * - May embed `null` literals in INSERT values
 */
export function createMockD1(): D1Database {
  // Each table stores an ordered list of rows.
  // Each row is a Map<columnName, value> to preserve insertion column order.
  const tables = new Map<
    string,
    { columns: string[]; rows: Record<string, unknown>[]; primaryKey: string[] }
  >()

  function getTable(name: string) {
    if (!tables.has(name)) {
      tables.set(name, { columns: [], rows: [], primaryKey: [] })
    }
    return tables.get(name)!
  }

  function executeInsert(sql: string, params: unknown[]): void {
    const tableM = sql.match(/insert\s+(?:or\s+(?:ignore|replace)\s+)?into\s+"?(\w+)"?/i)
    if (!tableM) return
    const isOrIgnore = /insert\s+or\s+ignore\s+into/i.test(sql)
    const isOrReplace = /insert\s+or\s+replace\s+into/i.test(sql)
    const table = getTable(tableM[1])

    // Extract column list
    const colsM = sql.match(/\(([^)]+)\)\s+values/i)
    if (!colsM) return
    const cols = colsM[1].split(',').map(c => unquote(c))

    // If table has no columns yet, record them
    if (table.columns.length === 0) {
      table.columns = cols
    }

    // Parse all VALUES groups — supports multi-row inserts: VALUES (?, ?, ?), (?, ?, ?)
    const valuesSection = sql.match(/values\s*([\s\S]+)$/i)
    if (!valuesSection) return
    // Extract each (...) value group
    const valueGroupRegex = /\(([^)]+)\)/g
    const valueGroups: string[][] = []
    let m: RegExpExecArray | null
    while ((m = valueGroupRegex.exec(valuesSection[1])) !== null) {
      valueGroups.push(m[1].split(',').map(t => t.trim()))
    }
    if (valueGroups.length === 0) return

    let paramIdx = 0
    for (const valueTokens of valueGroups) {
      const row: Record<string, unknown> = {}
      cols.forEach((col, i) => {
        const token = valueTokens[i]?.trim()
        if (token === '?') {
          row[col] = params[paramIdx++]
        } else if (token?.toLowerCase() === 'null') {
          row[col] = null
        } else {
          // Literal value (number, string, etc.)
          row[col] = token
        }
      })

      // INSERT OR IGNORE: skip if a row with the same primary key already exists
      if (isOrIgnore && table.columns.length > 0) {
        // Use composite PK if available, otherwise fall back to first column
        const pkCols = table.primaryKey.length > 0 ? table.primaryKey : [table.columns[0]]
        const isDuplicate = table.rows.some(r =>
          pkCols.every(col => r[col] !== undefined && r[col] === row[col])
        )
        if (isDuplicate) {
          continue
        }
      }

      // INSERT OR REPLACE: remove existing row with same primary key, then insert new row
      if (isOrReplace && table.columns.length > 0) {
        const pkCols = table.primaryKey.length > 0 ? table.primaryKey : [table.columns[0]]
        table.rows = table.rows.filter(
          r => !pkCols.every(col => r[col] !== undefined && r[col] === row[col])
        )
      }

      table.rows.push(row)
    }
  }

  function executeUpdate(sql: string, params: unknown[]): void {
    const tableM = sql.match(/update\s+"?(\w+)"?/i)
    if (!tableM) return
    const table = getTable(tableM[1])

    const setWhereM = sql.match(/set\s+(.*?)\s+where\s+(.*)/is)
    if (!setWhereM) return

    const setClause = setWhereM[1]
    const whereClause = setWhereM[2]

    // Count ? in SET
    const setQCount = (setClause.match(/\?/g) || []).length
    const setParams = params.slice(0, setQCount)
    const whereParams = params.slice(setQCount)

    // Parse SET column=? pairs
    const setPairs: { col: string; paramIdx: number }[] = []
    let si = 0
    for (const part of setClause.split(',')) {
      const m = part.match(/"?(\w+)"?\s*=\s*\?/)
      if (m) {
        setPairs.push({ col: m[1], paramIdx: si++ })
      }
    }

    for (const row of table.rows) {
      if (matchesWhere(row, whereClause, whereParams)) {
        for (const { col, paramIdx: pi } of setPairs) {
          row[col] = setParams[pi]
        }
      }
    }
  }

  function executeDelete(sql: string, params: unknown[]): void {
    const tableM = sql.match(/from\s+"?(\w+)"?/i)
    if (!tableM) return
    const table = getTable(tableM[1])

    const whereM = sql.match(/where\s+(.*)/is)
    if (whereM) {
      table.rows = table.rows.filter(row => !matchesWhere(row, whereM[1], params))
    } else {
      table.rows = []
    }
  }

  function executeSelect(
    sql: string,
    params: unknown[]
  ): { columns: string[]; rows: Record<string, unknown>[] } {
    const tableM = sql.match(/from\s+"?(\w+)"?/i)
    if (!tableM) return { columns: [], rows: [] }
    const table = getTable(tableM[1])

    // Check for count(*)
    if (/select\s+count\(\*\)/i.test(sql)) {
      let rows = [...table.rows]
      const whereM = sql.match(/where\s+(.*?)(?:\s*$)/is)
      if (whereM) {
        rows = rows.filter(r => matchesWhereWithOr(r, whereM[1], params))
      }
      return { columns: ['count(*)'], rows: [{ 'count(*)': rows.length }] }
    }

    // Parse SELECT columns
    const selectM = sql.match(/select\s+(.*?)\s+from/is)
    let selectCols: string[]
    if (!selectM || selectM[1].trim() === '*') {
      selectCols = table.columns.length > 0 ? table.columns : Object.keys(table.rows[0] ?? {})
    } else {
      selectCols = selectM[1].split(',').map(c => unquote(c))
    }

    let rows = [...table.rows]

    // WHERE
    const whereM = sql.match(/where\s+(.*?)(?:\s+order|\s+limit|\s*$)/is)
    let whereParamCount = 0
    if (whereM) {
      whereParamCount = (whereM[1].match(/\?/g) || []).length
      const whereParams = params.slice(0, whereParamCount)
      rows = rows.filter(r => matchesWhereWithOr(r, whereM[1], whereParams))
    }

    // ORDER BY
    const orderM = sql.match(/order\s+by\s+"?(\w+)"?\s+(asc|desc)/i)
    if (orderM) {
      const col = orderM[1]
      const desc = orderM[2].toLowerCase() === 'desc'
      rows.sort((a, b) => {
        const va = String(a[col] ?? '')
        const vb = String(b[col] ?? '')
        return desc ? vb.localeCompare(va) : va.localeCompare(vb)
      })
    }

    // LIMIT and OFFSET
    const limitM = sql.match(/limit\s+(\?|\d+)/i)
    const offsetM = sql.match(/offset\s+(\?|\d+)/i)

    let limitIdx = whereParamCount
    if (limitM?.at(1) === '?') {
      const limitVal = Number(params[limitIdx])
      limitIdx++
      if (offsetM?.at(1) === '?') {
        const offsetVal = Number(params[limitIdx])
        rows = rows.slice(offsetVal, offsetVal + limitVal)
      } else if (offsetM) {
        const offsetVal = Number(offsetM[1])
        rows = rows.slice(offsetVal, offsetVal + limitVal)
      } else {
        rows = rows.slice(0, limitVal)
      }
    } else if (limitM) {
      const limitVal = Number(limitM[1])
      rows = rows.slice(0, limitVal)
    }

    return { columns: selectCols, rows }
  }

  function matchesWhere(
    row: Record<string, unknown>,
    whereClause: string,
    params: unknown[]
  ): boolean {
    const conditions = whereClause.split(/\s+and\s+/i)
    let pi = 0

    for (const cond of conditions) {
      const t = cond.trim()

      // col = ?
      const eqM = t.match(/"?(\w+)"?\s*=\s*\?/)
      if (eqM) {
        const col = eqM[1]
        const val = params[pi++]
        // Allow loose comparison for numbers stored as different types
        if (row[col] !== val && String(row[col]) !== String(val)) return false
        continue
      }

      // col LIKE ?
      const likeM = t.match(/"?(\w+)"?\s+like\s+\?/i)
      if (likeM) {
        const col = likeM[1]
        const pattern = String(params[pi++])
        const regex = new RegExp(`^${pattern.replace(/%/g, '.*').replace(/_/g, '.')}$`, 'i')
        if (!regex.test(String(row[col] ?? ''))) return false
        continue
      }

      // col > ?
      const gtM = t.match(/"?(\w+)"?\s*>\s*\?/)
      if (gtM) {
        const col = gtM[1]
        const val = params[pi++]
        if (String(row[col] ?? '') <= String(val)) return false
        continue
      }
    }
    return true
  }

  function matchesWhereWithOr(
    row: Record<string, unknown>,
    whereClause: string,
    params: unknown[]
  ): boolean {
    // Drizzle wraps OR in parens: (cond1 OR cond2)
    const stripped = whereClause.replace(/^\s*\(/, '').replace(/\)\s*$/, '')

    if (/\s+or\s+/i.test(stripped) && !/\s+and\s+/i.test(stripped)) {
      const branches = stripped.split(/\s+or\s+/i)
      let pi = 0
      for (const branch of branches) {
        const branchQCount = (branch.match(/\?/g) || []).length
        const branchParams = params.slice(pi, pi + branchQCount)
        if (matchesWhere(row, branch, branchParams)) return true
        pi += branchQCount
      }
      return false
    }
    return matchesWhere(row, whereClause, params)
  }

  const db: D1Database = {
    prepare(query: string) {
      let boundValues: unknown[] = []

      const stmt = {
        bind(...values: unknown[]) {
          boundValues = values
          return stmt
        },
        async all() {
          const lower = query.trim().toLowerCase()
          if (lower.startsWith('select')) {
            const { rows } = executeSelect(query, boundValues)
            return { results: rows, success: true, meta: {} }
          }
          // Non-select: run and return empty results
          if (lower.startsWith('insert')) executeInsert(query, boundValues)
          else if (lower.startsWith('update')) executeUpdate(query, boundValues)
          else if (lower.startsWith('delete')) executeDelete(query, boundValues)
          return { results: [], success: true, meta: {} }
        },
        async first(col?: string) {
          const { rows } = executeSelect(query, boundValues)
          if (rows.length === 0) return null
          if (col) return rows[0][col]
          return rows[0]
        },
        async run() {
          const lower = query.trim().toLowerCase()
          if (lower.startsWith('insert')) executeInsert(query, boundValues)
          else if (lower.startsWith('update')) executeUpdate(query, boundValues)
          else if (lower.startsWith('delete')) executeDelete(query, boundValues)
          return { success: true, results: [], meta: { changes: 1 } }
        },
        async raw() {
          // D1's raw() returns just the array of arrays, not wrapped in {results:}
          const { columns, rows } = executeSelect(query, boundValues)
          return rows.map(row => columns.map(col => row[col]))
        },
      }
      return stmt as unknown as D1PreparedStatement
    },
    async dump() {
      return new ArrayBuffer(0)
    },
    async batch(statements: D1PreparedStatement[]) {
      const results = []
      for (const s of statements) {
        results.push(await s.all())
      }
      return results
    },
    async exec(query: string) {
      const statements = query.split(';').filter(s => s.trim())
      for (const stmt of statements) {
        const lower = stmt.trim().toLowerCase()
        if (lower.startsWith('create table') || lower.startsWith('create index')) {
          // Track table with columns from CREATE TABLE
          const m = stmt.match(
            /create\s+table\s+(?:if\s+not\s+exists\s+)?"?(\w+)"?\s*\(([\s\S]*)\)/i
          )
          if (m) {
            const tableName = m[1]
            const colDefs = m[2].split(',')
            const cols = colDefs
              .map(cd => {
                const cm = cd.trim().match(/^"?(\w+)"?\s+/i)
                return cm ? cm[1] : null
              })
              .filter(Boolean) as string[]
            const table = getTable(tableName)
            if (table.columns.length === 0) {
              table.columns = cols
            }
            // Extract composite PRIMARY KEY constraint, e.g. PRIMARY KEY (col1, col2)
            const pkM = m[2].match(/PRIMARY\s+KEY\s*\(([^)]+)\)/i)
            if (pkM && table.primaryKey.length === 0) {
              table.primaryKey = pkM[1].split(',').map(c => c.trim().replace(/"/g, ''))
            }
          }
        }
      }
      return { count: statements.length, duration: 0 }
    },
  }

  return db
}

/** In-memory KV mock */
export function createMockKV(): KVNamespace {
  const store = new Map<string, { value: string; expiration?: number }>()

  return {
    async get(key: string) {
      const entry = store.get(key)
      if (!entry) return null
      if (entry.expiration && Date.now() / 1000 > entry.expiration) {
        store.delete(key)
        return null
      }
      return entry.value
    },
    async put(key: string, value: string, opts?: { expirationTtl?: number }) {
      store.set(key, {
        value,
        expiration: opts?.expirationTtl ? Date.now() / 1000 + opts.expirationTtl : undefined,
      })
    },
    async delete(key: string) {
      store.delete(key)
    },
    async list(opts?: { prefix?: string; limit?: number }) {
      // Evict expired entries
      for (const [k, entry] of store) {
        if (entry.expiration && Date.now() / 1000 > entry.expiration) {
          store.delete(k)
        }
      }
      let keys = Array.from(store.keys()).sort()
      if (opts?.prefix) {
        keys = keys.filter(k => k.startsWith(opts.prefix!))
      }
      const total = keys.length
      if (opts?.limit) {
        keys = keys.slice(0, opts.limit)
      }
      return {
        keys: keys.map(name => ({ name })),
        list_complete: keys.length >= total,
        caches: [],
      }
    },
    async getWithMetadata() {
      return { value: null, metadata: null, cacheStatus: null }
    },
  } as unknown as KVNamespace
}

/** In-memory R2 mock */
export function createMockR2(): R2Bucket {
  const objects = new Map<string, { data: ArrayBuffer; metadata?: Record<string, string> }>()

  return {
    async put(
      key: string,
      value: ArrayBuffer | string,
      opts?: { httpMetadata?: { contentType?: string } }
    ) {
      const data = typeof value === 'string' ? new TextEncoder().encode(value).buffer : value
      objects.set(key, { data, metadata: opts?.httpMetadata as Record<string, string> })
      return { key, size: data.byteLength } as R2Object
    },
    async get(key: string) {
      const obj = objects.get(key)
      if (!obj) return null
      return {
        key,
        size: obj.data.byteLength,
        async arrayBuffer() {
          return obj.data
        },
        async text() {
          return new TextDecoder().decode(obj.data)
        },
        async json() {
          return JSON.parse(new TextDecoder().decode(obj.data))
        },
        body: new ReadableStream(),
        httpMetadata: obj.metadata ?? {},
      } as unknown as R2ObjectBody
    },
    async delete(key: string | string[]) {
      const keys = Array.isArray(key) ? key : [key]
      for (const k of keys) objects.delete(k)
    },
    async list() {
      return {
        objects: Array.from(objects.keys()).map(key => ({ key })),
        truncated: false,
      }
    },
    async head(key: string) {
      const obj = objects.get(key)
      if (!obj) return null
      return { key, size: obj.data.byteLength } as R2Object
    },
  } as unknown as R2Bucket
}

/** Create a full mock Env for testing */
export function createMockEnv(): Env {
  return {
    DB: createMockD1(),
    STORAGE: createMockR2(),
    SESSIONS: createMockKV(),
    INDEXER_STATE: createMockKV(),
    RELAY_MAILBOX: createMockKV(),
    RELAY_ROOM: {} as unknown as DurableObjectNamespace,
    SERVER_NAME: 'Test SAGA Server',
  }
}

/** Run initial migration on mock D1 */
export async function runMigrations(db: D1Database): Promise<void> {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY,
      handle TEXT UNIQUE NOT NULL,
      wallet_address TEXT NOT NULL,
      chain TEXT NOT NULL,
      public_key TEXT,
      registered_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      token_id INTEGER,
      tba_address TEXT,
      contract_address TEXT,
      mint_tx_hash TEXT,
      entity_type TEXT DEFAULT 'agent',
      home_hub_url TEXT
    );
    CREATE TABLE IF NOT EXISTS organizations (
      id TEXT PRIMARY KEY,
      handle TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      wallet_address TEXT NOT NULL,
      chain TEXT NOT NULL,
      public_key TEXT,
      token_id INTEGER,
      tba_address TEXT,
      contract_address TEXT,
      mint_tx_hash TEXT,
      registered_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      export_type TEXT NOT NULL,
      saga_version TEXT NOT NULL,
      storage_key TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      checksum TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS transfers (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      source_server_url TEXT NOT NULL,
      destination_server_url TEXT NOT NULL,
      status TEXT NOT NULL,
      requested_layers TEXT,
      consent_signature TEXT,
      document_id TEXT,
      initiated_at TEXT NOT NULL,
      completed_at TEXT
    );
    CREATE TABLE IF NOT EXISTS auth_challenges (
      id TEXT PRIMARY KEY,
      wallet_address TEXT NOT NULL,
      chain TEXT NOT NULL,
      challenge TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      used INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS memory_envelopes (
      id TEXT PRIMARY KEY,
      agent_handle TEXT NOT NULL,
      envelope_json TEXT NOT NULL,
      stored_at TEXT NOT NULL,
      envelope_ts TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS group_members (
      group_id TEXT NOT NULL,
      handle TEXT NOT NULL,
      added_at TEXT NOT NULL,
      PRIMARY KEY (group_id, handle)
    );
    CREATE TABLE IF NOT EXISTS replication_policies (
      org_id TEXT PRIMARY KEY,
      policy_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `)
}
