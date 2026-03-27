// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

export interface Env {
  DB: D1Database
  STORAGE: R2Bucket
  SESSIONS: KVNamespace
  INDEXER_STATE: KVNamespace

  /** KV namespace for offline relay message storage */
  RELAY_MAILBOX: KVNamespace

  /** Durable Object namespace for the WebSocket relay room */
  RELAY_ROOM: DurableObjectNamespace

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

  /** Deployed SAGADirectoryIdentity contract address */
  DIRECTORY_IDENTITY_CONTRACT?: string

  /** CAIP-2 chain identifier for the indexer (default: eip155:84532 for Base Sepolia) */
  INDEXER_CHAIN?: string

  /** Block number to start indexing from when no cursor exists in KV */
  INDEXER_START_BLOCK?: string

  /** Secret for admin endpoints (e.g. /admin/reindex). Endpoint disabled if unset. */
  ADMIN_SECRET?: string

  /** Local directory identity (used for federation routing decisions) */
  LOCAL_DIRECTORY_ID?: string
}
