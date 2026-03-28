// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { CognitiveLayer } from '@epicdm/saga-sdk'

/**
 * Parse .claude/settings.json into cognitive parameters.
 */
export function parseProjectSettings(claudeDir: string): Partial<CognitiveLayer> | null {
  const settingsPath = join(claudeDir, 'settings.json')
  if (!existsSync(settingsPath)) return null

  try {
    const content = readFileSync(settingsPath, 'utf-8')
    const settings = JSON.parse(content) as Record<string, unknown>

    const result: Partial<CognitiveLayer> = {}

    // Extract allowed/denied tools as capabilities
    const allowedTools = Array.isArray(settings.allowedTools) ? settings.allowedTools as string[] : undefined
    const deniedTools = Array.isArray(settings.deniedTools) ? settings.deniedTools as string[] : undefined

    if (allowedTools || deniedTools) {
      const capabilities: Record<string, boolean> = {}
      if (allowedTools) {
        for (const tool of allowedTools) capabilities[String(tool)] = true
      }
      if (deniedTools) {
        for (const tool of deniedTools) capabilities[String(tool)] = false
      }
      result.capabilities = capabilities
    }

    return Object.keys(result).length > 0 ? result : null
  } catch {
    return null
  }
}
