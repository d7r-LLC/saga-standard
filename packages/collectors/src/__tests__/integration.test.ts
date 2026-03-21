// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { assembleSagaDocument, generateDocumentId } from '@epicdm/saga-sdk'
import type { PartialSagaDocument } from '@epicdm/saga-sdk'
import { ClaudeCodeCollector } from '../claude-code'
import { OpenClawCollector } from '../openclaw'
import { createCollector, detectCollectors, listCollectorSources } from '../registry'

// Force registration of built-in collectors
import '../index'

let homeDir: string

beforeEach(() => {
  homeDir = join(tmpdir(), `saga-integration-${Date.now()}`)
  mkdirSync(homeDir, { recursive: true })
})

afterEach(() => {
  rmSync(homeDir, { recursive: true, force: true })
})

describe('Integration: Collector → Assembly pipeline', () => {
  it('registry contains both built-in collectors', () => {
    const sources = listCollectorSources()
    expect(sources).toContain('claude-code')
    expect(sources).toContain('openclaw')
  })

  it('creates collectors from registry', () => {
    const cc = createCollector('claude-code')
    expect(cc).toBeInstanceOf(ClaudeCodeCollector)

    const oc = createCollector('openclaw')
    expect(oc).toBeInstanceOf(OpenClawCollector)
  })

  it('detectCollectors finds installed sources', async () => {
    // Create both .claude and .openclaw dirs
    mkdirSync(join(homeDir, '.claude'), { recursive: true })
    mkdirSync(join(homeDir, '.openclaw', 'workspace'), { recursive: true })

    const detected = await detectCollectors(homeDir)
    expect(detected).toHaveLength(2)
    expect(detected.map(d => d.source).sort()).toEqual(['claude-code', 'openclaw'])
    expect(detected.every(d => d.found)).toBe(true)
  })

  it('assembles partials from Claude Code + OpenClaw into a SagaDocument', async () => {
    // Set up Claude Code fixtures
    const claudeDir = join(homeDir, '.claude')
    mkdirSync(claudeDir, { recursive: true })
    writeFileSync(join(claudeDir, 'CLAUDE.md'), '# Project\n\nUse TypeScript strict mode.')
    writeFileSync(
      join(claudeDir, 'settings.json'),
      JSON.stringify({ model: 'anthropic/claude-3-5-sonnet', temperature: 0.7 })
    )
    writeFileSync(
      join(claudeDir, 'history.jsonl'),
      [
        JSON.stringify({
          sessionId: 's1',
          timestamp: '2026-01-15T10:00:00Z',
          summary: 'Refactored auth',
          duration: 300,
        }),
        JSON.stringify({
          sessionId: 's2',
          timestamp: '2026-02-01T14:00:00Z',
          summary: 'Built API',
          duration: 600,
        }),
      ].join('\n')
    )

    // Set up OpenClaw fixtures
    const openclawDir = join(homeDir, '.openclaw')
    const wsDir = join(openclawDir, 'workspace')
    mkdirSync(wsDir, { recursive: true })
    writeFileSync(
      join(wsDir, 'IDENTITY.md'),
      ['- Name: Koda', '- Creature: AI familiar', '- Vibe: Warm and playful'].join('\n')
    )
    writeFileSync(join(wsDir, 'SOUL.md'), '# Soul\n\nYou are a helpful coding assistant.')
    writeFileSync(
      join(wsDir, 'TOOLS.md'),
      ['# Tools', '', '- bash: Shell commands', '- memory_search: Search memory'].join('\n')
    )

    // Skills
    const skillDir = join(openclawDir, 'skills', 'git-ops')
    mkdirSync(skillDir, { recursive: true })
    writeFileSync(
      join(skillDir, 'SKILL.md'),
      '---\nname: Git Operations\ncategory: dev\n---\n\n# Git'
    )

    // Extract from both collectors
    const ccCollector = new ClaudeCodeCollector()
    const ocCollector = new OpenClawCollector()

    const ccPartial = await ccCollector.extract({ homeDir })
    const ocPartial = await ocCollector.extract({ homeDir })

    expect(ccPartial.source).toBe('claude-code')
    expect(ocPartial.source).toBe('openclaw')

    // Both should have populated layers
    expect(ccPartial.layers.cognitive).toBeDefined()
    expect(ccPartial.layers.taskHistory).toBeDefined()
    expect(ocPartial.layers.persona).toBeDefined()
    expect(ocPartial.layers.cognitive).toBeDefined()
    expect(ocPartial.layers.skills).toBeDefined()
    expect(ocPartial.layers.environment).toBeDefined()

    // Create an identity partial (identity comes from the user/wallet, not from collectors)
    const identityPartial: PartialSagaDocument = {
      source: 'user',
      layers: {
        identity: {
          handle: 'koda.saga',
          walletAddress: '0x1234567890abcdef1234567890abcdef12345678',
          chain: 'eip155:1',
          createdAt: new Date().toISOString(),
        },
      },
    }

    // Assemble into a SAGA document
    const result = assembleSagaDocument({
      partials: [identityPartial, ccPartial, ocPartial],
      exportType: 'profile',
      documentId: generateDocumentId(),
    })

    expect(result.document).toBeDefined()
    const doc = result.document

    // Identity set from explicit partial
    expect(doc.layers.identity?.handle).toBe('koda.saga')

    // Persona from OpenClaw IDENTITY.md
    expect(doc.layers.persona?.name).toBe('Koda')

    // Cognitive merged from both sources
    expect(doc.layers.cognitive?.systemPrompt?.content).toBeDefined()
    const prompt = doc.layers.cognitive?.systemPrompt?.content ?? ''
    expect(prompt).toContain('TypeScript strict mode') // From Claude Code
    expect(prompt).toContain('helpful coding assistant') // From OpenClaw

    // Model from Claude Code settings
    expect(doc.layers.cognitive?.baseModel?.provider).toBe('anthropic')

    // Task history from Claude Code
    expect(doc.layers.taskHistory?.summary?.totalCompleted).toBe(2)
    expect(doc.layers.taskHistory?.recentTasks?.length).toBeGreaterThanOrEqual(2)

    // Skills from OpenClaw
    expect(doc.layers.skills?.selfReported?.length).toBeGreaterThanOrEqual(1)
    expect(doc.layers.skills?.selfReported?.find(s => s.name === 'Git Operations')).toBeDefined()

    // Environment from OpenClaw TOOLS.md
    expect(doc.layers.environment?.tools?.nativeTools).toContain('bash')

    // Sources tracked correctly
    expect(result.sources.cognitive).toContain('claude-code')
    expect(result.sources.cognitive).toContain('openclaw')
    expect(result.sources.persona).toContain('openclaw')
    expect(result.sources.taskHistory).toContain('claude-code')
  })
})
