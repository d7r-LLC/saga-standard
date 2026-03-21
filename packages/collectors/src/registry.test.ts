// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { beforeEach, describe, expect, it } from 'vitest'
import type { CollectorDetection, CollectorScan, SagaCollector } from './types'
import {
  createCollector,
  detectCollectors,
  listCollectorSources,
  registerCollector,
} from './registry'

function makeMockCollector(source: string, found: boolean): SagaCollector {
  return {
    source,
    async detect(): Promise<CollectorDetection> {
      return { source, found, locations: found ? ['/mock'] : [] }
    },
    async scan(): Promise<CollectorScan> {
      return {
        sessionCount: 5,
        projectCount: 2,
        memoryEntries: 10,
        skillCount: 3,
        estimatedExportSizeBytes: 1024,
        layers: ['memory', 'taskHistory'],
      }
    },
    async extract() {
      return { source, layers: {} }
    },
  }
}

// Note: registry is module-level state, so tests share it
beforeEach(() => {
  // Register a fresh mock for each test
})

describe('registry', () => {
  it('registers and creates a collector', () => {
    registerCollector('mock-test', () => makeMockCollector('mock-test', true))
    const collector = createCollector('mock-test')
    expect(collector.source).toBe('mock-test')
  })

  it('throws on unknown collector source', () => {
    expect(() => createCollector('nonexistent-source')).toThrow('Unknown collector source')
  })

  it('detectCollectors returns results for all registered collectors', async () => {
    registerCollector('mock-found', () => makeMockCollector('mock-found', true))
    registerCollector('mock-missing', () => makeMockCollector('mock-missing', false))
    const results = await detectCollectors()
    expect(results.length).toBeGreaterThanOrEqual(2)
    const found = results.find(r => r.source === 'mock-found')
    const missing = results.find(r => r.source === 'mock-missing')
    expect(found?.found).toBe(true)
    expect(missing?.found).toBe(false)
  })

  it('listCollectorSources returns registered names', () => {
    const sources = listCollectorSources()
    expect(sources).toContain('mock-test')
  })
})
