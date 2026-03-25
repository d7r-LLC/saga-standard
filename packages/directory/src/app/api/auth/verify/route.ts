// Copyright 2026 d7r LLC
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { createSession, setSessionCookie } from '@/lib/session/server'

export async function POST(request: Request) {
  const body = (await request.json()) as {
    walletAddress?: string
    chain?: string
    signature?: string
    challenge?: string
  }
  const { walletAddress, chain, signature, challenge } = body

  if (!walletAddress || !chain || !signature || !challenge) {
    return NextResponse.json(
      { error: 'Missing required fields' },
      { status: 400 },
    )
  }

  const { env } = await getCloudflareContext<{ env: CloudflareEnv }>()

  const res = await fetch(`${env.SAGA_SERVER_URL}/v1/auth/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ walletAddress, chain, signature, challenge }),
  })

  const data = (await res.json()) as {
    walletAddress: string
    token: string
    expiresAt: string
    error?: string
  }

  if (!res.ok) {
    return NextResponse.json(data, { status: res.status })
  }

  const sessionId = await createSession({
    walletAddress: data.walletAddress,
    chain,
    sagaToken: data.token,
    expiresAt: data.expiresAt,
  })

  const cookie = setSessionCookie(sessionId)
  const response = NextResponse.json({
    walletAddress: data.walletAddress,
    chain,
  })
  response.cookies.set(cookie)

  return response
}
