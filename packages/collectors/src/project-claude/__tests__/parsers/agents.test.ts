// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { parseAgentProfiles } from '../../parsers/agents'

let tempDir: string

beforeEach(() => {
  tempDir = join(tmpdir(), `saga-test-agents-${Date.now()}`)
  mkdirSync(tempDir, { recursive: true })
})

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true })
})

describe('parseAgentProfiles', () => {
  it('parses agent markdown files into persona data', () => {
    const agentsDir = join(tempDir, '.claude', 'agents')
    mkdirSync(agentsDir, { recursive: true })
    writeFileSync(join(agentsDir, 'ceo.md'), [
      '# Marcus Chen',
      '',
      'Role: CEO',
      '',
      'Marcus is the CEO of d7r LLC. He provides strategic direction.',
      '',
      'Team Member ID: team_UfL4H7z2R6',
    ].join('\n'))

    const result = parseAgentProfiles(join(tempDir, '.claude'))
    expect(result.persona?.name).toBe('Marcus Chen')
    expect(result.persona?.bio).toContain('CEO of d7r LLC')
  })

  it('extracts team member relationships', () => {
    const agentsDir = join(tempDir, '.claude', 'agents')
    mkdirSync(agentsDir, { recursive: true })
    writeFileSync(join(agentsDir, 'ceo.md'), [
      '# Marcus Chen',
      '',
      'Role: CEO',
      'Team Member ID: team_UfL4H7z2R6',
    ].join('\n'))

    const result = parseAgentProfiles(join(tempDir, '.claude'))
    expect(result.relationships?.organization?.role).toBe('CEO')
  })

  it('returns null for missing agents directory', () => {
    const result = parseAgentProfiles(join(tempDir, '.claude'))
    expect(result.persona).toBeUndefined()
  })

  it('handles multiple agent files', () => {
    const agentsDir = join(tempDir, '.claude', 'agents')
    mkdirSync(agentsDir, { recursive: true })
    writeFileSync(join(agentsDir, 'ceo.md'), '# Marcus Chen\n\nRole: CEO')
    writeFileSync(join(agentsDir, 'cto.md'), '# Sarah Dev\n\nRole: CTO')

    const result = parseAgentProfiles(join(tempDir, '.claude'))
    // Should parse the first profile found (alphabetically)
    expect(result.persona?.name).toBeDefined()
  })
})
