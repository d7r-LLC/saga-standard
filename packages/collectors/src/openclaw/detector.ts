// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import type { CollectorDetection } from '../types'

/**
 * OpenClaw state directory resolution matching the upstream logic.
 * Checks: OPENCLAW_STATE_DIR env → ~/.openclaw → legacy dirs.
 */
export function resolveOpenClawStateDir(home: string): string | null {
  const envOverride = process.env.OPENCLAW_STATE_DIR?.trim()
  if (envOverride && existsSync(envOverride)) return envOverride

  const newDir = join(home, '.openclaw')
  if (existsSync(newDir)) return newDir

  // Legacy fallbacks
  const legacyNames = ['.clawdbot', '.moldbot', '.moltbot']
  for (const name of legacyNames) {
    const legacyDir = join(home, name)
    if (existsSync(legacyDir)) return legacyDir
  }

  return null
}

/**
 * Resolve the OpenClaw workspace directory.
 * Default: ~/.openclaw/workspace (or workspace-{profile} for non-default profiles)
 */
export function resolveOpenClawWorkspaceDir(stateDir: string): string | null {
  const profile = process.env.OPENCLAW_PROFILE?.trim()
  const dirName =
    profile && profile.toLowerCase() !== 'default' ? `workspace-${profile}` : 'workspace'
  const wsDir = join(stateDir, dirName)
  return existsSync(wsDir) ? wsDir : null
}

/**
 * Detect OpenClaw installation on disk.
 */
export function detectOpenClaw(homeDir?: string): CollectorDetection {
  const home = homeDir ?? homedir()
  const locations: string[] = []

  const stateDir = resolveOpenClawStateDir(home)
  if (!stateDir) {
    return { source: 'openclaw', found: false, locations }
  }
  locations.push(stateDir)

  const wsDir = resolveOpenClawWorkspaceDir(stateDir)
  if (wsDir) {
    locations.push(wsDir)
  }

  // Try to extract version from package.json or config
  let version: string | undefined
  try {
    const configPath = join(stateDir, 'openclaw.json')
    if (existsSync(configPath)) {
      const config = JSON.parse(readFileSync(configPath, 'utf-8'))
      version = config.version ?? config.openclaw?.version
    }
  } catch {
    // skip
  }

  return {
    source: 'openclaw',
    found: true,
    version,
    locations,
  }
}
