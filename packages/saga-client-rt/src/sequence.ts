// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

interface Sequenceable {
  from: string
  seq?: number
  id: string
  ts?: string
}

export interface SequenceTracker {
  /** Get the next sequence number for a sender identity */
  next(sender: string): number
  /** Reorder messages by per-sender sequence number (stable, groups by sender) */
  reorder<T extends Sequenceable>(messages: T[]): T[]
}

/**
 * Per-sender monotonic sequence tracker.
 * Stamps outbound envelopes with incrementing sequence numbers.
 * reorder() is provided for future inbound delivery ordering.
 */
export function createSequenceTracker(): SequenceTracker {
  const counters = new Map<string, number>()

  return {
    next(sender: string): number {
      const current = counters.get(sender) ?? 0
      const next = current + 1
      counters.set(sender, next)
      return next
    },

    reorder<T extends Sequenceable>(messages: T[]): T[] {
      return [...messages].sort((a, b) => {
        // Primary: sort by sender (stable grouping)
        const senderCmp = a.from.localeCompare(b.from)
        if (senderCmp !== 0) return senderCmp

        // Secondary: sort by sequence number if both have one
        if (a.seq != null && b.seq != null) {
          return a.seq - b.seq
        }

        // Fallback: sort by timestamp
        if (a.ts && b.ts) {
          return a.ts.localeCompare(b.ts)
        }

        return 0
      })
    },
  }
}
