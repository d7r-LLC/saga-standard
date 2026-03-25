// Copyright 2026 d7r LLC
// SPDX-License-Identifier: Apache-2.0

import { type NextRequest, NextResponse } from 'next/server'
import { SESSION_COOKIE_NAME } from '@/lib/session/constants'

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const sessionToken = request.cookies.get(SESSION_COOKIE_NAME)?.value

  // Protected dashboard pages require session
  if (pathname.startsWith('/dashboard')) {
    if (!sessionToken) {
      const connectUrl = new URL('/connect', request.url)
      connectUrl.searchParams.set('callbackUrl', pathname)
      return NextResponse.redirect(connectUrl)
    }
  }

  // Redirect authenticated users away from connect page
  if (pathname === '/connect' && sessionToken) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/dashboard/:path*', '/connect'],
}
