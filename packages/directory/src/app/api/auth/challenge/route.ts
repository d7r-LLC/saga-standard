// Copyright 2026 d7r LLC
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { getCloudflareContext } from '@opennextjs/cloudflare'

export async function POST(request: Request) {
  const body = (await request.json()) as {
    walletAddress?: string
    chain?: string
  }
  const { walletAddress, chain } = body

  if (!walletAddress || !chain) {
    return NextResponse.json(
      { error: 'Missing walletAddress or chain' },
      { status: 400 },
    )
  }

  const { env } = await getCloudflareContext<{ env: CloudflareEnv }>()

  const res = await fetch(`${env.SAGA_SERVER_URL}/v1/auth/challenge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ walletAddress, chain }),
  })

  const data = await res.json()

  if (!res.ok) {
    return NextResponse.json(data, { status: res.status })
  }

  return NextResponse.json(data)
}
