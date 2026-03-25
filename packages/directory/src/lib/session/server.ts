// Copyright 2026 d7r LLC
// SPDX-License-Identifier: Apache-2.0

import { cookies } from 'next/headers'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { getSession } from '@epicdm/kv-session'
import { SESSION_COOKIE_NAME } from './constants'
import type { SessionData } from './constants'

export async function getServerSession(): Promise<SessionData | null> {
  const cookieStore = await cookies()
  const sessionId = cookieStore.get(SESSION_COOKIE_NAME)?.value
  if (!sessionId) return null

  const { env } = await getCloudflareContext()
  const session = await getSession<SessionData>(env.SESSIONS, sessionId)
  return session ?? null
}
