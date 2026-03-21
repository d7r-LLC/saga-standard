// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import type { ChainId } from '@epicdm/saga-sdk'
import type {
  AuthSession,
  ChallengeRequest,
  ChallengeResponse,
  SagaApiError,
  VerifyRequest,
  VerifyResponse,
} from './types'

/**
 * Minimal wallet interface for auth challenge-response.
 * Lighter than the full SagaSigner — just needs to sign a message string.
 */
export interface WalletSigner {
  signMessage(message: string): Promise<string>
  getAddress(): Promise<string>
  getChain(): ChainId
}

export class SagaAuthError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode?: number
  ) {
    super(message)
    this.name = 'SagaAuthError'
  }
}

/**
 * Authenticate with a SAGA server using wallet challenge-response.
 *
 * Flow:
 * 1. Request challenge from server
 * 2. Sign challenge with wallet
 * 3. Submit signature for verification
 * 4. Receive session token
 */
export async function authenticateWithServer(options: {
  serverUrl: string
  signer: WalletSigner
  fetch?: typeof globalThis.fetch
}): Promise<AuthSession> {
  const { serverUrl, signer } = options
  const fetchFn = options.fetch ?? globalThis.fetch
  const baseUrl = serverUrl.replace(/\/$/, '')
  const walletAddress = await signer.getAddress()
  const chain = signer.getChain()

  // Step 1: Request challenge
  const challengeReq: ChallengeRequest = { walletAddress, chain }
  const challengeRes = await fetchFn(`${baseUrl}/v1/auth/challenge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(challengeReq),
  })

  if (!challengeRes.ok) {
    const err = (await challengeRes.json().catch(() => ({
      error: 'Challenge request failed',
      code: 'CHALLENGE_FAILED',
    }))) as SagaApiError
    throw new SagaAuthError(err.error, err.code, challengeRes.status)
  }

  const { challenge, expiresAt: challengeExpiry } = (await challengeRes.json()) as ChallengeResponse

  // Check challenge hasn't already expired
  if (new Date(challengeExpiry) <= new Date()) {
    throw new SagaAuthError('Challenge already expired', 'CHALLENGE_EXPIRED')
  }

  // Step 2: Sign challenge
  const signature = await signer.signMessage(challenge)

  // Step 3: Verify signature
  const verifyReq: VerifyRequest = { walletAddress, chain, signature, challenge }
  const verifyRes = await fetchFn(`${baseUrl}/v1/auth/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(verifyReq),
  })

  if (!verifyRes.ok) {
    const err = (await verifyRes.json().catch(() => ({
      error: 'Verification failed',
      code: 'VERIFY_FAILED',
    }))) as SagaApiError
    throw new SagaAuthError(err.error, err.code, verifyRes.status)
  }

  const { token, expiresAt, walletAddress: verified } = (await verifyRes.json()) as VerifyResponse

  return {
    token,
    expiresAt: new Date(expiresAt),
    walletAddress: verified,
    serverUrl: baseUrl,
  }
}

/**
 * Check if an auth session is still valid (not expired).
 */
export function isSessionValid(session: AuthSession): boolean {
  return session.expiresAt > new Date()
}

/**
 * Refresh an auth session by re-authenticating.
 */
export async function refreshSession(options: {
  session: AuthSession
  signer: WalletSigner
  fetch?: typeof globalThis.fetch
}): Promise<AuthSession> {
  return authenticateWithServer({
    serverUrl: options.session.serverUrl,
    signer: options.signer,
    fetch: options.fetch,
  })
}
