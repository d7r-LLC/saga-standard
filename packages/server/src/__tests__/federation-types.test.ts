// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { describe, expect, it } from 'vitest'
import {
  isFederationClientMessage,
  isRegularClientAttachment,
  parseFederationMessage,
} from '../relay/types'

describe('isFederationClientMessage', () => {
  it('recognizes valid federation:auth message', () => {
    expect(
      isFederationClientMessage({
        type: 'federation:auth',
        directoryId: 'hub-1',
        operatorWallet: '0xabc',
        signature: 'sig123',
        challenge: 'saga-federation:test:123',
      })
    ).toBe(true)
  })

  it('recognizes valid relay:forward message', () => {
    expect(
      isFederationClientMessage({
        type: 'relay:forward',
        envelope: {
          v: 1,
          type: 'direct-message',
          scope: 'mutual',
          from: 'a',
          to: 'b',
          ct: 'enc',
          ts: '2026-01-01',
          id: 'msg-1',
        },
        sourceDirectoryId: 'hub-1',
      })
    ).toBe(true)
  })

  it('recognizes control:pong', () => {
    expect(isFederationClientMessage({ type: 'control:pong' })).toBe(true)
  })

  it('rejects federation:auth missing fields', () => {
    expect(isFederationClientMessage({ type: 'federation:auth', directoryId: 'hub-1' })).toBe(false)
  })

  it('rejects relay:forward missing envelope', () => {
    expect(isFederationClientMessage({ type: 'relay:forward', sourceDirectoryId: 'hub-1' })).toBe(
      false
    )
  })

  it('rejects relay:forward with null envelope', () => {
    expect(
      isFederationClientMessage({
        type: 'relay:forward',
        envelope: null,
        sourceDirectoryId: 'hub-1',
      })
    ).toBe(false)
  })

  it('rejects unknown type', () => {
    expect(isFederationClientMessage({ type: 'unknown:message' })).toBe(false)
  })

  it('rejects non-object', () => {
    expect(isFederationClientMessage('string')).toBe(false)
    expect(isFederationClientMessage(null)).toBe(false)
    expect(isFederationClientMessage(42)).toBe(false)
  })
})

describe('parseFederationMessage', () => {
  it('parses valid federation JSON', () => {
    const msg = parseFederationMessage(
      JSON.stringify({
        type: 'federation:auth',
        directoryId: 'hub-1',
        operatorWallet: '0xabc',
        signature: 'sig123',
        challenge: 'saga-federation:test:123',
      })
    )
    expect(msg).not.toBeNull()
    expect(msg!.type).toBe('federation:auth')
  })

  it('returns null for invalid JSON', () => {
    expect(parseFederationMessage('not json')).toBeNull()
  })

  it('returns null for valid JSON but not a federation message', () => {
    expect(parseFederationMessage(JSON.stringify({ type: 'auth:verify' }))).toBeNull()
  })
})

describe('isRegularClientAttachment', () => {
  it('returns true for authenticated agent connection', () => {
    expect(
      isRegularClientAttachment({
        authenticated: true,
        state: {
          handle: 'alice',
          walletAddress: '0xabc',
          chain: 'eip155:84532',
          authenticatedAt: new Date().toISOString(),
          lastPong: Date.now(),
          lastNftCheck: Date.now(),
        },
      })
    ).toBe(true)
  })

  it('returns false for unauthenticated connection', () => {
    expect(
      isRegularClientAttachment({
        authenticated: false,
        challenge: 'saga-relay:test:123',
        expiresAt: new Date().toISOString(),
      })
    ).toBe(false)
  })

  it('returns false for federation connection', () => {
    expect(
      isRegularClientAttachment({
        authenticated: true,
        federation: true,
        directoryId: 'hub-1',
        operatorWallet: '0xabc',
      })
    ).toBe(false)
  })

  it('returns false for null', () => {
    expect(isRegularClientAttachment(null)).toBe(false)
  })
})
