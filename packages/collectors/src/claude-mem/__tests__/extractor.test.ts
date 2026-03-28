// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { ClaudeMemCollector } from '../extractor'

let homeDir: string
let dbPath: string
let collector: ClaudeMemCollector

beforeEach(() => {
  homeDir = join(tmpdir(), `saga-test-cm-extract-${Date.now()}`)
  const dbDir = join(homeDir, '.claude-mem')
  mkdirSync(dbDir, { recursive: true })
  dbPath = join(dbDir, 'claude-mem.db')

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
    );
    CREATE TABLE sdk_sessions (
      id INTEGER PRIMARY KEY,
      session_id TEXT NOT NULL,
      project TEXT,
      started_at TEXT NOT NULL,
      ended_at TEXT,
      model TEXT
    );
    CREATE TABLE session_summaries (
      id INTEGER PRIMARY KEY,
      session_id TEXT NOT NULL,
      summary TEXT,
      created_at TEXT NOT NULL
    )
  `)

  db.prepare(`INSERT INTO observations (id, type, title, narrative, facts, concepts, created_at, project) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(1, 'discovery', 'Redis caching', 'Found caching approach', '["Fast cache"]', '["redis","caching"]', '2026-03-01T00:00:00Z', 'proj')
  db.prepare(`INSERT INTO observations (id, type, title, narrative, facts, concepts, created_at, project) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(2, 'pattern', 'TDD workflow', 'Red-green-refactor', '["Write test first"]', '["testing"]', '2026-03-02T00:00:00Z', 'proj')
  db.prepare(`INSERT INTO sdk_sessions (session_id, project, started_at, ended_at, model) VALUES (?, ?, ?, ?, ?)`)
    .run('s1', 'proj', '2026-03-01T09:00:00Z', '2026-03-01T10:00:00Z', 'claude-sonnet-4-5-20250514')
  db.prepare(`INSERT INTO session_summaries (session_id, summary, created_at) VALUES (?, ?, ?)`)
    .run('s1', 'Built auth flow', '2026-03-01T10:00:00Z')

  db.close()
  collector = new ClaudeMemCollector()
})

afterEach(() => {
  rmSync(homeDir, { recursive: true, force: true })
})

describe('ClaudeMemCollector', () => {
  it('has source "claude-mem"', () => {
    expect(collector.source).toBe('claude-mem')
  })

  it('detects when db exists', async () => {
    const result = await collector.detect(homeDir)
    expect(result.found).toBe(true)
  })

  it('extracts memory layer with episodic and procedural', async () => {
    const result = await collector.extract({ homeDir })
    expect(result.source).toBe('claude-mem')
    expect(result.layers.memory?.episodic?.events?.length).toBe(1) // discovery
    expect(result.layers.memory?.procedural?.workflows?.length).toBe(1) // pattern
  })

  it('extracts semantic memory from concepts', async () => {
    const result = await collector.extract({ homeDir })
    expect(result.layers.memory?.semantic?.knowledgeDomains).toContain('redis')
    expect(result.layers.memory?.semantic?.knowledgeDomains).toContain('testing')
  })

  it('extracts task history from sessions', async () => {
    const result = await collector.extract({ homeDir })
    expect(result.layers.taskHistory?.recentTasks?.length).toBe(1)
    expect(result.layers.taskHistory?.recentTasks?.[0].title).toBe('Built auth flow')
  })

  it('filters by requested layers', async () => {
    const result = await collector.extract({ homeDir, layers: ['memory'] })
    expect(result.layers.memory).toBeDefined()
    expect(result.layers.taskHistory).toBeUndefined()
  })

  it('returns empty layers when db missing', async () => {
    const emptyHome = join(tmpdir(), `saga-empty-cm-${Date.now()}`)
    mkdirSync(emptyHome, { recursive: true })
    try {
      const result = await collector.extract({ homeDir: emptyHome })
      expect(result.layers).toEqual({})
    } finally {
      rmSync(emptyHome, { recursive: true, force: true })
    }
  })
})
