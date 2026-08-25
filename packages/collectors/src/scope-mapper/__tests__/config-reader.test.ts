// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { readFlowstateConfig, resolveNearestFlowstateConfig } from '../config-reader'

let tempDir: string

beforeEach(() => {
  tempDir = join(tmpdir(), `saga-test-config-reader-${Date.now()}`)
  mkdirSync(tempDir, { recursive: true })
})

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true })
})

describe('readFlowstateConfig', () => {
  it('reads saga-standard style config with version and codebaseId', () => {
    const fsDir = join(tempDir, '.flowstate')
    mkdirSync(fsDir, { recursive: true })
    writeFileSync(
      join(fsDir, 'config.json'),
      JSON.stringify({
        version: '1.0.0',
        projectName: '@d7r/saga-directory',
        projectId: 'proj_4HUZfWRpHh',
        codebaseId: 'code_u2uLspkjqe',
        orgId: 'org_9f3omFEY2H',
        workspaceId: 'work_RfO9myuOP8',
      })
    )

    const config = readFlowstateConfig(tempDir)
    expect(config).not.toBeNull()
    expect(config!.version).toBe('1.0.0')
    expect(config!.projectName).toBe('@d7r/saga-directory')
    expect(config!.orgId).toBe('org_9f3omFEY2H')
    expect(config!.workspaceId).toBe('work_RfO9myuOP8')
    expect(config!.codebaseId).toBe('code_u2uLspkjqe')
    expect(config!.projectId).toBe('proj_4HUZfWRpHh')
  })

  it('reads epic-flowstate per-package style config with packageName', () => {
    const fsDir = join(tempDir, '.flowstate')
    mkdirSync(fsDir, { recursive: true })
    writeFileSync(
      join(fsDir, 'config.json'),
      JSON.stringify({
        packageName: '@d7r/saga-cli',
        orgId: 'org_9f3omFEY2H',
        workspaceId: 'work_ojk4TWK5D2',
        projectId: 'proj_abc123',
      })
    )

    const config = readFlowstateConfig(tempDir)
    expect(config).not.toBeNull()
    expect(config!.packageName).toBe('@d7r/saga-cli')
    expect(config!.orgId).toBe('org_9f3omFEY2H')
    expect(config!.workspaceId).toBe('work_ojk4TWK5D2')
    expect(config!.version).toBeUndefined()
  })

  it('returns null when .flowstate dir does not exist', () => {
    const config = readFlowstateConfig(tempDir)
    expect(config).toBeNull()
  })

  it('returns null when config.json is invalid JSON', () => {
    const fsDir = join(tempDir, '.flowstate')
    mkdirSync(fsDir, { recursive: true })
    writeFileSync(join(fsDir, 'config.json'), 'not valid json')

    const config = readFlowstateConfig(tempDir)
    expect(config).toBeNull()
  })

  it('returns empty config object when fields are missing', () => {
    const fsDir = join(tempDir, '.flowstate')
    mkdirSync(fsDir, { recursive: true })
    writeFileSync(join(fsDir, 'config.json'), JSON.stringify({}))

    const config = readFlowstateConfig(tempDir)
    expect(config).not.toBeNull()
    expect(config!.orgId).toBeUndefined()
  })
})

describe('resolveNearestFlowstateConfig', () => {
  it('finds config in the same directory', () => {
    const fsDir = join(tempDir, '.flowstate')
    mkdirSync(fsDir, { recursive: true })
    writeFileSync(
      join(fsDir, 'config.json'),
      JSON.stringify({ orgId: 'org_abc', workspaceId: 'work_xyz' })
    )

    const result = resolveNearestFlowstateConfig(tempDir)
    expect(result).not.toBeNull()
    expect(result!.config.orgId).toBe('org_abc')
    expect(result!.configPath).toBe(tempDir)
  })

  it('walks upward to find config in parent', () => {
    const child = join(tempDir, 'packages', 'my-pkg', 'src')
    mkdirSync(child, { recursive: true })

    const fsDir = join(tempDir, '.flowstate')
    mkdirSync(fsDir, { recursive: true })
    writeFileSync(
      join(fsDir, 'config.json'),
      JSON.stringify({ orgId: 'org_root', workspaceId: 'work_root' })
    )

    const result = resolveNearestFlowstateConfig(child)
    expect(result).not.toBeNull()
    expect(result!.config.orgId).toBe('org_root')
    expect(result!.configPath).toBe(tempDir)
  })

  it('returns most specific (nearest) config when multiple exist', () => {
    // Root config
    const rootFs = join(tempDir, '.flowstate')
    mkdirSync(rootFs, { recursive: true })
    writeFileSync(
      join(rootFs, 'config.json'),
      JSON.stringify({ orgId: 'org_root', workspaceId: 'work_root' })
    )

    // Package-level config (more specific)
    const pkgDir = join(tempDir, 'packages', 'my-pkg')
    mkdirSync(join(pkgDir, '.flowstate'), { recursive: true })
    writeFileSync(
      join(pkgDir, '.flowstate', 'config.json'),
      JSON.stringify({
        orgId: 'org_root',
        workspaceId: 'work_root',
        projectId: 'proj_specific',
      })
    )

    const srcDir = join(pkgDir, 'src')
    mkdirSync(srcDir, { recursive: true })

    const result = resolveNearestFlowstateConfig(srcDir)
    expect(result).not.toBeNull()
    expect(result!.config.projectId).toBe('proj_specific')
    expect(result!.configPath).toBe(pkgDir)
  })

  it('returns null when no config found', () => {
    const result = resolveNearestFlowstateConfig(tempDir)
    expect(result).toBeNull()
  })
})
