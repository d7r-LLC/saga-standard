// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

/**
 * JSON Canonicalization Scheme per RFC 8785.
 *
 * Produces deterministic JSON output suitable for signing:
 * - Object keys sorted lexicographically by UTF-16 code units
 * - Numbers in shortest normalized form
 * - Minimal string escape sequences
 * - No whitespace between tokens
 */
export function canonicalize(value: unknown): string {
  return serializeValue(value)
}

function serializeValue(value: unknown): string {
  if (value === null) return 'null'
  if (value === undefined) return 'null'

  switch (typeof value) {
    case 'boolean':
      return value ? 'true' : 'false'
    case 'number':
      return serializeNumber(value)
    case 'string':
      return serializeString(value)
    case 'object':
      if (Array.isArray(value)) {
        return serializeArray(value)
      }
      return serializeObject(value as Record<string, unknown>)
    default:
      return 'null'
  }
}

function serializeNumber(n: number): string {
  if (!isFinite(n)) return 'null'
  // Handle -0 → 0
  if (Object.is(n, -0)) return '0'
  // JSON.stringify already produces the shortest representation for numbers
  return JSON.stringify(n)
}

function serializeString(s: string): string {
  // JSON.stringify handles escaping, but we need minimal escapes per RFC 8785
  // JSON.stringify already uses minimal escapes for ASCII control chars
  return JSON.stringify(s)
}

function serializeArray(arr: unknown[]): string {
  const items = arr.map(item => serializeValue(item))
  return `[${items.join(',')}]`
}

function serializeObject(obj: Record<string, unknown>): string {
  const keys = Object.keys(obj).sort((a, b) => {
    // Sort by UTF-16 code units (JavaScript default string comparison)
    if (a < b) return -1
    if (a > b) return 1
    return 0
  })

  const entries = keys
    .filter(k => obj[k] !== undefined) // skip undefined values
    .map(k => `${serializeString(k)}:${serializeValue(obj[k])}`)

  return `{${entries.join(',')}}`
}
