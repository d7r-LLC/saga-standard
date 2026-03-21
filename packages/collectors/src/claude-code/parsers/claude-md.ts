// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { existsSync, readFileSync } from 'node:fs'
import type { CognitiveLayer } from '@epicdm/saga-sdk'

/**
 * Parse CLAUDE.md files into cognitive system prompt fragments.
 * CLAUDE.md contains project instructions that shape agent behavior.
 */
export function parseClaudeMd(claudeMdPath: string): Partial<CognitiveLayer> | null {
  if (!existsSync(claudeMdPath)) return null

  try {
    const content = readFileSync(claudeMdPath, 'utf-8').trim()
    if (content.length === 0) return null

    return {
      systemPrompt: {
        format: 'markdown',
        content,
      },
    }
  } catch {
    return null
  }
}
