// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({ status: 'ok', service: 'saga-directory' })
}
