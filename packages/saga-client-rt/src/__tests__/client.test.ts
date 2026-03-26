// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SagaClientConfig, SagaEncryptedEnvelope, SagaMemory } from '../types'
import { createSagaClient } from '../client'
import { MockWebSocket, createMockSigner, simulateAuthFlow } from './test-helpers'

// Mock @epicdm/saga-crypto
vi.mock('@epicdm/saga-crypto', () => {
  const mockStore = {
    _data: new Map<string, unknown>(),
    put: vi.fn(async (key: string, value: unknown) => {
      mockStore._data.set(key, value)
    }),
    get: vi.fn(async (key: string) => {
      return mockStore._data.get(key) ?? null
    }),
    delete: vi.fn(async (key: string) => {
      mockStore._data.delete(key)
    }),
    query: vi.fn(async (filter: { prefix?: string }) => {
      const entries: Array<{ key: string; value: unknown }> = []
      for (const [key, value] of mockStore._data) {
        if (!filter.prefix || key.startsWith(filter.prefix)) {
          entries.push({ key, value })
        }
      }
      return entries
    }),
  }

  let envelopeCounter = 0

  return {
    seal: vi.fn(async (payload: Record<string, unknown>) => ({
      v: 1,
      type: payload.type,
      scope: payload.scope,
      from: payload.from,
      to: payload.to,
      ct: 'mock-ciphertext',
      ts: new Date().toISOString(),
      id: `mock-envelope-${++envelopeCounter}`,
    })),
    open: vi.fn(async (_envelope: SagaEncryptedEnvelope) => {
      // Return the "plaintext" that was "encrypted"
      return new TextEncoder().encode(
        JSON.stringify({ messageType: 'notification', payload: { text: 'hello' } })
      )
    }),
    createEncryptedStore: vi.fn(() => mockStore),
    MemoryBackend: vi.fn().mockImplementation(() => ({})),
    // Access mock store for assertions
    _mockStore: mockStore,
  }
})

function createTestConfig(overrides?: Partial<SagaClientConfig>): {
  config: SagaClientConfig
  getWs: () => MockWebSocket
} {
  let ws!: MockWebSocket
  const config: SagaClientConfig = {
    hubUrl: 'wss://test.example.com/v1/relay',
    identity: 'alice@epicflow',
    keyRing: {
      isUnlocked: true,
      getPublicKey: () => new Uint8Array(32),
      hasGroupKey: vi.fn().mockReturnValue(true),
    } as unknown as SagaClientConfig['keyRing'],
    signer: createMockSigner(),
    createWebSocket: () => {
      ws = new MockWebSocket()
      return ws
    },
    ...overrides,
  }
  return { config, getWs: () => ws }
}

async function connectClient(config: SagaClientConfig, getWs: () => MockWebSocket) {
  const client = createSagaClient(config)
  const connectPromise = client.connect()
  const ws = getWs()
  await simulateAuthFlow(ws, 'alice')
  ws.simulateMessage({ type: 'mailbox:batch', envelopes: [], remaining: 0 })
  await connectPromise
  return { client, ws }
}

describe('createSagaClient', () => {
  beforeEach(async () => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    // Reset mock store data
    const crypto = vi.mocked(await import('@epicdm/saga-crypto'))
    ;(crypto as unknown as { _mockStore: { _data: Map<string, unknown> } })._mockStore._data.clear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('connect() resolves after auth handshake', async () => {
    const { config, getWs } = createTestConfig()
    const { client } = await connectClient(config, getWs)
    expect(client.isConnected()).toBe(true)
  })

  it('disconnect() closes the connection', async () => {
    const { config, getWs } = createTestConfig()
    const { client } = await connectClient(config, getWs)

    await client.disconnect()
    expect(client.isConnected()).toBe(false)
  })

  it('storeMemory() stores in local encrypted store', async () => {
    const { config, getWs } = createTestConfig()
    const { client } = await connectClient(config, getWs)
    const crypto = vi.mocked(await import('@epicdm/saga-crypto'))
    const mockStore = (crypto as unknown as { _mockStore: { put: ReturnType<typeof vi.fn> } })
      ._mockStore

    const memory: SagaMemory = {
      id: 'mem-1',
      type: 'episodic',
      content: { learned: 'TypeScript patterns' },
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    }

    await client.storeMemory(memory)
    expect(mockStore.put).toHaveBeenCalledWith('memory:mem-1', memory)
  })

  it('storeMemory() also pushes envelope through relay', async () => {
    const { config, getWs } = createTestConfig()
    const { client, ws } = await connectClient(config, getWs)
    const crypto = vi.mocked(await import('@epicdm/saga-crypto'))

    const memory: SagaMemory = {
      id: 'mem-1',
      type: 'episodic',
      content: { learned: 'something' },
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    }

    await client.storeMemory(memory)

    expect(crypto.seal).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'memory-sync',
        scope: 'private',
        from: 'alice@epicflow',
        to: 'alice@epicflow',
      }),
      expect.anything()
    )

    const relaySends = ws
      .allSent()
      .filter((m: unknown) => (m as Record<string, unknown>).type === 'relay:send')
    expect(relaySends.length).toBeGreaterThan(0)
  })

  it('queryMemory() returns filtered results from local store', async () => {
    const { config, getWs } = createTestConfig()
    const { client } = await connectClient(config, getWs)

    const mem1: SagaMemory = {
      id: 'mem-1',
      type: 'episodic',
      content: 'a',
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    }
    const mem2: SagaMemory = {
      id: 'mem-2',
      type: 'semantic',
      content: 'b',
      createdAt: '2026-01-02',
      updatedAt: '2026-01-02',
    }

    await client.storeMemory(mem1)
    await client.storeMemory(mem2)

    const episodic = await client.queryMemory({ type: 'episodic' })
    expect(episodic).toHaveLength(1)
    expect(episodic[0].id).toBe('mem-1')

    const all = await client.queryMemory({})
    expect(all).toHaveLength(2)
  })

  it('deleteMemory() removes from local store', async () => {
    const { config, getWs } = createTestConfig()
    const { client } = await connectClient(config, getWs)

    await client.storeMemory({
      id: 'mem-1',
      type: 'episodic',
      content: 'a',
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    })

    await client.deleteMemory('mem-1')

    const results = await client.queryMemory({})
    expect(results).toHaveLength(0)
  })

  it('sendMessage() attempts key discovery and throws when key not found', async () => {
    const mockFetchFn = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ error: 'Handle not found' }), { status: 404 })
      )
    const { config, getWs } = createTestConfig({ fetchFn: mockFetchFn })
    const { client } = await connectClient(config, getWs)

    await expect(
      client.sendMessage('bob@epicflow', {
        messageType: 'task-request',
        payload: { task: 'test' },
      })
    ).rejects.toThrow('No public key found for bob')
  })

  it('sendMessage() seals and sends through relay', async () => {
    const { config, getWs } = createTestConfig()
    const { client } = await connectClient(config, getWs)
    const crypto = vi.mocked(await import('@epicdm/saga-crypto'))

    client.registerPeerKey('bob@epicflow', new Uint8Array(32))

    const messageId = await client.sendMessage('bob@epicflow', {
      messageType: 'task-request',
      payload: { task: 'test' },
    })

    expect(messageId).toMatch(/^mock-envelope-/)
    expect(crypto.seal).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'direct-message',
        scope: 'mutual',
        from: 'alice@epicflow',
        to: 'bob@epicflow',
      }),
      expect.anything()
    )
  })

  it('onMessage() receives direct messages from relay', async () => {
    const { config, getWs } = createTestConfig()
    const { client, ws } = await connectClient(config, getWs)

    const handler = vi.fn()
    client.onMessage(handler)

    ws.simulateMessage({
      type: 'relay:deliver',
      envelope: {
        v: 1,
        type: 'direct-message',
        scope: 'mutual',
        from: 'bob@epicflow',
        to: 'alice@epicflow',
        ct: 'encrypted',
        ts: '2026-01-01T00:00:00Z',
        id: 'msg-from-bob',
      },
    })

    // Let the async handler settle
    await vi.waitFor(() => {
      if (handler.mock.calls.length === 0) throw new Error('waiting')
    })

    expect(handler).toHaveBeenCalledWith(
      'bob@epicflow',
      expect.objectContaining({ messageType: 'notification' })
    )
  })

  it('onMessage() returns unsubscribe function', async () => {
    const { config, getWs } = createTestConfig()
    const { client, ws } = await connectClient(config, getWs)

    const handler = vi.fn()
    const unsub = client.onMessage(handler)
    unsub()

    ws.simulateMessage({
      type: 'relay:deliver',
      envelope: {
        v: 1,
        type: 'direct-message',
        scope: 'mutual',
        from: 'bob@epicflow',
        to: 'alice@epicflow',
        ct: 'enc',
        ts: '2026-01-01T00:00:00Z',
        id: 'msg-2',
      },
    })

    // Advance fake timers by a small amount and flush microtasks
    await vi.advanceTimersByTimeAsync(100)
    expect(handler).not.toHaveBeenCalled()
  })

  it('onConnectionChange() emits connection state', async () => {
    const { config, getWs } = createTestConfig()
    const client = createSagaClient(config)

    const handler = vi.fn()
    client.onConnectionChange(handler)

    const connectPromise = client.connect()
    const ws = getWs()
    await simulateAuthFlow(ws, 'alice')
    ws.simulateMessage({ type: 'mailbox:batch', envelopes: [], remaining: 0 })
    await connectPromise

    expect(handler).toHaveBeenCalledWith(true)

    await client.disconnect()
    expect(handler).toHaveBeenCalledWith(false)
  })

  it('registerPeerKey() stores keys for sendMessage', async () => {
    const { config, getWs } = createTestConfig()
    const { client } = await connectClient(config, getWs)

    const key = new Uint8Array(32).fill(42)
    client.registerPeerKey('bob@epicflow', key)

    // Should not throw now
    await client.sendMessage('bob@epicflow', {
      messageType: 'notification',
      payload: {},
    })
  })

  it('getPeers() returns peers seen from incoming messages', async () => {
    const { config, getWs } = createTestConfig()
    const { client, ws } = await connectClient(config, getWs)

    expect(client.getPeers()).toEqual([])

    ws.simulateMessage({
      type: 'relay:deliver',
      envelope: {
        v: 1,
        type: 'direct-message',
        scope: 'mutual',
        from: 'bob@epicflow',
        to: 'alice@epicflow',
        ct: 'enc',
        ts: '2026-01-01T00:00:00Z',
        id: 'peer-msg-1',
      },
    })

    await vi.waitFor(() => {
      if (client.getPeers().length === 0) throw new Error('waiting')
    })

    const peers = client.getPeers()
    expect(peers).toHaveLength(1)
    expect(peers[0].handle).toBe('bob@epicflow')
  })

  it('sendGroupMessage() seals with group scope', async () => {
    const { config, getWs } = createTestConfig()
    const { client } = await connectClient(config, getWs)
    const crypto = vi.mocked(await import('@epicdm/saga-crypto'))

    await client.sendGroupMessage('team-alpha', {
      messageType: 'coordination',
      payload: { action: 'sync' },
    })

    expect(crypto.seal).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'group-message',
        scope: 'group',
        groupKeyId: 'team-alpha',
      }),
      expect.anything()
    )
  })
})

describe('sync-on-activation', () => {
  beforeEach(async () => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    // Reset mock store data
    const crypto = vi.mocked(await import('@epicdm/saga-crypto'))
    ;(crypto as unknown as { _mockStore: { _data: Map<string, unknown> } })._mockStore._data.clear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('sends sync-request after connection with epoch checkpoint when no checkpoint stored', async () => {
    const { config, getWs } = createTestConfig()
    const { ws } = await connectClient(config, getWs)

    // Wait for any async operations to settle
    await vi.waitFor(() => {
      const sent = ws.allSent<Record<string, unknown>>()
      const hasSyncRequest = sent.some(m => m.type === 'sync-request')
      if (!hasSyncRequest) throw new Error('Waiting for sync-request')
    })

    const sent = ws.allSent<Record<string, unknown>>()
    const syncRequest = sent.find(m => m.type === 'sync-request')
    expect(syncRequest).toBeDefined()
    expect(syncRequest!.since).toBe('1970-01-01T00:00:00.000Z')
  })

  it('sends sync-request with persisted checkpoint on reconnect', async () => {
    const { config, getWs } = createTestConfig()
    const { client, ws } = await connectClient(config, getWs)

    // Wait for first sync-request
    await vi.waitFor(() => {
      const sent = ws.allSent<Record<string, unknown>>()
      if (!sent.some(m => m.type === 'sync-request')) throw new Error('Waiting for sync-request')
    })

    // Simulate sync-response to set checkpoint
    const savedCheckpoint = '2026-03-01T12:00:00.000Z'
    ws.simulateMessage({
      type: 'sync-response',
      envelopes: [],
      checkpoint: savedCheckpoint,
      hasMore: false,
    })

    // Wait for store.put to be called with the checkpoint
    const cryptoModule = vi.mocked(await import('@epicdm/saga-crypto'))
    const mockStoreRef = (
      cryptoModule as unknown as { _mockStore: { _data: Map<string, unknown> } }
    )._mockStore
    await vi.waitFor(() => {
      if (!mockStoreRef._data.has('checkpoint:sync'))
        throw new Error('Waiting for checkpoint to be stored')
    })

    // Disconnect and reconnect
    await client.disconnect()
    const connectPromise2 = client.connect()
    const ws2 = getWs()
    await simulateAuthFlow(ws2, 'alice')
    ws2.simulateMessage({ type: 'mailbox:batch', envelopes: [], remaining: 0 })
    await connectPromise2

    // Wait for second sync-request with the saved checkpoint
    await vi.waitFor(() => {
      const sent = ws2.allSent<Record<string, unknown>>()
      const hasSyncRequest = sent.some(m => m.type === 'sync-request')
      if (!hasSyncRequest) throw new Error('Waiting for sync-request on reconnect')
    })

    const sent2 = ws2.allSent<Record<string, unknown>>()
    const syncRequest2 = sent2.find(m => m.type === 'sync-request')
    expect(syncRequest2).toBeDefined()
    expect(syncRequest2!.since).toBe(savedCheckpoint)
  })

  it('requests more when hasMore is true', async () => {
    const { config, getWs } = createTestConfig()
    const { ws } = await connectClient(config, getWs)

    // Wait for first sync-request
    await vi.waitFor(() => {
      if (!ws.allSent<Record<string, unknown>>().some(m => m.type === 'sync-request'))
        throw new Error('Waiting for sync-request')
    })

    // Clear sent messages so we can check for new ones
    ws.sent.length = 0

    const nextCheckpoint = '2026-02-15T00:00:00.000Z'
    ws.simulateMessage({
      type: 'sync-response',
      envelopes: [],
      checkpoint: nextCheckpoint,
      hasMore: true,
    })

    // Wait for a follow-up sync-request with the new checkpoint
    await vi.waitFor(() => {
      const sent = ws.allSent<Record<string, unknown>>()
      const hasSyncRequest = sent.some(m => m.type === 'sync-request')
      if (!hasSyncRequest) throw new Error('Waiting for follow-up sync-request')
    })

    const sent = ws.allSent<Record<string, unknown>>()
    const syncRequest = sent.find(m => m.type === 'sync-request')
    expect(syncRequest).toBeDefined()
    expect(syncRequest!.since).toBe(nextCheckpoint)
  })

  it('stops requesting when hasMore is false', async () => {
    const { config, getWs } = createTestConfig()
    const { ws } = await connectClient(config, getWs)

    // Wait for first sync-request
    await vi.waitFor(() => {
      if (!ws.allSent<Record<string, unknown>>().some(m => m.type === 'sync-request'))
        throw new Error('Waiting for sync-request')
    })

    // Clear sent messages
    ws.sent.length = 0

    ws.simulateMessage({
      type: 'sync-response',
      envelopes: [],
      checkpoint: '2026-03-01T00:00:00.000Z',
      hasMore: false,
    })

    // Give time for any async operations
    await vi.advanceTimersByTimeAsync(100)

    const sent = ws.allSent<Record<string, unknown>>()
    const extraSyncRequests = sent.filter(m => m.type === 'sync-request')
    expect(extraSyncRequests).toHaveLength(0)
  })
})

describe('group key distribution', () => {
  beforeEach(async () => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    const crypto = vi.mocked(await import('@epicdm/saga-crypto'))
    ;(crypto as unknown as { _mockStore: { _data: Map<string, unknown> } })._mockStore._data.clear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('distributeGroupKey sends key-distribution DM to each member', async () => {
    const mockWrapGroupKeyFor = vi.fn().mockReturnValue({
      ciphertext: new Uint8Array([1, 2, 3]),
      nonce: new Uint8Array([4, 5, 6]),
    })

    const { config, getWs } = createTestConfig({
      keyRing: {
        isUnlocked: true,
        getPublicKey: () => new Uint8Array(32),
        hasGroupKey: vi.fn().mockReturnValue(true),
        wrapGroupKeyFor: mockWrapGroupKeyFor,
        addGroupKey: vi.fn(),
      } as unknown as SagaClientConfig['keyRing'],
    })

    const { client, ws } = await connectClient(config, getWs)

    // Register peer keys for members
    client.registerPeerKey('bob@epicflow', new Uint8Array(32).fill(1))
    client.registerPeerKey('carol@epicflow', new Uint8Array(32).fill(2))

    await client.distributeGroupKey('team-alpha', [
      'alice@epicflow', // self — should be skipped
      'bob@epicflow',
      'carol@epicflow',
    ])

    // Should have called wrapGroupKeyFor for bob and carol (not alice)
    expect(mockWrapGroupKeyFor).toHaveBeenCalledTimes(2)

    // Should have sent relay:send messages for bob and carol
    const sent = ws.allSent<Record<string, unknown>>()
    const relaySends = sent.filter(m => m.type === 'relay:send')
    // At least 2 relay:send for key-distribution (plus possibly memory-sync from connect)
    const keyDistSends = relaySends.filter(m => {
      const env = m.envelope as Record<string, unknown>
      return env.type === 'direct-message'
    })
    expect(keyDistSends.length).toBeGreaterThanOrEqual(2)
  })

  it('handles incoming key-distribution message and injects group key', async () => {
    const mockAddGroupKey = vi.fn()
    const { config, getWs } = createTestConfig({
      keyRing: {
        isUnlocked: true,
        getPublicKey: () => new Uint8Array(32),
        hasGroupKey: vi.fn().mockReturnValue(false),
        wrapGroupKeyFor: vi.fn(),
        addGroupKey: mockAddGroupKey,
      } as unknown as SagaClientConfig['keyRing'],
    })

    const { client: _client, ws } = await connectClient(config, getWs)

    // Register sender's public key so key resolver can find it
    _client.registerPeerKey('bob@epicflow', new Uint8Array(32).fill(1))

    // Override the open mock to return key-distribution payload
    const crypto = vi.mocked(await import('@epicdm/saga-crypto'))
    crypto.open.mockImplementationOnce(async () => {
      return new TextEncoder().encode(
        JSON.stringify({
          messageType: 'key-distribution',
          payload: {
            groupId: 'team-alpha',
            wrappedKey: {
              ciphertext: btoa(String.fromCharCode(1, 2, 3)),
              nonce: btoa(String.fromCharCode(4, 5, 6)),
            },
          },
        })
      )
    })

    // Simulate receiving a key-distribution envelope
    ws.simulateMessage({
      type: 'relay:deliver',
      envelope: {
        v: 1,
        type: 'direct-message',
        scope: 'mutual',
        from: 'bob@epicflow',
        to: 'alice@epicflow',
        ct: 'encrypted-key-data',
        ts: '2026-01-01T00:00:00Z',
        id: 'key-dist-001',
      },
    })

    await vi.waitFor(() => {
      if (mockAddGroupKey.mock.calls.length === 0) throw new Error('waiting')
    })

    expect(mockAddGroupKey).toHaveBeenCalledWith(
      'team-alpha',
      expect.objectContaining({
        ciphertext: expect.any(Uint8Array),
        nonce: expect.any(Uint8Array),
      }),
      expect.any(Uint8Array) // senderPublicKey
    )
  })
})

describe('governance — storeMemory', () => {
  beforeEach(async () => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    const crypto = vi.mocked(await import('@epicdm/saga-crypto'))
    ;(crypto as unknown as { _mockStore: { _data: Map<string, unknown> } })._mockStore._data.clear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('stores org-internal memory in company store only and does not sync', async () => {
    const mockCompanyKeyRing = {
      isUnlocked: true,
      getPublicKey: () => new Uint8Array(32).fill(99),
      hasGroupKey: vi.fn().mockReturnValue(false),
    } as unknown as SagaClientConfig['keyRing']

    const { config, getWs } = createTestConfig({
      governance: {
        orgId: 'acme-corp',
        policy: {
          orgId: 'acme-corp',
          defaultScope: 'agent-portable',
          restricted: { memoryTypes: ['procedural'] },
          retention: {},
        },
        companyKeyRing: mockCompanyKeyRing,
      },
    })

    const { client, ws } = await connectClient(config, getWs)

    const memory: SagaMemory = {
      id: 'mem-restricted',
      type: 'procedural',
      content: { steps: ['do this'] },
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    }

    await client.storeMemory(memory)

    // Should NOT have sent a relay:send for this memory (no sync)
    const sent = ws.allSent<Record<string, unknown>>()
    const relaySends = sent.filter(m => m.type === 'relay:send')
    const memorySyncs = relaySends.filter(m => {
      const env = m.envelope as Record<string, unknown> | undefined
      return env?.type === 'memory-sync'
    })
    expect(memorySyncs).toHaveLength(0)
  })

  it('stores agent-portable memory in agent store and syncs to hub', async () => {
    const { config, getWs } = createTestConfig({
      governance: {
        orgId: 'acme-corp',
        policy: {
          orgId: 'acme-corp',
          defaultScope: 'agent-portable',
          restricted: { memoryTypes: ['procedural'] },
          retention: {},
        },
        companyKeyRing: {
          isUnlocked: true,
          getPublicKey: () => new Uint8Array(32).fill(99),
          hasGroupKey: vi.fn().mockReturnValue(false),
        } as unknown as SagaClientConfig['keyRing'],
      },
    })

    const { client, ws } = await connectClient(config, getWs)

    const memory: SagaMemory = {
      id: 'mem-portable',
      type: 'episodic',
      content: { text: 'general learning' },
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    }

    await client.storeMemory(memory)

    // Should have synced (relay:send with memory-sync)
    const sent = ws.allSent<Record<string, unknown>>()
    const relaySends = sent.filter(m => m.type === 'relay:send')
    const memorySyncs = relaySends.filter(m => {
      const env = m.envelope as Record<string, unknown> | undefined
      return env?.type === 'memory-sync'
    })
    expect(memorySyncs.length).toBeGreaterThan(0)
  })

  it('behaves normally without governance config', async () => {
    const { config, getWs } = createTestConfig() // no governance
    const { client, ws } = await connectClient(config, getWs)

    const memory: SagaMemory = {
      id: 'mem-normal',
      type: 'procedural',
      content: { steps: ['do this'] },
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    }

    await client.storeMemory(memory)

    // Should sync as before
    const sent = ws.allSent<Record<string, unknown>>()
    const relaySends = sent.filter(m => m.type === 'relay:send')
    expect(relaySends.length).toBeGreaterThan(0)
  })
})
