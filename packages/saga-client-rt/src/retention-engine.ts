// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import type { CompanyReplicationPolicy, PolicyAuditEntry, SagaMemory } from './types'

export interface RetentionResult {
  mutualDowngraded: number
  portableDowngraded: number
}

/**
 * Run retention enforcement against stored memories.
 *
 * 1. mutualTtlDays: mutual memories older than TTL → reclassify to org-internal
 *    (move from agent store to company store)
 * 2. portableLimit: if portable count exceeds limit, oldest are downgraded to mutual
 */
export async function runRetention(
  agentStore: {
    query(filter: { prefix?: string }): Promise<Array<{ key: string; value: unknown }>>
    put(key: string, value: unknown): Promise<void>
    delete(key: string): Promise<void>
  },
  companyStore: { put(key: string, value: unknown): Promise<void> },
  policy: CompanyReplicationPolicy,
  logAudit: (entry: PolicyAuditEntry) => void
): Promise<RetentionResult> {
  let mutualDowngraded = 0
  let portableDowngraded = 0

  const entries = await agentStore.query({ prefix: 'memory:' })
  const memories = entries.map(e => e.value as SagaMemory)

  // 1. Mutual TTL enforcement
  if (policy.retention.mutualTtlDays !== undefined) {
    const ttlMs = policy.retention.mutualTtlDays * 24 * 60 * 60 * 1000
    const cutoff = new Date(Date.now() - ttlMs).toISOString()

    const expiredMutual = memories.filter(m => m.scope === 'mutual' && m.createdAt < cutoff)

    for (const memory of expiredMutual) {
      const reclassified = { ...memory, scope: 'org-internal' as const }
      await companyStore.put(`memory:${memory.id}`, reclassified)
      await agentStore.delete(`memory:${memory.id}`)
      logAudit({
        memoryId: memory.id,
        memoryType: memory.type,
        originalScope: 'mutual',
        appliedScope: 'org-internal',
        reason: `mutual TTL exceeded (${policy.retention.mutualTtlDays} days)`,
        timestamp: new Date().toISOString(),
      })
      mutualDowngraded++
    }
  }

  // 2. Portable limit enforcement
  if (policy.retention.portableLimit !== undefined) {
    const currentEntries = await agentStore.query({ prefix: 'memory:' })
    const currentMemories = currentEntries.map(e => e.value as SagaMemory)

    const portableMemories = currentMemories
      .filter(m => m.scope === 'agent-portable')
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt)) // oldest first

    const excess = portableMemories.length - policy.retention.portableLimit
    if (excess > 0) {
      const toDowngrade = portableMemories.slice(0, excess)
      for (const memory of toDowngrade) {
        const downgraded = { ...memory, scope: 'mutual' as const }
        await agentStore.put(`memory:${memory.id}`, downgraded)
        logAudit({
          memoryId: memory.id,
          memoryType: memory.type,
          originalScope: 'agent-portable',
          appliedScope: 'mutual',
          reason: `portable limit exceeded (${portableMemories.length}/${policy.retention.portableLimit})`,
          timestamp: new Date().toISOString(),
        })
        portableDowngraded++
      }
    }
  }

  return { mutualDowngraded, portableDowngraded }
}
