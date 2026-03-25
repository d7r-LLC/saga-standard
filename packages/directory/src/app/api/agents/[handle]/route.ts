// Copyright 2026 d7r LLC
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { getDb } from '@/db'
import { getAgentByHandle, updateAgent } from '@/db/queries/agents'
import { getSessionAgent } from '@/lib/auth/get-session-agent'
import { getWorkHistoryForAgent } from '@/db/queries/work-history'
import { agentUpdateSchema } from '@/lib/validation/schemas'
import { requireAuth } from '@/lib/auth/require-session'

export async function GET(
  _request: Request,
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

  const workHistoryEntries = await getWorkHistoryForAgent(db, agent.id)

  return NextResponse.json({ ...agent, workHistory: workHistoryEntries })
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ handle: string }> },
) {
  const { env } = await getCloudflareContext()
  const db = getDb(env.DB)
  const { handle } = await params

  const auth = await requireAuth(request)
  if (!auth.ok) return auth.response

  const agent = await getAgentByHandle(db, handle)
  if (!agent) {
    return NextResponse.json(
      { error: 'not_found', message: 'Agent not found' },
      { status: 404 },
    )
  }

  // Verify ownership: session identity must match agent
  const sessionAgent = await getSessionAgent(db, {
    identityId: auth.ctx.session.identityId,
    walletAddress: auth.ctx.session.walletAddress,
  })
  if (!sessionAgent || sessionAgent.id !== agent.id) {
    return NextResponse.json(
      { error: 'forbidden', message: 'You can only edit your own profile' },
      { status: 403 },
    )
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { error: 'invalid_request', message: 'Invalid JSON body' },
      { status: 400 },
    )
  }

  const parsed = agentUpdateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'validation_error', message: parsed.error.message },
      { status: 400 },
    )
  }

  await updateAgent(db, agent.id, parsed.data)

  const updated = await getAgentByHandle(db, handle)
  return NextResponse.json(updated)
}
