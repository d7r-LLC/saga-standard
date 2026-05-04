// Copyright 2026 d7r LLC
// SPDX-License-Identifier: Apache-2.0

import { type NextRequest, NextResponse } from 'next/server'
import { SESSION_COOKIE_NAME } from '@/lib/session/constants'

/**
 * Phase 6 (A-Med#13): callback-URL validator. The connect flow forwards
 * `callbackUrl` to the post-auth redirect; we must NOT let an attacker
 * redirect users off-origin (open redirect → phishing). Accept ONLY
 * relative paths that start with `/` and don't start with `//` (which
 * is protocol-relative and resolves off-origin).
 */
export function isSafeCallbackUrl(
  url: string | null | undefined,
): url is string {
  if (typeof url !== 'string' || url === '') return false
  if (!url.startsWith('/')) return false
  if (url.startsWith('//')) return false
  return true
}

/**
 * Phase 6 (A-Med#10): build a per-request CSP header.
 *
 * - `script-src 'self' 'nonce-<nonce>'` — Next.js's hydration runtime
 *   emits inline `<script nonce="...">` tags. The nonce is generated per
 *   request and stamped onto both the CSP header and the inline scripts.
 * - `style-src 'self' 'unsafe-inline'` — styled-jsx ships inline `<style>`
 *   tags without nonces; tightening this requires a Next.js upgrade
 *   tracked separately.
 * - `connect-src` and `frame-src` allow WalletConnect's bridge + verify
 *   endpoints. No third-party RPC providers (the directory talks to its
 *   own server only).
 */
function buildCsp(nonce: string): string {
  return [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}'`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: https:`,
    `font-src 'self' data:`,
    `connect-src 'self' https://*.walletconnect.com wss://*.walletconnect.com`,
    `frame-src 'self' https://verify.walletconnect.com`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
    `upgrade-insecure-requests`,
  ].join('; ')
}

function generateNonce(): string {
  // Web Crypto is available in Edge runtime (where Next.js middleware runs).
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s)
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const sessionToken = request.cookies.get(SESSION_COOKIE_NAME)?.value

  // Build the response (redirect or pass-through), then attach the CSP +
  // nonce to whatever response we end up returning. Doing it once at the
  // bottom keeps every branch consistent.
  let response: NextResponse

  if (pathname.startsWith('/dashboard')) {
    if (!sessionToken) {
      const connectUrl = new URL('/connect', request.url)
      // Phase 6 (A-Med#13): only forward callbackUrl when it's safe.
      // pathname always starts with `/` and never with `//`, so it's
      // always safe coming from this branch — but apply the same gate
      // for symmetry with the explicit query-param case.
      if (isSafeCallbackUrl(pathname)) {
        connectUrl.searchParams.set('callbackUrl', pathname)
      }
      response = NextResponse.redirect(connectUrl)
    } else {
      response = NextResponse.next()
    }
  } else if (pathname === '/connect' && sessionToken) {
    // After-login redirect can come from a query param. Validate it.
    const requestedCallback = request.nextUrl.searchParams.get('callbackUrl')
    const target = isSafeCallbackUrl(requestedCallback)
      ? requestedCallback
      : '/dashboard'
    response = NextResponse.redirect(new URL(target, request.url))
  } else {
    response = NextResponse.next()
  }

  // Attach per-request CSP. The nonce is also exposed via the
  // `x-csp-nonce` header so server components can read it (e.g.
  // <Script nonce={...}> in a custom layout). We do NOT set
  // `unsafe-inline` on script-src; nonced hydration scripts are the
  // sanctioned path forward.
  const nonce = generateNonce()
  response.headers.set('Content-Security-Policy', buildCsp(nonce))
  response.headers.set('x-csp-nonce', nonce)

  return response
}

export const config = {
  // Apply middleware to ALL routes so the CSP header lands on every response.
  // The session-protection branches above only trigger on /dashboard and
  // /connect; other routes still get the CSP attached.
  matcher: [
    /*
     * Match all request paths except for static asset paths that Next.js
     * serves from /_next/static, /_next/image, and the favicon — those don't
     * need CSP and the noise would slow up hot reload.
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
}
