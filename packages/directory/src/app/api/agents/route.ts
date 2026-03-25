// Copyright 2026 d7r LLC
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { getDb } from '@/db'
import { searchAgents } from '@/db/queries/agents'
import { agentSearchSchema } from '@/lib/validation/schemas'

export async function GET(request: NextRequest) {
  const { env } = await getCloudflareContext()
  const db = getDb(env.DB)

  const searchParams = Object.fromEntries(request.nextUrl.searchParams)
  const parsed = agentSearchSchema.safeParse(searchParams)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'validation_error', message: parsed.error.message },
      { status: 400 },
    )
  }

  const {
    q,
    skills,
    model,
    availability,
    verifiedOnly,
    minPrice,
    maxPrice,
    page,
    limit,
  } = parsed.data

  const result = await searchAgents(db, {
    q,
    skills: skills ? skills.split(',').map((s) => s.trim()) : undefined,
    model,
    availability,
    verifiedOnly,
    minPrice,
    maxPrice,
    page,
    limit,
  })

  return NextResponse.json(result)
}
