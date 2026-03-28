// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { parseRules } from '../../parsers/rules'

let tempDir: string

beforeEach(() => {
  tempDir = join(tmpdir(), `saga-test-rules-${Date.now()}`)
  mkdirSync(tempDir, { recursive: true })
})

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true })
})

describe('parseRules', () => {
  it('combines rules files into cognitive system prompt', () => {
    const rulesDir = join(tempDir, '.claude', 'rules')
    mkdirSync(rulesDir, { recursive: true })
    writeFileSync(join(rulesDir, 'git-workflow.md'), '# Git Workflow\n\nUse conventional commits.')
    writeFileSync(join(rulesDir, 'writing-voice.md'), '# Writing Voice\n\nBe concise.')

    const result = parseRules(join(tempDir, '.claude'))
    expect(result).toContain('conventional commits')
    expect(result).toContain('Be concise')
  })

  it('includes CLAUDE.md from project root', () => {
    const claudeDir = join(tempDir, '.claude')
    mkdirSync(claudeDir, { recursive: true })
    writeFileSync(join(tempDir, 'CLAUDE.md'), '# Project Instructions\n\nUse TypeScript strict mode.')

    const result = parseRules(claudeDir, tempDir)
    expect(result).toContain('TypeScript strict mode')
  })

  it('returns null when no rules exist', () => {
    const claudeDir = join(tempDir, '.claude')
    mkdirSync(claudeDir, { recursive: true })

    const result = parseRules(claudeDir)
    expect(result).toBeNull()
  })
})
