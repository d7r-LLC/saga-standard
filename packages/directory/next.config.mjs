// Copyright 2026 d7r LLC
// SPDX-License-Identifier: Apache-2.0

import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare'

await initOpenNextCloudflareForDev()

/**
 * Phase 6 (A-Med#10): static security headers shipped on every response.
 * Per-request CSP with a fresh nonce is added by `src/middleware.ts` because
 * Next.js needs nonced inline hydration scripts. The headers below are the
 * static, non-nonce ones that don't change per request — the standard
 * defense-in-depth set used by every modern frontend deploy guide.
 */
const securityHeaders = [
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
  },
]

/** @type {import('next').NextConfig} */
const nextConfig = {
  pageExtensions: ['js', 'jsx', 'ts', 'tsx'],
  images: {
    unoptimized: true,
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ]
  },
  webpack: (config, { dev }) => {
    if (dev) {
      config.watchOptions = {
        ...config.watchOptions,
        poll: 1000,
        aggregateTimeout: 300,
        ignored: ['**/node_modules/**', '**/.next/**', '**/.git/**'],
      }
    }
    return config
  },
}

export default nextConfig
