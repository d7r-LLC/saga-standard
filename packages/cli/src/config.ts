// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

export interface ServerConfig {
  name: string
  addedAt: string
}

export interface SagaConfig {
  defaultServer?: string
  defaultWallet?: string
  servers: Record<string, ServerConfig>
}

export interface CachedSession {
  token: string
  expiresAt: string
  walletAddress: string
}

const SAGA_DIR = join(homedir(), '.saga')
const CONFIG_PATH = join(SAGA_DIR, 'config.json')

/** Get the root .saga directory path */
export function getSagaDir(): string {
  return SAGA_DIR
}

/** Ensure the .saga directory structure exists */
export function ensureSagaDirs(): void {
  const dirs = [
    SAGA_DIR,
    join(SAGA_DIR, 'wallets'),
    join(SAGA_DIR, 'auth'),
    join(SAGA_DIR, 'exports'),
  ]
  for (const dir of dirs) {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }
  }
}

/** Load the global config, creating defaults if missing */
export function loadConfig(): SagaConfig {
  ensureSagaDirs()
  if (!existsSync(CONFIG_PATH)) {
    const defaults: SagaConfig = { servers: {} }
    writeFileSync(CONFIG_PATH, JSON.stringify(defaults, null, 2))
    return defaults
  }
  return JSON.parse(readFileSync(CONFIG_PATH, 'utf-8')) as SagaConfig
}

/** Save the global config */
export function saveConfig(config: SagaConfig): void {
  ensureSagaDirs()
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2))
}

/** Get a cached session token for a server URL */
export function getCachedSession(serverUrl: string): CachedSession | null {
  const hash = hashUrl(serverUrl)
  const path = join(SAGA_DIR, 'auth', `${hash}.json`)
  if (!existsSync(path)) return null
  const session = JSON.parse(readFileSync(path, 'utf-8')) as CachedSession
  if (new Date(session.expiresAt) <= new Date()) {
    return null // expired
  }
  return session
}

/** Cache a session token for a server URL */
export function cacheSession(serverUrl: string, session: CachedSession): void {
  ensureSagaDirs()
  const hash = hashUrl(serverUrl)
  const path = join(SAGA_DIR, 'auth', `${hash}.json`)
  writeFileSync(path, JSON.stringify(session, null, 2))
}

/** Clear cached session for a server URL */
export function clearCachedSession(serverUrl: string): void {
  const hash = hashUrl(serverUrl)
  const path = join(SAGA_DIR, 'auth', `${hash}.json`)
  if (existsSync(path)) {
    writeFileSync(path, '')
  }
}

/** Simple hash of a URL for use as a filename */
function hashUrl(url: string): string {
  let hash = 0
  for (let i = 0; i < url.length; i++) {
    const char = url.charCodeAt(i)
    hash = ((hash << 5) - hash + char) | 0
  }
  return Math.abs(hash).toString(36)
}
