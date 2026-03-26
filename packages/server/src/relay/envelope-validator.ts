// packages/server/src/relay/envelope-validator.ts
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

const VALID_TYPES = new Set(['memory-sync', 'direct-message', 'group-message'])
const VALID_SCOPES = new Set(['private', 'mutual', 'group', 'self'])

export interface EnvelopeValidationError {
  field: string
  message: string
}

/**
 * Validate that an object has the required envelope shape for relay routing.
 * Does NOT validate ciphertext content — the relay never decrypts.
 * Returns null on success, an error object on failure.
 */
export function validateEnvelope(obj: unknown): EnvelopeValidationError | null {
  if (typeof obj !== 'object' || obj === null) {
    return { field: 'envelope', message: 'Envelope must be a non-null object' }
  }

  const e = obj as Record<string, unknown>

  if (e.v !== 1) {
    return { field: 'v', message: 'Unsupported envelope version' }
  }

  if (typeof e.type !== 'string' || !VALID_TYPES.has(e.type)) {
    return { field: 'type', message: 'Invalid or missing envelope type' }
  }

  if (typeof e.scope !== 'string' || !VALID_SCOPES.has(e.scope)) {
    return { field: 'scope', message: 'Invalid or missing envelope scope' }
  }

  if (typeof e.from !== 'string' || e.from.length === 0) {
    return { field: 'from', message: 'Missing sender identity' }
  }

  if (typeof e.to === 'string') {
    if (e.to.length === 0) {
      return { field: 'to', message: 'Missing recipient' }
    }
  } else if (Array.isArray(e.to)) {
    if (
      e.to.length === 0 ||
      !e.to.every((t: unknown) => typeof t === 'string' && (t as string).length > 0)
    ) {
      return { field: 'to', message: 'Invalid recipient list' }
    }
  } else {
    return { field: 'to', message: 'Recipient must be a string or string array' }
  }

  if (typeof e.ct !== 'string' || e.ct.length === 0) {
    return { field: 'ct', message: 'Missing ciphertext' }
  }

  if (typeof e.ts !== 'string' || e.ts.length === 0) {
    return { field: 'ts', message: 'Missing timestamp' }
  }

  if (typeof e.id !== 'string' || e.id.length === 0) {
    return { field: 'id', message: 'Missing message ID' }
  }

  return null
}
