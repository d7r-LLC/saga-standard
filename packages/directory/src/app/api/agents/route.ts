// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import type { RegisterAgentRequest } from '@epicdm/saga-client'
import { getSession } from '@/lib/session/server'
import {
  createAuthenticatedSagaClient,
  createSagaClient,
} from '@/lib/saga-client'

export async function GET(request: NextRequest) {
  const client = await createSagaClient()

  const page = Number(request.nextUrl.searchParams.get('page') ?? '1')
  const limit = Number(request.nextUrl.searchParams.get('limit') ?? '20')
  const search = request.nextUrl.searchParams.get('search') ?? undefined

  try {
    const result = await client.listAgents({ page, limit, search })
    return NextResponse.json(result)
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? 'Failed to fetch agents' },
      { status: 502 },
    )
  }
}

export async function POST(request: Request) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = (await request.json()) as { handle?: string }
  const { handle } = body

  if (!handle) {
    return NextResponse.json({ error: 'Missing handle' }, { status: 400 })
  }

  const client = await createAuthenticatedSagaClient(session.sagaToken)

  try {
    const agent = await client.registerAgent({
      handle,
      walletAddress: session.walletAddress,
      chain: session.chain as RegisterAgentRequest['chain'],
    })
    return NextResponse.json(agent, { status: 201 })
  } catch (err: any) {
    const message = err?.message ?? 'Registration failed'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
