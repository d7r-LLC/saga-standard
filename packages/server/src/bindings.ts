// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

export interface Env {
  DB: D1Database
  STORAGE: R2Bucket
  SESSIONS: KVNamespace

  /** Optional: server display name (default: "SAGA Reference Server") */
  SERVER_NAME?: string

  /** Optional: supported chains as comma-separated list */
  SUPPORTED_CHAINS?: string
}
