// Copyright 2026 d7r LLC
// SPDX-License-Identifier: Apache-2.0

export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getCloudflareContext } from '@opennextjs/cloudflare'

export async function GET() {
  const { env } = await getCloudflareContext()

  let dbStatus = 'ok'
  try {
    const result = await env.DB.prepare('SELECT 1').first()
    if (!result) dbStatus = 'error'
  } catch {
    dbStatus = 'error'
  }

  const status = dbStatus === 'ok' ? 200 : 503

  return NextResponse.json(
    {
      status: dbStatus === 'ok' ? 'ok' : 'degraded',
      service: 'flowstate-directory',
      version: '0.1.0',
      db: dbStatus,
      timestamp: new Date().toISOString(),
    },
    { status },
  )
}
