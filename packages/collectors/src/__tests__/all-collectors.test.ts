// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Database from 'better-sqlite3'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createCollector, listCollectorSources } from '../registry'

// Force imports to trigger auto-registration
import '../index'

let homeDir: string

beforeEach(() => {
  homeDir = join(tmpdir(), `saga-integration-${Date.now()}`)
  mkdirSync(homeDir, { recursive: true })
})

afterEach(() => {
  rmSync(homeDir, { recursive: true, force: true })
  vi.restoreAllMocks()
})

describe('Collector Registry Integration', () => {
  it('registers all 5 collector sources', () => {
    const sources = listCollectorSources()
    expect(sources).toContain('claude-code')
    expect(sources).toContain('openclaw')
    expect(sources).toContain('claude-mem')
    expect(sources).toContain('flowstate-memory')
    expect(sources).toContain('project-claude')
  })

  it('creates each collector by name', () => {
    expect(createCollector('claude-mem').source).toBe('claude-mem')
    expect(createCollector('flowstate-memory').source).toBe('flowstate-memory')
    expect(createCollector('project-claude').source).toBe('project-claude')
  })
})

describe('claude-mem full pipeline', () => {
  it('detects, scans, and extracts from test database', async () => {
    // Set up test database
    const dbDir = join(homeDir, '.claude-mem')
    mkdirSync(dbDir, { recursive: true })
    const dbPath = join(dbDir, 'claude-mem.db')

    const db = new Database(dbPath)
    db.exec(`
      CREATE TABLE observations (
        id INTEGER PRIMARY KEY, memory_session_id TEXT, project TEXT,
        text TEXT, type TEXT NOT NULL, title TEXT, subtitle TEXT,
        facts TEXT, narrative TEXT, concepts TEXT,
        files_read TEXT, files_modified TEXT, prompt_number INTEGER,
        created_at TEXT NOT NULL, created_at_epoch INTEGER, discovery_tokens INTEGER
      );
      CREATE TABLE sdk_sessions (
        id INTEGER PRIMARY KEY, content_session_id TEXT, memory_session_id TEXT NOT NULL,
        project TEXT, user_prompt TEXT, started_at TEXT NOT NULL,
        started_at_epoch INTEGER, completed_at TEXT, completed_at_epoch INTEGER,
        status TEXT, worker_port INTEGER, prompt_counter INTEGER
      );
      CREATE TABLE session_summaries (
        id INTEGER PRIMARY KEY, memory_session_id TEXT NOT NULL, project TEXT,
        request TEXT, investigated TEXT, learned TEXT, completed TEXT,
        next_steps TEXT, files_read TEXT, files_edited TEXT, notes TEXT,
        prompt_number INTEGER, created_at TEXT NOT NULL,
        created_at_epoch INTEGER, discovery_tokens INTEGER
      )
    `)
    db.prepare(
      `INSERT INTO observations (id, type, title, narrative, facts, concepts, created_at, project) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      1,
      'discovery',
      'Test discovery',
      'Found something',
      '["fact1"]',
      '["typescript"]',
      '2026-03-01T00:00:00Z',
      'proj'
    )
    db.close()

    const collector = createCollector('claude-mem')

    const detection = await collector.detect(homeDir)
    expect(detection.found).toBe(true)

    const scan = await collector.scan(homeDir)
    expect(scan.memoryEntries).toBe(1)

    const result = await collector.extract({ homeDir })
    expect(result.layers.memory?.episodic?.events?.length).toBe(1)
    expect(result.layers.memory?.semantic?.knowledgeDomains).toContain('typescript')
  })
})

describe('project-claude full pipeline', () => {
  it('detects, scans, and extracts from test .claude directory', async () => {
    const claudeDir = join(homeDir, '.claude')
    const agentsDir = join(claudeDir, 'agents')
    const rulesDir = join(claudeDir, 'rules')
    const commandsDir = join(claudeDir, 'commands')
    mkdirSync(agentsDir, { recursive: true })
    mkdirSync(rulesDir, { recursive: true })
    mkdirSync(commandsDir, { recursive: true })

    writeFileSync(join(agentsDir, 'bot.md'), '# TestBot\n\nRole: Assistant')
    writeFileSync(join(rulesDir, 'style.md'), '# Style\n\nBe helpful.')
    writeFileSync(join(commandsDir, 'deploy.md'), 'Deploy command')

    // project-claude uses paths, not homeDir, so we need to create with paths
    const { ProjectClaudeCollector } = await import('../project-claude')
    const collector = new ProjectClaudeCollector([homeDir])

    const detection = await collector.detect()
    expect(detection.found).toBe(true)

    const result = await collector.extract({})
    expect(result.layers.persona?.name).toBe('TestBot')
    expect(result.layers.cognitive?.systemPrompt?.content).toContain('Be helpful')
    expect(result.layers.skills?.selfReported?.length).toBe(1)
    expect(result.layers.relationships?.organization?.role).toBe('Assistant')
  })
})
