// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

/**
 * Best-effort secret redaction for any text that may end up on a user
 * terminal, in a log file, or in an error message. Patterns are
 * intentionally broad — false positives (e.g. an unrelated 64-hex
 * string) are acceptable; false negatives (a real secret slipping
 * through) are not.
 *
 * Patterns covered:
 *   - 1Password service-account tokens (`ops_...`)
 *   - Hex private keys (0x + 64 hex chars; also bare 64 hex chars)
 *   - BIP-39-shaped mnemonic phrases (12/15/18/21/24 lowercase words
 *     separated by single spaces)
 *   - Any value of OP_SERVICE_ACCOUNT_TOKEN that already lives on
 *     `process.env` (caller passes the value to allow exact-match
 *     redaction independent of shape)
 *
 * The function does NOT log or otherwise side-effect; it just returns
 * a redacted copy of the input.
 */
export function scrubSecrets(input: string, knownLiterals: string[] = []): string {
  if (!input) return input
  let out = input

  // Exact-match redaction first — catches secrets whose shape we may
  // not have a regex for. Sorted longest-first so a longer literal
  // doesn't get partially replaced by a shorter substring.
  const literals = knownLiterals
    .filter(s => typeof s === 'string' && s.length >= 8)
    .sort((a, b) => b.length - a.length)
  for (const literal of literals) {
    if (literal && out.includes(literal)) {
      out = out.split(literal).join('***REDACTED***')
    }
  }

  // 1Password service-account token — well-known prefix `ops_` followed
  // by base64url payload, length ~80+. The minimum length guard avoids
  // false-positives on short identifiers.
  out = out.replace(/\bops_[A-Za-z0-9_-]{40,}\b/g, '***REDACTED-OP-TOKEN***')

  // Hex private key with 0x prefix — 0x followed by exactly 64 hex chars.
  out = out.replace(/\b0x[0-9a-fA-F]{64}\b/g, '***REDACTED-HEX-KEY***')

  // Bare 64-char hex (no 0x prefix), word-bounded.
  out = out.replace(/\b[0-9a-fA-F]{64}\b/g, '***REDACTED-HEX-KEY***')

  // BIP-39-shaped mnemonics. Look for runs of 12/15/18/21/24
  // lowercase-letter words separated by single spaces. Anchored at
  // word boundaries so it doesn't gobble surrounding punctuation.
  // Each word is 3-8 chars (BIP-39 wordlist range).
  const wordCounts = [24, 21, 18, 15, 12]
  for (const n of wordCounts) {
    const pattern = new RegExp(`\\b(?:[a-z]{3,8}\\s){${n - 1}}[a-z]{3,8}\\b`, 'g')
    out = out.replace(pattern, '***REDACTED-MNEMONIC***')
  }

  return out
}
