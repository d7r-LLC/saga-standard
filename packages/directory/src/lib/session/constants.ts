// Copyright 2026 d7r LLC
// SPDX-License-Identifier: Apache-2.0

export const SESSION_COOKIE_NAME = '__session_saga_dir'
export const SESSION_TTL_SECONDS = 3600 // 1 hour (matches SAGA token TTL)

export interface SessionData {
  walletAddress: string
  chain: string
  sagaToken: string
  expiresAt: string
}
