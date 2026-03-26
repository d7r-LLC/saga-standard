// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { describe, expect, it } from 'vitest'
import { isClientMessage, isServerMessage, parseClientMessage } from '../relay/types'

describe('isClientMessage', () => {
  it('identifies auth:verify', () => {
    expect(
      isClientMessage({
        type: 'auth:verify',
        walletAddress: '0xabc',
        chain: 'eip155:8453',
        handle: 'alice',
        signature: '0xsig',
        challenge: 'saga-relay:nonce:123',
      })
    ).toBe(true)
  })

  it('identifies relay:send', () => {
    expect(isClientMessage({ type: 'relay:send', envelope: {} })).toBe(true)
  })

  it('identifies control:pong', () => {
    expect(isClientMessage({ type: 'control:pong' })).toBe(true)
  })

  it('identifies mailbox:drain', () => {
    expect(isClientMessage({ type: 'mailbox:drain' })).toBe(true)
  })

  it('identifies mailbox:ack', () => {
    expect(isClientMessage({ type: 'mailbox:ack', messageIds: ['a'] })).toBe(true)
  })

  it('rejects server message types', () => {
    expect(isClientMessage({ type: 'auth:challenge' })).toBe(false)
    expect(isClientMessage({ type: 'relay:deliver' })).toBe(false)
    expect(isClientMessage({ type: 'control:ping' })).toBe(false)
  })

  it('rejects null, non-object, missing type', () => {
    expect(isClientMessage(null)).toBe(false)
    expect(isClientMessage('string')).toBe(false)
    expect(isClientMessage(42)).toBe(false)
    expect(isClientMessage({})).toBe(false)
    expect(isClientMessage({ type: 123 })).toBe(false)
    expect(isClientMessage({ type: 'unknown' })).toBe(false)
  })

  it('rejects auth:verify with missing required fields', () => {
    expect(isClientMessage({ type: 'auth:verify' })).toBe(false)
    expect(isClientMessage({ type: 'auth:verify', walletAddress: '0x' })).toBe(false)
  })

  it('rejects relay:send with non-object envelope', () => {
    expect(isClientMessage({ type: 'relay:send' })).toBe(false)
    expect(isClientMessage({ type: 'relay:send', envelope: 'string' })).toBe(false)
    expect(isClientMessage({ type: 'relay:send', envelope: null })).toBe(false)
  })

  it('rejects mailbox:ack with invalid messageIds', () => {
    expect(isClientMessage({ type: 'mailbox:ack' })).toBe(false)
    expect(isClientMessage({ type: 'mailbox:ack', messageIds: 'not-array' })).toBe(false)
    expect(isClientMessage({ type: 'mailbox:ack', messageIds: [123] })).toBe(false)
  })
})

describe('isServerMessage', () => {
  it('identifies all server message types', () => {
    const types = [
      'auth:challenge',
      'auth:success',
      'auth:error',
      'relay:deliver',
      'relay:ack',
      'relay:error',
      'control:ping',
      'mailbox:batch',
      'error',
    ]
    for (const type of types) {
      expect(isServerMessage({ type })).toBe(true)
    }
  })

  it('rejects client message types', () => {
    expect(isServerMessage({ type: 'auth:verify' })).toBe(false)
    expect(isServerMessage({ type: 'relay:send' })).toBe(false)
  })
})

describe('parseClientMessage', () => {
  it('parses valid JSON client message', () => {
    const msg = parseClientMessage(JSON.stringify({ type: 'control:pong' }))
    expect(msg).toEqual({ type: 'control:pong' })
  })

  it('returns null for invalid JSON', () => {
    expect(parseClientMessage('not json')).toBeNull()
  })

  it('returns null for valid JSON but not a client message', () => {
    expect(parseClientMessage(JSON.stringify({ type: 'control:ping' }))).toBeNull()
    expect(parseClientMessage(JSON.stringify({ foo: 'bar' }))).toBeNull()
  })
})
