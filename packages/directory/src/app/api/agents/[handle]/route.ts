// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { NextResponse } from 'next/server'
import { createSagaClient } from '@/lib/saga-client'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ handle: string }> },
) {
  const { handle } = await params
  const client = await createSagaClient()

  try {
    const result = await client.getAgent(handle)
    return NextResponse.json(result)
  } catch (err: any) {
    if (err?.message?.includes('not found') || err?.status === 404) {
      return NextResponse.json(
        { error: 'not_found', message: 'Agent not found' },
        { status: 404 },
      )
    }
    return NextResponse.json(
      { error: err?.message ?? 'Failed to fetch agent' },
      { status: 502 },
    )
  }
}
