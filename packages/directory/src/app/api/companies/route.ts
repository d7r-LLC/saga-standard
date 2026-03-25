// Copyright 2026 d7r LLC
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { getDb } from '@/db'
import { searchCompanies } from '@/db/queries/companies'
import { companySearchSchema } from '@/lib/validation/schemas'

export async function GET(request: NextRequest) {
  const { env } = await getCloudflareContext()
  const db = getDb(env.DB)

  const searchParams = Object.fromEntries(request.nextUrl.searchParams)
  const parsed = companySearchSchema.safeParse(searchParams)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'validation_error', message: parsed.error.message },
      { status: 400 },
    )
  }

  const result = await searchCompanies(db, parsed.data)
  return NextResponse.json(result)
}
