// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { MemoryBackend, createEncryptedStore, open, seal } from '@epicdm/saga-crypto'
import type {
  ConnectedPeer,
  MemoryFilter,
  PolicyAuditEntry,
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
import { classifyMemory } from './policy-engine'
import { runRetention } from './retention-engine'

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

  // Phase 6: Company governance store (org-internal memories)
  const companyBackend =
    config.governance?.companyStorageBackend ??
    (config.governance ? new MemoryBackend() : undefined)
  const companyStore =
    config.governance && companyBackend
      ? createEncryptedStore(config.governance.companyKeyRing, companyBackend)
      : undefined

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
      if (message.messageType === 'key-distribution') {
        const payload = message.payload as {
          groupId: string
          wrappedKey: { ciphertext: string; nonce: string }
        }
        // Resolve sender key asynchronously for group key unwrapping
        void (async () => {
          try {
            const senderPublicKey = await keyResolver.resolve(from)
            const wrappedKey = {
              ciphertext: Uint8Array.from(atob(payload.wrappedKey.ciphertext), c =>
                c.charCodeAt(0)
              ),
              nonce: Uint8Array.from(atob(payload.wrappedKey.nonce), c => c.charCodeAt(0)),
            }
            config.keyRing.addGroupKey(payload.groupId, wrappedKey, senderPublicKey)
          } catch {
            // Key distribution failed — ignore silently
          }
        })()
        return
      }
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

  // Phase 6: Retention enforcement timer (runs hourly when governance is active)
  const retentionInterval =
    config.governance && companyStore
      ? setInterval(
          async () => {
            try {
              await runRetention(store, companyStore, config.governance!.policy, entry => {
                store.put(`audit:${entry.memoryId}:retention`, entry).catch(() => {})
              })
            } catch {
              // Retention run failed — will retry next interval
            }
          },
          60 * 60 * 1000
        )
      : undefined

  const sagaClient: SagaClient = {
    connect(): Promise<void> {
      return connection.connect()
    },

    async disconnect(): Promise<void> {
      clearInterval(dedupCleanupInterval)
      if (retentionInterval) clearInterval(retentionInterval)
      connection.disconnect()
    },

    isConnected(): boolean {
      return connection.isConnected()
    },

    async storeMemory(memory: SagaMemory): Promise<void> {
      // Phase 6: Policy engine classification
      if (config.governance && companyStore) {
        const classification = classifyMemory(memory, config.governance.policy)
        const classified = { ...memory, scope: classification.scope }

        // Log audit entry
        const auditEntry = {
          memoryId: memory.id,
          memoryType: memory.type,
          originalScope: (memory.scope ?? 'unclassified') as string,
          appliedScope: classification.scope,
          reason: classification.reason,
          timestamp: new Date().toISOString(),
        }
        await store.put(`audit:${memory.id}`, auditEntry)

        if (classification.scope === 'org-internal') {
          // Org-internal: company store only, no sync
          await companyStore.put(`memory:${memory.id}`, classified)
          return
        }

        // mutual or agent-portable: agent store + sync
        await store.put(`memory:${memory.id}`, classified)

        const plaintext = new TextEncoder().encode(JSON.stringify(classified))
        const sealScope = classification.scope === 'mutual' ? 'mutual' : 'private'
        const sealPayload: Record<string, unknown> = {
          type: 'memory-sync',
          scope: sealScope,
          from: config.identity,
          to: config.identity,
          plaintext,
        }
        if (sealScope === 'mutual') {
          sealPayload.recipientPublicKey = config.governance.companyKeyRing.getPublicKey()
        }
        const envelope = await seal(
          sealPayload as unknown as Parameters<typeof seal>[0],
          config.keyRing
        )
        connection.send(envelope as SagaEncryptedEnvelope)
        return
      }

      // No governance — original behavior
      await store.put(`memory:${memory.id}`, memory)
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
      let results = entries.map((e: { value: unknown }) => e.value as SagaMemory)

      // Phase 6: Merge org-internal memories from company store
      if (companyStore) {
        const companyEntries = await companyStore.query({ prefix: 'memory:' })
        const companyMemories = companyEntries.map((e: { value: unknown }) => e.value as SagaMemory)
        results = [...results, ...companyMemories]
      }

      if (filter.type) {
        results = results.filter((m: SagaMemory) => m.type === filter.type)
      }
      if (filter.since) {
        const since = filter.since
        results = results.filter((m: SagaMemory) => m.createdAt >= since)
      }
      if (filter.prefix) {
        const prefix = filter.prefix
        results = results.filter((m: SagaMemory) => m.id.startsWith(prefix))
      }
      if (filter.limit !== undefined) {
        results = results.slice(0, filter.limit)
      }

      return results
    },

    async deleteMemory(memoryId: string): Promise<void> {
      await store.delete(`memory:${memoryId}`)
      if (companyStore) {
        await companyStore.delete(`memory:${memoryId}`)
      }
    },

    async queryAuditLog(filter?: { since?: string; limit?: number }): Promise<PolicyAuditEntry[]> {
      if (!config.governance) return []

      const entries = await store.query({ prefix: 'audit:' })
      let results = entries.map((e: { value: unknown }) => e.value as PolicyAuditEntry)

      if (filter?.since) {
        const since = filter.since
        results = results.filter(e => e.timestamp >= since)
      }
      if (filter?.limit !== undefined) {
        results = results.slice(0, filter.limit)
      }

      return results
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

    async distributeGroupKey(groupId: string, memberIdentities: string[]): Promise<void> {
      for (const member of memberIdentities) {
        if (member === config.identity) continue // Skip self

        const recipientKey = await keyResolver.resolve(member)
        const wrappedKey = config.keyRing.wrapGroupKeyFor(groupId, recipientKey)

        await sagaClient.sendMessage(member, {
          messageType: 'key-distribution',
          payload: {
            groupId,
            wrappedKey: {
              ciphertext: btoa(String.fromCharCode(...wrappedKey.ciphertext)),
              nonce: btoa(String.fromCharCode(...wrappedKey.nonce)),
            },
          },
        })
      }
    },

    getPeers(): ConnectedPeer[] {
      return Array.from(peers.values())
    },

    onConnectionChange(handler): Unsubscribe {
      connectionHandlers.add(handler)
      return () => connectionHandlers.delete(handler)
    },
  }
  return sagaClient
}
