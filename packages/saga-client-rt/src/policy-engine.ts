// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import type { CompanyReplicationPolicy, PolicyClassification, SagaMemory } from './types'

/**
 * Classify a memory against a company replication policy.
 *
 * Pipeline checks restrictions in order:
 * 1. memoryTypes — if memory.type matches a restricted type → org-internal
 * 2. domains — if memory.metadata.domain matches a restricted domain → org-internal
 * 3. contentPatterns — if serialized content matches a restricted regex → org-internal
 * 4. No match → apply policy.defaultScope
 */
export function classifyMemory(
  memory: SagaMemory,
  policy: CompanyReplicationPolicy
): PolicyClassification {
  const { restricted, defaultScope } = policy

  // 1. Check restricted memory types
  if (restricted.memoryTypes && restricted.memoryTypes.includes(memory.type)) {
    return {
      scope: 'org-internal',
      reason: `memoryType '${memory.type}' is restricted`,
    }
  }

  // 2. Check restricted domains
  if (restricted.domains && restricted.domains.length > 0) {
    const domain = (memory.metadata as Record<string, unknown> | undefined)?.domain
    if (typeof domain === 'string' && restricted.domains.includes(domain)) {
      return {
        scope: 'org-internal',
        reason: `domain '${domain}' is restricted`,
      }
    }
  }

  // 3. Check restricted content patterns (try/catch guards against malformed regex)
  if (restricted.contentPatterns && restricted.contentPatterns.length > 0) {
    const serialized = JSON.stringify(memory.content)
    for (const pattern of restricted.contentPatterns) {
      try {
        if (new RegExp(pattern, 'i').test(serialized)) {
          return {
            scope: 'org-internal',
            reason: `contentPattern '${pattern}' matched`,
          }
        }
      } catch {
        // Malformed regex pattern — skip
      }
    }
  }

  // 4. No restriction matched — apply default scope
  return {
    scope: defaultScope,
    reason: `default scope '${defaultScope}'`,
  }
}
