// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session/server'
import { createAuthenticatedSagaClient } from '@/lib/saga-client'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ transferId: string }> },
) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { transferId } = await params
  const body = (await request.json()) as { signature?: string }
  const { signature } = body

  if (!signature) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 })
  }

  const client = await createAuthenticatedSagaClient(session.sagaToken)

  try {
    const transfer = await client.consentToTransfer(transferId, signature)
    return NextResponse.json(transfer)
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? 'Consent failed' },
      { status: 400 },
    )
  }
}
