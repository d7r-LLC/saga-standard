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
