// packages/server/src/relay/relay-room.ts
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import type { Env } from '../bindings'
import type { ConnectionState, RelayEnvelope, WebSocketAttachment } from './types'
import {
  NFT_RECHECK_INTERVAL_MS,
  PING_INTERVAL_MS,
  STALE_TIMEOUT_MS,
  parseClientMessage,
} from './types'
import { generateWsChallenge, reVerifyNft, verifyWsAuth } from './ws-auth'
import { validateEnvelope } from './envelope-validator'
import { createMailbox } from './mailbox'
import type { RelayMailbox } from './mailbox'

/**
 * RelayRoom Durable Object — manages WebSocket connections for the SAGA relay.
 *
 * Uses the Hibernatable WebSocket API. Connection state is stored as WebSocket
 * attachments so it survives DO hibernation. An in-memory handle→WebSocket map
 * is lazily reconstructed from attachments on wake.
 *
 * One instance per directory acts as the relay coordinator.
 */
export class RelayRoom {
  private ctx: DurableObjectState
  private env: Env
  private mailbox: RelayMailbox

  /** Lazy cache: handle → Set<WebSocket>. Reconstructed from attachments on demand. */
  private handleMap: Map<string, Set<WebSocket>> | null = null

  constructor(ctx: DurableObjectState, env: Env) {
    this.ctx = ctx
    this.env = env
    this.mailbox = createMailbox(this.env.RELAY_MAILBOX)
  }

  // ── WebSocket upgrade ─────────────────────────────────────────

  async fetch(request: Request): Promise<Response> {
    const upgradeHeader = request.headers.get('Upgrade')
    if (upgradeHeader?.toLowerCase() !== 'websocket') {
      return new Response('Expected WebSocket upgrade', { status: 426 })
    }

    const pair = new WebSocketPair()
    const [client, server] = Object.values(pair)

    this.ctx.acceptWebSocket(server)

    const { challenge, expiresAt } = generateWsChallenge()
    const attachment: WebSocketAttachment = {
      authenticated: false,
      challenge,
      expiresAt,
    }
    server.serializeAttachment(attachment)

    server.send(JSON.stringify({ type: 'auth:challenge', challenge, expiresAt }))

    // Schedule heartbeat alarm if not already set
    const currentAlarm = await this.ctx.storage.getAlarm()
    if (!currentAlarm) {
      await this.ctx.storage.setAlarm(Date.now() + PING_INTERVAL_MS)
    }

    return new Response(null, { status: 101, webSocket: client })
  }

  // ── Hibernatable WebSocket handlers ───────────────────────────

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message !== 'string') {
      this.sendJson(ws, { type: 'error', error: 'Binary messages not supported' })
      return
    }

    const msg = parseClientMessage(message)
    if (!msg) {
      this.sendJson(ws, { type: 'error', error: 'Invalid message format' })
      return
    }

    switch (msg.type) {
      case 'auth:verify':
        await this.handleAuthVerify(ws, msg)
        break
      case 'relay:send':
        await this.handleRelaySend(ws, msg)
        break
      case 'control:pong':
        this.handlePong(ws)
        break
      case 'mailbox:drain':
        await this.handleMailboxDrain(ws)
        break
      case 'mailbox:ack':
        await this.handleMailboxAck(ws, msg)
        break
    }
  }

  async webSocketClose(
    ws: WebSocket,
    _code: number,
    _reason: string,
    _wasClean: boolean
  ): Promise<void> {
    this.removeConnection(ws)
  }

  async webSocketError(ws: WebSocket, _error: unknown): Promise<void> {
    this.removeConnection(ws)
  }

  async alarm(): Promise<void> {
    const handleMap = this.getHandleMap()

    // Send pings
    for (const [, wsSet] of handleMap) {
      for (const ws of wsSet) {
        try {
          this.sendJson(ws, { type: 'control:ping' })
        } catch {
          this.removeConnection(ws)
        }
      }
    }

    // Cleanup stale connections
    const now = Date.now()
    for (const [, wsSet] of handleMap) {
      for (const ws of wsSet) {
        const attachment = ws.deserializeAttachment() as WebSocketAttachment
        if (attachment.authenticated && now - attachment.state.lastPong > STALE_TIMEOUT_MS) {
          try {
            ws.close(4001, 'Connection stale')
          } catch {
            // WebSocket may already be closed; ignore close error and proceed to cleanup
          }
          this.removeConnection(ws)
        }
      }
    }

    // Re-verify NFT ownership
    for (const [handle, wsSet] of this.getHandleMap()) {
      for (const ws of wsSet) {
        const attachment = ws.deserializeAttachment() as WebSocketAttachment
        if (
          attachment.authenticated &&
          now - attachment.state.lastNftCheck > NFT_RECHECK_INTERVAL_MS
        ) {
          const valid = await reVerifyNft(handle, attachment.state.walletAddress, this.env.DB)
          if (!valid) {
            this.sendJson(ws, { type: 'auth:error', error: 'NFT verification failed' })
            try {
              ws.close(4003, 'NFT verification failed')
            } catch {
              // WebSocket may already be closed; ignore close error and proceed to cleanup
            }
            this.removeConnection(ws)
          } else {
            attachment.state.lastNftCheck = now
            ws.serializeAttachment(attachment)
          }
        }
      }
    }

    // Re-schedule if connections remain
    if (this.getHandleMap().size > 0) {
      await this.ctx.storage.setAlarm(Date.now() + PING_INTERVAL_MS)
    }
  }

  // ── Private handlers ──────────────────────────────────────────

  private async handleAuthVerify(
    ws: WebSocket,
    msg: {
      walletAddress: string
      chain: string
      handle: string
      signature: string
      challenge: string
    }
  ): Promise<void> {
    const attachment = ws.deserializeAttachment() as WebSocketAttachment | null

    if (!attachment || attachment.authenticated) {
      this.sendJson(ws, {
        type: 'auth:error',
        error: attachment?.authenticated ? 'Already authenticated' : 'No pending challenge',
      })
      return
    }

    if (msg.challenge !== attachment.challenge) {
      this.sendJson(ws, { type: 'auth:error', error: 'Challenge mismatch' })
      return
    }

    const result = await verifyWsAuth(
      msg.walletAddress,
      msg.chain,
      msg.handle,
      msg.signature,
      attachment.challenge,
      attachment.expiresAt,
      this.env.DB
    )

    if (!result.ok) {
      this.sendJson(ws, { type: 'auth:error', error: result.error })
      try {
        ws.close(4002, result.error)
      } catch {
        // WebSocket may already be closed; ignore close error
      }
      return
    }

    // Register authenticated connection
    const authAttachment: WebSocketAttachment = {
      authenticated: true,
      state: result.state,
    }
    ws.serializeAttachment(authAttachment)
    this.invalidateHandleMap()

    this.sendJson(ws, { type: 'auth:success', handle: result.state.handle })
  }

  private async handleRelaySend(ws: WebSocket, msg: { envelope: unknown }): Promise<void> {
    const senderState = this.getAuthenticatedState(ws)
    if (!senderState) {
      this.sendJson(ws, { type: 'error', error: 'Not authenticated' })
      return
    }

    const envelope = msg.envelope as RelayEnvelope
    const validationError = validateEnvelope(envelope)
    if (validationError) {
      this.sendJson(ws, {
        type: 'relay:error',
        messageId: ((envelope as Record<string, unknown>)?.id as string) ?? '',
        error: validationError.message,
      })
      return
    }

    // Verify sender identity matches (exact handle match before @)
    const senderHandle = envelope.from.split('@')[0]
    if (senderHandle !== senderState.handle) {
      this.sendJson(ws, {
        type: 'relay:error',
        messageId: envelope.id,
        error: 'Sender identity mismatch',
      })
      return
    }

    // Route to recipients
    const recipients = Array.isArray(envelope.to) ? envelope.to : [envelope.to]

    for (const recipient of recipients) {
      const recipientHandle = recipient.split('@')[0]
      const recipientSet = this.getHandleMap().get(recipientHandle)

      if (recipientSet && recipientSet.size > 0) {
        for (const recipientWs of recipientSet) {
          try {
            this.sendJson(recipientWs, { type: 'relay:deliver', envelope })
          } catch {
            // Individual send failure
          }
        }
      } else {
        await this.mailbox.store(recipientHandle, envelope)
      }
    }

    this.sendJson(ws, { type: 'relay:ack', messageId: envelope.id })
  }

  private handlePong(ws: WebSocket): void {
    const attachment = ws.deserializeAttachment() as WebSocketAttachment
    if (attachment?.authenticated) {
      attachment.state.lastPong = Date.now()
      ws.serializeAttachment(attachment)
    }
  }

  private async handleMailboxDrain(ws: WebSocket): Promise<void> {
    const state = this.getAuthenticatedState(ws)
    if (!state) {
      this.sendJson(ws, { type: 'error', error: 'Not authenticated' })
      return
    }

    const { envelopes, remaining } = await this.mailbox.drain(state.handle)
    this.sendJson(ws, { type: 'mailbox:batch', envelopes, remaining })
  }

  private async handleMailboxAck(ws: WebSocket, msg: { messageIds: string[] }): Promise<void> {
    const state = this.getAuthenticatedState(ws)
    if (!state) {
      this.sendJson(ws, { type: 'error', error: 'Not authenticated' })
      return
    }

    await this.mailbox.ack(state.handle, msg.messageIds)
  }

  // ── Helpers ───────────────────────────────────────────────────

  /**
   * Lazily build handle→Set<WebSocket> map from WebSocket attachments.
   * Survives DO hibernation via reconstruction.
   */
  private getHandleMap(): Map<string, Set<WebSocket>> {
    if (!this.handleMap) {
      this.handleMap = new Map()
      for (const ws of this.ctx.getWebSockets()) {
        const attachment = ws.deserializeAttachment() as WebSocketAttachment | null
        if (attachment?.authenticated) {
          const handle = attachment.state.handle
          if (!this.handleMap.has(handle)) {
            this.handleMap.set(handle, new Set())
          }
          this.handleMap.get(handle)!.add(ws)
        }
      }
    }
    return this.handleMap
  }

  /** Invalidate the cached handle map (call after registration/removal) */
  private invalidateHandleMap(): void {
    this.handleMap = null
  }

  /** Remove a WebSocket from the registry */
  private removeConnection(ws: WebSocket): void {
    const attachment = ws.deserializeAttachment() as WebSocketAttachment | null
    if (attachment?.authenticated) {
      const set = this.handleMap?.get(attachment.state.handle)
      if (set) {
        set.delete(ws)
        if (set.size === 0) {
          this.handleMap?.delete(attachment.state.handle)
        }
      }
    }
    // Mark as unauthenticated so it's excluded from future map rebuilds
    ws.serializeAttachment(null)
    this.invalidateHandleMap()
  }

  /** Get the connection state for an authenticated WebSocket, or null */
  private getAuthenticatedState(ws: WebSocket): ConnectionState | null {
    const attachment = ws.deserializeAttachment() as WebSocketAttachment | null
    if (attachment?.authenticated) {
      return attachment.state
    }
    return null
  }

  /** Send a JSON message to a WebSocket */
  private sendJson(ws: WebSocket, data: Record<string, unknown>): void {
    ws.send(JSON.stringify(data))
  }
}
