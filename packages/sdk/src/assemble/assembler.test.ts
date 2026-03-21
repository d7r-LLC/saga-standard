// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { describe, expect, it } from 'vitest'
import type { PartialSagaDocument } from '../types/partial'
import { assembleSagaDocument } from './assembler'

function partial(source: string, layers: PartialSagaDocument['layers']): PartialSagaDocument {
  return { source, layers }
}

describe('assembleSagaDocument', () => {
  it('produces a valid document from a single partial', () => {
    const result = assembleSagaDocument({
      partials: [
        partial('flowstate', {
          identity: {
            handle: 'aria-chen',
            walletAddress: '0xabc123',
            chain: 'eip155:8453',
            createdAt: '2026-01-15T08:00:00Z',
          },
        }),
      ],
      exportType: 'identity',
    })
    expect(result.document.layers.identity?.handle).toBe('aria-chen')
    expect(result.document.exportType).toBe('identity')
    expect(result.document.documentId).toMatch(/^saga_/)
  })

  it('identity: first source wins', () => {
    const result = assembleSagaDocument({
      partials: [
        partial('flowstate', {
          identity: {
            handle: 'first',
            walletAddress: '0x1',
            chain: 'eip155:8453',
            createdAt: '2026-01-01T00:00:00Z',
          },
        }),
        partial('openclaw', {
          identity: {
            handle: 'second',
            walletAddress: '0x2',
            chain: 'eip155:8453',
            createdAt: '2026-01-01T00:00:00Z',
          },
        }),
      ],
      exportType: 'identity',
    })
    expect(result.document.layers.identity?.handle).toBe('first')
    expect(result.sources.identity).toEqual(['flowstate'])
  })

  it('dedupes episodic memory events and sorts by timestamp', () => {
    const result = assembleSagaDocument({
      partials: [
        partial('claude-code', {
          memory: {
            episodic: {
              events: [
                { eventId: 'evt_1', type: 'task-completed', timestamp: '2026-01-01T00:00:00Z' },
                { eventId: 'evt_2', type: 'interaction', timestamp: '2026-02-01T00:00:00Z' },
              ],
            },
          },
        }),
        partial('openclaw', {
          memory: {
            episodic: {
              events: [
                { eventId: 'evt_1', type: 'task-completed', timestamp: '2026-01-01T00:00:00Z' }, // dupe
                { eventId: 'evt_3', type: 'decision', timestamp: '2026-03-01T00:00:00Z' },
              ],
            },
          },
        }),
      ],
      exportType: 'full',
    })
    const events = result.document.layers.memory?.episodic?.events ?? []
    expect(events).toHaveLength(3)
    expect(events[0].eventId).toBe('evt_3') // most recent first
    expect(events[2].eventId).toBe('evt_1') // oldest last
  })

  it('merges verified skills by highest confidence', () => {
    const result = assembleSagaDocument({
      partials: [
        partial('flowstate', {
          skills: {
            verified: [{ name: 'TypeScript', verificationSource: 'flowstate', confidence: 0.85 }],
          },
        }),
        partial('openclaw', {
          skills: {
            verified: [
              { name: 'TypeScript', verificationSource: 'openclaw', confidence: 0.97 },
              { name: 'Python', verificationSource: 'openclaw', confidence: 0.8 },
            ],
          },
        }),
      ],
      exportType: 'full',
    })
    const verified = result.document.layers.skills?.verified ?? []
    expect(verified).toHaveLength(2)
    const ts = verified.find(s => s.name === 'TypeScript')
    expect(ts?.confidence).toBe(0.97) // highest wins
  })

  it('sums task history correctly', () => {
    const result = assembleSagaDocument({
      partials: [
        partial('flowstate', {
          taskHistory: {
            summary: {
              totalCompleted: 100,
              totalFailed: 5,
              firstTaskAt: '2026-01-01T00:00:00Z',
              lastTaskAt: '2026-02-01T00:00:00Z',
            },
          },
        }),
        partial('claude-code', {
          taskHistory: {
            summary: {
              totalCompleted: 50,
              totalFailed: 3,
              firstTaskAt: '2025-12-01T00:00:00Z',
              lastTaskAt: '2026-03-01T00:00:00Z',
            },
          },
        }),
      ],
      exportType: 'full',
    })
    const summary = result.document.layers.taskHistory?.summary
    expect(summary?.totalCompleted).toBe(150)
    expect(summary?.totalFailed).toBe(8)
    expect(summary?.firstTaskAt).toBe('2025-12-01T00:00:00Z') // earliest
    expect(summary?.lastTaskAt).toBe('2026-03-01T00:00:00Z') // latest
  })

  it('produces minimal document from empty partials', () => {
    const result = assembleSagaDocument({
      partials: [partial('empty', {})],
      exportType: 'identity',
    })
    expect(result.document.documentId).toMatch(/^saga_/)
    expect(result.document.layers).toEqual({})
  })

  it('respects source priority ordering', () => {
    const result = assembleSagaDocument({
      partials: [
        partial('openclaw', {
          identity: {
            handle: 'from-openclaw',
            walletAddress: '0x1',
            chain: 'eip155:8453',
            createdAt: '2026-01-01T00:00:00Z',
          },
        }),
        partial('flowstate', {
          identity: {
            handle: 'from-flowstate',
            walletAddress: '0x2',
            chain: 'eip155:8453',
            createdAt: '2026-01-01T00:00:00Z',
          },
        }),
      ],
      exportType: 'identity',
      sourcePriority: ['flowstate', 'openclaw'], // flowstate first
    })
    expect(result.document.layers.identity?.handle).toBe('from-flowstate')
  })

  it('uses provided documentId', () => {
    const result = assembleSagaDocument({
      partials: [partial('test', {})],
      exportType: 'identity',
      documentId: 'saga_customId12345abcde',
    })
    expect(result.document.documentId).toBe('saga_customId12345abcde')
  })

  it('concatenates cognitive systemPrompt content from multiple sources', () => {
    const result = assembleSagaDocument({
      partials: [
        partial('openclaw', {
          cognitive: { systemPrompt: { format: 'markdown', content: 'You are Aria.' } },
        }),
        partial('claude-code', {
          cognitive: { systemPrompt: { format: 'markdown', content: 'Follow TDD.' } },
        }),
      ],
      exportType: 'full',
    })
    const content = result.document.layers.cognitive?.systemPrompt?.content ?? ''
    expect(content).toContain('You are Aria.')
    expect(content).toContain('Follow TDD.')
    expect(content).toContain('---') // separator
  })
})
