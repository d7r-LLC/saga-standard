// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import type { CollectorDetection } from '../types'

const DEFAULT_URL = 'http://localhost:7090'

/**
 * Detect flowstate-agent-memory service availability via HTTP health check.
 */
export async function detectFlowstateMemory(url?: string): Promise<CollectorDetection> {
  const baseUrl = url ?? DEFAULT_URL

  try {
    const res = await fetch(`${baseUrl}/api/health`)
    if (res.ok) {
      return {
        source: 'flowstate-memory',
        found: true,
        locations: [baseUrl],
      }
    }
  } catch {
    // Service not reachable
  }

  return {
    source: 'flowstate-memory',
    found: false,
    locations: [],
  }
}
