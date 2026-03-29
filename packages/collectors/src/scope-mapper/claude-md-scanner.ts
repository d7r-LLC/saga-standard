// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { ClaudeMdReference } from './types'

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'coverage', '.worktrees', 'build'])

/**
 * Extract observation IDs from a string containing a <claude-mem-context> block.
 * Looks for `#NNNNN` patterns in table rows.
 */
export function extractObservationIds(content: string): number[] {
  // Find the <claude-mem-context> block
  const startTag = '<claude-mem-context>'
  const endTag = '</claude-mem-context>'
  const startIdx = content.indexOf(startTag)
  const endIdx = content.indexOf(endTag)

  if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) return []

  const block = content.slice(startIdx + startTag.length, endIdx)

  // Match #NNNNN patterns in table rows (| #12345 | ...)
  const ids: number[] = []
  const pattern = /\|\s*#(\d+)\s*\|/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(block)) !== null) {
    ids.push(parseInt(match[1], 10))
  }

  return ids
}

/**
 * Recursively scan a directory for CLAUDE.md files that contain observation references.
 */
export function scanForClaudeMdReferences(rootDir: string, maxDepth = 10): ClaudeMdReference[] {
  const results: ClaudeMdReference[] = []

  if (!existsSync(rootDir)) return results

  function walk(dir: string, depth: number): void {
    if (depth > maxDepth) return

    let entries: string[]
    try {
      entries = readdirSync(dir)
    } catch {
      return
    }

    for (const entry of entries) {
      if (entry === 'CLAUDE.md') {
        const filePath = join(dir, entry)
        try {
          const content = readFileSync(filePath, 'utf-8')
          const ids = extractObservationIds(content)
          if (ids.length > 0) {
            results.push({ filePath, observationIds: ids })
          }
        } catch {
          // skip unreadable files
        }
        continue
      }

      if (SKIP_DIRS.has(entry)) continue

      const fullPath = join(dir, entry)
      try {
        if (statSync(fullPath).isDirectory()) {
          walk(fullPath, depth + 1)
        }
      } catch {
        // skip inaccessible dirs
      }
    }
  }

  walk(rootDir, 0)
  return results
}
