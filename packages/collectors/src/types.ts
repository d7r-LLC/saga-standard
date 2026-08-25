// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import type { PartialSagaDocument, SagaLayerName } from '@d7r/saga-sdk'

/** Result of detecting a collector source on disk */
export interface CollectorDetection {
  source: string
  found: boolean
  version?: string
  locations: string[]
}

/** Summary of available data from a collector source */
export interface CollectorScan {
  sessionCount: number
  projectCount: number
  memoryEntries: number
  skillCount: number
  estimatedExportSizeBytes: number
  layers: SagaLayerName[]
}

/** Options for extracting data from a collector */
export interface ExtractOptions {
  layers?: SagaLayerName[]
  since?: Date
  projects?: string[]
  includeSessionTranscripts?: boolean
  maxMemoryEntries?: number
  /** Override the home directory (for testing) */
  homeDir?: string
  /** Optional FlowState scope to attach to extracted data */
  flowstateScope?: import('./scope-mapper/types').FlowstateScope
}

/** A collector that can detect, scan, and extract agent data from a local source */
export interface SagaCollector {
  readonly source: string
  detect(homeDir?: string): Promise<CollectorDetection>
  scan(homeDir?: string): Promise<CollectorScan>
  extract(options?: ExtractOptions): Promise<PartialSagaDocument>
}
