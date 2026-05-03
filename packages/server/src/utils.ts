// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

/** Handle validation pattern — shared across all routes */
export const HANDLE_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9._-]{1,62}[a-zA-Z0-9]$/

/** Parse a numeric query param with a fallback for NaN/missing values */
export function parseIntParam(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback
  const parsed = parseInt(value, 10)
  return Number.isNaN(parsed) ? fallback : parsed
}

/** Compute SHA-256 checksum, returned as `sha256:<hex>` prefixed string */
export async function computeChecksum(data: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', data)
  const hex = Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
  return `sha256:${hex}`
}

/**
 * Validate an Ed25519 public key supplied at the API boundary.
 *
 * Accepts only:
 *   - Standard base64 encoding (RFC 4648), 44 characters including the
 *     trailing "=" padding for a 32-byte payload.
 *   - No whitespace, no `-_` URL-safe alphabet (server emits standard b64;
 *     callers must too for round-trip stability).
 *
 * Rejects:
 *   - Empty, missing, or non-string input.
 *   - Wrong length (Ed25519 public keys are exactly 32 bytes → 44 b64 chars).
 *   - Characters outside the standard base64 alphabet.
 *   - Decode-time errors (handled via a safe try/decode probe).
 *
 * Returns `true` when the input is a 44-char standard-base64 string that
 * decodes to exactly 32 bytes. The check uses `atob().length` rather than
 * round-tripping to a `Uint8Array`, which is sufficient for length validation
 * without allocating the byte array.
 *
 * Used by `POST /v1/agents` to reject malformed `publicKey` payloads before
 * they reach storage. The orgs route does not currently accept publicKey;
 * if it ever does, apply this same helper. See Phase 2 of the 2026-05-03
 * security remediation (finding O-Med#3).
 */
export function isValidEd25519PublicKey(input: unknown): input is string {
  if (typeof input !== 'string') return false
  if (input.length !== 44) return false
  // Standard base64 alphabet only; padding required at end.
  if (!/^[A-Za-z0-9+/]{43}=$/.test(input)) return false
  try {
    // atob is available in the Cloudflare Workers runtime.
    const decoded = atob(input)
    return decoded.length === 32
  } catch {
    return false
  }
}
