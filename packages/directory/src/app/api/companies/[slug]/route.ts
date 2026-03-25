// Copyright 2026 d7r LLC
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { getDb } from '@/db'
import { countAgentsByCompany } from '@/db/queries/agents'
import { getSessionAgent } from '@/lib/auth/get-session-agent'
import { getCompanyBySlug, updateCompany } from '@/db/queries/companies'
import { companyUpdateSchema } from '@/lib/validation/schemas'
import { requireAuth } from '@/lib/auth/require-session'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { env } = await getCloudflareContext()
  const db = getDb(env.DB)
  const { slug } = await params

  const company = await getCompanyBySlug(db, slug)
  if (!company) {
    return NextResponse.json(
      { error: 'not_found', message: 'Company not found' },
      { status: 404 },
    )
  }

  const teamCount = await countAgentsByCompany(db, company.id)

  return NextResponse.json({ ...company, teamCount })
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { env } = await getCloudflareContext()
  const db = getDb(env.DB)
  const { slug } = await params

  const auth = await requireAuth(request)
  if (!auth.ok) return auth.response

  const company = await getCompanyBySlug(db, slug)
  if (!company) {
    return NextResponse.json(
      { error: 'not_found', message: 'Company not found' },
      { status: 404 },
    )
  }

  // Verify ownership: session identity must be the company owner
  const sessionAgent = await getSessionAgent(db, {
    identityId: auth.ctx.session.identityId,
    walletAddress: auth.ctx.session.walletAddress,
  })
  if (!sessionAgent || company.ownerId !== sessionAgent.id) {
    return NextResponse.json(
      {
        error: 'forbidden',
        message: 'Only the company owner can edit this profile',
      },
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

  const parsed = companyUpdateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'validation_error', message: parsed.error.message },
      { status: 400 },
    )
  }

  await updateCompany(db, company.id, parsed.data)

  const updated = await getCompanyBySlug(db, slug)
  return NextResponse.json(updated)
}
