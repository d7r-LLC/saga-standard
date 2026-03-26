// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import type { RelayEnvelope } from './types'
import { DM_TTL_SECONDS, MAILBOX_DRAIN_BATCH_SIZE, MAILBOX_TTL_SECONDS } from './types'

/**
 * KV-backed offline message store for the relay.
 *
 * Key format: `mailbox:{handle}:{timestamp}:{messageId}`
 * Value: JSON serialized RelayEnvelope
 * TTL: 30 days (configurable via constructor)
 *
 * Messages are stored when a recipient is offline and drained
 * in timestamp order when they reconnect.
 */
export interface RelayMailbox {
  store(handle: string, envelope: RelayEnvelope): Promise<void>
  drain(handle: string): Promise<{ envelopes: RelayEnvelope[]; remaining: number }>
  ack(handle: string, messageIds: string[]): Promise<void>
  count(handle: string): Promise<number>
}

function mailboxPrefix(handle: string): string {
  return `mailbox:${handle}:`
}

function mailboxKey(handle: string, envelope: RelayEnvelope): string {
  return `mailbox:${handle}:${envelope.ts}:${envelope.id}`
}

export function createMailbox(
  kv: KVNamespace,
  ttlSeconds: number = MAILBOX_TTL_SECONDS
): RelayMailbox {
  return {
    async store(handle, envelope) {
      const key = mailboxKey(handle, envelope)
      // Per-envelope TTL: use envelope.ttl if present,
      // otherwise use type-based default
      const envelopeTtl = typeof (envelope as Record<string, unknown>).ttl === 'number'
        ? (envelope as Record<string, unknown>).ttl as number
        : undefined
      const effectiveTtl = envelopeTtl
        ?? (envelope.type === 'direct-message' ? DM_TTL_SECONDS : ttlSeconds)
      await kv.put(key, JSON.stringify(envelope), { expirationTtl: effectiveTtl })
    },

    async drain(handle) {
      const prefix = mailboxPrefix(handle)
      const list = await kv.list({ prefix, limit: MAILBOX_DRAIN_BATCH_SIZE + 1 })

      const hasMore = list.keys.length > MAILBOX_DRAIN_BATCH_SIZE
      const keys = list.keys.slice(0, MAILBOX_DRAIN_BATCH_SIZE)
      const remaining = hasMore ? list.keys.length - MAILBOX_DRAIN_BATCH_SIZE : 0

      const envelopes: RelayEnvelope[] = []
      for (const key of keys) {
        const value = await kv.get(key.name)
        if (value) {
          envelopes.push(JSON.parse(value) as RelayEnvelope)
        }
      }

      return { envelopes, remaining }
    },

    async ack(handle, messageIds) {
      const prefix = mailboxPrefix(handle)
      const list = await kv.list({ prefix })
      const idsToDelete = new Set(messageIds)

      for (const key of list.keys) {
        // Key: mailbox:{handle}:{ts}:{messageId}
        const parts = key.name.split(':')
        const msgId = parts[parts.length - 1]
        if (idsToDelete.has(msgId)) {
          await kv.delete(key.name)
        }
      }
    },

    async count(handle) {
      const prefix = mailboxPrefix(handle)
      const list = await kv.list({ prefix })
      return list.keys.length
    },
  }
}
