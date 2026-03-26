// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import type {
  RelayConnectionConfig,
  SagaEncryptedEnvelope,
  ServerMessage,
  WebSocketLike,
} from './types'

/** WebSocket-based relay connection with auth, reconnect, and message buffering */
export interface RelayConnection {
  connect(): Promise<void>
  disconnect(): void
  send(envelope: SagaEncryptedEnvelope): void
  drainMailbox(): void
  ackMailbox(messageIds: string[]): void
  isConnected(): boolean
}

export function createRelayConnection(config: RelayConnectionConfig): RelayConnection {
  let ws: WebSocketLike | null = null
  let connected = false
  let disconnecting = false
  let connectPromise: { resolve: () => void; reject: (err: Error) => void } | null = null
  let reconnectAttempts = 0
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  const buffer: SagaEncryptedEnvelope[] = []

  const createWs =
    config.createWebSocket ?? ((url: string) => new WebSocket(url) as unknown as WebSocketLike)

  function sendJson(data: unknown): void {
    ws?.send(JSON.stringify(data))
  }

  function openWebSocket(): void {
    ws = createWs(config.hubUrl)

    ws.onopen = () => {
      // Wait for server to send auth:challenge
    }

    ws.onmessage = (ev: MessageEvent) => {
      try {
        const msg = JSON.parse(String(ev.data)) as ServerMessage
        handleServerMessage(msg)
      } catch {
        // Ignore unparseable messages
      }
    }

    ws.onclose = () => {
      const wasConnected = connected
      connected = false
      ws = null

      if (wasConnected) {
        config.callbacks.onConnectionChange(false)
      }

      if (connectPromise) {
        connectPromise.reject(new Error('WebSocket closed before auth completed'))
        connectPromise = null
      }

      if (!disconnecting) {
        scheduleReconnect()
      }
    }

    ws.onerror = () => {
      // onclose fires after onerror — reconnect handled there
    }
  }

  async function handleServerMessage(msg: ServerMessage): Promise<void> {
    switch (msg.type) {
      case 'auth:challenge': {
        try {
          const signature = await config.signer.sign(msg.challenge)
          sendJson({
            type: 'auth:verify',
            walletAddress: config.signer.address,
            chain: config.signer.chain,
            handle: config.handle,
            signature,
            challenge: msg.challenge,
          })
        } catch (err) {
          connectPromise?.reject(err instanceof Error ? err : new Error(String(err)))
          connectPromise = null
        }
        break
      }

      case 'auth:success':
        connected = true
        reconnectAttempts = 0
        config.callbacks.onConnectionChange(true)

        // Drain mailbox on connect
        sendJson({ type: 'mailbox:drain' })

        // Drain buffered outbound messages
        while (buffer.length > 0) {
          const envelope = buffer.shift()!
          sendJson({ type: 'relay:send', envelope })
        }

        connectPromise?.resolve()
        connectPromise = null
        break

      case 'auth:error':
        config.callbacks.onError(msg.error)
        disconnecting = true // Prevent reconnect — auth failure is terminal
        connectPromise?.reject(new Error(msg.error))
        connectPromise = null
        ws?.close(4001, 'Auth failed')
        break

      case 'relay:deliver':
        config.callbacks.onEnvelope(msg.envelope as SagaEncryptedEnvelope)
        break

      case 'relay:ack':
        config.callbacks.onRelayAck(msg.messageId)
        break

      case 'relay:error':
        config.callbacks.onRelayError(msg.messageId, msg.error)
        break

      case 'control:ping':
        sendJson({ type: 'control:pong' })
        break

      case 'mailbox:batch':
        config.callbacks.onMailboxBatch(msg.envelopes as SagaEncryptedEnvelope[], msg.remaining)
        break

      case 'error':
        config.callbacks.onError(msg.error)
        break
    }
  }

  function scheduleReconnect(): void {
    if (reconnectTimer || disconnecting) return
    const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 60_000)
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null
      reconnectAttempts++
      openWebSocket()
    }, delay)
  }

  return {
    connect(): Promise<void> {
      if (connected) return Promise.resolve()
      if (connectPromise) {
        return new Promise<void>((resolve, reject) => {
          const existing = connectPromise!
          connectPromise = {
            resolve: () => {
              existing.resolve()
              resolve()
            },
            reject: (err: Error) => {
              existing.reject(err)
              reject(err)
            },
          }
        })
      }
      disconnecting = false
      reconnectAttempts = 0
      return new Promise<void>((resolve, reject) => {
        connectPromise = { resolve, reject }
        openWebSocket()
      })
    },

    disconnect(): void {
      disconnecting = true
      if (reconnectTimer) {
        clearTimeout(reconnectTimer)
        reconnectTimer = null
      }
      if (ws) {
        const wasConnected = connected
        connected = false
        try {
          ws.close(1000, 'Client disconnecting')
        } catch {
          // Already closed
        }
        ws = null
        if (wasConnected) {
          config.callbacks.onConnectionChange(false)
        }
      }
    },

    send(envelope: SagaEncryptedEnvelope): void {
      if (connected && ws) {
        sendJson({ type: 'relay:send', envelope })
      } else {
        buffer.push(envelope)
      }
    },

    drainMailbox(): void {
      if (connected) {
        sendJson({ type: 'mailbox:drain' })
      }
    },

    ackMailbox(messageIds: string[]): void {
      if (connected) {
        sendJson({ type: 'mailbox:ack', messageIds })
      }
    },

    isConnected(): boolean {
      return connected
    },
  }
}
