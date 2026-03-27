// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { drizzle } from 'drizzle-orm/d1'
import { eq } from 'drizzle-orm'
import { verifyMessage } from 'viem'
import { directories } from '../db/schema'
import { CHALLENGE_TTL_MS } from './types'

export type FederationAuthResult =
  | { ok: true; directoryId: string; operatorWallet: string }
  | { ok: false; error: string }

/**
 * Generate a challenge string for federation WebSocket authentication.
 * Format: `saga-federation:{uuid}:{timestamp}`
 */
export function generateFederationChallenge(): { challenge: string; expiresAt: string } {
  const nonce = crypto.randomUUID()
  const now = Date.now()
  const expiresAt = new Date(now + CHALLENGE_TTL_MS).toISOString()
  const challenge = `saga-federation:${nonce}:${now}`
  return { challenge, expiresAt }
}

/**
 * Verify federation authentication from a remote directory.
 *
 * Checks:
 * 1. Challenge is not expired and has correct format
 * 2. Signature is present (full verification is a TODO)
 * 3. Directory exists in D1 with matching operator wallet
 * 4. Directory has a valid NFT (tokenId not null)
 * 5. Directory status is 'active'
 */
export async function verifyFederationAuth(
  directoryId: string,
  operatorWallet: string,
  signature: string,
  challenge: string,
  challengeExpiresAt: string,
  db: D1Database
): Promise<FederationAuthResult> {
  if (new Date(challengeExpiresAt) <= new Date()) {
    return { ok: false, error: 'Challenge expired' }
  }

  if (!challenge.startsWith('saga-federation:')) {
    return { ok: false, error: 'Invalid challenge format' }
  }

  if (!signature || !signature.startsWith('0x')) {
    return { ok: false, error: 'Invalid signature format' }
  }
  let signatureValid: boolean
  try {
    signatureValid = await verifyMessage({
      address: operatorWallet as `0x${string}`,
      message: challenge,
      signature: signature as `0x${string}`,
    })
  } catch {
    signatureValid = false
  }
  if (!signatureValid) {
    return { ok: false, error: 'Signature verification failed' }
  }

  const orm = drizzle(db)
  const normalizedWallet = operatorWallet.toLowerCase()

  const dir = await orm
    .select()
    .from(directories)
    .where(eq(directories.directoryId, directoryId))
    .get()

  if (!dir) {
    return { ok: false, error: 'Directory not found' }
  }

  if (dir.operatorWallet.toLowerCase() !== normalizedWallet) {
    return { ok: false, error: 'Operator wallet does not match registered directory' }
  }

  if (dir.tokenId === null || dir.tokenId === undefined) {
    return { ok: false, error: 'Directory does not have a valid NFT' }
  }

  if (dir.status !== 'active') {
    return { ok: false, error: 'Directory is not active' }
  }

  return { ok: true, directoryId, operatorWallet: normalizedWallet }
}
