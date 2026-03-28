// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { ProjectClaudeCollector } from '../extractor'

let tempDir: string
let collector: ProjectClaudeCollector

beforeEach(() => {
  tempDir = join(tmpdir(), `saga-test-projclaude-ext-${Date.now()}`)
  mkdirSync(tempDir, { recursive: true })
  collector = new ProjectClaudeCollector([tempDir])
})

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true })
})

describe('ProjectClaudeCollector', () => {
  it('has source "project-claude"', () => {
    expect(collector.source).toBe('project-claude')
  })

  it('extracts persona from agent profiles', async () => {
    const agentsDir = join(tempDir, '.claude', 'agents')
    mkdirSync(agentsDir, { recursive: true })
    writeFileSync(join(agentsDir, 'ceo.md'), '# Marcus Chen\n\nRole: CEO\n\nStrategic leader.')

    const result = await collector.extract({})
    expect(result.layers.persona?.name).toBe('Marcus Chen')
  })

  it('extracts cognitive layer from rules', async () => {
    const rulesDir = join(tempDir, '.claude', 'rules')
    mkdirSync(rulesDir, { recursive: true })
    writeFileSync(join(rulesDir, 'voice.md'), '# Voice\n\nBe direct and concise.')

    const result = await collector.extract({})
    expect(result.layers.cognitive?.systemPrompt?.content).toContain('Be direct and concise')
  })

  it('extracts skills from commands', async () => {
    const commandsDir = join(tempDir, '.claude', 'commands')
    mkdirSync(commandsDir, { recursive: true })
    writeFileSync(join(commandsDir, 'review-pr.md'), 'Review a pull request')
    writeFileSync(join(commandsDir, 'deploy.md'), 'Deploy to production')

    const result = await collector.extract({})
    expect(result.layers.skills?.selfReported?.length).toBe(2)
    expect(result.layers.skills?.selfReported?.map(s => s.name)).toContain('review-pr')
  })

  it('extracts relationships from agent role', async () => {
    const agentsDir = join(tempDir, '.claude', 'agents')
    mkdirSync(agentsDir, { recursive: true })
    writeFileSync(join(agentsDir, 'ceo.md'), '# Marcus\n\nRole: CEO')

    const result = await collector.extract({})
    expect(result.layers.relationships?.organization?.role).toBe('CEO')
  })

  it('returns empty layers when .claude missing', async () => {
    const emptyDir = join(tmpdir(), `saga-empty-proj-${Date.now()}`)
    mkdirSync(emptyDir, { recursive: true })
    const emptyCollector = new ProjectClaudeCollector([emptyDir])
    try {
      const result = await emptyCollector.extract({})
      expect(result.layers).toEqual({})
    } finally {
      rmSync(emptyDir, { recursive: true, force: true })
    }
  })

  it('filters by requested layers', async () => {
    const agentsDir = join(tempDir, '.claude', 'agents')
    mkdirSync(agentsDir, { recursive: true })
    writeFileSync(join(agentsDir, 'ceo.md'), '# Marcus\n\nRole: CEO')
    const rulesDir = join(tempDir, '.claude', 'rules')
    mkdirSync(rulesDir, { recursive: true })
    writeFileSync(join(rulesDir, 'voice.md'), '# Voice\n\nBe concise.')

    const result = await collector.extract({ layers: ['persona'] })
    expect(result.layers.persona).toBeDefined()
    expect(result.layers.cognitive).toBeUndefined()
  })
})
