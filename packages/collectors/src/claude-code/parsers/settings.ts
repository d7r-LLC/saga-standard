// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { existsSync, readFileSync } from 'node:fs'
import type { CognitiveLayer, ModelRef } from '@d7r/saga-sdk'

interface ClaudeSettings {
  model?: string
  temperature?: number
  maxTokens?: number
  theme?: string
  [key: string]: unknown
}

/**
 * Parse Claude Code settings.json into cognitive parameters.
 */
export function parseSettings(settingsPath: string): Partial<CognitiveLayer> | null {
  if (!existsSync(settingsPath)) return null

  try {
    const content = readFileSync(settingsPath, 'utf-8')
    const settings: ClaudeSettings = JSON.parse(content)

    const result: Partial<CognitiveLayer> = {}

    if (settings.model) {
      const parts = settings.model.split('/')
      const baseModel: ModelRef = {
        provider: parts.length > 1 ? parts[0] : 'anthropic',
        model: parts.length > 1 ? parts[1] : parts[0],
      }
      result.baseModel = baseModel
    }

    if (settings.temperature !== undefined || settings.maxTokens !== undefined) {
      result.parameters = {
        ...(settings.temperature !== undefined ? { temperature: settings.temperature } : {}),
        ...(settings.maxTokens !== undefined ? { maxOutputTokens: settings.maxTokens } : {}),
      }
    }

    return Object.keys(result).length > 0 ? result : null
  } catch {
    return null
  }
}
