// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { beforeEach, describe, expect, it } from 'vitest'
import { app } from '../index'
import { createMockEnv, runMigrations } from './test-helpers'
import type { Env } from '../bindings'

let env: Env

beforeEach(async () => {
  env = createMockEnv()
  await runMigrations(env.DB)
})

// Phase 6 (O-Low#2) — CORS origin allowlist regression tests.
//
// `Access-Control-Allow-Origin` should ONLY echo back the origin when it's
// in the configured allowlist (or wildcard `*` is set). When the env var is
// unset OR the origin doesn't match, Hono's cors middleware emits no
// Access-Control-Allow-Origin header at all (which the browser interprets
// as "deny").
describe('CORS origin allowlist', () => {
  async function preflight(origin: string): Promise<Response> {
    return app.request(
      'http://localhost/v1/server',
      {
        method: 'OPTIONS',
        headers: {
          Origin: origin,
          'Access-Control-Request-Method': 'GET',
          'Access-Control-Request-Headers': 'content-type',
        },
      },
      env
    )
  }

  it('allows an origin listed in CORS_ALLOWED_ORIGINS', async () => {
    env.CORS_ALLOWED_ORIGINS = 'https://directory.d7r.io,https://other.example'
    const r = await preflight('https://directory.d7r.io')
    expect(r.headers.get('Access-Control-Allow-Origin')).toBe('https://directory.d7r.io')
  })

  it('rejects an unlisted origin (no ACAO header echoed)', async () => {
    env.CORS_ALLOWED_ORIGINS = 'https://directory.d7r.io'
    const r = await preflight('https://evil.example.com')
    // Hono's cors() either omits the header or returns the empty string when
    // origin() returns null. Either way, the browser treats this as denied.
    expect(r.headers.get('Access-Control-Allow-Origin')).not.toBe('https://evil.example.com')
  })

  it('honors the wildcard "*" for reference deploys', async () => {
    env.CORS_ALLOWED_ORIGINS = '*'
    const r = await preflight('https://anything.example.com')
    expect(r.headers.get('Access-Control-Allow-Origin')).toBe('https://anything.example.com')
  })

  it('rejects all origins when CORS_ALLOWED_ORIGINS is unset', async () => {
    // env.CORS_ALLOWED_ORIGINS intentionally not set
    const r = await preflight('https://directory.d7r.io')
    expect(r.headers.get('Access-Control-Allow-Origin')).not.toBe('https://directory.d7r.io')
  })

  it('trims whitespace in CORS_ALLOWED_ORIGINS entries', async () => {
    env.CORS_ALLOWED_ORIGINS = '  https://a.example  , https://b.example '
    const r = await preflight('https://a.example')
    expect(r.headers.get('Access-Control-Allow-Origin')).toBe('https://a.example')
  })
})
