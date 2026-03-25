// Copyright 2026 d7r LLC
// SPDX-License-Identifier: Apache-2.0

import { getCloudflareContext } from '@opennextjs/cloudflare'
import { cookies } from 'next/headers'
import {
  SESSION_COOKIE_NAME,
  SESSION_TTL_SECONDS,
  type SessionData,
} from './constants'

export async function getSession(): Promise<SessionData | null> {
  const cookieStore = await cookies()
  const sessionId = cookieStore.get(SESSION_COOKIE_NAME)?.value
  if (!sessionId) return null

  const { env } = await getCloudflareContext<{ env: CloudflareEnv }>()
  const raw = await env.SESSIONS.get(sessionId)
  if (!raw) return null

  const session: SessionData = JSON.parse(raw)

  if (new Date(session.expiresAt) <= new Date()) {
    await env.SESSIONS.delete(sessionId)
    return null
  }

  return session
}

export async function createSession(data: SessionData): Promise<string> {
  const { env } = await getCloudflareContext<{ env: CloudflareEnv }>()
  const sessionId = `saga_dir_${crypto.randomUUID()}`

  await env.SESSIONS.put(sessionId, JSON.stringify(data), {
    expirationTtl: SESSION_TTL_SECONDS,
  })

  return sessionId
}

export async function deleteSession(sessionId: string): Promise<void> {
  const { env } = await getCloudflareContext<{ env: CloudflareEnv }>()
  await env.SESSIONS.delete(sessionId)
}

export function setSessionCookie(sessionId: string) {
  return {
    name: SESSION_COOKIE_NAME,
    value: sessionId,
    httpOnly: true,
    secure: true,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  }
}
