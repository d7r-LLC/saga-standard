// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { describe, expect, it } from 'vitest'
import { aggregateKnowledge } from '../../parsers/knowledge'

describe('aggregateKnowledge', () => {
  it('builds knowledge domains from concept frequencies', () => {
    const concepts = ['redis', 'caching', 'redis', 'auth', 'redis', 'caching', 'testing']
    const result = aggregateKnowledge(concepts)
    expect(result.knowledgeDomains).toContain('redis')
    expect(result.knowledgeDomains).toContain('caching')
  })

  it('ranks domains by frequency', () => {
    const concepts = ['redis', 'redis', 'redis', 'auth', 'auth', 'testing']
    const result = aggregateKnowledge(concepts)
    expect(result.knowledgeDomains![0]).toBe('redis')
  })

  it('builds expertise entries with frequency-based level', () => {
    const concepts = Array(10).fill('typescript').concat(Array(3).fill('rust'))
    const result = aggregateKnowledge(concepts)
    expect(result.expertise!['typescript'].level).toBe('expert')
    expect(result.expertise!['rust'].level).toBe('familiar')
  })

  it('returns empty for no concepts', () => {
    const result = aggregateKnowledge([])
    expect(result.knowledgeDomains).toEqual([])
  })
})
