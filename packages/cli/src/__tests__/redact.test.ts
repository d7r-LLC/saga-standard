// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC
//
// SECRET-SCANNER FALSE POSITIVES IN THIS FILE:
//
// The fixtures below are SYNTHETIC values constructed to exercise
// `scrubSecrets()`'s regexes. They look like real secrets BY DESIGN —
// that's the only way to verify the regexes engage at all. None of
// them authenticate to anything:
//
//   - `ops_eyJzaWduSW5BZGRyZXNzIjoiaHR0cHM6Ly9teS4xcGFzc3dvcmQuY29tIn0_abc123def456ghi789`
//     The base64 portion decodes to the PUBLIC 1Password sign-in URL
//     (`{"signInAddress":"https://my.1password.com"}`); the trailing
//     suffix is too short for a real 1P service-account token.
//   - `0x1234567890abcdef…` (64 hex)
//     All-low-bits hex; trivially identifiable as a placeholder.
//   - `zero one two three four five six seven eight nine alpha bravo`
//     Twelve made-up English words; not a valid BIP-39 wordlist entry.
//
// Allowlisted in `.gitleaksignore` (file:rule:line) for the local
// pre-commit scan. ALSO allowlist these fingerprints in the GitGuardian
// dashboard with the "False positive — synthetic redactor test fixture"
// rationale so CI alerts don't re-fire on every push.

import { describe, expect, it } from 'vitest'
import { scrubSecrets } from '../redact'

describe('scrubSecrets', () => {
  it('redacts 1Password service-account tokens', () => {
    const input =
      'token=ops_eyJzaWduSW5BZGRyZXNzIjoiaHR0cHM6Ly9teS4xcGFzc3dvcmQuY29tIn0_abc123def456ghi789'
    const out = scrubSecrets(input)
    expect(out).not.toContain('ops_eyJ')
    expect(out).toContain('***REDACTED-OP-TOKEN***')
  })

  it('redacts 0x-prefixed 64-char hex private keys', () => {
    const input = 'PRIVATE_KEY=0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef'
    const out = scrubSecrets(input)
    expect(out).not.toContain('0x1234567890abcdef')
    expect(out).toContain('***REDACTED-HEX-KEY***')
  })

  it('redacts bare 64-char hex strings', () => {
    const input = 'key: 1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef'
    const out = scrubSecrets(input)
    expect(out).toContain('***REDACTED-HEX-KEY***')
  })

  it('does NOT redact short hex (e.g. an address)', () => {
    const addr = '0x8f0BCeB40A136f3d34649820E3276e7f2cE477e3'
    expect(scrubSecrets(`signer=${addr}`)).toContain(addr)
  })

  it('redacts 12-word BIP-39-shaped mnemonics', () => {
    const input = 'mnemonic: zero one two three four five six seven eight nine alpha bravo'
    const out = scrubSecrets(input)
    expect(out).not.toContain('zero one two')
    expect(out).toContain('***REDACTED-MNEMONIC***')
  })

  it('redacts 24-word BIP-39-shaped mnemonics', () => {
    const words = Array.from({ length: 24 }, (_, i) => `word${i}`).join(' ')
    // Replace numeric suffixes with letters so the words match [a-z]{3,8}
    const phrase =
      'apple banana cherry date elder fig grape hazel iris juice kiwi lemon ' +
      'mango nectar olive papaya quince rose sage tomato umbrella violet walnut yam'
    const out = scrubSecrets(`seed: ${phrase}`)
    expect(out).not.toContain(phrase)
    expect(out).toContain('***REDACTED-MNEMONIC***')
    // Sanity: ensure the dummy words variable isn't accidentally used
    expect(words).toContain('word0')
  })

  it('redacts caller-supplied literal even if shape regex misses it', () => {
    const customSecret = 'sk-live-deadbeef-XYZ123'
    const input = `Authorization: Bearer ${customSecret} and something`
    const out = scrubSecrets(input, [customSecret])
    expect(out).not.toContain(customSecret)
    expect(out).toContain('***REDACTED***')
  })

  it('redacts longer literal before shorter to avoid partial replacement', () => {
    const longSecret = 'super-long-secret-token-deadbeef'
    const shortSecret = 'long-secret'
    const input = `value=${longSecret}`
    const out = scrubSecrets(input, [shortSecret, longSecret])
    expect(out).not.toContain(longSecret)
    expect(out).not.toContain(shortSecret)
  })

  it('ignores empty / very short literals to avoid pathological replacement', () => {
    const input = 'normal output text'
    const out = scrubSecrets(input, ['', 'ab', 'x'])
    expect(out).toBe(input)
  })

  it('returns empty string unchanged', () => {
    expect(scrubSecrets('')).toBe('')
  })

  it('handles multiple secret types in one string', () => {
    const input =
      'token=ops_eyJzaWduSW5BZGRyZXNzIjoiaHR0cHM6Ly9teS4xcGFzc3dvcmQuY29tIn0_abc123def456ghi789 ' +
      'key=0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef ' +
      'mnemonic=zero one two three four five six seven eight nine alpha bravo'
    const out = scrubSecrets(input)
    expect(out).toContain('***REDACTED-OP-TOKEN***')
    expect(out).toContain('***REDACTED-HEX-KEY***')
    expect(out).toContain('***REDACTED-MNEMONIC***')
    expect(out).not.toContain('ops_eyJ')
    expect(out).not.toContain('1234567890abcdef')
    expect(out).not.toContain('zero one two')
  })
})
