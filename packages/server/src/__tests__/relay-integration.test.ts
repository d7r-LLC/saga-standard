// packages/server/src/__tests__/relay-integration.test.ts
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { beforeEach, describe, expect, it } from 'vitest'
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

  it('hub cannot read message content — passes through opaque ciphertext', async () => {
    const aliceWs = await connectAndAuth('alice', '0xalice')
    const bobWs = await connectAndAuth('bob', '0xbob')

    // Content is random bytes (base64) — hub has no way to decrypt
    const opaquePayload = 'dGhpcyBpcyBlbmNyeXB0ZWQgZGF0YSB0aGF0IHRoZSBodWIgY2Fubm90IHJlYWQ='
    const envelope = {
      v: 1,
      type: 'memory-sync',
      scope: 'private',
      from: 'alice@epicflow',
      to: 'bob@epicflow',
      ct: opaquePayload,
      iv: 'cmFuZG9taXY=',
      authTag: 'cmFuZG9tdGFn',
      wrappedDek: 'cmFuZG9tZGVr',
      ts: new Date().toISOString(),
      id: 'opacity-test-001',
    }

    await room.webSocketMessage(aliceWs, JSON.stringify({ type: 'relay:send', envelope }))

    // Verify envelope is delivered EXACTLY as sent — no modification
    const delivery = lastMessage(bobWs)
    expect(delivery.type).toBe('relay:deliver')
    const delivered = delivery.envelope as Record<string, unknown>
    expect(delivered.ct).toBe(opaquePayload)
    expect(delivered.iv).toBe('cmFuZG9taXY=')
    expect(delivered.authTag).toBe('cmFuZG9tdGFn')
    expect(delivered.wrappedDek).toBe('cmFuZG9tZGVr')
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

  it('connection replacement — new connection replaces old', async () => {
    const aliceWs1 = await connectAndAuth('alice', '0xalice')
    const aliceWs2 = await connectAndAuth('alice', '0xalice')

    // First connection should have been notified and closed
    const ws1Messages = parseSent(aliceWs1)
    const replacedMsg = ws1Messages.find(m => m.error === 'Replaced by new connection')
    expect(replacedMsg).toBeDefined()
    expect(aliceWs1._closed).toBe(true)

    // New connection should work
    const bobWs = await connectAndAuth('bob', '0xbob')
    const envelope = {
      v: 1,
      type: 'direct-message',
      scope: 'mutual',
      from: 'bob@epicflow',
      to: 'alice@epicflow',
      ct: 'x',
      ts: new Date().toISOString(),
      id: 'replace-test',
    }
    await room.webSocketMessage(bobWs, JSON.stringify({ type: 'relay:send', envelope }))

    // Message should arrive on the NEW connection (ws2), not the old one (ws1)
    expect(lastMessage(aliceWs2).type).toBe('relay:deliver')
  })
})
