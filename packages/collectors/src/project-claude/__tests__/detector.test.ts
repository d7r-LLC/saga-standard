// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { detectProjectClaude } from '../detector'

let tempDir: string

beforeEach(() => {
  tempDir = join(tmpdir(), `saga-test-projclaude-${Date.now()}`)
  mkdirSync(tempDir, { recursive: true })
})

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true })
})

describe('detectProjectClaude', () => {
  it('detects .claude directory with agents or rules', () => {
    const claudeDir = join(tempDir, '.claude', 'agents')
    mkdirSync(claudeDir, { recursive: true })

    const result = detectProjectClaude([tempDir])
    expect(result.source).toBe('project-claude')
    expect(result.found).toBe(true)
    expect(result.locations).toContain(join(tempDir, '.claude'))
  })

  it('detects across multiple paths', () => {
    const path1 = join(tempDir, 'project1')
    const path2 = join(tempDir, 'project2')
    mkdirSync(join(path1, '.claude', 'rules'), { recursive: true })
    mkdirSync(join(path2, '.claude', 'agents'), { recursive: true })

    const result = detectProjectClaude([path1, path2])
    expect(result.found).toBe(true)
    expect(result.locations).toHaveLength(2)
  })

  it('returns not found when no .claude dirs exist', () => {
    const result = detectProjectClaude([tempDir])
    expect(result.found).toBe(false)
  })
})
