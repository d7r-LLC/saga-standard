// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { parseSessions } from '../../parsers/sessions'

let dbPath: string
let tempDir: string

beforeEach(() => {
  tempDir = join(tmpdir(), `saga-test-sessions-${Date.now()}`)
  mkdirSync(tempDir, { recursive: true })
  dbPath = join(tempDir, 'claude-mem.db')

  const db = new Database(dbPath)
  db.exec(`
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

  db.prepare(
    `INSERT INTO sdk_sessions (session_id, project, started_at, ended_at, model) VALUES (?, ?, ?, ?, ?)`
  ).run(
    's1',
    'saga-standard',
    '2026-03-01T09:00:00Z',
    '2026-03-01T10:00:00Z',
    'claude-sonnet-4-5-20250514'
  )
  db.prepare(
    `INSERT INTO sdk_sessions (session_id, project, started_at, ended_at, model) VALUES (?, ?, ?, ?, ?)`
  ).run('s2', 'saga-standard', '2026-03-02T09:00:00Z', null, 'claude-sonnet-4-5-20250514')

  db.prepare(
    `INSERT INTO session_summaries (session_id, summary, created_at) VALUES (?, ?, ?)`
  ).run('s1', 'Implemented auth flow', '2026-03-01T10:00:00Z')

  db.close()
})

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true })
})

describe('parseSessions', () => {
  it('returns recent tasks from sessions', () => {
    const result = parseSessions(dbPath)
    expect(result.recentTasks.length).toBe(2)
  })

  it('maps completed sessions to completed tasks', () => {
    const result = parseSessions(dbPath)
    const s1 = result.recentTasks.find(t => t.taskId === 'claude-mem-s1')
    expect(s1).toBeDefined()
    expect(s1!.status).toBe('completed')
    expect(s1!.title).toBe('Implemented auth flow')
  })

  it('maps ongoing sessions to in-progress tasks', () => {
    const result = parseSessions(dbPath)
    const s2 = result.recentTasks.find(t => t.taskId === 'claude-mem-s2')
    expect(s2).toBeDefined()
    expect(s2!.status).toBe('in-progress')
  })

  it('computes summary counts', () => {
    const result = parseSessions(dbPath)
    expect(result.summary.totalCompleted).toBe(1)
    expect(result.summary.totalInProgress).toBe(1)
  })

  it('returns empty results for missing db', () => {
    const result = parseSessions('/nonexistent/path.db')
    expect(result.recentTasks).toEqual([])
    expect(result.summary.totalCompleted).toBe(0)
  })
})
