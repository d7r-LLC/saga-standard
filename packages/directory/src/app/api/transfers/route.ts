// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session/server'
import { createAuthenticatedSagaClient } from '@/lib/saga-client'

export async function POST(request: Request) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = (await request.json()) as {
    agentHandle?: string
    destinationServerUrl?: string
    requestedLayers?: string[]
  }
  const { agentHandle, destinationServerUrl, requestedLayers } = body

  if (!agentHandle || !destinationServerUrl) {
    return NextResponse.json(
      { error: 'Missing required fields' },
      { status: 400 },
    )
  }

  const client = await createAuthenticatedSagaClient(session.sagaToken)

  try {
    const transfer = await client.initiateTransfer({
      agentHandle,
      destinationServerUrl,
      requestedLayers,
    })
    return NextResponse.json(transfer, { status: 201 })
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? 'Transfer initiation failed' },
      { status: 400 },
    )
  }
}
