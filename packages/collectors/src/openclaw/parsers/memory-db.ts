// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { existsSync } from 'node:fs'

/**
 * Chunk row from OpenClaw memory SQLite database.
 * We only extract text content — embeddings are discarded because
 * the SAGA export pipeline re-embeds with a standard model.
 */
interface MemoryChunk {
  id: string
  path: string
  source: string
  start_line: number
  end_line: number
  text: string
  model: string
  updated_at: number
}

interface FileRow {
  path: string
  source: string
  hash: string
  mtime: number
  size: number
}

/**
 * Export memory data from an OpenClaw SQLite index.
 * Reads chunk text (for re-embedding) and file metadata.
 *
 * We intentionally skip raw embeddings — the SAGA pipeline re-embeds
 * all text with a standard model to ensure cross-platform portability.
 */
export function exportMemoryFromSqlite(
  dbPath: string,
  options?: { maxChunks?: number }
): {
  chunks: Array<{ id: string; path: string; source: string; text: string; model: string }>
  files: Array<{ path: string; source: string }>
  knowledgeDomains: string[]
  chunkCount: number
} | null {
  if (!existsSync(dbPath)) return null

  try {
    // Dynamic import of better-sqlite3
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Database = require('better-sqlite3')
    const db = new Database(dbPath, { readonly: true })

    try {
      const limit = options?.maxChunks ?? 1000

      // Read chunks (text only, skip embedding column)
      const chunks = db
        .prepare(
          `SELECT id, path, source, start_line, end_line, text, model, updated_at
           FROM chunks
           ORDER BY updated_at DESC
           LIMIT ?`
        )
        .all(limit) as MemoryChunk[]

      // Read files
      const files = db
        .prepare('SELECT path, source, hash, mtime, size FROM files')
        .all() as FileRow[]

      // Extract knowledge domains from file paths
      const domains = new Set<string>()
      for (const file of files) {
        const pathParts = file.path.split('/')
        const filename = pathParts[pathParts.length - 1]
        if (filename) {
          const domain = filename.replace(/\.md$/, '').replace(/[-_]/g, ' ')
          domains.add(domain)
        }
      }

      // Get total chunk count
      const countResult = db.prepare('SELECT COUNT(*) as c FROM chunks').get() as { c: number }

      return {
        chunks: chunks.map(c => ({
          id: c.id,
          path: c.path,
          source: c.source,
          text: c.text,
          model: c.model,
        })),
        files: files.map(f => ({ path: f.path, source: f.source })),
        knowledgeDomains: [...domains],
        chunkCount: countResult.c,
      }
    } finally {
      db.close()
    }
  } catch {
    // SQLite read failed — likely db doesn't exist or schema mismatch
    return null
  }
}
