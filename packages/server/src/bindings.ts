// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

export interface Env {
  DB: D1Database
  STORAGE: R2Bucket
  SESSIONS: KVNamespace
  INDEXER_STATE: KVNamespace

  /** Optional: server display name (default: "SAGA Reference Server") */
  SERVER_NAME?: string

  /** Optional: supported chains as comma-separated list */
  SUPPORTED_CHAINS?: string

  // Chain indexer configuration
  /** Base RPC URL (e.g. https://sepolia.base.org). Indexer skips if unset. */
  BASE_RPC_URL?: string

  /** Deployed SAGAAgentIdentity contract address */
  AGENT_IDENTITY_CONTRACT?: string

  /** Deployed SAGAOrgIdentity contract address */
  ORG_IDENTITY_CONTRACT?: string

  /** Deployed SAGAHandleRegistry contract address */
  HANDLE_REGISTRY_CONTRACT?: string
}
