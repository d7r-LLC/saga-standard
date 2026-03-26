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
import { createKeyResolver } from './key-resolver'

const SYNC_CHECKPOINT_KEY = 'checkpoint:sync'

export function createSagaClient(config: SagaClientConfig): SagaClient {
  const handle = config.identity.split('@')[0]
  const keyResolver = createKeyResolver(config.hubUrl, config.fetchFn)
  const messageHandlers = new Set<(from: string, msg: SagaDirectMessage) => void>()
  const groupHandlers = new Set<(groupId: string, from: string, msg: SagaDirectMessage) => void>()
  const connectionHandlers = new Set<(connected: boolean) => void>()
  const peers = new Map<string, ConnectedPeer>()

  const dedup = createDedup()
  const backend = config.storageBackend ?? new MemoryBackend()
  const store = createEncryptedStore(config.keyRing, backend)

  // Decrypt function wired to KeyRing + key resolver
  async function decrypt(envelope: SagaEncryptedEnvelope): Promise<Uint8Array> {
    let senderKey: Uint8Array | undefined
    try {
      senderKey = await keyResolver.resolve(envelope.from)
    } catch {
      // Sender key not available — proceed without it (private scope doesn't need it)
    }
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
        if (connected) {
          loadCheckpointAndSync()
        }
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
      async onSyncResponse(envelopes, checkpoint, hasMore) {
        // Decrypt and store each envelope via the router
        for (const envelope of envelopes) {
          try {
            await router.handleEnvelope(envelope)
          } catch {
            // Skip envelopes we can't decrypt
          }
        }

        // Persist the new checkpoint
        await store.put(SYNC_CHECKPOINT_KEY, { checkpoint })

        // If more envelopes remain, request the next batch
        if (hasMore) {
          connection.sendSyncRequest(checkpoint)
        }
      },
    },
    createWebSocket: config.createWebSocket,
  })

  async function loadCheckpointAndSync(): Promise<void> {
    let since = '1970-01-01T00:00:00.000Z'
    try {
      const saved = (await store.get(SYNC_CHECKPOINT_KEY)) as { checkpoint: string } | undefined
      if (saved?.checkpoint) {
        since = saved.checkpoint
      }
    } catch {
      // No checkpoint yet — sync from beginning
    }
    connection.sendSyncRequest(since)
  }

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
      const recipientKey = await keyResolver.resolve(to)

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
      keyResolver.register(identity, publicKey)
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
