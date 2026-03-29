// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import Database from 'better-sqlite3'
import { FlowstateScopeMapper } from '../scope-mapper'

let tempDir: string

function makeClaudeMd(ids: number[]): string {
  const rows = ids.map(id => `| #${id} | 1:00 PM | 🔵 | Observation ${id} | ~100 |`).join('\n')

  return `<claude-mem-context>
# Recent Activity

| ID | Time | T | Title | Read |
|----|------|---|-------|------|
${rows}
</claude-mem-context>`
}

function makeFlowstateConfig(overrides: Record<string, string> = {}): string {
  return JSON.stringify({
    orgId: 'org_test',
    workspaceId: 'work_test',
    ...overrides,
  })
}

function createDb(dbPath: string, projects: string[]): void {
  const db = new Database(dbPath)
  db.exec(`
    CREATE TABLE observations (
      id INTEGER PRIMARY KEY,
      project TEXT,
      type TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `)
  for (let i = 0; i < projects.length; i++) {
    db.prepare('INSERT INTO observations (id, type, project, created_at) VALUES (?, ?, ?, ?)').run(
      i + 1,
      'discovery',
      projects[i],
      '2026-03-01T00:00:00Z'
    )
  }
  db.close()
}

beforeEach(() => {
  tempDir = join(tmpdir(), `saga-test-scope-mapper-${Date.now()}`)
  mkdirSync(tempDir, { recursive: true })
})

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true })
})

describe('FlowstateScopeMapper', () => {
  it('maps observation IDs from CLAUDE.md to nearest flowstate config', () => {
    // Create a mini monorepo structure
    const pkgDir = join(tempDir, 'packages', 'my-pkg')
    mkdirSync(join(pkgDir, '.flowstate'), { recursive: true })
    writeFileSync(join(pkgDir, 'CLAUDE.md'), makeClaudeMd([100, 101]))
    writeFileSync(
      join(pkgDir, '.flowstate', 'config.json'),
      makeFlowstateConfig({ projectId: 'proj_mypkg' })
    )

    const mapper = new FlowstateScopeMapper({ scanRoots: [tempDir] })
    const result = mapper.buildMapping()

    expect(result.observationScopes.get(100)?.projectId).toBe('proj_mypkg')
    expect(result.observationScopes.get(101)?.projectId).toBe('proj_mypkg')
  })

  it('falls back to parent config when package has none', () => {
    // Root config only
    mkdirSync(join(tempDir, '.flowstate'), { recursive: true })
    writeFileSync(
      join(tempDir, '.flowstate', 'config.json'),
      makeFlowstateConfig({ codebaseId: 'code_root' })
    )

    const srcDir = join(tempDir, 'src')
    mkdirSync(srcDir, { recursive: true })
    writeFileSync(join(srcDir, 'CLAUDE.md'), makeClaudeMd([200]))

    const mapper = new FlowstateScopeMapper({ scanRoots: [tempDir] })
    const result = mapper.buildMapping()

    expect(result.observationScopes.get(200)?.codebaseId).toBe('code_root')
  })

  it('tracks unmapped observation IDs when no config found', () => {
    // CLAUDE.md with references but no flowstate config anywhere
    writeFileSync(join(tempDir, 'CLAUDE.md'), makeClaudeMd([300, 301]))

    const mapper = new FlowstateScopeMapper({ scanRoots: [tempDir] })
    const result = mapper.buildMapping()

    expect(result.observationScopes.size).toBe(0)
    expect(result.unmappedObservationIds).toContain(300)
    expect(result.unmappedObservationIds).toContain(301)
  })

  it('resolves project names from DB to filesystem scopes', () => {
    // Create a project directory with flowstate config
    const projectDir = join(tempDir, 'saga-standard')
    mkdirSync(join(projectDir, '.flowstate'), { recursive: true })
    writeFileSync(
      join(projectDir, '.flowstate', 'config.json'),
      makeFlowstateConfig({
        orgId: 'org_epic',
        workspaceId: 'work_saga',
        projectName: '@epicdm/saga-standard',
      })
    )

    // Create DB with project references
    const dbPath = join(tempDir, 'claude-mem.db')
    createDb(dbPath, ['saga-standard'])

    const mapper = new FlowstateScopeMapper({
      scanRoots: [tempDir],
      dbPath,
    })
    const result = mapper.buildMapping()

    expect(result.projectScopes.get('saga-standard')).toBeDefined()
    expect(result.projectScopes.get('saga-standard')!.orgId).toBe('org_epic')
    expect(result.projectScopes.get('saga-standard')!.projectName).toBe('@epicdm/saga-standard')
  })

  it('tracks unmapped projects', () => {
    const dbPath = join(tempDir, 'claude-mem.db')
    createDb(dbPath, ['unknown-project'])

    const mapper = new FlowstateScopeMapper({
      scanRoots: [tempDir],
      dbPath,
    })
    const result = mapper.buildMapping()

    expect(result.unmappedProjects).toContain('unknown-project')
  })

  it('combines both strategies in a single mapping', () => {
    // Root config
    mkdirSync(join(tempDir, '.flowstate'), { recursive: true })
    writeFileSync(
      join(tempDir, '.flowstate', 'config.json'),
      makeFlowstateConfig({ orgId: 'org_root', workspaceId: 'work_root' })
    )

    // Package with CLAUDE.md referencing observations
    const pkgDir = join(tempDir, 'packages', 'cli')
    mkdirSync(join(pkgDir, '.flowstate'), { recursive: true })
    writeFileSync(
      join(pkgDir, '.flowstate', 'config.json'),
      makeFlowstateConfig({ orgId: 'org_root', workspaceId: 'work_root', projectId: 'proj_cli' })
    )
    writeFileSync(join(pkgDir, 'CLAUDE.md'), makeClaudeMd([500]))

    // Project directory for bulk resolution
    const projDir = join(tempDir, 'my-project')
    mkdirSync(join(projDir, '.flowstate'), { recursive: true })
    writeFileSync(
      join(projDir, '.flowstate', 'config.json'),
      makeFlowstateConfig({ orgId: 'org_other', workspaceId: 'work_other' })
    )

    const dbPath = join(tempDir, 'claude-mem.db')
    createDb(dbPath, ['my-project', 'missing-project'])

    const mapper = new FlowstateScopeMapper({
      scanRoots: [tempDir],
      dbPath,
    })
    const result = mapper.buildMapping()

    // Strategy 1: observation from CLAUDE.md
    expect(result.observationScopes.get(500)?.projectId).toBe('proj_cli')

    // Strategy 2: project from DB
    expect(result.projectScopes.get('my-project')?.orgId).toBe('org_other')
    expect(result.unmappedProjects).toContain('missing-project')
  })

  it('handles empty scan roots', () => {
    const mapper = new FlowstateScopeMapper({ scanRoots: [] })
    const result = mapper.buildMapping()

    expect(result.observationScopes.size).toBe(0)
    expect(result.projectScopes.size).toBe(0)
    expect(result.unmappedObservationIds).toHaveLength(0)
    expect(result.unmappedProjects).toHaveLength(0)
  })

  it('keeps first mapping when observation ID appears in multiple CLAUDE.md files', () => {
    // Two packages reference the same observation ID
    const pkg1 = join(tempDir, 'pkg1')
    mkdirSync(join(pkg1, '.flowstate'), { recursive: true })
    writeFileSync(join(pkg1, 'CLAUDE.md'), makeClaudeMd([999]))
    writeFileSync(
      join(pkg1, '.flowstate', 'config.json'),
      makeFlowstateConfig({ projectId: 'proj_first' })
    )

    const pkg2 = join(tempDir, 'pkg2')
    mkdirSync(join(pkg2, '.flowstate'), { recursive: true })
    writeFileSync(join(pkg2, 'CLAUDE.md'), makeClaudeMd([999]))
    writeFileSync(
      join(pkg2, '.flowstate', 'config.json'),
      makeFlowstateConfig({ projectId: 'proj_second' })
    )

    const mapper = new FlowstateScopeMapper({ scanRoots: [tempDir] })
    const result = mapper.buildMapping()

    // Should have one mapping for ID 999 (first one found wins)
    expect(result.observationScopes.has(999)).toBe(true)
  })
})
