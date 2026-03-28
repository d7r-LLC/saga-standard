// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import type { SessionToken } from '../types'

export const HUB_URL = __DEV__
  ? 'http://localhost:8787'
  : 'https://saga-hub.d7r-LLC.workers.dev'

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message?: string
  ) {
    super(message ?? `Server error: ${status}`)
    this.name = 'ApiError'
  }
}

export async function requestChallenge(
  walletAddress: string,
  chain: string
): Promise<{ challenge: string; expiresAt: string }> {
  const res = await fetch(`${HUB_URL}/v1/auth/challenge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ walletAddress, chain }),
  })
  if (!res.ok) throw new ApiError(res.status, 'Failed to request auth challenge')
  return res.json() as Promise<{ challenge: string; expiresAt: string }>
}

export async function verifyChallenge(
  walletAddress: string,
  chain: string,
  signature: string,
  challenge: string
): Promise<SessionToken> {
  const res = await fetch(`${HUB_URL}/v1/auth/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ walletAddress, chain, signature, challenge }),
  })
  if (!res.ok) throw new ApiError(res.status, 'Failed to verify wallet signature')
  return res.json() as Promise<SessionToken>
}
