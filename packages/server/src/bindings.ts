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

  /** Operator wallet private key (Wrangler secret). Used for outbound federation signing. */
  OPERATOR_PRIVATE_KEY?: string

  /** Cloudflare account ID (for AI Gateway URL construction) */
  CF_ACCOUNT_ID?: string

  /** AI Gateway name (e.g. "saga-hub"). When set, LLM requests route through AI Gateway. */
  CF_GATEWAY_NAME?: string

  /** Default Anthropic API key (used when no BYOK key is provided) */
  ANTHROPIC_API_KEY?: string

  /** Default OpenAI API key */
  OPENAI_API_KEY?: string

  /** Default Google AI API key */
  GOOGLE_AI_API_KEY?: string

  /** Base URL for the Agent Memory Server (context management) */
  AMS_BASE_URL?: string

  /** Auth token for AMS (optional, enables bearer auth) */
  AMS_AUTH_TOKEN?: string

  /**
   * Per-handle rate limit on memory-sync envelopes (envelopes per 60s).
   * Default 60. Phase 3 (A-High#4) — caps the burst surface for the
   * memory-poisoning attack pattern flagged in the 2026-05-03 audit.
   */
  MEMORY_SYNC_RATE_LIMIT?: string

  /**
   * Cloudflare Rate Limiting binding for the unauthenticated auth endpoints
   * (`POST /v1/auth/challenge`, `POST /v1/auth/verify`). Keyed by client IP
   * (`cf-connecting-ip`). Configured at 10 req / 60s in `wrangler.toml`.
   * Phase 5 (A-Med, auth).
   *
   * Optional so unit tests can omit the binding without crashing — when
   * undefined, the rate-limit middleware degrades to "always allow".
   */
  RATE_LIMITER_AUTH?: { limit(opts: { key: string }): Promise<{ success: boolean }> }

  /**
   * Per-wallet API request limit (req/min) enforced inside `requireAuth`.
   * Default 60. Phase 5 (A-Med, auth).
   */
  RATE_LIMIT_API?: string

  /**
   * Per-wallet chat-class limit (req/min) — applied to `/v1/chat/*` and
   * relay outbound. Default 10. Phase 5 (A-Med, auth).
   */
  RATE_LIMIT_CHAT?: string
}
