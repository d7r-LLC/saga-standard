// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { MemoryBackend, createEncryptedStore, open, seal } from '@epicdm/saga-crypto'
import type {
  ConnectedPeer,
  MemoryFilter,
  SagaClient,
  SagaClientConfig,
  SagaDirectMessage,
  SagaEncryptedEnvelope,
  SagaMemory,
  Unsubscribe,
} from './types'
import { createRelayConnection } from './relay-connection'
import { createMessageRouter } from './message-router'
import { createDedup } from './dedup'

export function createSagaClient(config: SagaClientConfig): SagaClient {
  const handle = config.identity.split('@')[0]
  const peerKeys = new Map<string, Uint8Array>()
  const messageHandlers = new Set<(from: string, msg: SagaDirectMessage) => void>()
  const groupHandlers = new Set<(groupId: string, from: string, msg: SagaDirectMessage) => void>()
  const connectionHandlers = new Set<(connected: boolean) => void>()
  const peers = new Map<string, ConnectedPeer>()

  const dedup = createDedup()
  const backend = config.storageBackend ?? new MemoryBackend()
  const store = createEncryptedStore(config.keyRing, backend)

  // Decrypt function wired to KeyRing + peer keys
  async function decrypt(envelope: SagaEncryptedEnvelope): Promise<Uint8Array> {
    const senderKey = peerKeys.get(envelope.from)
    const result = open(envelope, config.keyRing, senderKey)
    return result instanceof Promise ? result : Promise.resolve(result)
  }

  const router = createMessageRouter(decrypt, dedup, {
    onDirectMessage(from, message) {
      peers.set(from, { handle: from, lastSeen: new Date().toISOString() })
      for (const handler of messageHandlers) handler(from, message)
    },
    onGroupMessage(groupId, from, message) {
      peers.set(from, { handle: from, lastSeen: new Date().toISOString() })
      for (const handler of groupHandlers) handler(groupId, from, message)
    },
    onMemorySync(_from, memory) {
      store.put(`memory:${memory.id}`, memory).catch(() => {})
    },
  })

  const connection = createRelayConnection({
    hubUrl: config.hubUrl,
    handle,
    signer: config.signer,
    callbacks: {
      onEnvelope(envelope) {
        router.handleEnvelope(envelope).catch(() => {})
      },
      async onMailboxBatch(envelopes, remaining) {
        const acked = await router.handleMailboxBatch(envelopes)
        if (acked.length > 0) {
          connection.ackMailbox(acked)
        }
        if (remaining > 0) {
          connection.drainMailbox()
        }
      },
      onConnectionChange(connected) {
        for (const handler of connectionHandlers) handler(connected)
      },
      onRelayAck() {
        // Placeholder for ack tracking (future enhancement)
      },
      onRelayError() {
        // Placeholder for send error handling (future enhancement)
      },
      onError() {
        // Placeholder for error surfacing (future enhancement)
      },
      onSyncResponse() {
        // Will be implemented in sync-on-activation task (Task 7)
      },
    },
    createWebSocket: config.createWebSocket,
  })

  // Periodically clean up dedup tracker
  const dedupCleanupInterval = setInterval(() => dedup.cleanup(), 10 * 60 * 1000)

  return {
    connect(): Promise<void> {
      return connection.connect()
    },

    async disconnect(): Promise<void> {
      clearInterval(dedupCleanupInterval)
      connection.disconnect()
    },

    isConnected(): boolean {
      return connection.isConnected()
    },

    async storeMemory(memory: SagaMemory): Promise<void> {
      await store.put(`memory:${memory.id}`, memory)

      // Push through relay as memory-sync envelope
      const plaintext = new TextEncoder().encode(JSON.stringify(memory))
      const envelope = await seal(
        {
          type: 'memory-sync',
          scope: 'private',
          from: config.identity,
          to: config.identity,
          plaintext,
        },
        config.keyRing
      )
      connection.send(envelope as SagaEncryptedEnvelope)
    },

    async queryMemory(filter: MemoryFilter): Promise<SagaMemory[]> {
      const entries = await store.query({ prefix: 'memory:' })
      let results = entries.map(e => e.value as SagaMemory)

      if (filter.type) {
        results = results.filter(m => m.type === filter.type)
      }
      if (filter.since) {
        const since = filter.since
        results = results.filter(m => m.createdAt >= since)
      }
      if (filter.prefix) {
        const prefix = filter.prefix
        results = results.filter(m => m.id.startsWith(prefix))
      }
      if (filter.limit !== undefined) {
        results = results.slice(0, filter.limit)
      }

      return results
    },

    async deleteMemory(memoryId: string): Promise<void> {
      await store.delete(`memory:${memoryId}`)
    },

    async sendMessage(to: string, message: SagaDirectMessage): Promise<string> {
      const recipientKey = peerKeys.get(to)
      if (!recipientKey) {
        throw new Error(`No public key registered for ${to}`)
      }

      const plaintext = new TextEncoder().encode(JSON.stringify(message))
      const envelope = await seal(
        {
          type: 'direct-message',
          scope: 'mutual',
          from: config.identity,
          to,
          plaintext,
          recipientPublicKey: recipientKey,
        },
        config.keyRing
      )
      const resolved = (
        envelope instanceof Promise ? await envelope : envelope
      ) as SagaEncryptedEnvelope
      connection.send(resolved)
      return resolved.id
    },

    onMessage(handler): Unsubscribe {
      messageHandlers.add(handler)
      return () => messageHandlers.delete(handler)
    },

    async sendGroupMessage(groupId: string, message: SagaDirectMessage): Promise<string> {
      if (!config.keyRing.hasGroupKey(groupId)) {
        throw new Error(`No group key loaded for ${groupId}`)
      }

      const plaintext = new TextEncoder().encode(JSON.stringify(message))
      const envelope = await seal(
        {
          type: 'group-message',
          scope: 'group',
          from: config.identity,
          to: `group:${groupId}`,
          plaintext,
          groupKeyId: groupId,
        },
        config.keyRing
      )
      const resolved = (
        envelope instanceof Promise ? await envelope : envelope
      ) as SagaEncryptedEnvelope
      connection.send(resolved)
      return resolved.id
    },

    onGroupMessage(handler): Unsubscribe {
      groupHandlers.add(handler)
      return () => groupHandlers.delete(handler)
    },

    registerPeerKey(identity: string, publicKey: Uint8Array): void {
      peerKeys.set(identity, publicKey)
    },

    getPeers(): ConnectedPeer[] {
      return Array.from(peers.values())
    },

    onConnectionChange(handler): Unsubscribe {
      connectionHandlers.add(handler)
      return () => connectionHandlers.delete(handler)
    },
  }
}
