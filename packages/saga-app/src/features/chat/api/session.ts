// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { HUB_URL, ApiError } from '../../../core/api/hub'
import type { SessionToken } from '../types'

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
