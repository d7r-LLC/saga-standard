// packages/server/src/__tests__/relay-room.test.ts
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { beforeEach, describe, expect, it } from 'vitest'
import { privateKeyToAccount } from 'viem/accounts'
import { drizzle } from 'drizzle-orm/d1'
import { agents, groupMembers } from '../db/schema'
import { RelayRoom } from '../relay/relay-room'
import {
  createMockDurableObjectState,
  createMockWebSocket,
  createRelayMockEnv,
} from './relay-test-helpers'
import type { MockWebSocket } from './relay-test-helpers'
import type { Env } from '../bindings'

// Hardhat's first account — well-known test key, NOT a real wallet
const TEST_PRIVATE_KEY =
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as const // gitleaks:allow
const testAccount = privateKeyToAccount(TEST_PRIVATE_KEY)
const TEST_WALLET = testAccount.address.toLowerCase() // 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266

async function signChallenge(challenge: string): Promise<string> {
  return testAccount.signMessage({ message: challenge })
}

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
      walletAddress: TEST_WALLET,
      chain: 'eip155:8453',
      registeredAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      tokenId: 42,
      contractAddress: '0xcontract',
    })
    await orm.insert(agents).values({
      id: 'agent_bob',
      handle: 'bob',
      walletAddress: TEST_WALLET,
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

  async function authenticateWs(ws: MockWebSocket, handle: string): Promise<void> {
    // Simulate challenge sent (normally happens in fetch)
    const challenge = `saga-relay:${crypto.randomUUID()}:${Date.now()}`
    const expiresAt = new Date(Date.now() + 300_000).toISOString()
    ws.serializeAttachment({ authenticated: false, challenge, expiresAt })
    ctx._websockets.push(ws)

    const signature = await signChallenge(challenge)

    await room.webSocketMessage(
      ws,
      JSON.stringify({
        type: 'auth:verify',
        walletAddress: TEST_WALLET,
        chain: 'eip155:8453',
        handle,
        signature,
        challenge,
      })
    )
  }

  describe('authentication', () => {
    it('authenticates a valid agent', async () => {
      const ws = createMockWebSocket()
      await authenticateWs(ws, 'alice')

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
      await authenticateWs(aliceWs, 'alice')
      await authenticateWs(bobWs, 'bob')

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
      await authenticateWs(aliceWs, 'alice')

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
      await authenticateWs(aliceWs, 'alice')

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

    it('rejects duplicate message IDs', async () => {
      const aliceWs = createMockWebSocket()
      const bobWs = createMockWebSocket()
      await authenticateWs(aliceWs, 'alice')
      await authenticateWs(bobWs, 'bob')

      const envelope = {
        v: 1,
        type: 'direct-message',
        scope: 'mutual',
        from: 'alice@epicflow',
        to: 'bob@epicflow',
        ct: 'encrypted-content',
        ts: new Date().toISOString(),
        id: 'msg-dedup-test-001',
      }

      // First send — should succeed
      await room.webSocketMessage(aliceWs, JSON.stringify({ type: 'relay:send', envelope }))

      // Check bob received the first delivery
      const bobMessages = bobWs._sent.map((m: string) => JSON.parse(m))
      const firstDelivered = bobMessages.filter(
        (m: Record<string, unknown>) => m.type === 'relay:deliver'
      )
      expect(firstDelivered).toHaveLength(1)

      // Clear bob's sent buffer to isolate second attempt
      bobWs._sent.length = 0

      // Second send with same ID — should be silently deduped
      await room.webSocketMessage(aliceWs, JSON.stringify({ type: 'relay:send', envelope }))

      const bobMessages2 = bobWs._sent.map((m: string) => JSON.parse(m))
      const duplicateDelivered = bobMessages2.filter(
        (m: Record<string, unknown>) => m.type === 'relay:deliver'
      )
      expect(duplicateDelivered).toHaveLength(0)

      // Sender should still get ack for deduped messages (not an error)
      const aliceMessages = aliceWs._sent.map((m: string) => JSON.parse(m))
      const acks = aliceMessages.filter(
        (m: Record<string, unknown>) =>
          m.type === 'relay:ack' && m.messageId === 'msg-dedup-test-001'
      )
      expect(acks).toHaveLength(2) // first send + deduped second send
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
      await authenticateWs(bobWs, 'bob')

      await room.webSocketMessage(bobWs, JSON.stringify({ type: 'mailbox:drain' }))

      const batch = getLastMessage(bobWs)
      expect(batch.type).toBe('mailbox:batch')
      expect((batch.envelopes as unknown[]).length).toBe(1)
    })
  })

  describe('multi-connection support', () => {
    it('allows two connections for the same handle', async () => {
      const ws1 = createMockWebSocket()
      const ws2 = createMockWebSocket()

      await authenticateWs(ws1, 'alice')
      await authenticateWs(ws2, 'alice')

      // Neither should be closed
      expect(ws1._closed).toBe(false)
      expect(ws2._closed).toBe(false)
    })

    it('delivers relay message to all connections for a handle', async () => {
      const ws1 = createMockWebSocket()
      const ws2 = createMockWebSocket()
      const sender = createMockWebSocket()

      await authenticateWs(ws1, 'alice')
      await authenticateWs(ws2, 'alice')
      await authenticateWs(sender, 'bob')

      // Bob sends to alice
      const envelope = {
        v: 1,
        type: 'direct-message',
        scope: 'mutual',
        from: 'bob@epicflow',
        to: 'alice@epicflow',
        ct: 'encrypted-payload',
        ts: new Date().toISOString(),
        id: 'msg-multi-1',
      }
      await room.webSocketMessage(sender, JSON.stringify({ type: 'relay:send', envelope }))

      // Both ws1 and ws2 should receive the delivery
      const ws1Messages = ws1._sent.map((m: string) => JSON.parse(m))
      const ws2Messages = ws2._sent.map((m: string) => JSON.parse(m))
      const ws1Delivers = ws1Messages.filter(
        (m: Record<string, unknown>) => m.type === 'relay:deliver'
      )
      const ws2Delivers = ws2Messages.filter(
        (m: Record<string, unknown>) => m.type === 'relay:deliver'
      )
      expect(ws1Delivers).toHaveLength(1)
      expect(ws2Delivers).toHaveLength(1)
    })

    it('removes only the disconnected connection, keeps others', async () => {
      const ws1 = createMockWebSocket()
      const ws2 = createMockWebSocket()

      await authenticateWs(ws1, 'alice')
      await authenticateWs(ws2, 'alice')

      // Disconnect ws1
      await room.webSocketClose(ws1, 1000, 'bye', true)

      // Send to alice — only ws2 should receive
      const sender = createMockWebSocket()
      await authenticateWs(sender, 'bob')

      const envelope = {
        v: 1,
        type: 'direct-message',
        scope: 'mutual',
        from: 'bob@epicflow',
        to: 'alice@epicflow',
        ct: 'x',
        ts: new Date().toISOString(),
        id: 'msg-multi-2',
      }
      await room.webSocketMessage(sender, JSON.stringify({ type: 'relay:send', envelope }))

      const ws2Delivers = ws2._sent
        .map((m: string) => JSON.parse(m))
        .filter((m: Record<string, unknown>) => m.type === 'relay:deliver')
      expect(ws2Delivers).toHaveLength(1)
    })
  })

  describe('memory-sync interception', () => {
    it('stores memory-sync envelope in canonical store', async () => {
      const aliceWs = createMockWebSocket()
      await authenticateWs(aliceWs, 'alice')

      const envelope = {
        v: 1,
        type: 'memory-sync',
        scope: 'private',
        from: 'alice@epicflow',
        to: 'alice@epicflow',
        ct: 'encrypted-memory-payload',
        ts: new Date().toISOString(),
        id: 'mem-001',
      }

      await room.webSocketMessage(aliceWs, JSON.stringify({ type: 'relay:send', envelope }))

      // Alice should get an ack
      const ack = getLastMessage(aliceWs)
      expect(ack.type).toBe('relay:ack')
      expect(ack.messageId).toBe('mem-001')
    })

    it('forwards memory-sync to other connections for same handle', async () => {
      const derpA = createMockWebSocket()
      const derpB = createMockWebSocket()
      await authenticateWs(derpA, 'alice')
      await authenticateWs(derpB, 'alice')

      const envelope = {
        v: 1,
        type: 'memory-sync',
        scope: 'private',
        from: 'alice@epicflow',
        to: 'alice@epicflow',
        ct: 'encrypted-memory-payload',
        ts: new Date().toISOString(),
        id: 'mem-002',
      }

      await room.webSocketMessage(derpA, JSON.stringify({ type: 'relay:send', envelope }))

      // derpB should receive relay:deliver
      const derpBMessages = derpB._sent.map((m: string) => JSON.parse(m))
      const derpBDelivers = derpBMessages.filter(
        (m: Record<string, unknown>) => m.type === 'relay:deliver'
      )
      expect(derpBDelivers).toHaveLength(1)
      expect((derpBDelivers[0].envelope as Record<string, unknown>).id).toBe('mem-002')

      // derpA should only get the ack, NOT a relay:deliver echo
      const derpAMessages = derpA._sent.map((m: string) => JSON.parse(m))
      const derpADelivers = derpAMessages.filter(
        (m: Record<string, unknown>) => m.type === 'relay:deliver'
      )
      expect(derpADelivers).toHaveLength(0)

      const derpAAck = derpAMessages.find((m: Record<string, unknown>) => m.type === 'relay:ack')
      expect(derpAAck).toBeDefined()
      expect(derpAAck?.messageId).toBe('mem-002')
    })

    it('does not intercept non-memory-sync envelopes', async () => {
      const aliceWs = createMockWebSocket()
      const bobWs = createMockWebSocket()
      await authenticateWs(aliceWs, 'alice')
      await authenticateWs(bobWs, 'bob')

      const envelope = {
        v: 1,
        type: 'direct-message',
        scope: 'mutual',
        from: 'alice@epicflow',
        to: 'bob@epicflow',
        ct: 'encrypted-payload',
        ts: new Date().toISOString(),
        id: 'dm-003',
      }

      await room.webSocketMessage(aliceWs, JSON.stringify({ type: 'relay:send', envelope }))

      // Normal routing: bob gets relay:deliver
      const bobDelivers = bobWs._sent
        .map((m: string) => JSON.parse(m))
        .filter((m: Record<string, unknown>) => m.type === 'relay:deliver')
      expect(bobDelivers).toHaveLength(1)
      expect((bobDelivers[0].envelope as Record<string, unknown>).id).toBe('dm-003')

      // Alice gets ack
      const ack = getLastMessage(aliceWs)
      expect(ack.type).toBe('relay:ack')
      expect(ack.messageId).toBe('dm-003')
    })
  })

  describe('sync-request handler', () => {
    it('responds with envelopes since checkpoint', async () => {
      const aliceWs = createMockWebSocket()
      await authenticateWs(aliceWs, 'alice')

      const envelope = {
        v: 1,
        type: 'memory-sync',
        scope: 'private',
        from: 'alice@epicflow',
        to: 'alice@epicflow',
        ct: 'encrypted-memory-payload',
        ts: '2026-01-02T00:00:00.000Z',
        id: 'mem-sync-001',
      }

      // Store a memory-sync envelope via relay:send
      await room.webSocketMessage(aliceWs, JSON.stringify({ type: 'relay:send', envelope }))

      // Now send a sync-request from another connection for the same handle
      const aliceWs2 = createMockWebSocket()
      await authenticateWs(aliceWs2, 'alice')

      await room.webSocketMessage(
        aliceWs2,
        JSON.stringify({ type: 'sync-request', since: '2026-01-01T00:00:00.000Z' })
      )

      const response = getLastMessage(aliceWs2)
      expect(response.type).toBe('sync-response')
      expect((response.envelopes as unknown[]).length).toBeGreaterThanOrEqual(1)
      const envelopes = response.envelopes as Record<string, unknown>[]
      const found = envelopes.find(e => e.id === 'mem-sync-001')
      expect(found).toBeDefined()
      expect(response.hasMore).toBe(false)
      expect(typeof response.checkpoint).toBe('string')
    })

    it('returns empty response for no envelopes since checkpoint', async () => {
      const aliceWs = createMockWebSocket()
      await authenticateWs(aliceWs, 'alice')

      // Use a future checkpoint so no envelopes match
      await room.webSocketMessage(
        aliceWs,
        JSON.stringify({ type: 'sync-request', since: '2099-12-31T23:59:59.999Z' })
      )

      const response = getLastMessage(aliceWs)
      expect(response.type).toBe('sync-response')
      expect((response.envelopes as unknown[]).length).toBe(0)
      expect(response.hasMore).toBe(false)
    })

    it('rejects sync-request from unauthenticated connection', async () => {
      const ws = createMockWebSocket()
      ws.serializeAttachment({ authenticated: false, challenge: 'c', expiresAt: 'e' })
      ctx._websockets.push(ws)

      await room.webSocketMessage(
        ws,
        JSON.stringify({ type: 'sync-request', since: '2026-01-01T00:00:00.000Z' })
      )

      const response = getLastMessage(ws)
      expect(response.type).toBe('error')
      expect(response.error).toContain('Not authenticated')
    })
  })

  describe('group fan-out routing', () => {
    it('delivers group message to all online members', async () => {
      // Insert group members
      const orm = drizzle(env.DB)
      await orm.insert(groupMembers).values([
        { groupId: 'team-alpha', handle: 'alice', addedAt: new Date().toISOString() },
        { groupId: 'team-alpha', handle: 'bob', addedAt: new Date().toISOString() },
      ])

      const aliceWs = createMockWebSocket()
      const bobWs = createMockWebSocket()
      await authenticateWs(aliceWs, 'alice')
      await authenticateWs(bobWs, 'bob')
      bobWs._sent.length = 0 // Clear auth messages

      const envelope = {
        v: 1,
        type: 'group-message',
        scope: 'group',
        from: 'alice@epicflow',
        to: 'group:team-alpha',
        ct: 'encrypted-group-data',
        groupKeyId: 'team-alpha',
        ts: new Date().toISOString(),
        id: 'group-msg-001',
      }

      await room.webSocketMessage(aliceWs, JSON.stringify({ type: 'relay:send', envelope }))

      // Alice gets ack
      const ack = getLastMessage(aliceWs)
      expect(ack.type).toBe('relay:ack')
      expect(ack.messageId).toBe('group-msg-001')

      // Bob receives the group message
      const bobMessages = bobWs._sent.map((m: string) => JSON.parse(m))
      const bobDelivers = bobMessages.filter(
        (m: Record<string, unknown>) => m.type === 'relay:deliver'
      )
      expect(bobDelivers).toHaveLength(1)
      expect((bobDelivers[0].envelope as Record<string, unknown>).id).toBe('group-msg-001')
    })

    it('mailboxes group message for offline members', async () => {
      const orm = drizzle(env.DB)
      await orm.insert(groupMembers).values([
        { groupId: 'team-alpha', handle: 'alice', addedAt: new Date().toISOString() },
        { groupId: 'team-alpha', handle: 'bob', addedAt: new Date().toISOString() },
      ])

      const aliceWs = createMockWebSocket()
      await authenticateWs(aliceWs, 'alice')
      // Bob is NOT connected

      const envelope = {
        v: 1,
        type: 'group-message',
        scope: 'group',
        from: 'alice@epicflow',
        to: 'group:team-alpha',
        ct: 'encrypted-group-data',
        groupKeyId: 'team-alpha',
        ts: new Date().toISOString(),
        id: 'group-msg-002',
      }

      await room.webSocketMessage(aliceWs, JSON.stringify({ type: 'relay:send', envelope }))

      // Alice gets ack
      expect(getLastMessage(aliceWs).type).toBe('relay:ack')

      // Bob later connects and drains mailbox
      const bobWs = createMockWebSocket()
      await authenticateWs(bobWs, 'bob')
      await room.webSocketMessage(bobWs, JSON.stringify({ type: 'mailbox:drain' }))

      const batch = getLastMessage(bobWs)
      expect(batch.type).toBe('mailbox:batch')
      expect((batch.envelopes as unknown[]).length).toBe(1)
    })

    it('rejects group message from non-member', async () => {
      // Create group with only bob as member (alice is NOT a member)
      const orm = drizzle(env.DB)
      await orm
        .insert(groupMembers)
        .values([{ groupId: 'team-alpha', handle: 'bob', addedAt: new Date().toISOString() }])

      const aliceWs = createMockWebSocket()
      await authenticateWs(aliceWs, 'alice')

      const envelope = {
        v: 1,
        type: 'group-message',
        scope: 'group',
        from: 'alice@epicflow',
        to: 'group:team-alpha',
        ct: 'encrypted-group-data',
        groupKeyId: 'team-alpha',
        ts: new Date().toISOString(),
        id: 'group-msg-unauth',
      }

      await room.webSocketMessage(aliceWs, JSON.stringify({ type: 'relay:send', envelope }))

      const err = getLastMessage(aliceWs)
      expect(err.type).toBe('relay:error')
      expect(err.error).toContain('Not a member')
    })

    it('does not deliver group message back to sender', async () => {
      const orm = drizzle(env.DB)
      await orm
        .insert(groupMembers)
        .values([{ groupId: 'team-alpha', handle: 'alice', addedAt: new Date().toISOString() }])

      const aliceWs = createMockWebSocket()
      await authenticateWs(aliceWs, 'alice')
      aliceWs._sent.length = 0 // Clear auth messages

      const envelope = {
        v: 1,
        type: 'group-message',
        scope: 'group',
        from: 'alice@epicflow',
        to: 'group:team-alpha',
        ct: 'x',
        groupKeyId: 'team-alpha',
        ts: new Date().toISOString(),
        id: 'group-msg-003',
      }

      await room.webSocketMessage(aliceWs, JSON.stringify({ type: 'relay:send', envelope }))

      const messages = aliceWs._sent.map((m: string) => JSON.parse(m))
      const delivers = messages.filter((m: Record<string, unknown>) => m.type === 'relay:deliver')
      expect(delivers).toHaveLength(0) // No echo back to sender
      expect(messages.find((m: Record<string, unknown>) => m.type === 'relay:ack')).toBeDefined()
    })
  })

  describe('connection lifecycle', () => {
    it('handles pong message', async () => {
      const ws = createMockWebSocket()
      await authenticateWs(ws, 'alice')

      // Send pong (should not produce any response, just updates lastPong)
      const sentBefore = ws._sent.length
      await room.webSocketMessage(ws, JSON.stringify({ type: 'control:pong' }))
      // Pong handler does not send a response
      expect(ws._sent.length).toBe(sentBefore)
    })

    it('handles webSocketClose by removing from registry', async () => {
      const aliceWs = createMockWebSocket()
      const bobWs = createMockWebSocket()
      await authenticateWs(aliceWs, 'alice')
      await authenticateWs(bobWs, 'bob')

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
