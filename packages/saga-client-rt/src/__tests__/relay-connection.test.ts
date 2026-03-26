// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  RelayConnectionCallbacks,
  RelayConnectionConfig,
  SagaEncryptedEnvelope,
} from '../types'
import { createRelayConnection } from '../relay-connection'
import { MockWebSocket, createMockSigner, simulateAuthFlow } from './test-helpers'

function createCallbacks(overrides?: Partial<RelayConnectionCallbacks>): RelayConnectionCallbacks {
  return {
    onEnvelope: vi.fn(),
    onMailboxBatch: vi.fn(),
    onConnectionChange: vi.fn(),
    onRelayAck: vi.fn(),
    onRelayError: vi.fn(),
    onError: vi.fn(),
    onSyncResponse: vi.fn(),
    ...overrides,
  }
}

describe('createRelayConnection', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('completes auth flow and resolves connect()', async () => {
    let ws!: MockWebSocket
    const callbacks = createCallbacks()
    const config: RelayConnectionConfig = {
      hubUrl: 'wss://test.example.com/v1/relay',
      handle: 'alice',
      signer: createMockSigner(),
      callbacks,
      createWebSocket: () => {
        ws = new MockWebSocket()
        return ws
      },
    }

    const conn = createRelayConnection(config)
    const connectPromise = conn.connect()

    await simulateAuthFlow(ws, 'alice')
    ws.simulateMessage({ type: 'mailbox:batch', envelopes: [], remaining: 0 })

    await connectPromise
    expect(conn.isConnected()).toBe(true)
    expect(callbacks.onConnectionChange).toHaveBeenCalledWith(true)
  })

  it('signs challenge with signer and sends auth:verify', async () => {
    let ws!: MockWebSocket
    const signer = createMockSigner()
    const conn = createRelayConnection({
      hubUrl: 'wss://test.example.com/v1/relay',
      handle: 'alice',
      signer,
      callbacks: createCallbacks(),
      createWebSocket: () => {
        ws = new MockWebSocket()
        return ws
      },
    })

    const connectPromise = conn.connect()
    ws.simulateOpen()

    ws.simulateMessage({
      type: 'auth:challenge',
      challenge: 'saga-relay:my-uuid:12345',
      expiresAt: '2026-12-31T00:00:00Z',
    })

    await vi.waitFor(() => {
      if (ws.sent.length === 0) throw new Error('waiting')
    })

    expect(signer.sign).toHaveBeenCalledWith('saga-relay:my-uuid:12345')
    const verify = ws.lastSent<Record<string, unknown>>()
    expect(verify).toMatchObject({
      type: 'auth:verify',
      walletAddress: signer.address,
      chain: signer.chain,
      handle: 'alice',
      signature: '0xmocksignature',
      challenge: 'saga-relay:my-uuid:12345',
    })

    // Complete to avoid dangling
    ws.simulateMessage({ type: 'auth:success', handle: 'alice' })
    ws.simulateMessage({ type: 'mailbox:batch', envelopes: [], remaining: 0 })
    await connectPromise
  })

  it('rejects connect() on auth:error', async () => {
    let ws!: MockWebSocket
    const conn = createRelayConnection({
      hubUrl: 'wss://test.example.com/v1/relay',
      handle: 'alice',
      signer: createMockSigner(),
      callbacks: createCallbacks(),
      createWebSocket: () => {
        ws = new MockWebSocket()
        return ws
      },
    })

    const connectPromise = conn.connect()
    ws.simulateOpen()
    ws.simulateMessage({
      type: 'auth:challenge',
      challenge: 'saga-relay:test:123',
      expiresAt: '2026-12-31T00:00:00Z',
    })

    await vi.waitFor(() => {
      if (ws.sent.length === 0) throw new Error('waiting')
    })

    ws.simulateMessage({ type: 'auth:error', error: 'NFT not found' })

    await expect(connectPromise).rejects.toThrow('NFT not found')
  })

  it('responds to control:ping with control:pong', async () => {
    let ws!: MockWebSocket
    const conn = createRelayConnection({
      hubUrl: 'wss://test.example.com/v1/relay',
      handle: 'alice',
      signer: createMockSigner(),
      callbacks: createCallbacks(),
      createWebSocket: () => {
        ws = new MockWebSocket()
        return ws
      },
    })

    const connectPromise = conn.connect()
    await simulateAuthFlow(ws, 'alice')
    ws.simulateMessage({ type: 'mailbox:batch', envelopes: [], remaining: 0 })
    await connectPromise

    ws.simulateMessage({ type: 'control:ping' })

    const pong = ws.lastSent<Record<string, string>>()
    expect(pong).toEqual({ type: 'control:pong' })
  })

  it('forwards relay:deliver to onEnvelope callback', async () => {
    let ws!: MockWebSocket
    const onEnvelope = vi.fn()
    const conn = createRelayConnection({
      hubUrl: 'wss://test.example.com/v1/relay',
      handle: 'alice',
      signer: createMockSigner(),
      callbacks: createCallbacks({ onEnvelope }),
      createWebSocket: () => {
        ws = new MockWebSocket()
        return ws
      },
    })

    const connectPromise = conn.connect()
    await simulateAuthFlow(ws, 'alice')
    ws.simulateMessage({ type: 'mailbox:batch', envelopes: [], remaining: 0 })
    await connectPromise

    const fakeEnvelope = {
      v: 1,
      type: 'direct-message',
      from: 'bob@dir',
      to: 'alice@dir',
      ct: 'abc',
      ts: '2026-01-01T00:00:00Z',
      id: 'msg-1',
      scope: 'mutual',
    }
    ws.simulateMessage({ type: 'relay:deliver', envelope: fakeEnvelope })

    expect(onEnvelope).toHaveBeenCalledWith(fakeEnvelope)
  })

  it('sends mailbox:drain after auth:success', async () => {
    let ws!: MockWebSocket
    const conn = createRelayConnection({
      hubUrl: 'wss://test.example.com/v1/relay',
      handle: 'alice',
      signer: createMockSigner(),
      callbacks: createCallbacks(),
      createWebSocket: () => {
        ws = new MockWebSocket()
        return ws
      },
    })

    const connectPromise = conn.connect()
    await simulateAuthFlow(ws, 'alice')
    ws.simulateMessage({ type: 'mailbox:batch', envelopes: [], remaining: 0 })
    await connectPromise

    const messages = ws.allSent<Record<string, unknown>>()
    const drainMsg = messages.find(m => m.type === 'mailbox:drain')
    expect(drainMsg).toEqual({ type: 'mailbox:drain' })
  })

  it('buffers messages when disconnected and drains on reconnect', async () => {
    let ws!: MockWebSocket
    const conn = createRelayConnection({
      hubUrl: 'wss://test.example.com/v1/relay',
      handle: 'alice',
      signer: createMockSigner(),
      callbacks: createCallbacks(),
      createWebSocket: () => {
        ws = new MockWebSocket()
        return ws
      },
    })

    const connectPromise = conn.connect()
    await simulateAuthFlow(ws, 'alice')
    ws.simulateMessage({ type: 'mailbox:batch', envelopes: [], remaining: 0 })
    await connectPromise

    // Disconnect
    ws.simulateClose(1006, 'Network error')

    // Buffer messages while disconnected
    const envelope1 = {
      v: 1,
      type: 'direct-message',
      scope: 'mutual',
      from: 'alice@dir',
      to: 'bob@dir',
      ct: 'ct1',
      ts: '2026-01-01T00:00:00Z',
      id: 'e1',
    } as SagaEncryptedEnvelope
    const envelope2 = {
      v: 1,
      type: 'direct-message',
      scope: 'mutual',
      from: 'alice@dir',
      to: 'bob@dir',
      ct: 'ct2',
      ts: '2026-01-01T00:00:01Z',
      id: 'e2',
    } as SagaEncryptedEnvelope
    conn.send(envelope1)
    conn.send(envelope2)

    // Trigger reconnect
    vi.advanceTimersByTime(1000)

    // Complete auth on new connection
    await simulateAuthFlow(ws, 'alice')
    ws.simulateMessage({ type: 'mailbox:batch', envelopes: [], remaining: 0 })

    // Buffered messages should have been sent
    const allMessages = ws.allSent<Record<string, unknown>>()
    const relaySends = allMessages.filter(m => m.type === 'relay:send')
    expect(relaySends).toHaveLength(2)
    expect((relaySends[0] as { envelope: { id: string } }).envelope.id).toBe('e1')
    expect((relaySends[1] as { envelope: { id: string } }).envelope.id).toBe('e2')
  })

  it('auto-reconnects with exponential backoff on close', async () => {
    let wsCount = 0
    let ws!: MockWebSocket
    const conn = createRelayConnection({
      hubUrl: 'wss://test.example.com/v1/relay',
      handle: 'alice',
      signer: createMockSigner(),
      callbacks: createCallbacks(),
      createWebSocket: () => {
        wsCount++
        ws = new MockWebSocket()
        return ws
      },
    })

    const connectPromise = conn.connect()
    await simulateAuthFlow(ws, 'alice')
    ws.simulateMessage({ type: 'mailbox:batch', envelopes: [], remaining: 0 })
    await connectPromise

    expect(wsCount).toBe(1)

    ws.simulateClose(1006, 'Network error')

    // First reconnect after 1s
    vi.advanceTimersByTime(999)
    expect(wsCount).toBe(1)
    vi.advanceTimersByTime(1)
    expect(wsCount).toBe(2)

    ws.simulateClose(1006, 'Network error')

    // Second reconnect after 2s
    vi.advanceTimersByTime(1999)
    expect(wsCount).toBe(2)
    vi.advanceTimersByTime(1)
    expect(wsCount).toBe(3)
  })

  it('stops reconnecting after disconnect()', async () => {
    let wsCount = 0
    let ws!: MockWebSocket
    const conn = createRelayConnection({
      hubUrl: 'wss://test.example.com/v1/relay',
      handle: 'alice',
      signer: createMockSigner(),
      callbacks: createCallbacks(),
      createWebSocket: () => {
        wsCount++
        ws = new MockWebSocket()
        return ws
      },
    })

    const connectPromise = conn.connect()
    await simulateAuthFlow(ws, 'alice')
    ws.simulateMessage({ type: 'mailbox:batch', envelopes: [], remaining: 0 })
    await connectPromise

    conn.disconnect()

    vi.advanceTimersByTime(120_000)
    expect(wsCount).toBe(1)
  })

  it('calls onConnectionChange on disconnect', async () => {
    let ws!: MockWebSocket
    const onConnectionChange = vi.fn()
    const conn = createRelayConnection({
      hubUrl: 'wss://test.example.com/v1/relay',
      handle: 'alice',
      signer: createMockSigner(),
      callbacks: createCallbacks({ onConnectionChange }),
      createWebSocket: () => {
        ws = new MockWebSocket()
        return ws
      },
    })

    const connectPromise = conn.connect()
    await simulateAuthFlow(ws, 'alice')
    ws.simulateMessage({ type: 'mailbox:batch', envelopes: [], remaining: 0 })
    await connectPromise

    expect(onConnectionChange).toHaveBeenCalledWith(true)
    onConnectionChange.mockClear()

    ws.simulateClose(1006, 'Network error')
    expect(onConnectionChange).toHaveBeenCalledWith(false)
  })

  it('forwards mailbox:batch to onMailboxBatch callback', async () => {
    let ws!: MockWebSocket
    const onMailboxBatch = vi.fn()
    const conn = createRelayConnection({
      hubUrl: 'wss://test.example.com/v1/relay',
      handle: 'alice',
      signer: createMockSigner(),
      callbacks: createCallbacks({ onMailboxBatch }),
      createWebSocket: () => {
        ws = new MockWebSocket()
        return ws
      },
    })

    const connectPromise = conn.connect()
    await simulateAuthFlow(ws, 'alice')

    const envelopes = [
      {
        v: 1,
        type: 'direct-message',
        scope: 'mutual',
        from: 'bob@dir',
        to: 'alice@dir',
        ct: 'ct',
        ts: '2026-01-01T00:00:00Z',
        id: 'mb-1',
      },
    ]
    ws.simulateMessage({ type: 'mailbox:batch', envelopes, remaining: 5 })
    await connectPromise

    expect(onMailboxBatch).toHaveBeenCalledWith(envelopes, 5)
  })

  describe('sync protocol', () => {
    it('sends sync-request to server', async () => {
      let ws!: MockWebSocket
      const conn = createRelayConnection({
        hubUrl: 'wss://test.example.com/v1/relay',
        handle: 'alice',
        signer: createMockSigner(),
        callbacks: createCallbacks(),
        createWebSocket: () => {
          ws = new MockWebSocket()
          return ws
        },
      })

      const connectPromise = conn.connect()
      await simulateAuthFlow(ws, 'alice')
      ws.simulateMessage({ type: 'mailbox:batch', envelopes: [], remaining: 0 })
      await connectPromise

      conn.sendSyncRequest('2026-01-01T00:00:00.000Z')

      const sent = ws.allSent<Record<string, unknown>>()
      const syncReq = sent.find(m => m.type === 'sync-request')
      expect(syncReq).toBeDefined()
      expect(syncReq!.since).toBe('2026-01-01T00:00:00.000Z')
    })

    it('sends sync-request with collections filter', async () => {
      let ws!: MockWebSocket
      const conn = createRelayConnection({
        hubUrl: 'wss://test.example.com/v1/relay',
        handle: 'alice',
        signer: createMockSigner(),
        callbacks: createCallbacks(),
        createWebSocket: () => {
          ws = new MockWebSocket()
          return ws
        },
      })

      const connectPromise = conn.connect()
      await simulateAuthFlow(ws, 'alice')
      ws.simulateMessage({ type: 'mailbox:batch', envelopes: [], remaining: 0 })
      await connectPromise

      conn.sendSyncRequest('2026-01-01T00:00:00.000Z', ['episodic'])

      const sent = ws.allSent<Record<string, unknown>>()
      const syncReq = sent.find(m => m.type === 'sync-request')
      expect(syncReq!.collections).toEqual(['episodic'])
    })

    it('invokes onSyncResponse callback on sync-response message', async () => {
      let ws!: MockWebSocket
      const onSyncResponse = vi.fn()
      const conn = createRelayConnection({
        hubUrl: 'wss://test.example.com/v1/relay',
        handle: 'alice',
        signer: createMockSigner(),
        callbacks: createCallbacks({ onSyncResponse }),
        createWebSocket: () => {
          ws = new MockWebSocket()
          return ws
        },
      })

      const connectPromise = conn.connect()
      await simulateAuthFlow(ws, 'alice')
      ws.simulateMessage({ type: 'mailbox:batch', envelopes: [], remaining: 0 })
      await connectPromise

      const syncResponse = {
        type: 'sync-response',
        envelopes: [{ id: 'env1', v: 1, type: 'memory-sync', ct: 'data' }],
        checkpoint: '2026-03-26T00:00:00.000Z',
        hasMore: false,
      }
      ws.simulateMessage(syncResponse)

      expect(onSyncResponse).toHaveBeenCalledWith(
        syncResponse.envelopes,
        syncResponse.checkpoint,
        syncResponse.hasMore
      )
    })

    it('does not throw when sendSyncRequest called while not connected', () => {
      const conn = createRelayConnection({
        hubUrl: 'wss://test.example.com/v1/relay',
        handle: 'alice',
        signer: createMockSigner(),
        callbacks: createCallbacks(),
        createWebSocket: () => new MockWebSocket(),
      })

      // Should not throw - just a no-op when not connected
      expect(() => conn.sendSyncRequest('2026-01-01T00:00:00.000Z')).not.toThrow()
    })
  })
})
