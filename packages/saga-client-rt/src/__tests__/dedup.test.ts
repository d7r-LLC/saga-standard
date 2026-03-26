// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDedup } from '../dedup'

describe('createDedup', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns false for unseen message IDs', () => {
    const dedup = createDedup()
    expect(dedup.has('msg-1')).toBe(false)
  })

  it('returns true for seen message IDs', () => {
    const dedup = createDedup()
    dedup.add('msg-1')
    expect(dedup.has('msg-1')).toBe(true)
  })

  it('tracks multiple distinct IDs', () => {
    const dedup = createDedup()
    dedup.add('msg-1')
    dedup.add('msg-2')
    expect(dedup.has('msg-1')).toBe(true)
    expect(dedup.has('msg-2')).toBe(true)
    expect(dedup.has('msg-3')).toBe(false)
  })

  it('cleans up entries older than 1 hour', () => {
    const dedup = createDedup()
    dedup.add('old-msg')

    vi.advanceTimersByTime(61 * 60 * 1000) // 61 minutes
    dedup.cleanup()

    expect(dedup.has('old-msg')).toBe(false)
  })

  it('keeps entries younger than 1 hour during cleanup', () => {
    const dedup = createDedup()
    dedup.add('recent-msg')

    vi.advanceTimersByTime(30 * 60 * 1000) // 30 minutes
    dedup.cleanup()

    expect(dedup.has('recent-msg')).toBe(true)
  })

  it('handles mixed old and new entries during cleanup', () => {
    const dedup = createDedup()
    dedup.add('old-msg')

    vi.advanceTimersByTime(50 * 60 * 1000) // 50 minutes
    dedup.add('new-msg')

    vi.advanceTimersByTime(15 * 60 * 1000) // 15 more minutes (old = 65 min, new = 15 min)
    dedup.cleanup()

    expect(dedup.has('old-msg')).toBe(false)
    expect(dedup.has('new-msg')).toBe(true)
  })
})
