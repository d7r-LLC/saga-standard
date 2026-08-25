// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import type { SagaLayerName } from '@d7r/saga-sdk'
import type { CollectorScan } from '../types'
import { FlowstateMemoryClient } from './client'

/**
 * Scan flowstate-agent-memory API for available data counts.
 */
export async function scanFlowstateMemory(url?: string): Promise<CollectorScan> {
  const client = new FlowstateMemoryClient(url ?? 'http://localhost:7090')

  const empty: CollectorScan = {
    sessionCount: 0,
    projectCount: 0,
    memoryEntries: 0,
    skillCount: 0,
    estimatedExportSizeBytes: 0,
    layers: [],
  }

  try {
    const result = await client.search({ limit: 0 })
    const layers: SagaLayerName[] = []
    if (result.total > 0) layers.push('memory')

    return {
      ...empty,
      memoryEntries: result.total,
      layers,
    }
  } catch {
    return empty
  }
}
