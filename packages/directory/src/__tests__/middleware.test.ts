// Copyright 2026 d7r LLC
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest'
import { isSafeCallbackUrl } from '../middleware'

// Phase 6 (A-Med#13) — open-redirect prevention on the OIDC callback URL.
describe('isSafeCallbackUrl', () => {
  it('accepts a relative path that starts with /', () => {
    expect(isSafeCallbackUrl('/dashboard')).toBe(true)
    expect(isSafeCallbackUrl('/dashboard/agents/koda')).toBe(true)
    expect(isSafeCallbackUrl('/')).toBe(true)
  })

  it('rejects protocol-relative URLs (//evil.example.com)', () => {
    // Protocol-relative URLs resolve off-origin in browsers.
    expect(isSafeCallbackUrl('//evil.example.com/x')).toBe(false)
    expect(isSafeCallbackUrl('//')).toBe(false)
  })

  it('rejects absolute URLs (https://...)', () => {
    expect(isSafeCallbackUrl('https://evil.example.com')).toBe(false)
    expect(isSafeCallbackUrl('http://evil.example.com')).toBe(false)
  })

  it('rejects javascript: URIs', () => {
    expect(isSafeCallbackUrl('javascript:alert(1)')).toBe(false)
    expect(isSafeCallbackUrl('JAVASCRIPT:alert(1)')).toBe(false)
  })

  it('rejects data: URIs', () => {
    expect(isSafeCallbackUrl('data:text/html,<script>alert(1)</script>')).toBe(
      false,
    )
  })

  it('rejects empty / null / undefined', () => {
    expect(isSafeCallbackUrl('')).toBe(false)
    expect(isSafeCallbackUrl(null)).toBe(false)
    expect(isSafeCallbackUrl(undefined)).toBe(false)
  })

  it('rejects relative paths that do not start with /', () => {
    expect(isSafeCallbackUrl('dashboard')).toBe(false)
    expect(isSafeCallbackUrl('./dashboard')).toBe(false)
    expect(isSafeCallbackUrl('../escape')).toBe(false)
  })

  it('rejects non-string inputs', () => {
    // The `.startsWith` check would crash on non-strings; the typeof guard
    // closes that.
    expect(isSafeCallbackUrl(123 as unknown as string)).toBe(false)
    expect(isSafeCallbackUrl({} as unknown as string)).toBe(false)
  })
})
