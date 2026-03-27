// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryBackend, createSagaKeyRing } from '@epicdm/saga-crypto'
import type { SagaEncryptedEnvelope } from '@epicdm/saga-crypto'
import { createSagaClient } from '../client'
import type { SagaMemory } from '../types'
import { MockWebSocket, createMockSigner, simulateAuthFlow } from './test-helpers'

// Generate deterministic wallet keys for testing
const ALICE_WALLET_KEY = new Uint8Array(32).fill(1)
const BOB_WALLET_KEY = new Uint8Array(32).fill(2)

async function setupKeyRing(walletKey: Uint8Array) {
  const keyRing = createSagaKeyRing()
  await keyRing.unlockWallet(walletKey)
  return keyRing
}

describe('SagaClient integration', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('Alice stores memory locally and retrieves it', async () => {
    const keyRing = await setupKeyRing(ALICE_WALLET_KEY)
    let ws!: MockWebSocket

    const client = createSagaClient({
      hubUrl: 'wss://hub.example.com/v1/relay',
      identity: 'alice@epicflow',
      keyRing,
      signer: createMockSigner(),
      storageBackend: new MemoryBackend(),
      createWebSocket: () => {
        ws = new MockWebSocket()
        return ws
      },
    })

    const connectPromise = client.connect()
    await simulateAuthFlow(ws, 'alice')
    ws.simulateMessage({ type: 'mailbox:batch', envelopes: [], remaining: 0 })
    await connectPromise

    const memory: SagaMemory = {
      id: 'mem-integration-1',
      type: 'episodic',
      content: { learned: 'integration testing patterns' },
      createdAt: '2026-03-26T00:00:00Z',
      updatedAt: '2026-03-26T00:00:00Z',
    }

    await client.storeMemory(memory)

    const results = await client.queryMemory({ type: 'episodic' })
    expect(results).toHaveLength(1)
    expect(results[0].content).toEqual({ learned: 'integration testing patterns' })

    await client.deleteMemory('mem-integration-1')
    const afterDelete = await client.queryMemory({})
    expect(afterDelete).toHaveLength(0)
  })

  it('Alice sends direct message to Bob, Bob receives and decrypts', async () => {
    const aliceKeyRing = await setupKeyRing(ALICE_WALLET_KEY)
    const bobKeyRing = await setupKeyRing(BOB_WALLET_KEY)

    let aliceWs!: MockWebSocket
    let bobWs!: MockWebSocket

    const aliceClient = createSagaClient({
      hubUrl: 'wss://hub.example.com/v1/relay',
      identity: 'alice@epicflow',
      keyRing: aliceKeyRing,
      signer: createMockSigner({ address: '0xalice' }),
      storageBackend: new MemoryBackend(),
      createWebSocket: () => {
        aliceWs = new MockWebSocket()
        return aliceWs
      },
    })

    const bobClient = createSagaClient({
      hubUrl: 'wss://hub.example.com/v1/relay',
      identity: 'bob@epicflow',
      keyRing: bobKeyRing,
      signer: createMockSigner({ address: '0xbob' }),
      storageBackend: new MemoryBackend(),
      createWebSocket: () => {
        bobWs = new MockWebSocket()
        return bobWs
      },
    })

    // Connect both
    const aliceConnect = aliceClient.connect()
    await simulateAuthFlow(aliceWs, 'alice')
    aliceWs.simulateMessage({ type: 'mailbox:batch', envelopes: [], remaining: 0 })
    await aliceConnect

    const bobConnect = bobClient.connect()
    await simulateAuthFlow(bobWs, 'bob')
    bobWs.simulateMessage({ type: 'mailbox:batch', envelopes: [], remaining: 0 })
    await bobConnect

    // Register each other's public keys
    aliceClient.registerPeerKey('bob@epicflow', bobKeyRing.getPublicKey())
    bobClient.registerPeerKey('alice@epicflow', aliceKeyRing.getPublicKey())

    // Bob listens for messages
    const received = vi.fn()
    bobClient.onMessage(received)

    // Alice sends a message
    const messageId = await aliceClient.sendMessage('bob@epicflow', {
      messageType: 'task-request',
      payload: { task: 'review PR #14' },
    })

    expect(messageId).toBeTruthy()

    // Simulate relay delivery: extract Alice's sent envelope and deliver to Bob
    const aliceSent = aliceWs.allSent<Record<string, unknown>>()
    const relaySend = aliceSent.find(m => m.type === 'relay:send') as {
      type: string
      envelope: SagaEncryptedEnvelope
    }
    expect(relaySend).toBeDefined()

    // Deliver to Bob via relay:deliver
    bobWs.simulateMessage({
      type: 'relay:deliver',
      envelope: relaySend.envelope,
    })

    await vi.waitFor(() => {
      if (received.mock.calls.length === 0) throw new Error('waiting')
    })

    expect(received).toHaveBeenCalledWith(
      'alice@epicflow',
      expect.objectContaining({
        messageType: 'task-request',
        payload: { task: 'review PR #14' },
      })
    )

    // Bob should have Alice in their peer list
    const bobPeers = bobClient.getPeers()
    expect(bobPeers).toHaveLength(1)
    expect(bobPeers[0].handle).toBe('alice@epicflow')
  })

  it('messages buffer during disconnect and drain on reconnect', async () => {
    const aliceKeyRing = await setupKeyRing(ALICE_WALLET_KEY)
    const bobKeyRing = await setupKeyRing(BOB_WALLET_KEY)

    let ws!: MockWebSocket
    const client = createSagaClient({
      hubUrl: 'wss://hub.example.com/v1/relay',
      identity: 'alice@epicflow',
      keyRing: aliceKeyRing,
      signer: createMockSigner(),
      storageBackend: new MemoryBackend(),
      createWebSocket: () => {
        ws = new MockWebSocket()
        return ws
      },
    })

    // Connect
    const connectPromise = client.connect()
    await simulateAuthFlow(ws, 'alice')
    ws.simulateMessage({ type: 'mailbox:batch', envelopes: [], remaining: 0 })
    await connectPromise

    client.registerPeerKey('bob@epicflow', bobKeyRing.getPublicKey())

    // Simulate disconnect
    ws.simulateClose(1006, 'Network error')
    expect(client.isConnected()).toBe(false)

    // Send while disconnected — should buffer
    await client.sendMessage('bob@epicflow', {
      messageType: 'notification',
      payload: { text: 'buffered message' },
    })

    // Trigger reconnect
    vi.advanceTimersByTime(1000)

    // Complete reconnect auth
    await simulateAuthFlow(ws, 'alice')
    ws.simulateMessage({ type: 'mailbox:batch', envelopes: [], remaining: 0 })

    // Buffered message should have been sent
    const allSent = ws.allSent<Record<string, unknown>>()
    const relaySends = allSent.filter(m => m.type === 'relay:send')
    expect(relaySends.length).toBeGreaterThanOrEqual(1)
  })

  it('onConnectionChange fires on connect and disconnect', async () => {
    const keyRing = await setupKeyRing(ALICE_WALLET_KEY)
    let ws!: MockWebSocket

    const client = createSagaClient({
      hubUrl: 'wss://hub.example.com/v1/relay',
      identity: 'alice@epicflow',
      keyRing,
      signer: createMockSigner(),
      storageBackend: new MemoryBackend(),
      createWebSocket: () => {
        ws = new MockWebSocket()
        return ws
      },
    })

    const states: boolean[] = []
    client.onConnectionChange(connected => states.push(connected))

    const connectPromise = client.connect()
    await simulateAuthFlow(ws, 'alice')
    ws.simulateMessage({ type: 'mailbox:batch', envelopes: [], remaining: 0 })
    await connectPromise

    expect(states).toEqual([true])

    await client.disconnect()
    expect(states).toEqual([true, false])
  })

  describe('auto key discovery', () => {
    it('sendMessage auto-fetches recipient public key', async () => {
      const aliceKeyRing = await setupKeyRing(ALICE_WALLET_KEY)
      const bobKeyRing = await setupKeyRing(BOB_WALLET_KEY)

      // Encode Bob's public key as base64 for the mock response
      const bobPublicKeyBytes = bobKeyRing.getPublicKey()
      const bobPublicKeyB64 = btoa(String.fromCharCode(...bobPublicKeyBytes))

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ publicKey: bobPublicKeyB64 }),
      } as unknown as Response)

      let ws!: MockWebSocket
      const client = createSagaClient({
        hubUrl: 'wss://hub.example.com/v1/relay',
        identity: 'alice@epicflow',
        keyRing: aliceKeyRing,
        signer: createMockSigner(),
        storageBackend: new MemoryBackend(),
        fetchFn: mockFetch,
        createWebSocket: () => {
          ws = new MockWebSocket()
          return ws
        },
      })

      const connectPromise = client.connect()
      await simulateAuthFlow(ws, 'alice')
      ws.simulateMessage({ type: 'mailbox:batch', envelopes: [], remaining: 0 })
      await connectPromise

      // Send message to bob without registering his key manually
      const messageId = await client.sendMessage('bob@epicflow', {
        messageType: 'task-request',
        payload: { task: 'auto-key-discovery' },
      })

      expect(messageId).toBeTruthy()

      // Verify mockFetch was called to look up Bob's key
      expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('/v1/keys/bob'))

      // Verify a relay:send message was sent
      const allSent = ws.allSent<Record<string, unknown>>()
      const relaySend = allSent.find(m => m.type === 'relay:send')
      expect(relaySend).toBeDefined()
      const envelope = relaySend!.envelope as Record<string, unknown>
      expect(envelope.to).toBe('bob@epicflow')
      expect(envelope.type).toBe('direct-message')
    })
  })

  describe('governance integration', () => {
    beforeEach(async () => {
      vi.useFakeTimers()
      vi.clearAllMocks()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('full governance flow: classify, store, audit, retain', async () => {
      const agentKeyRing = await setupKeyRing(ALICE_WALLET_KEY)
      const companyKeyRing = await setupKeyRing(new Uint8Array(32).fill(99))

      let ws!: MockWebSocket
      const client = createSagaClient({
        hubUrl: 'wss://hub.example.com/v1/relay',
        identity: 'alice@epicflow',
        keyRing: agentKeyRing,
        signer: createMockSigner(),
        storageBackend: new MemoryBackend(),
        createWebSocket: () => {
          ws = new MockWebSocket()
          return ws
        },
        governance: {
          orgId: 'acme-corp',
          policy: {
            orgId: 'acme-corp',
            defaultScope: 'agent-portable',
            restricted: {
              memoryTypes: ['procedural'],
              contentPatterns: ['secret'],
            },
            retention: { portableLimit: 2 },
          },
          companyKeyRing,
          companyStorageBackend: new MemoryBackend(),
        },
      })

      const connectPromise = client.connect()
      await simulateAuthFlow(ws, 'alice')
      ws.simulateMessage({ type: 'mailbox:batch', envelopes: [], remaining: 0 })
      await connectPromise

      // Store a restricted memory (procedural → org-internal)
      await client.storeMemory({
        id: 'mem-restricted',
        type: 'procedural',
        content: { steps: ['internal process'] },
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      })

      // Store a content-pattern-matching memory (secret → org-internal)
      await client.storeMemory({
        id: 'mem-secret',
        type: 'episodic',
        content: { text: 'secret project details' },
        createdAt: '2026-01-02T00:00:00Z',
        updatedAt: '2026-01-02T00:00:00Z',
      })

      // Store 3 portable memories
      for (let i = 1; i <= 3; i++) {
        await client.storeMemory({
          id: `mem-portable-${i}`,
          type: 'episodic',
          content: { text: `learning ${i}` },
          createdAt: `2026-01-0${i}T00:00:00Z`,
          updatedAt: `2026-01-0${i}T00:00:00Z`,
        })
      }

      // Verify: no relay:send for org-internal memories
      const sent = ws.allSent<Record<string, unknown>>()
      const relaySends = sent.filter(m => m.type === 'relay:send')
      const syncEnvelopes = relaySends
        .map(m => m.envelope as Record<string, unknown>)
        .filter(e => e?.type === 'memory-sync')

      // Only 3 portable memories should have synced (not the 2 org-internal ones)
      expect(syncEnvelopes).toHaveLength(3)

      // Verify: audit log has entries for all 5 memories
      const auditLog = await client.queryAuditLog()
      expect(auditLog.length).toBeGreaterThanOrEqual(5)

      const restrictedAudit = auditLog.find(e => e.memoryId === 'mem-restricted')
      expect(restrictedAudit?.appliedScope).toBe('org-internal')

      const secretAudit = auditLog.find(e => e.memoryId === 'mem-secret')
      expect(secretAudit?.appliedScope).toBe('org-internal')

      // queryMemory should return all accessible memories (agent store + company store)
      const allMemories = await client.queryMemory({})
      expect(allMemories.length).toBeGreaterThanOrEqual(5)

      await client.disconnect()
    })
  })

  describe('sync-on-activation', () => {
    it('sends sync-request after connecting with default checkpoint', async () => {
      const keyRing = await setupKeyRing(ALICE_WALLET_KEY)
      let ws!: MockWebSocket

      const client = createSagaClient({
        hubUrl: 'wss://hub.example.com/v1/relay',
        identity: 'alice@epicflow',
        keyRing,
        signer: createMockSigner(),
        storageBackend: new MemoryBackend(),
        createWebSocket: () => {
          ws = new MockWebSocket()
          return ws
        },
      })

      const connectPromise = client.connect()
      await simulateAuthFlow(ws, 'alice')
      ws.simulateMessage({ type: 'mailbox:batch', envelopes: [], remaining: 0 })
      await connectPromise

      // Wait for the async loadCheckpointAndSync to send sync-request
      await vi.waitFor(() => {
        const msgs = ws.allSent<Record<string, unknown>>()
        const syncReq = msgs.find(m => m.type === 'sync-request')
        if (!syncReq) throw new Error('Waiting for sync-request')
      })

      const msgs = ws.allSent<Record<string, unknown>>()
      const syncReq = msgs.find(m => m.type === 'sync-request')
      expect(syncReq).toBeDefined()
      expect(syncReq!.since).toBe('1970-01-01T00:00:00.000Z')
    })

    it('processes sync-response and stores memories locally', async () => {
      const keyRing = await setupKeyRing(ALICE_WALLET_KEY)
      const identity = 'alice@epicflow'
      let ws!: MockWebSocket

      const client = createSagaClient({
        hubUrl: 'wss://hub.example.com/v1/relay',
        identity,
        keyRing,
        signer: createMockSigner(),
        storageBackend: new MemoryBackend(),
        createWebSocket: () => {
          ws = new MockWebSocket()
          return ws
        },
      })

      const connectPromise = client.connect()
      await simulateAuthFlow(ws, 'alice')
      ws.simulateMessage({ type: 'mailbox:batch', envelopes: [], remaining: 0 })
      await connectPromise

      // Wait for sync-request to be sent
      await vi.waitFor(() => {
        const msgs = ws.allSent<Record<string, unknown>>()
        if (!msgs.find(m => m.type === 'sync-request')) throw new Error('Waiting for sync-request')
      })

      // Create a real encrypted memory envelope using seal
      const { seal } = await import('@epicdm/saga-crypto')

      const memory: SagaMemory = {
        id: 'sync-mem-001',
        type: 'episodic',
        content: { learned: 'sync protocol works' },
        createdAt: '2026-03-26T00:00:00Z',
        updatedAt: '2026-03-26T00:00:00Z',
      }

      const plaintext = new TextEncoder().encode(JSON.stringify(memory))
      const envelope = await seal(
        {
          type: 'memory-sync',
          scope: 'private',
          from: identity,
          to: identity,
          plaintext,
        },
        keyRing
      )

      // Simulate server sending sync-response
      ws.simulateMessage({
        type: 'sync-response',
        envelopes: [envelope],
        checkpoint: new Date().toISOString(),
        hasMore: false,
      })

      // Wait for async processing to complete
      await vi.waitFor(async () => {
        const results = await client.queryMemory({})
        if (results.length === 0) throw new Error('Waiting for memory to be stored')
      })

      const results = await client.queryMemory({})
      expect(results).toHaveLength(1)
      expect(results[0].id).toBe('sync-mem-001')
    })
  })
})
