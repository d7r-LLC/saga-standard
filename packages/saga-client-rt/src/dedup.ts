// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

/** Rolling-window message ID dedup tracker */
export interface MessageDedup {
  /** Check if a message ID has been seen */
  has(messageId: string): boolean
  /** Mark a message ID as seen */
  add(messageId: string): void
  /** Remove entries older than the TTL window */
  cleanup(): void
}

const DEDUP_TTL_MS = 60 * 60 * 1000 // 1 hour

export function createDedup(): MessageDedup {
  const seen = new Map<string, number>()

  return {
    has(messageId: string): boolean {
      return seen.has(messageId)
    },

    add(messageId: string): void {
      seen.set(messageId, Date.now())
    },

    cleanup(): void {
      const cutoff = Date.now() - DEDUP_TTL_MS
      for (const [id, ts] of seen) {
        if (ts < cutoff) {
          seen.delete(id)
        }
      }
    },
  }
}
