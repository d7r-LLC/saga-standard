// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { describe, expect, it } from 'vitest'
import { createSequenceTracker } from '../sequence'

describe('createSequenceTracker', () => {
  it('returns incrementing sequence numbers per sender', () => {
    const tracker = createSequenceTracker()
    expect(tracker.next('alice@hub')).toBe(1)
    expect(tracker.next('alice@hub')).toBe(2)
    expect(tracker.next('alice@hub')).toBe(3)
  })

  it('tracks separate sequences per sender', () => {
    const tracker = createSequenceTracker()
    expect(tracker.next('alice@hub')).toBe(1)
    expect(tracker.next('bob@hub')).toBe(1)
    expect(tracker.next('alice@hub')).toBe(2)
    expect(tracker.next('bob@hub')).toBe(2)
  })

  it('reorders out-of-order messages by seq', () => {
    const tracker = createSequenceTracker()
    const messages = [
      { from: 'alice@hub', seq: 3, id: 'c' },
      { from: 'alice@hub', seq: 1, id: 'a' },
      { from: 'alice@hub', seq: 2, id: 'b' },
    ]
    const ordered = tracker.reorder(messages)
    expect(ordered.map(m => m.id)).toEqual(['a', 'b', 'c'])
  })

  it('reorders messages from mixed senders independently', () => {
    const tracker = createSequenceTracker()
    const messages = [
      { from: 'bob@hub', seq: 2, id: 'b2' },
      { from: 'alice@hub', seq: 2, id: 'a2' },
      { from: 'alice@hub', seq: 1, id: 'a1' },
      { from: 'bob@hub', seq: 1, id: 'b1' },
    ]
    const ordered = tracker.reorder(messages)
    expect(ordered.map(m => m.id)).toEqual(['a1', 'a2', 'b1', 'b2'])
  })

  it('handles messages without seq (sorts by timestamp fallback)', () => {
    const tracker = createSequenceTracker()
    const messages = [
      { from: 'alice@hub', seq: undefined, id: 'a', ts: '2026-03-27T14:02:00Z' },
      { from: 'alice@hub', seq: undefined, id: 'b', ts: '2026-03-27T14:01:00Z' },
    ]
    const ordered = tracker.reorder(messages)
    expect(ordered.map(m => m.id)).toEqual(['b', 'a'])
  })
})
