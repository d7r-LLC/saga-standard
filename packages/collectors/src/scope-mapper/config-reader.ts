// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { FlowstateConfig } from './types'

/**
 * Read a .flowstate/config.json from the given directory.
 * Returns null if the file doesn't exist or is invalid.
 */
export function readFlowstateConfig(dirPath: string): FlowstateConfig | null {
  const configPath = join(dirPath, '.flowstate', 'config.json')
  if (!existsSync(configPath)) return null

  try {
    const raw = JSON.parse(readFileSync(configPath, 'utf-8'))

    // Both saga-standard style (version, codebaseId) and
    // epic-flowstate per-package style (packageName, linkedAt) are supported
    const config: FlowstateConfig = {}

    if (raw.version) config.version = raw.version
    if (raw.projectName) config.projectName = raw.projectName
    if (raw.projectId) config.projectId = raw.projectId
    if (raw.codebaseId) config.codebaseId = raw.codebaseId
    if (raw.orgId) config.orgId = raw.orgId
    if (raw.workspaceId) config.workspaceId = raw.workspaceId
    if (raw.packageName) config.packageName = raw.packageName

    return config
  } catch {
    return null
  }
}

/**
 * Walk upward from startPath to find the nearest .flowstate/config.json.
 * Returns the config and the path to the directory containing .flowstate/, or null.
 */
export function resolveNearestFlowstateConfig(
  startPath: string
): { config: FlowstateConfig; configPath: string } | null {
  let current = startPath

  // Walk up at most 20 levels to avoid infinite loops
  for (let i = 0; i < 20; i++) {
    const config = readFlowstateConfig(current)
    if (config) {
      return { config, configPath: current }
    }

    const parent = dirname(current)
    if (parent === current) break // reached filesystem root
    current = parent
  }

  return null
}
