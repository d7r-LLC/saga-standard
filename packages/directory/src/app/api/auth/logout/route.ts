// Copyright 2026 d7r LLC
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { SESSION_COOKIE_NAME } from '@/lib/session/constants'
import { deleteSession } from '@/lib/session/server'

export async function POST() {
  const cookieStore = await cookies()
  const sessionId = cookieStore.get(SESSION_COOKIE_NAME)?.value

  if (sessionId) {
    await deleteSession(sessionId)
  }

  const response = NextResponse.json({ ok: true })
  response.cookies.delete(SESSION_COOKIE_NAME)
  return response
}

export async function GET(request: Request) {
  const cookieStore = await cookies()
  const sessionId = cookieStore.get(SESSION_COOKIE_NAME)?.value

  if (sessionId) {
    await deleteSession(sessionId)
  }

  const url = new URL('/', request.url)
  const response = NextResponse.redirect(url)
  response.cookies.delete(SESSION_COOKIE_NAME)
  return response
}
