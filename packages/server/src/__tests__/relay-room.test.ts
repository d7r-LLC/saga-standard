// packages/server/src/__tests__/relay-room.test.ts
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { beforeEach, describe, expect, it } from 'vitest'
import { drizzle } from 'drizzle-orm/d1'
import { agents } from '../db/schema'
import { RelayRoom } from '../relay/relay-room'
import {
  createMockDurableObjectState,
  createMockWebSocket,
  createRelayMockEnv,
} from './relay-test-helpers'
import type { MockWebSocket } from './relay-test-helpers'
import type { Env } from '../bindings'

describe('RelayRoom', () => {
  let ctx: ReturnType<typeof createMockDurableObjectState>
  let env: Env
  let room: RelayRoom

  beforeEach(async () => {
    ctx = createMockDurableObjectState()
    env = await createRelayMockEnv()

    // Seed a valid agent with NFT
    const orm = drizzle(env.DB)
    await orm.insert(agents).values({
      id: 'agent_alice',
      handle: 'alice',
      walletAddress: '0xalice',
      chain: 'eip155:8453',
      registeredAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      tokenId: 42,
      contractAddress: '0xcontract',
    })
    await orm.insert(agents).values({
      id: 'agent_bob',
      handle: 'bob',
      walletAddress: '0xbob',
      chain: 'eip155:8453',
      registeredAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      tokenId: 43,
      contractAddress: '0xcontract',
    })

    room = new RelayRoom(ctx as unknown as DurableObjectState, env)
  })

  function getLastMessage(ws: MockWebSocket): Record<string, unknown> {
    return JSON.parse(ws._sent[ws._sent.length - 1])
  }

  async function authenticateWs(
    ws: MockWebSocket,
    handle: string,
    walletAddress: string
  ): Promise<void> {
    // Simulate challenge sent (normally happens in fetch)
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
  }

  describe('authentication', () => {
    it('authenticates a valid agent', async () => {
      const ws = createMockWebSocket()
      await authenticateWs(ws, 'alice', '0xalice')

      const msg = getLastMessage(ws)
      expect(msg.type).toBe('auth:success')
      expect(msg.handle).toBe('alice')
    })

    it('rejects agent without matching challenge', async () => {
      const ws = createMockWebSocket()
      ws.serializeAttachment({
        authenticated: false,
        challenge: 'saga-relay:correct:123',
        expiresAt: new Date(Date.now() + 300_000).toISOString(),
      })
      ctx._websockets.push(ws)

      await room.webSocketMessage(
        ws,
        JSON.stringify({
          type: 'auth:verify',
          walletAddress: '0xalice',
          chain: 'eip155:8453',
          handle: 'alice',
          signature: 'valid-signature-1234567890',
          challenge: 'saga-relay:wrong:456',
        })
      )

      const msg = getLastMessage(ws)
      expect(msg.type).toBe('auth:error')
    })

    it('rejects unauthenticated relay:send', async () => {
      const ws = createMockWebSocket()
      ws.serializeAttachment({ authenticated: false, challenge: 'c', expiresAt: 'e' })
      ctx._websockets.push(ws)

      await room.webSocketMessage(
        ws,
        JSON.stringify({
          type: 'relay:send',
          envelope: {
            v: 1,
            type: 'direct-message',
            scope: 'mutual',
            from: 'alice@epicflow',
            to: 'bob@epicflow',
            ct: 'x',
            ts: '2026-01-01T00:00:00Z',
            id: 'msg1',
          },
        })
      )

      const msg = getLastMessage(ws)
      expect(msg.type).toBe('error')
      expect(msg.error).toContain('Not authenticated')
    })
  })

  describe('message routing', () => {
    it('delivers to online recipient', async () => {
      const aliceWs = createMockWebSocket()
      const bobWs = createMockWebSocket()
      await authenticateWs(aliceWs, 'alice', '0xalice')
      await authenticateWs(bobWs, 'bob', '0xbob')

      const envelope = {
        v: 1,
        type: 'direct-message',
        scope: 'mutual',
        from: 'alice@epicflow',
        to: 'bob@epicflow',
        ct: 'encrypted-payload',
        ts: new Date().toISOString(),
        id: 'msg-001',
      }

      await room.webSocketMessage(aliceWs, JSON.stringify({ type: 'relay:send', envelope }))

      // Alice should get ack
      const ack = getLastMessage(aliceWs)
      expect(ack.type).toBe('relay:ack')
      expect(ack.messageId).toBe('msg-001')

      // Bob should receive delivery
      const delivery = getLastMessage(bobWs)
      expect(delivery.type).toBe('relay:deliver')
      expect((delivery.envelope as Record<string, unknown>).id).toBe('msg-001')
      expect((delivery.envelope as Record<string, unknown>).ct).toBe('encrypted-payload')
    })

    it('mailboxes message for offline recipient', async () => {
      const aliceWs = createMockWebSocket()
      await authenticateWs(aliceWs, 'alice', '0xalice')

      const envelope = {
        v: 1,
        type: 'direct-message',
        scope: 'mutual',
        from: 'alice@epicflow',
        to: 'charlie@epicflow',
        ct: 'encrypted-for-charlie',
        ts: new Date().toISOString(),
        id: 'msg-002',
      }

      await room.webSocketMessage(aliceWs, JSON.stringify({ type: 'relay:send', envelope }))

      // Alice gets ack (message was mailboxed)
      const ack = getLastMessage(aliceWs)
      expect(ack.type).toBe('relay:ack')
      expect(ack.messageId).toBe('msg-002')
    })

    it('rejects envelope with sender identity mismatch', async () => {
      const aliceWs = createMockWebSocket()
      await authenticateWs(aliceWs, 'alice', '0xalice')

      const envelope = {
        v: 1,
        type: 'direct-message',
        scope: 'mutual',
        from: 'mallory@epicflow',
        to: 'bob@epicflow',
        ct: 'x',
        ts: new Date().toISOString(),
        id: 'msg-003',
      }

      await room.webSocketMessage(aliceWs, JSON.stringify({ type: 'relay:send', envelope }))

      const err = getLastMessage(aliceWs)
      expect(err.type).toBe('relay:error')
      expect(err.error).toContain('mismatch')
    })
  })

  describe('mailbox drain', () => {
    it('drains mailbox on request', async () => {
      // Store a message in bob's mailbox directly
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (env as any).RELAY_MAILBOX.put(
        'mailbox:bob:2026-03-26T00:00:00.000Z:msg-queued',
        JSON.stringify({
          v: 1,
          type: 'direct-message',
          scope: 'mutual',
          from: 'alice@epicflow',
          to: 'bob@epicflow',
          ct: 'queued-payload',
          ts: '2026-03-26T00:00:00.000Z',
          id: 'msg-queued',
        })
      )

      const bobWs = createMockWebSocket()
      await authenticateWs(bobWs, 'bob', '0xbob')

      await room.webSocketMessage(bobWs, JSON.stringify({ type: 'mailbox:drain' }))

      const batch = getLastMessage(bobWs)
      expect(batch.type).toBe('mailbox:batch')
      expect((batch.envelopes as unknown[]).length).toBe(1)
    })
  })

  describe('connection lifecycle', () => {
    it('handles pong message', async () => {
      const ws = createMockWebSocket()
      await authenticateWs(ws, 'alice', '0xalice')

      // Send pong (should not produce any response, just updates lastPong)
      const sentBefore = ws._sent.length
      await room.webSocketMessage(ws, JSON.stringify({ type: 'control:pong' }))
      // Pong handler does not send a response
      expect(ws._sent.length).toBe(sentBefore)
    })

    it('handles webSocketClose by removing from registry', async () => {
      const aliceWs = createMockWebSocket()
      const bobWs = createMockWebSocket()
      await authenticateWs(aliceWs, 'alice', '0xalice')
      await authenticateWs(bobWs, 'bob', '0xbob')

      // Alice disconnects
      await room.webSocketClose(aliceWs, 1000, 'bye', true)

      // Now a message to alice should be mailboxed, not delivered
      const envelope = {
        v: 1,
        type: 'direct-message',
        scope: 'mutual',
        from: 'bob@epicflow',
        to: 'alice@epicflow',
        ct: 'x',
        ts: new Date().toISOString(),
        id: 'msg-after-dc',
      }
      await room.webSocketMessage(bobWs, JSON.stringify({ type: 'relay:send', envelope }))

      const ack = getLastMessage(bobWs)
      expect(ack.type).toBe('relay:ack')
      // Alice's WS should NOT have received the message
      expect(aliceWs._sent.filter(m => JSON.parse(m).type === 'relay:deliver')).toHaveLength(0)
    })

    it('rejects invalid JSON messages', async () => {
      const ws = createMockWebSocket()
      ws.serializeAttachment({ authenticated: false, challenge: 'c', expiresAt: 'e' })
      ctx._websockets.push(ws)

      await room.webSocketMessage(ws, 'not-json-at-all')

      const msg = getLastMessage(ws)
      expect(msg.type).toBe('error')
    })
  })
})
