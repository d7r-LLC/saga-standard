// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import type { ChainId } from './common'

/** SAGA agent identity configuration */
export interface SagaConfigAgent {
  /** SAGA handle (e.g. "marcus-chen") */
  sagaHandle: string
  /** Agent wallet address */
  sagaWallet: string
  /** Blockchain identifier (e.g. "eip155:8453") */
  chain: ChainId
  /** Organization handle */
  orgHandle?: string
}

/** SAGA hub connection configuration */
export interface SagaConfigHub {
  /** Hub URL (e.g. "https://agents.epicflowstate.ai") */
  url: string
  /** Unique system identifier for this DERP */
  systemId: string
  /** Public URL of this spoke system */
  systemUrl?: string
}

/** SAGA sync service configuration */
export interface SagaConfigSync {
  /** Milliseconds to debounce push operations (default: 2000) */
  pushDebounceMs?: number
  /** Milliseconds between pull polls (default: 300000) */
  pullIntervalMs?: number
  /** Enable real-time sync (default: false) */
  realtimeEnabled?: boolean
  /** Real-time sync mode (default: "sse") */
  realtimeMode?: 'sse' | 'websocket' | 'polling'
}

/** FlowState-specific identity bridge */
export interface SagaConfigIdentity {
  /** FlowState team member ID (e.g. "team_UfL4H7z2R6") */
  flowstateTeamMemberId?: string
  /** FlowState org ID */
  flowstateOrgId?: string
  /** FlowState workspace ID */
  flowstateWorkspaceId?: string
}

/** Per-collector configuration */
export interface SagaConfigCollectors {
  'claude-mem'?: {
    /** Path to claude-mem.db (default: ~/.claude-mem/claude-mem.db) */
    dbPath?: string
  }
  'flowstate-memory'?: {
    /** Base URL of flowstate-agent-memory API (default: http://localhost:7090) */
    url?: string
  }
  'project-claude'?: {
    /** Paths to scan for .claude/ directories */
    paths?: string[]
  }
  [key: string]: Record<string, unknown> | undefined
}

/** Root .saga/config.json schema */
export interface SagaConfig {
  agent: SagaConfigAgent
  hub?: SagaConfigHub
  sync?: SagaConfigSync
  identity?: SagaConfigIdentity
  collectors?: SagaConfigCollectors
}
