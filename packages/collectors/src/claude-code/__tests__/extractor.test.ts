// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { ClaudeCodeCollector } from '../extractor'

let homeDir: string
let claudeDir: string
let collector: ClaudeCodeCollector

beforeEach(() => {
  homeDir = join(tmpdir(), `saga-test-home-${Date.now()}`)
  claudeDir = join(homeDir, '.claude')
  mkdirSync(claudeDir, { recursive: true })
  collector = new ClaudeCodeCollector()
})

afterEach(() => {
  rmSync(homeDir, { recursive: true, force: true })
})

describe('ClaudeCodeCollector', () => {
  it('has source "claude-code"', () => {
    expect(collector.source).toBe('claude-code')
  })

  describe('detect', () => {
    it('detects when .claude exists', async () => {
      const result = await collector.detect(homeDir)
      expect(result.found).toBe(true)
      expect(result.source).toBe('claude-code')
      expect(result.locations).toContain(claudeDir)
    })

    it('returns not found for empty home', async () => {
      const emptyHome = join(tmpdir(), `saga-empty-${Date.now()}`)
      mkdirSync(emptyHome, { recursive: true })
      try {
        const result = await collector.detect(emptyHome)
        expect(result.found).toBe(false)
      } finally {
        rmSync(emptyHome, { recursive: true, force: true })
      }
    })
  })

  describe('scan', () => {
    it('counts sessions and projects', async () => {
      writeFileSync(
        join(claudeDir, 'history.jsonl'),
        [
          JSON.stringify({ sessionId: 's1', timestamp: '2026-01-01T00:00:00Z', summary: 'Task 1' }),
          JSON.stringify({ sessionId: 's2', timestamp: '2026-01-02T00:00:00Z', summary: 'Task 2' }),
        ].join('\n')
      )

      const projectDir = join(claudeDir, 'projects', 'my-project')
      mkdirSync(projectDir, { recursive: true })

      const result = await collector.scan(homeDir)
      expect(result.sessionCount).toBeGreaterThanOrEqual(2)
      expect(result.projectCount).toBe(1)
    })
  })

  describe('extract', () => {
    it('extracts cognitive layer from CLAUDE.md + settings', async () => {
      writeFileSync(join(claudeDir, 'CLAUDE.md'), '# Rules\n\nUse TypeScript strict mode.')
      writeFileSync(
        join(claudeDir, 'settings.json'),
        JSON.stringify({ model: 'anthropic/claude-3-5-sonnet', temperature: 0.7 })
      )

      const result = await collector.extract({ homeDir })
      expect(result.source).toBe('claude-code')
      expect(result.layers.cognitive?.systemPrompt?.content).toContain('TypeScript strict mode')
      expect(result.layers.cognitive?.baseModel?.provider).toBe('anthropic')
      expect(result.layers.cognitive?.parameters?.temperature).toBe(0.7)
    })

    it('extracts task history from history.jsonl', async () => {
      writeFileSync(
        join(claudeDir, 'history.jsonl'),
        [
          JSON.stringify({
            sessionId: 's1',
            timestamp: '2026-01-01T00:00:00Z',
            summary: 'Auth fix',
          }),
          JSON.stringify({
            sessionId: 's2',
            timestamp: '2026-02-01T00:00:00Z',
            summary: 'Build API',
            result: 'error',
          }),
        ].join('\n')
      )

      const result = await collector.extract({ homeDir })
      expect(result.layers.taskHistory?.summary?.totalCompleted).toBe(1)
      expect(result.layers.taskHistory?.summary?.totalFailed).toBe(1)
      expect(result.layers.taskHistory?.recentTasks).toHaveLength(2)
    })

    it('extracts memory from project memory files', async () => {
      const memDir = join(claudeDir, 'projects', 'my-project', 'memory')
      mkdirSync(memDir, { recursive: true })
      writeFileSync(join(memDir, 'architecture.md'), '# Architecture\n\nCloudflare Workers stack.')

      const result = await collector.extract({ homeDir })
      expect(result.layers.memory?.semantic?.knowledgeDomains).toContain('architecture')
    })

    it('extracts procedural memory from plans', async () => {
      const plansDir = join(claudeDir, 'plans')
      mkdirSync(plansDir, { recursive: true })
      writeFileSync(
        join(plansDir, 'migration.json'),
        JSON.stringify({
          title: 'DB Migration',
          steps: ['Export schema', 'Generate types'],
        })
      )

      const result = await collector.extract({ homeDir })
      expect(result.layers.memory?.procedural?.workflows).toHaveLength(1)
      expect(result.layers.memory?.procedural?.workflows?.[0].name).toBe('DB Migration')
    })

    it('includes todos in task history', async () => {
      const todosDir = join(claudeDir, 'todos')
      mkdirSync(todosDir, { recursive: true })
      writeFileSync(
        join(todosDir, 'current.json'),
        JSON.stringify([
          { id: 't1', title: 'Add error handling', done: false },
          { id: 't2', title: 'Write tests', done: true },
        ])
      )

      const result = await collector.extract({ homeDir })
      expect(result.layers.taskHistory?.recentTasks?.length).toBeGreaterThanOrEqual(2)
      expect(result.layers.taskHistory?.summary?.totalInProgress).toBe(1)
    })

    it('returns empty layers when .claude does not exist', async () => {
      const emptyHome = join(tmpdir(), `saga-empty-${Date.now()}`)
      mkdirSync(emptyHome, { recursive: true })
      try {
        const result = await collector.extract({ homeDir: emptyHome })
        expect(result.layers).toEqual({})
      } finally {
        rmSync(emptyHome, { recursive: true, force: true })
      }
    })

    it('filters by requested layers', async () => {
      writeFileSync(join(claudeDir, 'CLAUDE.md'), '# Rules\n\nStrict.')
      writeFileSync(
        join(claudeDir, 'history.jsonl'),
        JSON.stringify({ sessionId: 's1', timestamp: '2026-01-01T00:00:00Z', summary: 'Task' })
      )

      const result = await collector.extract({
        homeDir,
        layers: ['cognitive'],
      })
      expect(result.layers.cognitive).toBeDefined()
      expect(result.layers.taskHistory).toBeUndefined()
    })

    it('filters history by since date', async () => {
      writeFileSync(
        join(claudeDir, 'history.jsonl'),
        [
          JSON.stringify({ sessionId: 's1', timestamp: '2025-01-01T00:00:00Z', summary: 'Old' }),
          JSON.stringify({ sessionId: 's2', timestamp: '2026-06-01T00:00:00Z', summary: 'New' }),
        ].join('\n')
      )

      const result = await collector.extract({
        homeDir,
        since: new Date('2026-01-01'),
      })
      expect(result.layers.taskHistory?.recentTasks).toHaveLength(1)
      expect(result.layers.taskHistory?.recentTasks?.[0].title).toBe('New')
    })

    it('merges per-project CLAUDE.md into cognitive prompt', async () => {
      writeFileSync(join(claudeDir, 'CLAUDE.md'), '# Root rules')
      const projectDir = join(claudeDir, 'projects', 'my-app')
      mkdirSync(projectDir, { recursive: true })
      writeFileSync(join(projectDir, 'CLAUDE.md'), '# App rules\n\nUse React.')

      const result = await collector.extract({ homeDir })
      expect(result.layers.cognitive?.systemPrompt?.content).toContain('Root rules')
      expect(result.layers.cognitive?.systemPrompt?.content).toContain('my-app')
      expect(result.layers.cognitive?.systemPrompt?.content).toContain('Use React')
    })
  })
})
