// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { OpenClawCollector } from '../extractor'

let homeDir: string
let stateDir: string
let wsDir: string
let collector: OpenClawCollector

beforeEach(() => {
  homeDir = join(tmpdir(), `saga-oc-home-${Date.now()}`)
  stateDir = join(homeDir, '.openclaw')
  wsDir = join(stateDir, 'workspace')
  mkdirSync(wsDir, { recursive: true })
  collector = new OpenClawCollector()
})

afterEach(() => {
  rmSync(homeDir, { recursive: true, force: true })
})

describe('OpenClawCollector', () => {
  it('has source "openclaw"', () => {
    expect(collector.source).toBe('openclaw')
  })

  describe('detect', () => {
    it('detects when .openclaw exists', async () => {
      const result = await collector.detect(homeDir)
      expect(result.found).toBe(true)
      expect(result.source).toBe('openclaw')
      expect(result.locations).toContain(stateDir)
    })

    it('returns not found for empty home', async () => {
      const emptyHome = join(tmpdir(), `saga-empty-oc-${Date.now()}`)
      mkdirSync(emptyHome, { recursive: true })
      try {
        const result = await collector.detect(emptyHome)
        expect(result.found).toBe(false)
      } finally {
        rmSync(emptyHome, { recursive: true, force: true })
      }
    })
  })

  describe('extract', () => {
    it('extracts persona from IDENTITY.md', async () => {
      writeFileSync(
        join(wsDir, 'IDENTITY.md'),
        ['- Name: Koda', '- Creature: AI familiar', '- Vibe: Warm'].join('\n')
      )

      const result = await collector.extract({ homeDir })
      expect(result.layers.persona?.name).toBe('Koda')
    })

    it('extracts cognitive from SOUL.md + AGENTS.md', async () => {
      writeFileSync(join(wsDir, 'SOUL.md'), '# Soul\n\nYou are a creative coding assistant.')
      writeFileSync(join(wsDir, 'AGENTS.md'), '# Rules\n\n- Always test first')

      const result = await collector.extract({ homeDir })
      expect(result.layers.cognitive?.systemPrompt?.content).toContain('creative coding')
      expect(result.layers.cognitive?.systemPrompt?.content).toContain('Agent Rules')
    })

    it('extracts memory from workspace memory files', async () => {
      const memDir = join(wsDir, 'memory')
      mkdirSync(memDir, { recursive: true })
      writeFileSync(join(wsDir, 'MEMORY.md'), '# Memory\n\nProject context.')
      writeFileSync(join(memDir, 'architecture.md'), '# Arch\n\nMicroservices.')

      const result = await collector.extract({ homeDir })
      expect(result.layers.memory?.semantic?.knowledgeDomains).toContain('workspace-memory')
      expect(result.layers.memory?.semantic?.knowledgeDomains).toContain('architecture')
    })

    it('extracts skills from skills directory', async () => {
      const skillDir = join(stateDir, 'skills', 'git-ops')
      mkdirSync(skillDir, { recursive: true })
      writeFileSync(
        join(skillDir, 'SKILL.md'),
        '---\nname: Git Operations\ncategory: dev\n---\n\n# Git skill'
      )

      const result = await collector.extract({ homeDir })
      expect(result.layers.skills?.selfReported).toHaveLength(1)
      expect(result.layers.skills?.selfReported?.[0].name).toBe('Git Operations')
    })

    it('extracts task history from sessions', async () => {
      const sessionsDir = join(stateDir, 'sessions')
      mkdirSync(sessionsDir, { recursive: true })
      writeFileSync(
        join(sessionsDir, 'abc.jsonl'),
        JSON.stringify({
          role: 'assistant',
          timestamp: '2026-01-15T10:00:00Z',
          content: 'Done.',
        })
      )

      const result = await collector.extract({ homeDir })
      expect(result.layers.taskHistory?.recentTasks).toHaveLength(1)
    })

    it('extracts environment from TOOLS.md', async () => {
      writeFileSync(
        join(wsDir, 'TOOLS.md'),
        ['# Tools', '', '- bash: Shell commands', '- memory_search: Search memory'].join('\n')
      )

      const result = await collector.extract({ homeDir })
      expect(result.layers.environment?.tools?.nativeTools).toContain('bash')
      expect(result.layers.environment?.tools?.nativeTools).toContain('memory_search')
    })

    it('returns empty layers when .openclaw does not exist', async () => {
      const emptyHome = join(tmpdir(), `saga-empty-oc-${Date.now()}`)
      mkdirSync(emptyHome, { recursive: true })
      try {
        const result = await collector.extract({ homeDir: emptyHome })
        expect(result.layers).toEqual({})
      } finally {
        rmSync(emptyHome, { recursive: true, force: true })
      }
    })

    it('filters by requested layers', async () => {
      writeFileSync(join(wsDir, 'SOUL.md'), '# Soul\n\nTest.')
      writeFileSync(join(wsDir, 'IDENTITY.md'), '- Name: Test\n- Creature: Bot')

      const result = await collector.extract({ homeDir, layers: ['persona'] })
      expect(result.layers.persona).toBeDefined()
      expect(result.layers.cognitive).toBeUndefined()
    })
  })
})
