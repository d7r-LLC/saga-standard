// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import type { CollectorDetection, SagaCollector } from './types'

const collectors = new Map<string, () => SagaCollector>()

/** Register a collector factory */
export function registerCollector(source: string, factory: () => SagaCollector): void {
  collectors.set(source, factory)
}

/** Create a collector by source name */
export function createCollector(source: string): SagaCollector {
  const factory = collectors.get(source)
  if (!factory) {
    throw new Error(
      `Unknown collector source: '${source}'. Available: ${[...collectors.keys()].join(', ')}`
    )
  }
  return factory()
}

/** Detect which collector sources are available on this machine */
export async function detectCollectors(homeDir?: string): Promise<CollectorDetection[]> {
  const results: CollectorDetection[] = []
  for (const [, factory] of collectors) {
    const collector = factory()
    try {
      const detection = await collector.detect(homeDir)
      results.push(detection)
    } catch {
      // Skip collectors that fail to detect
    }
  }
  return results
}

/** Get all registered collector source names */
export function listCollectorSources(): string[] {
  return [...collectors.keys()]
}
