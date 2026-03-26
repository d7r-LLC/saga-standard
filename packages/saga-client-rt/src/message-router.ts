// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import type { MessageRouterCallbacks, SagaEncryptedEnvelope } from './types'
import type { MessageDedup } from './dedup'

/** Decryption function — injected by the SagaClient with KeyRing + peer keys */
export type DecryptFn = (envelope: SagaEncryptedEnvelope) => Promise<Uint8Array>

export interface MessageRouter {
  /** Process a single incoming envelope */
  handleEnvelope(envelope: SagaEncryptedEnvelope): Promise<void>
  /** Process a mailbox batch; returns IDs of successfully processed envelopes */
  handleMailboxBatch(envelopes: SagaEncryptedEnvelope[]): Promise<string[]>
}

export function createMessageRouter(
  decrypt: DecryptFn,
  dedup: MessageDedup,
  callbacks: MessageRouterCallbacks
): MessageRouter {
  return {
    async handleEnvelope(envelope: SagaEncryptedEnvelope): Promise<void> {
      if (dedup.has(envelope.id)) return

      const plaintext = await decrypt(envelope)
      const decoded = JSON.parse(new TextDecoder().decode(plaintext))

      // Mark as seen only after successful decrypt+decode
      dedup.add(envelope.id)

      switch (envelope.type) {
        case 'direct-message':
          callbacks.onDirectMessage(envelope.from, decoded)
          break
        case 'group-message': {
          if (!envelope.groupKeyId) {
            throw new Error(`Missing groupKeyId for group-message envelope ${envelope.id}`)
          }
          callbacks.onGroupMessage(envelope.groupKeyId, envelope.from, decoded)
          break
        }
        case 'memory-sync':
          callbacks.onMemorySync(envelope.from, decoded)
          break
      }
    },

    async handleMailboxBatch(envelopes: SagaEncryptedEnvelope[]): Promise<string[]> {
      const acked: string[] = []
      for (const envelope of envelopes) {
        try {
          await this.handleEnvelope(envelope)
          acked.push(envelope.id)
        } catch {
          // Skip envelopes we can't decrypt (missing peer key, corrupted, etc.)
        }
      }
      return acked
    },
  }
}
