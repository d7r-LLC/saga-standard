// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { describe, expect, it, vi } from 'vitest'
import type { MessageRouterCallbacks, SagaEncryptedEnvelope } from '../types'
import { createMessageRouter } from '../message-router'
import { createDedup } from '../dedup'

function fakeEnvelope(overrides?: Partial<SagaEncryptedEnvelope>): SagaEncryptedEnvelope {
  return {
    v: 1,
    type: 'direct-message',
    scope: 'mutual',
    from: 'bob@epicflow',
    to: 'alice@epicflow',
    ct: 'base64ciphertext',
    ts: '2026-01-01T00:00:00Z',
    id: crypto.randomUUID(),
    ...overrides,
  } as SagaEncryptedEnvelope
}

function createMockCallbacks(): MessageRouterCallbacks {
  return {
    onDirectMessage: vi.fn(),
    onGroupMessage: vi.fn(),
    onMemorySync: vi.fn(),
  }
}

describe('createMessageRouter', () => {
  it('routes direct-message to onDirectMessage', async () => {
    const callbacks = createMockCallbacks()
    const message = { messageType: 'task-request', payload: { task: 'hello' } }
    const decrypt = vi.fn().mockResolvedValue(new TextEncoder().encode(JSON.stringify(message)))
    const router = createMessageRouter(decrypt, createDedup(), callbacks)

    const envelope = fakeEnvelope({ type: 'direct-message', from: 'bob@epicflow' })
    await router.handleEnvelope(envelope)

    expect(callbacks.onDirectMessage).toHaveBeenCalledWith('bob@epicflow', message)
    expect(callbacks.onGroupMessage).not.toHaveBeenCalled()
    expect(callbacks.onMemorySync).not.toHaveBeenCalled()
  })

  it('routes group-message to onGroupMessage', async () => {
    const callbacks = createMockCallbacks()
    const message = { messageType: 'coordination', payload: { action: 'sync' } }
    const decrypt = vi.fn().mockResolvedValue(new TextEncoder().encode(JSON.stringify(message)))
    const router = createMessageRouter(decrypt, createDedup(), callbacks)

    const envelope = fakeEnvelope({
      type: 'group-message',
      scope: 'group',
      from: 'bob@epicflow',
      to: 'group:team-alpha',
      groupKeyId: 'team-alpha',
    })
    await router.handleEnvelope(envelope)

    expect(callbacks.onGroupMessage).toHaveBeenCalledWith('team-alpha', 'bob@epicflow', message)
  })

  it('routes memory-sync to onMemorySync', async () => {
    const callbacks = createMockCallbacks()
    const memory = {
      id: 'mem-1',
      type: 'episodic',
      content: 'learned X',
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    }
    const decrypt = vi.fn().mockResolvedValue(new TextEncoder().encode(JSON.stringify(memory)))
    const router = createMessageRouter(decrypt, createDedup(), callbacks)

    const envelope = fakeEnvelope({
      type: 'memory-sync',
      scope: 'private',
      from: 'alice@epicflow',
      to: 'alice@epicflow',
    })
    await router.handleEnvelope(envelope)

    expect(callbacks.onMemorySync).toHaveBeenCalledWith('alice@epicflow', memory)
  })

  it('skips duplicate messages via dedup', async () => {
    const callbacks = createMockCallbacks()
    const decrypt = vi
      .fn()
      .mockResolvedValue(
        new TextEncoder().encode(JSON.stringify({ messageType: 'notification', payload: {} }))
      )
    const router = createMessageRouter(decrypt, createDedup(), callbacks)

    const envelope = fakeEnvelope({ id: 'dup-id' })
    await router.handleEnvelope(envelope)
    await router.handleEnvelope(envelope)

    expect(callbacks.onDirectMessage).toHaveBeenCalledTimes(1)
    expect(decrypt).toHaveBeenCalledTimes(1)
  })

  it('handleMailboxBatch processes envelopes and returns acked IDs', async () => {
    const callbacks = createMockCallbacks()
    const decrypt = vi
      .fn()
      .mockResolvedValue(
        new TextEncoder().encode(JSON.stringify({ messageType: 'notification', payload: {} }))
      )
    const router = createMessageRouter(decrypt, createDedup(), callbacks)

    const envelopes = [fakeEnvelope({ id: 'mb-1' }), fakeEnvelope({ id: 'mb-2' })]

    const acked = await router.handleMailboxBatch(envelopes)
    expect(acked).toEqual(['mb-1', 'mb-2'])
    expect(callbacks.onDirectMessage).toHaveBeenCalledTimes(2)
  })

  it('skips undecryptable envelopes in batch without failing', async () => {
    const callbacks = createMockCallbacks()
    const decrypt = vi
      .fn()
      .mockResolvedValueOnce(
        new TextEncoder().encode(JSON.stringify({ messageType: 'notification', payload: {} }))
      )
      .mockRejectedValueOnce(new Error('Missing peer key'))
      .mockResolvedValueOnce(
        new TextEncoder().encode(JSON.stringify({ messageType: 'notification', payload: {} }))
      )
    const router = createMessageRouter(decrypt, createDedup(), callbacks)

    const envelopes = [
      fakeEnvelope({ id: 'ok-1' }),
      fakeEnvelope({ id: 'fail-2' }),
      fakeEnvelope({ id: 'ok-3' }),
    ]

    const acked = await router.handleMailboxBatch(envelopes)
    expect(acked).toEqual(['ok-1', 'ok-3'])
    expect(callbacks.onDirectMessage).toHaveBeenCalledTimes(2)
  })

  it('passes envelope to decrypt function', async () => {
    const callbacks = createMockCallbacks()
    const decrypt = vi
      .fn()
      .mockResolvedValue(
        new TextEncoder().encode(JSON.stringify({ messageType: 'notification', payload: {} }))
      )
    const router = createMessageRouter(decrypt, createDedup(), callbacks)

    const envelope = fakeEnvelope()
    await router.handleEnvelope(envelope)

    expect(decrypt).toHaveBeenCalledWith(envelope)
  })
})
