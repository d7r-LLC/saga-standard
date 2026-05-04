// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

/**
 * Phase 6 (A-Low#7) — markdown XSS-vector rejection.
 *
 * SAGA documents carry user-authored markdown in persona / cognitive layer
 * fields (`identity.summary`, `cognitive.systemPrompt`, etc.). When a UI
 * renders that markdown back to HTML, raw `<script>` tags or
 * `javascript:` URIs in a link target become live attack surface.
 *
 * `checkMarkdownSafety()` is a defense-in-depth gate at the SDK boundary:
 *   - Reject any HTML tag (`<script>`, `<img onerror=...>`, etc.).
 *   - Reject any `javascript:` URI scheme.
 *   - Reject any `data:text/html` URI scheme (HTML smuggling).
 *
 * This is NOT a substitute for output-side sanitization (DOMPurify or
 * equivalent) at render time. Frontends MUST sanitize before innerHTML.
 * The validator catches the obvious vectors so they're stopped before
 * they ever reach a renderer in the first place.
 */
export type MarkdownSafetyReason = 'html-tag' | 'javascript-uri' | 'data-html-uri'

export interface MarkdownSafetyResult {
  ok: boolean
  reason?: MarkdownSafetyReason
}

const HTML_TAG = /<\s*[a-zA-Z][\s\S]*?>/
const JS_URI = /\bjavascript\s*:/i
const DATA_HTML = /\bdata\s*:\s*text\/html\b/i

/**
 * Inspect a markdown string for the three rejection patterns above. Returns
 * `{ ok: true }` when the string is safe per the rules; otherwise returns
 * `{ ok: false, reason: ... }` so callers can surface a clear validation
 * error.
 *
 * Note: code fences and inline code (`<...>` inside `` `...` ``) are NOT
 * given a pass — that would let an attacker hide a `<script>` inside a
 * fence that some renderers process as raw HTML. If a use case genuinely
 * needs to display angle-bracket text, the caller should escape the
 * brackets (`&lt;`, `&gt;`) before calling this validator.
 */
export function checkMarkdownSafety(s: string): MarkdownSafetyResult {
  if (typeof s !== 'string' || s.length === 0) return { ok: true }
  if (HTML_TAG.test(s)) return { ok: false, reason: 'html-tag' }
  if (JS_URI.test(s)) return { ok: false, reason: 'javascript-uri' }
  if (DATA_HTML.test(s)) return { ok: false, reason: 'data-html-uri' }
  return { ok: true }
}

/**
 * Convenience: throws when the string is unsafe. Used by callers that prefer
 * to fail loudly rather than branch on a result object.
 */
export function assertMarkdownSafe(s: string, fieldName: string): void {
  const r = checkMarkdownSafety(s)
  if (!r.ok) {
    throw new Error(`Field "${fieldName}" rejected by markdown safety check: ${r.reason}`)
  }
}
