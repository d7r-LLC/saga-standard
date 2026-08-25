// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import Database from 'better-sqlite3'
import { buildProjectPathMap, getDistinctProjects, resolveProjectScope } from '../project-resolver'

let tempDir: string

beforeEach(() => {
  tempDir = join(tmpdir(), `saga-test-proj-resolver-${Date.now()}`)
  mkdirSync(tempDir, { recursive: true })
})

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true })
})

describe('buildProjectPathMap', () => {
  it('maps directory names to absolute paths', () => {
    mkdirSync(join(tempDir, 'saga-standard'), { recursive: true })
    mkdirSync(join(tempDir, 'epic-flowstate'), { recursive: true })

    const map = buildProjectPathMap([tempDir])
    expect(map.get('saga-standard')).toBe(join(tempDir, 'saga-standard'))
    expect(map.get('epic-flowstate')).toBe(join(tempDir, 'epic-flowstate'))
  })

  it('skips files (only includes directories)', () => {
    mkdirSync(join(tempDir, 'my-project'), { recursive: true })
    writeFileSync(join(tempDir, 'README.md'), 'hello')

    const map = buildProjectPathMap([tempDir])
    expect(map.has('my-project')).toBe(true)
    expect(map.has('README.md')).toBe(false)
  })

  it('handles multiple scan roots', () => {
    const root1 = join(tempDir, 'root1')
    const root2 = join(tempDir, 'root2')
    mkdirSync(join(root1, 'project-a'), { recursive: true })
    mkdirSync(join(root2, 'project-b'), { recursive: true })

    const map = buildProjectPathMap([root1, root2])
    expect(map.has('project-a')).toBe(true)
    expect(map.has('project-b')).toBe(true)
  })

  it('handles nonexistent scan roots', () => {
    const map = buildProjectPathMap(['/nonexistent/path'])
    expect(map.size).toBe(0)
  })
})

describe('getDistinctProjects', () => {
  it('returns distinct project names from database', () => {
    const dbPath = join(tempDir, 'claude-mem.db')
    const db = new Database(dbPath)
    db.exec(`
      CREATE TABLE observations (
        id INTEGER PRIMARY KEY,
        project TEXT,
        type TEXT NOT NULL,
        created_at TEXT NOT NULL
      )
    `)
    db.prepare('INSERT INTO observations (id, type, project, created_at) VALUES (?, ?, ?, ?)').run(
      1,
      'discovery',
      'saga-standard',
      '2026-03-01T00:00:00Z'
    )
    db.prepare('INSERT INTO observations (id, type, project, created_at) VALUES (?, ?, ?, ?)').run(
      2,
      'bugfix',
      'saga-standard',
      '2026-03-01T00:00:00Z'
    )
    db.prepare('INSERT INTO observations (id, type, project, created_at) VALUES (?, ?, ?, ?)').run(
      3,
      'feature',
      'epic-flowstate',
      '2026-03-01T00:00:00Z'
    )
    db.prepare('INSERT INTO observations (id, type, project, created_at) VALUES (?, ?, ?, ?)').run(
      4,
      'discovery',
      null,
      '2026-03-01T00:00:00Z'
    )
    db.close()

    const projects = getDistinctProjects(dbPath)
    expect(projects).toContain('saga-standard')
    expect(projects).toContain('epic-flowstate')
    expect(projects).toHaveLength(2)
  })

  it('returns empty array for nonexistent database', () => {
    const projects = getDistinctProjects('/nonexistent/path.db')
    expect(projects).toEqual([])
  })
})

describe('resolveProjectScope', () => {
  it('resolves scope from project directory with flowstate config', () => {
    const projectDir = join(tempDir, 'saga-standard')
    mkdirSync(join(projectDir, '.flowstate'), { recursive: true })
    writeFileSync(
      join(projectDir, '.flowstate', 'config.json'),
      JSON.stringify({
        orgId: 'org_9f3omFEY2H',
        workspaceId: 'work_RfO9myuOP8',
        codebaseId: 'code_abc123',
        projectName: '@d7r/saga-standard',
      })
    )

    const pathMap = new Map([['saga-standard', projectDir]])
    const result = resolveProjectScope('saga-standard', pathMap)

    expect(result).not.toBeNull()
    expect(result!.scope.orgId).toBe('org_9f3omFEY2H')
    expect(result!.scope.workspaceId).toBe('work_RfO9myuOP8')
    expect(result!.scope.codebaseId).toBe('code_abc123')
    expect(result!.scope.projectName).toBe('@d7r/saga-standard')
  })

  it('returns null when project not in path map', () => {
    const result = resolveProjectScope('unknown-project', new Map())
    expect(result).toBeNull()
  })

  it('returns null when no flowstate config exists', () => {
    const projectDir = join(tempDir, 'no-config')
    mkdirSync(projectDir, { recursive: true })

    const pathMap = new Map([['no-config', projectDir]])
    const result = resolveProjectScope('no-config', pathMap)
    expect(result).toBeNull()
  })

  it('returns null when config lacks required orgId/workspaceId', () => {
    const projectDir = join(tempDir, 'partial-config')
    mkdirSync(join(projectDir, '.flowstate'), { recursive: true })
    writeFileSync(
      join(projectDir, '.flowstate', 'config.json'),
      JSON.stringify({ projectName: 'partial' })
    )

    const pathMap = new Map([['partial-config', projectDir]])
    const result = resolveProjectScope('partial-config', pathMap)
    expect(result).toBeNull()
  })

  it('uses project name as fallback when config has no projectName', () => {
    const projectDir = join(tempDir, 'my-project')
    mkdirSync(join(projectDir, '.flowstate'), { recursive: true })
    writeFileSync(
      join(projectDir, '.flowstate', 'config.json'),
      JSON.stringify({ orgId: 'org_a', workspaceId: 'work_b' })
    )

    const pathMap = new Map([['my-project', projectDir]])
    const result = resolveProjectScope('my-project', pathMap)

    expect(result).not.toBeNull()
    expect(result!.scope.projectName).toBe('my-project')
  })
})
