// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import type { Context, Next } from 'hono'
import type { Env } from '../bindings'

export interface SessionData {
  walletAddress: string
  chain: string
  expiresAt: string
}

/**
 * Bearer token auth middleware.
 * Reads token from Authorization header, looks up session in KV.
 * Sets c.set('session', sessionData) on success.
 */
export async function requireAuth(
  c: Context<{ Bindings: Env; Variables: { session: SessionData } }>,
  next: Next
): Promise<Response | void> {
  const header = c.req.header('Authorization')
  if (!header?.startsWith('Bearer ')) {
    return c.json({ error: 'Missing or invalid Authorization header', code: 'UNAUTHORIZED' }, 401)
  }

  const token = header.slice(7)
  const sessionJson = await c.env.SESSIONS.get(token)
  if (!sessionJson) {
    return c.json({ error: 'Invalid or expired session token', code: 'SESSION_EXPIRED' }, 401)
  }

  const session = JSON.parse(sessionJson) as SessionData
  if (new Date(session.expiresAt) <= new Date()) {
    // Clean up expired token
    await c.env.SESSIONS.delete(token)
    return c.json({ error: 'Session expired', code: 'SESSION_EXPIRED' }, 401)
  }

  c.set('session', session)
  return next()
}

/** Generate a random ID with a prefix */
export function generateId(prefix: string): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  const hex = Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
  return `${prefix}_${hex}`
}
