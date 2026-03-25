// Copyright 2026 d7r LLC
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { getDb } from '@/db'
import { getAgentByHandle } from '@/db/queries/agents'
import { buildSagaDocument } from '@/lib/saga/export'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ handle: string }> },
) {
  const { env } = await getCloudflareContext()
  const db = getDb(env.DB)
  const { handle } = await params

  const agent = await getAgentByHandle(db, handle)
  if (!agent || agent.isVerified === 0) {
    return NextResponse.json(
      { error: 'not_found', message: 'Agent not found' },
      { status: 404 },
    )
  }

  const exportType =
    request.nextUrl.searchParams.get('exportType') === 'profile'
      ? 'profile'
      : 'identity'

  const doc = buildSagaDocument(agent, exportType)

  return NextResponse.json(doc, {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': 'inline',
      'Cache-Control': 'public, max-age=60',
    },
  })
}
