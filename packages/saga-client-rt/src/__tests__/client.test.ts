// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { beforeEach, describe, expect, it, vi } from 'vitest'
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

  it('sendMessage() requires registered peer key', async () => {
    const { config, getWs } = createTestConfig()
    const { client } = await connectClient(config, getWs)

    await expect(
      client.sendMessage('bob@epicflow', {
        messageType: 'task-request',
        payload: { task: 'test' },
      })
    ).rejects.toThrow('No public key registered for bob@epicflow')
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
