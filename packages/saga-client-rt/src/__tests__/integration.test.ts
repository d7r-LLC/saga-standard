// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { beforeEach, describe, expect, it, vi } from 'vitest'
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
})
