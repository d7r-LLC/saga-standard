// packages/collectors/src/claude-mem/__tests__/parsers/observations.test.ts
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { parseObservations } from '../../parsers/observations'

let dbPath: string
let tempDir: string

beforeEach(() => {
  tempDir = join(tmpdir(), `saga-test-obs-${Date.now()}`)
  mkdirSync(tempDir, { recursive: true })
  dbPath = join(tempDir, 'claude-mem.db')

  const db = new Database(dbPath)
  db.exec(`
    CREATE TABLE observations (
      id INTEGER PRIMARY KEY,
      type TEXT NOT NULL,
      title TEXT,
      narrative TEXT,
      facts TEXT,
      concepts TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT,
      project TEXT,
      session_id TEXT
    )
  `)
  db.prepare(`
    INSERT INTO observations (id, type, title, narrative, facts, concepts, created_at, project)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(1, 'discovery', 'Found caching pattern', 'Discovered Redis caching approach', '["Redis is fast","TTL is 60s"]', '["redis","caching"]', '2026-03-01T00:00:00Z', 'my-project')

  db.prepare(`
    INSERT INTO observations (id, type, title, narrative, facts, concepts, created_at, project)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(2, 'bugfix', 'Fixed auth timeout', 'Token refresh was failing', '["Token expiry was wrong"]', '["auth"]', '2026-03-02T00:00:00Z', 'my-project')

  db.prepare(`
    INSERT INTO observations (id, type, title, narrative, facts, concepts, created_at, project)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(3, 'pattern', 'TDD workflow', 'Write test first then implement', '["Red-green-refactor"]', '["testing","tdd"]', '2026-03-03T00:00:00Z', 'my-project')

  db.close()
})

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true })
})

describe('parseObservations', () => {
  it('categorizes observations into episodic, semantic, and procedural', () => {
    const result = parseObservations(dbPath)
    expect(result.episodic.length).toBe(2) // discovery + bugfix
    expect(result.procedural.length).toBe(1) // pattern
  })

  it('maps discovery observations to episodic events', () => {
    const result = parseObservations(dbPath)
    const discovery = result.episodic.find(e => e.summary === 'Found caching pattern')
    expect(discovery).toBeDefined()
    expect(discovery!.type).toBe('learning')
    expect(discovery!.timestamp).toBe('2026-03-01T00:00:00Z')
  })

  it('maps pattern observations to procedural workflows', () => {
    const result = parseObservations(dbPath)
    expect(result.procedural[0].name).toBe('TDD workflow')
    expect(result.procedural[0].description).toBe('Write test first then implement')
  })

  it('extracts concepts for semantic aggregation', () => {
    const result = parseObservations(dbPath)
    expect(result.concepts).toContain('redis')
    expect(result.concepts).toContain('caching')
    expect(result.concepts).toContain('testing')
  })

  it('filters by since date', () => {
    const result = parseObservations(dbPath, { since: new Date('2026-03-02') })
    expect(result.episodic.length).toBe(1) // bugfix only
    expect(result.procedural.length).toBe(1) // pattern
  })

  it('limits results with maxEntries', () => {
    const result = parseObservations(dbPath, { maxEntries: 1 })
    const total = result.episodic.length + result.procedural.length
    expect(total).toBeLessThanOrEqual(1)
  })

  it('returns empty results for missing db', () => {
    const result = parseObservations('/nonexistent/path.db')
    expect(result.episodic).toEqual([])
    expect(result.procedural).toEqual([])
    expect(result.concepts).toEqual([])
  })
})
