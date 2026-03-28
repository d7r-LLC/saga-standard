// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import type { ExpertiseLevel, SemanticMemory } from '@epicdm/saga-sdk'

export function aggregateKnowledge(concepts: string[]): Partial<SemanticMemory> {
  if (concepts.length === 0) {
    return { knowledgeDomains: [] }
  }

  const freq = new Map<string, number>()
  for (const c of concepts) {
    const normalized = c.toLowerCase().trim()
    if (normalized) freq.set(normalized, (freq.get(normalized) ?? 0) + 1)
  }

  const sorted = [...freq.entries()].sort((a, b) => b[1] - a[1])

  const knowledgeDomains = sorted.map(([domain]) => domain)

  const expertise: Record<string, { level: ExpertiseLevel }> = {}
  for (const [domain, count] of sorted) {
    expertise[domain] = {
      level: frequencyToLevel(count),
    }
  }

  return { knowledgeDomains, expertise }
}

function frequencyToLevel(count: number): ExpertiseLevel {
  if (count >= 8) return 'expert'
  if (count >= 4) return 'proficient'
  return 'familiar'
}
