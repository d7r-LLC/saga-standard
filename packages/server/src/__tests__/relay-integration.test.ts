// packages/server/src/__tests__/relay-integration.test.ts
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { drizzle } from 'drizzle-orm/d1'
import { agents, organizations } from '../db/schema'
import { RelayRoom } from '../relay/relay-room'
import {
  createMockDurableObjectState,
  createMockWebSocket,
  createRelayMockEnv,
} from './relay-test-helpers'
import type { MockWebSocket } from './relay-test-helpers'
import type { Env } from '../bindings'

describe('Relay Integration', () => {
  let ctx: ReturnType<typeof createMockDurableObjectState>
  let env: Env
  let room: RelayRoom

  beforeEach(async () => {
    ctx = createMockDurableObjectState()
    env = await createRelayMockEnv()

    const orm = drizzle(env.DB)
    await orm.insert(agents).values({
      id: 'agent_alice',
      handle: 'alice',
      walletAddress: '0xalice',
      chain: 'eip155:8453',
      registeredAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      tokenId: 1,
      contractAddress: '0xcontract',
    })
    await orm.insert(agents).values({
      id: 'agent_bob',
      handle: 'bob',
      walletAddress: '0xbob',
      chain: 'eip155:8453',
      registeredAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      tokenId: 2,
      contractAddress: '0xcontract',
    })
    await orm.insert(organizations).values({
      id: 'org_acme',
      handle: 'acme',
      name: 'Acme Corp',
      walletAddress: '0xacme',
      chain: 'eip155:8453',
      registeredAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      tokenId: 100,
      contractAddress: '0xcontract',
    })

    room = new RelayRoom(ctx as unknown as DurableObjectState, env)
  })

  function parseSent(ws: MockWebSocket): Record<string, unknown>[] {
    return ws._sent.map(s => JSON.parse(s))
  }

  function lastMessage(ws: MockWebSocket): Record<string, unknown> {
    return JSON.parse(ws._sent[ws._sent.length - 1])
  }

  async function connectAndAuth(handle: string, walletAddress: string): Promise<MockWebSocket> {
    const ws = createMockWebSocket()
    const challenge = `saga-relay:${crypto.randomUUID()}:${Date.now()}`
    const expiresAt = new Date(Date.now() + 300_000).toISOString()
    ws.serializeAttachment({ authenticated: false, challenge, expiresAt })
    ctx._websockets.push(ws)

    await room.webSocketMessage(
      ws,
      JSON.stringify({
        type: 'auth:verify',
        walletAddress,
        chain: 'eip155:8453',
        handle,
        signature: 'valid-signature-1234567890',
        challenge,
      })
    )

    expect(lastMessage(ws).type).toBe('auth:success')
    return ws
  }

  it('full flow: connect → auth → send → receive → ack', async () => {
    const aliceWs = await connectAndAuth('alice', '0xalice')
    const bobWs = await connectAndAuth('bob', '0xbob')

    const envelope = {
      v: 1,
      type: 'direct-message',
      scope: 'mutual',
      from: 'alice@epicflow',
      to: 'bob@epicflow',
      ct: 'aGVsbG8gYm9i', // opaque ciphertext
      nonce: 'cmFuZG9tbm9uY2U=',
      ts: new Date().toISOString(),
      id: 'integration-msg-001',
    }

    await room.webSocketMessage(aliceWs, JSON.stringify({ type: 'relay:send', envelope }))

    // Alice gets ack
    expect(lastMessage(aliceWs)).toEqual({
      type: 'relay:ack',
      messageId: 'integration-msg-001',
    })

    // Bob receives the envelope
    const bobDelivery = lastMessage(bobWs)
    expect(bobDelivery.type).toBe('relay:deliver')
    expect(bobDelivery.envelope).toEqual(envelope)
  })

  it('hub cannot read message content — memory-sync stored canonically and forwarded to own DERPs', async () => {
    const aliceWs1 = await connectAndAuth('alice', '0xalice')
    const aliceWs2 = await connectAndAuth('alice', '0xalice')
    const bobWs = await connectAndAuth('bob', '0xbob')

    // Content is random bytes (base64) — hub has no way to decrypt
    const opaquePayload = 'dGhpcyBpcyBlbmNyeXB0ZWQgZGF0YSB0aGF0IHRoZSBodWIgY2Fubm90IHJlYWQ='
    const envelope = {
      v: 1,
      type: 'memory-sync',
      scope: 'self',
      from: 'alice@epicflow',
      to: 'alice@epicflow',
      ct: opaquePayload,
      iv: 'cmFuZG9taXY=',
      authTag: 'cmFuZG9tdGFn',
      wrappedDek: 'cmFuZG9tZGVr',
      ts: new Date().toISOString(),
      id: 'opacity-test-001',
    }

    await room.webSocketMessage(aliceWs1, JSON.stringify({ type: 'relay:send', envelope }))

    // Sender (aliceWs1) gets ack — not a relay:deliver echo
    const ack = lastMessage(aliceWs1)
    expect(ack.type).toBe('relay:ack')
    expect(ack.messageId).toBe('opacity-test-001')

    // aliceWs1 should NOT receive a relay:deliver (no echo back to sender)
    const ws1Delivers = parseSent(aliceWs1).filter(m => m.type === 'relay:deliver')
    expect(ws1Delivers).toHaveLength(0)

    // aliceWs2 (same handle, other DERP) should receive relay:deliver with exact ciphertext
    const ws2Delivers = parseSent(aliceWs2).filter(m => m.type === 'relay:deliver')
    expect(ws2Delivers).toHaveLength(1)
    const delivered = ws2Delivers[0].envelope as Record<string, unknown>
    expect(delivered.ct).toBe(opaquePayload)
    expect(delivered.iv).toBe('cmFuZG9taXY=')
    expect(delivered.authTag).toBe('cmFuZG9tdGFn')
    expect(delivered.wrappedDek).toBe('cmFuZG9tZGVr')

    // bob should NOT receive the memory-sync (it's a self-directed envelope)
    const bobDelivers = parseSent(bobWs).filter(m => m.type === 'relay:deliver')
    expect(bobDelivers).toHaveLength(0)
  })

  it('offline message delivery via mailbox', async () => {
    const aliceWs = await connectAndAuth('alice', '0xalice')
    // Bob is NOT connected

    const envelope = {
      v: 1,
      type: 'direct-message',
      scope: 'mutual',
      from: 'alice@epicflow',
      to: 'bob@epicflow',
      ct: 'bWVzc2FnZSBmb3IgYm9i',
      ts: new Date().toISOString(),
      id: 'offline-msg-001',
    }

    await room.webSocketMessage(aliceWs, JSON.stringify({ type: 'relay:send', envelope }))

    // Alice gets ack (message was mailboxed)
    expect(lastMessage(aliceWs).type).toBe('relay:ack')

    // Bob connects later
    const bobWs = await connectAndAuth('bob', '0xbob')

    // Bob drains mailbox
    await room.webSocketMessage(bobWs, JSON.stringify({ type: 'mailbox:drain' }))

    const batch = lastMessage(bobWs)
    expect(batch.type).toBe('mailbox:batch')
    const envelopes = batch.envelopes as unknown[]
    expect(envelopes).toHaveLength(1)
    expect((envelopes[0] as Record<string, unknown>).id).toBe('offline-msg-001')

    // Bob acks the messages
    await room.webSocketMessage(
      bobWs,
      JSON.stringify({ type: 'mailbox:ack', messageIds: ['offline-msg-001'] })
    )

    // Drain again — should be empty
    await room.webSocketMessage(bobWs, JSON.stringify({ type: 'mailbox:drain' }))
    const emptyBatch = lastMessage(bobWs)
    expect((emptyBatch.envelopes as unknown[]).length).toBe(0)
  })

  it('org entity can authenticate and send messages', async () => {
    const acmeWs = await connectAndAuth('acme', '0xacme')
    const aliceWs = await connectAndAuth('alice', '0xalice')

    const envelope = {
      v: 1,
      type: 'direct-message',
      scope: 'mutual',
      from: 'acme@epicflow',
      to: 'alice@epicflow',
      ct: 'dGFzayBhc3NpZ25tZW50',
      ts: new Date().toISOString(),
      id: 'org-msg-001',
    }

    await room.webSocketMessage(acmeWs, JSON.stringify({ type: 'relay:send', envelope }))

    expect(lastMessage(acmeWs).type).toBe('relay:ack')
    expect(lastMessage(aliceWs).type).toBe('relay:deliver')
  })

  it('multi-connection — second connection coexists and both receive messages', async () => {
    const aliceWs1 = await connectAndAuth('alice', '0xalice')
    const aliceWs2 = await connectAndAuth('alice', '0xalice')

    // Both connections should remain open (multi-DERP support)
    expect(aliceWs1._closed).toBe(false)
    expect(aliceWs2._closed).toBe(false)

    // Both connections should receive messages sent to alice
    const bobWs = await connectAndAuth('bob', '0xbob')
    const envelope = {
      v: 1,
      type: 'direct-message',
      scope: 'mutual',
      from: 'bob@epicflow',
      to: 'alice@epicflow',
      ct: 'x',
      ts: new Date().toISOString(),
      id: 'multi-conn-test',
    }
    await room.webSocketMessage(bobWs, JSON.stringify({ type: 'relay:send', envelope }))

    // Both ws1 and ws2 should have received the delivery
    const ws1Delivers = parseSent(aliceWs1).filter(m => m.type === 'relay:deliver')
    const ws2Delivers = parseSent(aliceWs2).filter(m => m.type === 'relay:deliver')
    expect(ws1Delivers).toHaveLength(1)
    expect(ws2Delivers).toHaveLength(1)
  })

  describe('memory sync protocol', () => {
    beforeEach(() => {
      vi.useFakeTimers({ now: new Date('2026-03-26T10:00:00.000Z') })
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('full sync flow: store memory, sync-request retrieves it', async () => {
      const derpA = await connectAndAuth('alice', '0xalice')

      const envelope = {
        v: 1,
        type: 'memory-sync',
        scope: 'self',
        from: 'alice@epicflow',
        to: 'alice@epicflow',
        ct: 'encrypted-data',
        ts: new Date().toISOString(),
        id: 'sync-flow-001',
      }

      await room.webSocketMessage(derpA, JSON.stringify({ type: 'relay:send', envelope }))

      // Connect a second DERP for alice
      const derpB = await connectAndAuth('alice', '0xalice')
      derpB._sent.length = 0

      // Request sync from the beginning of time
      await room.webSocketMessage(
        derpB,
        JSON.stringify({ type: 'sync-request', since: '1970-01-01T00:00:00.000Z' })
      )

      const messages = parseSent(derpB)
      const syncResponse = messages.find(m => m.type === 'sync-response')
      expect(syncResponse).toBeDefined()
      const envelopes = syncResponse!.envelopes as Record<string, unknown>[]
      expect(envelopes).toHaveLength(1)
      expect(envelopes[0].id).toBe('sync-flow-001')
      expect(syncResponse!.hasMore).toBe(false)
    })

    it('multi-DERP real-time: memory created on derpA delivered live to derpB', async () => {
      const derpA = await connectAndAuth('alice', '0xalice')
      const derpB = await connectAndAuth('alice', '0xalice')
      derpB._sent.length = 0

      const envelope = {
        v: 1,
        type: 'memory-sync',
        scope: 'self',
        from: 'alice@epicflow',
        to: 'alice@epicflow',
        ct: 'realtime-encrypted-data',
        ts: new Date().toISOString(),
        id: 'realtime-sync-001',
      }

      await room.webSocketMessage(derpA, JSON.stringify({ type: 'relay:send', envelope }))

      const messages = parseSent(derpB)
      const delivers = messages.filter(m => m.type === 'relay:deliver')
      expect(delivers).toHaveLength(1)
      const delivered = delivers[0].envelope as Record<string, unknown>
      expect(delivered.id).toBe('realtime-sync-001')
    })

    it('checkpoint-based sync: only returns envelopes after checkpoint', async () => {
      const ws = await connectAndAuth('alice', '0xalice')

      // Store first envelope with an explicit early timestamp
      const env1 = {
        v: 1,
        type: 'memory-sync',
        scope: 'self',
        from: 'alice@epicflow',
        to: 'alice@epicflow',
        ct: 'first-memory',
        ts: '2026-01-01T00:00:00.000Z',
        id: 'checkpoint-env1',
      }

      await room.webSocketMessage(ws, JSON.stringify({ type: 'relay:send', envelope: env1 }))

      // Sync from epoch to get the checkpoint
      ws._sent.length = 0
      await room.webSocketMessage(
        ws,
        JSON.stringify({ type: 'sync-request', since: '1970-01-01T00:00:00.000Z' })
      )

      const firstSync = parseSent(ws).find(m => m.type === 'sync-response') as Record<
        string,
        unknown
      >
      expect(firstSync).toBeDefined()
      const checkpoint = firstSync.checkpoint as string

      // Advance time so env2 gets a strictly later stored_at
      vi.advanceTimersByTime(2000)

      const env2 = {
        v: 1,
        type: 'memory-sync',
        scope: 'self',
        from: 'alice@epicflow',
        to: 'alice@epicflow',
        ct: 'second-memory',
        ts: '2026-06-01T00:00:00.000Z',
        id: 'checkpoint-env2',
      }

      await room.webSocketMessage(ws, JSON.stringify({ type: 'relay:send', envelope: env2 }))

      // Sync using the checkpoint — should only return env2
      ws._sent.length = 0
      await room.webSocketMessage(ws, JSON.stringify({ type: 'sync-request', since: checkpoint }))

      const secondSync = parseSent(ws).find(m => m.type === 'sync-response') as Record<
        string,
        unknown
      >
      expect(secondSync).toBeDefined()
      const envelopes = secondSync.envelopes as Record<string, unknown>[]
      expect(envelopes).toHaveLength(1)
      expect(envelopes[0].id).toBe('checkpoint-env2')
    })

    it('hub cannot read memory content — envelopes are opaque blobs', async () => {
      const ws = await connectAndAuth('alice', '0xalice')

      const envelope = {
        v: 1,
        type: 'memory-sync',
        scope: 'self',
        from: 'alice@epicflow',
        to: 'alice@epicflow',
        ct: 'totally-opaque-encrypted-content',
        ts: new Date().toISOString(),
        id: 'opaque-blob-001',
      }

      await room.webSocketMessage(ws, JSON.stringify({ type: 'relay:send', envelope }))

      // Sync and verify ciphertext is preserved exactly
      ws._sent.length = 0
      await room.webSocketMessage(
        ws,
        JSON.stringify({ type: 'sync-request', since: '1970-01-01T00:00:00.000Z' })
      )

      const syncResponse = parseSent(ws).find(m => m.type === 'sync-response') as Record<
        string,
        unknown
      >
      expect(syncResponse).toBeDefined()
      const envelopes = syncResponse.envelopes as Record<string, unknown>[]
      expect(envelopes).toHaveLength(1)
      expect(envelopes[0].ct).toBe('totally-opaque-encrypted-content')
    })
  })
})
