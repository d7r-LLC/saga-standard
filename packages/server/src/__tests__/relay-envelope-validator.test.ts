// packages/server/src/__tests__/relay-envelope-validator.test.ts
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { describe, expect, it } from 'vitest'
import { validateEnvelope } from '../relay/envelope-validator'

const validEnvelope = {
  v: 1,
  type: 'direct-message',
  scope: 'mutual',
  from: 'alice@epicflow',
  to: 'bob@epicflow',
  ct: 'base64ciphertext==',
  nonce: 'base64nonce==',
  ts: '2026-03-26T00:00:00.000Z',
  id: '550e8400-e29b-41d4-a716-446655440000',
}

describe('validateEnvelope', () => {
  it('accepts a valid envelope', () => {
    expect(validateEnvelope(validEnvelope)).toBeNull()
  })

  it('accepts envelope with array recipients', () => {
    expect(
      validateEnvelope({ ...validEnvelope, to: ['bob@epicflow', 'charlie@epicflow'] })
    ).toBeNull()
  })

  it('accepts all valid message types', () => {
    for (const type of ['memory-sync', 'direct-message', 'group-message']) {
      expect(validateEnvelope({ ...validEnvelope, type })).toBeNull()
    }
  })

  it('accepts all valid scopes', () => {
    for (const scope of ['private', 'mutual', 'group']) {
      expect(validateEnvelope({ ...validEnvelope, scope })).toBeNull()
    }
  })

  it('passes through unknown extra fields', () => {
    expect(validateEnvelope({ ...validEnvelope, wrappedDek: 'abc', groupKeyId: 'gk1' })).toBeNull()
  })

  it('rejects null', () => {
    expect(validateEnvelope(null)).toEqual({ field: 'envelope', message: expect.any(String) })
  })

  it('rejects non-object', () => {
    expect(validateEnvelope('string')).toEqual({ field: 'envelope', message: expect.any(String) })
  })

  it('rejects wrong version', () => {
    expect(validateEnvelope({ ...validEnvelope, v: 2 })).toEqual({
      field: 'v',
      message: expect.any(String),
    })
  })

  it('rejects invalid type', () => {
    expect(validateEnvelope({ ...validEnvelope, type: 'unknown' })).toEqual({
      field: 'type',
      message: expect.any(String),
    })
  })

  it('rejects invalid scope', () => {
    expect(validateEnvelope({ ...validEnvelope, scope: 'public' })).toEqual({
      field: 'scope',
      message: expect.any(String),
    })
  })

  it('rejects empty from', () => {
    expect(validateEnvelope({ ...validEnvelope, from: '' })).toEqual({
      field: 'from',
      message: expect.any(String),
    })
  })

  it('rejects empty to string', () => {
    expect(validateEnvelope({ ...validEnvelope, to: '' })).toEqual({
      field: 'to',
      message: expect.any(String),
    })
  })

  it('rejects empty to array', () => {
    expect(validateEnvelope({ ...validEnvelope, to: [] })).toEqual({
      field: 'to',
      message: expect.any(String),
    })
  })

  it('rejects to array with empty strings', () => {
    expect(validateEnvelope({ ...validEnvelope, to: ['bob', ''] })).toEqual({
      field: 'to',
      message: expect.any(String),
    })
  })

  it('rejects missing ciphertext', () => {
    expect(validateEnvelope({ ...validEnvelope, ct: '' })).toEqual({
      field: 'ct',
      message: expect.any(String),
    })
  })

  it('rejects missing timestamp', () => {
    expect(validateEnvelope({ ...validEnvelope, ts: '' })).toEqual({
      field: 'ts',
      message: expect.any(String),
    })
  })

  it('rejects missing id', () => {
    expect(validateEnvelope({ ...validEnvelope, id: '' })).toEqual({
      field: 'id',
      message: expect.any(String),
    })
  })
})
