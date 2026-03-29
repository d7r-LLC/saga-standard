// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { readFlowstateConfig } from './config-reader'
import type { FlowstateScope } from './types'

/**
 * Walk scan roots one level deep to build a map of directory name -> absolute path.
 * This maps project names like "epic-flowstate" or "saga-standard" to their filesystem locations.
 */
export function buildProjectPathMap(scanRoots: string[]): Map<string, string> {
  const map = new Map<string, string>()

  for (const root of scanRoots) {
    if (!existsSync(root)) continue

    let entries: string[]
    try {
      entries = readdirSync(root)
    } catch {
      continue
    }

    for (const entry of entries) {
      const fullPath = join(root, entry)
      try {
        if (statSync(fullPath).isDirectory()) {
          map.set(entry, fullPath)
        }
      } catch {
        // skip inaccessible
      }
    }
  }

  return map
}

/**
 * Read distinct project names from the claude-mem database.
 */
export function getDistinctProjects(dbPath: string): string[] {
  if (!existsSync(dbPath)) return []

  let db: Database.Database | null = null
  try {
    db = new Database(dbPath, { readonly: true })
    const rows = db
      .prepare('SELECT DISTINCT project FROM observations WHERE project IS NOT NULL')
      .all() as { project: string }[]
    return rows.map(r => r.project)
  } catch {
    return []
  } finally {
    db?.close()
  }
}

/**
 * Look up a project name in the path map and read its root .flowstate/config.json.
 */
export function resolveProjectScope(
  projectName: string,
  projectPaths: Map<string, string>
): { scope: FlowstateScope; configPath: string } | null {
  const projectDir = projectPaths.get(projectName)
  if (!projectDir) return null

  const config = readFlowstateConfig(projectDir)
  if (!config || !config.orgId || !config.workspaceId) return null

  const scope: FlowstateScope = {
    orgId: config.orgId,
    workspaceId: config.workspaceId,
    codebaseId: config.codebaseId,
    projectId: config.projectId,
    projectName: config.projectName ?? projectName,
  }

  return { scope, configPath: projectDir }
}
