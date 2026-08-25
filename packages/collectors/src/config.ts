// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { SagaConfig } from '@d7r/saga-sdk'

/**
 * Load .saga/config.json from a workspace directory.
 * Returns null if the file doesn't exist or is invalid.
 */
export function loadSagaConfig(workspaceDir: string): SagaConfig | null {
  const configPath = join(workspaceDir, '.saga', 'config.json')
  if (!existsSync(configPath)) return null

  try {
    const content = readFileSync(configPath, 'utf-8')
    const parsed = JSON.parse(content) as Record<string, unknown>

    // Validate required agent section
    if (!parsed.agent || typeof parsed.agent !== 'object') return null

    const agent = parsed.agent as Record<string, unknown>
    if (typeof agent.sagaHandle !== 'string') return null
    if (typeof agent.sagaWallet !== 'string') return null
    if (typeof agent.chain !== 'string') return null

    return parsed as unknown as SagaConfig
  } catch {
    return null
  }
}
