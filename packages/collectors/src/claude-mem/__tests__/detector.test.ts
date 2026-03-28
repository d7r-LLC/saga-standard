// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { detectClaudeMem } from '../detector'

let homeDir: string

beforeEach(() => {
  homeDir = join(tmpdir(), `saga-test-claudemem-${Date.now()}`)
  mkdirSync(homeDir, { recursive: true })
})

afterEach(() => {
  rmSync(homeDir, { recursive: true, force: true })
})

describe('detectClaudeMem', () => {
  it('returns found when claude-mem.db exists', () => {
    const dbDir = join(homeDir, '.claude-mem')
    mkdirSync(dbDir, { recursive: true })
    writeFileSync(join(dbDir, 'claude-mem.db'), '')

    const result = detectClaudeMem(homeDir)
    expect(result.source).toBe('claude-mem')
    expect(result.found).toBe(true)
    expect(result.locations).toContain(join(dbDir, 'claude-mem.db'))
  })

  it('returns not found when directory missing', () => {
    const result = detectClaudeMem(homeDir)
    expect(result.source).toBe('claude-mem')
    expect(result.found).toBe(false)
    expect(result.locations).toEqual([])
  })

  it('returns not found when directory exists but no db file', () => {
    mkdirSync(join(homeDir, '.claude-mem'), { recursive: true })
    const result = detectClaudeMem(homeDir)
    expect(result.found).toBe(false)
  })
})
