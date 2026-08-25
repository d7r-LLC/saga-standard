// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { existsSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import Database from 'better-sqlite3'
import type { SagaLayerName } from '@d7r/saga-sdk'
import type { CollectorScan } from '../types'

/**
 * Scan claude-mem database and report available data counts.
 */
export function scanClaudeMem(homeDir?: string): CollectorScan {
  const home = homeDir ?? homedir()
  const dbPath = join(home, '.claude-mem', 'claude-mem.db')

  const empty: CollectorScan = {
    sessionCount: 0,
    projectCount: 0,
    memoryEntries: 0,
    skillCount: 0,
    estimatedExportSizeBytes: 0,
    layers: [],
  }

  if (!existsSync(dbPath)) return empty

  let db: Database.Database | null = null
  try {
    db = new Database(dbPath, { readonly: true })

    const obsCount = (db.prepare('SELECT COUNT(*) as count FROM observations').get() as { count: number }).count
    const sessionCount = (db.prepare('SELECT COUNT(*) as count FROM sdk_sessions').get() as { count: number }).count
    const projectCount = (db.prepare('SELECT COUNT(DISTINCT project) as count FROM observations WHERE project IS NOT NULL').get() as { count: number }).count

    const layers: SagaLayerName[] = []
    if (obsCount > 0) layers.push('memory')
    if (sessionCount > 0) layers.push('taskHistory')

    const fileSize = statSync(dbPath).size

    return {
      sessionCount,
      projectCount,
      memoryEntries: obsCount,
      skillCount: 0,
      estimatedExportSizeBytes: fileSize,
      layers,
    }
  } catch {
    return empty
  } finally {
    db?.close()
  }
}
