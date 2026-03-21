// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { parseHistory } from '../history'
import { parseClaudeMd } from '../claude-md'
import { parseSettings } from '../settings'
import { parseProjectMemory } from '../memory'
import { parsePlans } from '../plans'
import { parseTodos } from '../todos'

let fixtureDir: string

beforeEach(() => {
  fixtureDir = join(tmpdir(), `saga-test-cc-${Date.now()}`)
  mkdirSync(fixtureDir, { recursive: true })
})

afterEach(() => {
  rmSync(fixtureDir, { recursive: true, force: true })
})

describe('parseHistory', () => {
  it('parses valid history.jsonl with multiple entries', () => {
    const historyPath = join(fixtureDir, 'history.jsonl')
    writeFileSync(
      historyPath,
      [
        JSON.stringify({
          sessionId: 's1',
          timestamp: '2026-02-01T10:00:00Z',
          summary: 'Refactored auth',
          duration: 300,
        }),
        JSON.stringify({
          sessionId: 's2',
          timestamp: '2026-02-15T14:00:00Z',
          summary: 'Built API',
          result: 'error',
          duration: 600,
        }),
        JSON.stringify({
          sessionId: 's3',
          timestamp: '2026-03-01T09:00:00Z',
          summary: 'Code review',
        }),
      ].join('\n')
    )

    const result = parseHistory(historyPath)
    expect(result.summary.totalCompleted).toBe(2)
    expect(result.summary.totalFailed).toBe(1)
    expect(result.recentTasks).toHaveLength(3)
    expect(result.recentTasks[0].completedAt).toBe('2026-03-01T09:00:00Z') // most recent first
    expect(result.summary.firstTaskAt).toBe('2026-02-01T10:00:00Z')
    expect(result.summary.lastTaskAt).toBe('2026-03-01T09:00:00Z')
  })

  it('returns empty result for missing file', () => {
    const result = parseHistory(join(fixtureDir, 'nonexistent.jsonl'))
    expect(result.summary.totalCompleted).toBe(0)
    expect(result.recentTasks).toHaveLength(0)
  })

  it('filters by since date', () => {
    const historyPath = join(fixtureDir, 'history.jsonl')
    writeFileSync(
      historyPath,
      [
        JSON.stringify({ sessionId: 's1', timestamp: '2025-01-01T00:00:00Z', summary: 'Old' }),
        JSON.stringify({ sessionId: 's2', timestamp: '2026-06-01T00:00:00Z', summary: 'New' }),
      ].join('\n')
    )

    const result = parseHistory(historyPath, new Date('2026-01-01'))
    expect(result.recentTasks).toHaveLength(1)
    expect(result.recentTasks[0].title).toBe('New')
  })

  it('handles malformed lines gracefully', () => {
    const historyPath = join(fixtureDir, 'history.jsonl')
    writeFileSync(
      historyPath,
      'not json\n{"sessionId":"s1","timestamp":"2026-01-01T00:00:00Z"}\n{broken'
    )

    const result = parseHistory(historyPath)
    expect(result.recentTasks).toHaveLength(1)
  })
})

describe('parseClaudeMd', () => {
  it('parses CLAUDE.md into cognitive fragment', () => {
    const claudeMdPath = join(fixtureDir, 'CLAUDE.md')
    writeFileSync(claudeMdPath, '# Project\n\nUse TypeScript strict mode.\n\nFollow TDD.')

    const result = parseClaudeMd(claudeMdPath)
    expect(result).not.toBeNull()
    expect(result?.systemPrompt?.format).toBe('markdown')
    expect(result?.systemPrompt?.content).toContain('TypeScript strict mode')
  })

  it('returns null for missing file', () => {
    expect(parseClaudeMd(join(fixtureDir, 'missing.md'))).toBeNull()
  })

  it('returns null for empty file', () => {
    const path = join(fixtureDir, 'empty.md')
    writeFileSync(path, '   ')
    expect(parseClaudeMd(path)).toBeNull()
  })
})

describe('parseSettings', () => {
  it('parses model and temperature from settings.json', () => {
    const path = join(fixtureDir, 'settings.json')
    writeFileSync(
      path,
      JSON.stringify({ model: 'anthropic/claude-3-5-sonnet', temperature: 0.8, maxTokens: 4096 })
    )

    const result = parseSettings(path)
    expect(result?.baseModel?.provider).toBe('anthropic')
    expect(result?.baseModel?.model).toBe('claude-3-5-sonnet')
    expect(result?.parameters?.temperature).toBe(0.8)
    expect(result?.parameters?.maxOutputTokens).toBe(4096)
  })

  it('returns null for missing file', () => {
    expect(parseSettings(join(fixtureDir, 'missing.json'))).toBeNull()
  })
})

describe('parseProjectMemory', () => {
  it('extracts knowledge domains from memory files', () => {
    const projectsDir = join(fixtureDir, 'projects')
    const memDir = join(projectsDir, 'my-project', 'memory')
    mkdirSync(memDir, { recursive: true })
    writeFileSync(
      join(memDir, 'MEMORY.md'),
      '# Project memory\n\nOAuth 2.0 implementation details.'
    )
    writeFileSync(join(memDir, 'architecture.md'), '# Architecture\n\nUses Cloudflare Workers.')

    const result = parseProjectMemory(projectsDir)
    expect(result.semantic.knowledgeDomains).toContain('MEMORY')
    expect(result.semantic.knowledgeDomains).toContain('architecture')
  })

  it('returns empty for missing directory', () => {
    const result = parseProjectMemory(join(fixtureDir, 'nonexistent'))
    expect(result.semantic).toEqual({})
    expect(result.episodicEvents).toHaveLength(0)
  })
})

describe('parsePlans', () => {
  it('parses JSON plan files into workflows', () => {
    const plansDir = join(fixtureDir, 'plans')
    mkdirSync(plansDir, { recursive: true })
    writeFileSync(
      join(plansDir, 'migration.json'),
      JSON.stringify({
        title: 'Database migration',
        description: 'Migrate from Prisma to Drizzle',
        steps: ['Export schema', 'Generate Drizzle types', 'Update queries'],
      })
    )

    const result = parsePlans(plansDir)
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('Database migration')
    expect(result[0].steps).toHaveLength(3)
    expect(result[0].learnedFrom).toBe('claude-code/plans')
  })

  it('parses markdown plan files', () => {
    const plansDir = join(fixtureDir, 'plans')
    mkdirSync(plansDir, { recursive: true })
    writeFileSync(
      join(plansDir, 'auth-refactor.md'),
      '# Auth Refactor\n\n1. Extract interface\n2. Add tests\n3. Swap implementation'
    )

    const result = parsePlans(plansDir)
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('Auth Refactor')
    expect(result[0].steps).toHaveLength(3)
  })

  it('returns empty for missing directory', () => {
    expect(parsePlans(join(fixtureDir, 'nonexistent'))).toEqual([])
  })
})

describe('parseTodos', () => {
  it('parses JSON todos into tasks', () => {
    const todosDir = join(fixtureDir, 'todos')
    mkdirSync(todosDir, { recursive: true })
    writeFileSync(
      join(todosDir, 'current.json'),
      JSON.stringify([
        { id: 't1', title: 'Add error handling', done: false },
        { id: 't2', title: 'Write tests', done: true },
      ])
    )

    const result = parseTodos(todosDir)
    expect(result).toHaveLength(2)
    expect(result.find(t => t.title === 'Add error handling')?.status).toBe('in-progress')
    expect(result.find(t => t.title === 'Write tests')?.status).toBe('completed')
  })

  it('returns empty for missing directory', () => {
    expect(parseTodos(join(fixtureDir, 'nonexistent'))).toEqual([])
  })
})
