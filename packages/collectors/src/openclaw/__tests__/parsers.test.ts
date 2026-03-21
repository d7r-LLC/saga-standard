// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  parseAgentsMd,
  parseBootstrapMd,
  parseIdentityMd,
  parseSoulMd,
  parseToolsMd,
  parseWorkspaceMemory,
} from '../parsers/workspace-files'
import { parseOpenClawSkills } from '../parsers/skills'
import { parseOpenClawSessions } from '../parsers/sessions'

let fixtureDir: string

beforeEach(() => {
  fixtureDir = join(tmpdir(), `saga-oc-test-${Date.now()}`)
  mkdirSync(fixtureDir, { recursive: true })
})

afterEach(() => {
  rmSync(fixtureDir, { recursive: true, force: true })
})

describe('parseIdentityMd', () => {
  it('parses name, creature, vibe, and avatar', () => {
    const idPath = join(fixtureDir, 'IDENTITY.md')
    writeFileSync(
      idPath,
      [
        '# Identity',
        '',
        '- **Name**: Koda',
        '- **Emoji**: 🐾',
        '- **Creature**: AI familiar',
        '- **Vibe**: Warm and playful',
        '- **Avatar**: https://example.com/avatar.png',
      ].join('\n')
    )

    const result = parseIdentityMd(idPath)
    expect(result).not.toBeNull()
    expect(result?.name).toBe('Koda')
    expect(result?.avatar).toBe('https://example.com/avatar.png')
    expect(result?.personality?.communicationStyle).toBe('Warm and playful')
    expect(result?.personality?.customAttributes?.creature).toBe('AI familiar')
  })

  it('skips placeholder values', () => {
    const idPath = join(fixtureDir, 'IDENTITY.md')
    writeFileSync(
      idPath,
      [
        '- Name: pick something you like',
        '- Creature: AI? Robot? Familiar? Ghost in the machine? Something weirder?',
      ].join('\n')
    )

    const result = parseIdentityMd(idPath)
    expect(result).toBeNull()
  })

  it('returns null for missing file', () => {
    expect(parseIdentityMd(join(fixtureDir, 'missing.md'))).toBeNull()
  })
})

describe('parseSoulMd', () => {
  it('parses SOUL.md into system prompt', () => {
    const path = join(fixtureDir, 'SOUL.md')
    writeFileSync(path, '# Soul\n\nYou are a helpful coding assistant.')

    const result = parseSoulMd(path)
    expect(result?.systemPrompt?.format).toBe('markdown')
    expect(result?.systemPrompt?.content).toContain('helpful coding assistant')
  })

  it('returns null for empty file', () => {
    const path = join(fixtureDir, 'SOUL.md')
    writeFileSync(path, '   ')
    expect(parseSoulMd(path)).toBeNull()
  })
})

describe('parseAgentsMd', () => {
  it('parses AGENTS.md into cognitive layer', () => {
    const path = join(fixtureDir, 'AGENTS.md')
    writeFileSync(path, '# Rules\n\n- Always use TypeScript\n- Follow TDD')

    const result = parseAgentsMd(path)
    expect(result?.systemPrompt?.content).toContain('Agent Rules')
    expect(result?.systemPrompt?.content).toContain('TypeScript')
  })
})

describe('parseBootstrapMd', () => {
  it('returns content from BOOTSTRAP.md', () => {
    const path = join(fixtureDir, 'BOOTSTRAP.md')
    writeFileSync(path, '# Bootstrap\n\nLoad project context first.')

    const result = parseBootstrapMd(path)
    expect(result).toContain('Bootstrap')
  })

  it('returns null for missing file', () => {
    expect(parseBootstrapMd(join(fixtureDir, 'missing.md'))).toBeNull()
  })
})

describe('parseToolsMd', () => {
  it('extracts tool names from markdown lists', () => {
    const path = join(fixtureDir, 'TOOLS.md')
    writeFileSync(
      path,
      [
        '# Available Tools',
        '',
        '- memory_search: Search through memory files',
        '- memory_get: Read specific memory entries',
        '- bash: Execute shell commands',
      ].join('\n')
    )

    const result = parseToolsMd(path)
    expect(result?.tools?.nativeTools).toContain('memory_search')
    expect(result?.tools?.nativeTools).toContain('memory_get')
    expect(result?.tools?.nativeTools).toContain('bash')
  })

  it('returns null for missing file', () => {
    expect(parseToolsMd(join(fixtureDir, 'missing.md'))).toBeNull()
  })
})

describe('parseWorkspaceMemory', () => {
  it('extracts knowledge domains from MEMORY.md and memory/*.md', () => {
    mkdirSync(join(fixtureDir, 'memory'), { recursive: true })
    writeFileSync(join(fixtureDir, 'MEMORY.md'), '# Main Memory\n\nProject context here.')
    writeFileSync(join(fixtureDir, 'memory', 'architecture.md'), '# Architecture\n\nMicroservices.')
    writeFileSync(join(fixtureDir, 'memory', 'decisions.md'), '# Decisions\n\nUse Postgres.')

    const result = parseWorkspaceMemory(fixtureDir)
    expect(result?.semantic?.knowledgeDomains).toContain('workspace-memory')
    expect(result?.semantic?.knowledgeDomains).toContain('architecture')
    expect(result?.semantic?.knowledgeDomains).toContain('decisions')
  })

  it('returns null when no memory exists', () => {
    expect(parseWorkspaceMemory(join(fixtureDir, 'nonexistent'))).toBeNull()
  })
})

describe('parseOpenClawSkills', () => {
  it('parses skills from SKILL.md frontmatter', () => {
    const skillsDir = join(fixtureDir, 'skills')
    const skillDir = join(skillsDir, 'my-skill')
    mkdirSync(skillDir, { recursive: true })
    writeFileSync(
      join(skillDir, 'SKILL.md'),
      [
        '---',
        'name: Git Operations',
        'category: development',
        '---',
        '',
        '# Git Operations Skill',
        '',
        'Handles git workflows.',
      ].join('\n')
    )

    const result = parseOpenClawSkills(skillsDir)
    expect(result.selfReported).toHaveLength(1)
    expect(result.selfReported[0].name).toBe('Git Operations')
    expect(result.selfReported[0].category).toBe('development')
    expect(result.capabilities.specializations).toContain('Git Operations')
  })

  it('uses directory name as fallback', () => {
    const skillsDir = join(fixtureDir, 'skills')
    const skillDir = join(skillsDir, 'code-review')
    mkdirSync(skillDir, { recursive: true })
    writeFileSync(join(skillDir, 'SKILL.md'), '---\n---\n\n# Review skill')

    const result = parseOpenClawSkills(skillsDir)
    expect(result.selfReported).toHaveLength(1)
    expect(result.selfReported[0].name).toBe('code-review')
  })

  it('returns empty for missing directory', () => {
    const result = parseOpenClawSkills(join(fixtureDir, 'nonexistent'))
    expect(result.selfReported).toEqual([])
  })
})

describe('parseOpenClawSessions', () => {
  it('parses session JSONL files into task history', () => {
    const sessionsDir = join(fixtureDir, 'sessions')
    mkdirSync(sessionsDir, { recursive: true })

    writeFileSync(
      join(sessionsDir, 'session-001.jsonl'),
      [
        JSON.stringify({
          role: 'user',
          timestamp: '2026-01-15T10:00:00Z',
          content: 'Fix the bug',
        }),
        JSON.stringify({
          role: 'assistant',
          timestamp: '2026-01-15T10:01:00Z',
          content: 'Fixed the null pointer issue in auth module.',
        }),
      ].join('\n')
    )

    writeFileSync(
      join(sessionsDir, 'session-002.jsonl'),
      [
        JSON.stringify({
          role: 'user',
          timestamp: '2026-02-01T14:00:00Z',
          content: 'Deploy to staging',
        }),
        JSON.stringify({
          role: 'assistant',
          timestamp: '2026-02-01T14:05:00Z',
          content: 'Deployment failed.',
          error: true,
        }),
      ].join('\n')
    )

    const result = parseOpenClawSessions(fixtureDir)
    expect(result.summary.totalCompleted).toBe(1)
    expect(result.summary.totalFailed).toBe(1)
    expect(result.recentTasks).toHaveLength(2)
    expect(result.episodicEvents).toHaveLength(2)
  })

  it('filters by since date', () => {
    const sessionsDir = join(fixtureDir, 'sessions')
    mkdirSync(sessionsDir, { recursive: true })

    writeFileSync(
      join(sessionsDir, 'old.jsonl'),
      JSON.stringify({ role: 'user', timestamp: '2025-01-01T00:00:00Z', content: 'Old' })
    )
    writeFileSync(
      join(sessionsDir, 'new.jsonl'),
      JSON.stringify({ role: 'user', timestamp: '2026-06-01T00:00:00Z', content: 'New' })
    )

    const result = parseOpenClawSessions(fixtureDir, { since: new Date('2026-01-01') })
    expect(result.recentTasks).toHaveLength(1)
  })

  it('returns empty for missing directory', () => {
    const result = parseOpenClawSessions(join(fixtureDir, 'nonexistent'))
    expect(result.recentTasks).toEqual([])
    expect(result.summary.totalCompleted).toBe(0)
  })
})
