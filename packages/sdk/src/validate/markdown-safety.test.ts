// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { describe, expect, it } from 'vitest'
import { assertMarkdownSafe, checkMarkdownSafety } from './markdown-safety'

describe('checkMarkdownSafety', () => {
  it('accepts plain markdown', () => {
    expect(checkMarkdownSafety('Hello, **world**!')).toEqual({ ok: true })
    expect(checkMarkdownSafety('# Heading\n\nA paragraph.')).toEqual({ ok: true })
    expect(checkMarkdownSafety('A list:\n- one\n- two\n- three')).toEqual({ ok: true })
  })

  it('accepts the empty string and non-string inputs', () => {
    expect(checkMarkdownSafety('')).toEqual({ ok: true })
    // Non-string is treated as nothing to check (the schema-level validator
    // handles type errors; this gate only inspects strings).
    expect(checkMarkdownSafety(null as unknown as string)).toEqual({ ok: true })
    expect(checkMarkdownSafety(undefined as unknown as string)).toEqual({ ok: true })
  })

  it('rejects a raw <script> tag', () => {
    const r = checkMarkdownSafety('<script>alert(1)</script>')
    expect(r.ok).toBe(false)
    expect(r.reason).toBe('html-tag')
  })

  it('rejects HTML img-onerror payloads', () => {
    const r = checkMarkdownSafety('<img src=x onerror=alert(1)>')
    expect(r.ok).toBe(false)
    expect(r.reason).toBe('html-tag')
  })

  it('rejects an HTML tag embedded in otherwise-clean markdown', () => {
    // A renderer that processes HTML inside markdown would emit the tag
    // verbatim; reject before it reaches a renderer.
    const r = checkMarkdownSafety('Hello <b>world</b>!')
    expect(r.ok).toBe(false)
    expect(r.reason).toBe('html-tag')
  })

  it('rejects javascript: URIs in link targets', () => {
    const r = checkMarkdownSafety('[Click me](javascript:alert(1))')
    expect(r.ok).toBe(false)
    expect(r.reason).toBe('javascript-uri')
  })

  it('rejects javascript: URIs case-insensitively', () => {
    expect(checkMarkdownSafety('JAVASCRIPT:alert(1)').reason).toBe('javascript-uri')
    expect(checkMarkdownSafety('JaVaScRiPt:alert(1)').reason).toBe('javascript-uri')
  })

  it('rejects javascript: URIs with whitespace before the colon', () => {
    // Some encoders allow `javascript :` (note space) as a smuggling vector.
    const r = checkMarkdownSafety('[x](javascript :alert(1))')
    expect(r.ok).toBe(false)
    expect(r.reason).toBe('javascript-uri')
  })

  it('rejects data:text/html URIs', () => {
    // Use an HTML-tag-free payload so the data-html-uri rule fires (not
    // the html-tag rule which would otherwise short-circuit).
    const r = checkMarkdownSafety('[x](data:text/html,Hello)')
    expect(r.ok).toBe(false)
    expect(r.reason).toBe('data-html-uri')
  })

  it('accepts data:image/png URIs (NOT data:text/html)', () => {
    // Inline images via data: are legitimate; only data:text/html is rejected.
    expect(checkMarkdownSafety('![avatar](data:image/png;base64,iVBORw0KGgo...)').ok).toBe(true)
  })

  it('rejects HTML inside a fenced code block (paranoid)', () => {
    // Markdown renderers SHOULD escape inside fences, but some don't.
    // The safety gate is intentionally paranoid: brackets in input mean
    // brackets reach the renderer's output — escape upstream if needed.
    const r = checkMarkdownSafety('```\n<script>alert(1)</script>\n```')
    expect(r.ok).toBe(false)
    expect(r.reason).toBe('html-tag')
  })
})

describe('assertMarkdownSafe', () => {
  it('returns void on safe input', () => {
    expect(() => assertMarkdownSafe('plain text', 'persona.bio')).not.toThrow()
  })

  it('throws with field name on unsafe input', () => {
    expect(() => assertMarkdownSafe('<script>x</script>', 'persona.bio')).toThrow(
      /persona\.bio.*html-tag/
    )
  })
})
