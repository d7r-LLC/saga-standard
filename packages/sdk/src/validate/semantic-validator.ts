// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import type { SagaDocument } from '../types/saga-document'
import type { SagaValidationError, ValidationResult } from './errors'
import { checkMarkdownSafety } from './markdown-safety'

/**
 * Semantic validation: checks meaning beyond JSON Schema structure.
 * Returns errors (blocking) and warnings (informational).
 */
export function validateSemantics(doc: SagaDocument): ValidationResult {
  const errors: SagaValidationError[] = []
  const warnings: SagaValidationError[] = []

  const identity = doc.layers?.identity
  const sig = doc.signature

  // Rule 1: signature.walletAddress MUST match layers.identity.walletAddress
  if (identity && sig.walletAddress !== identity.walletAddress) {
    errors.push({
      path: '/signature/walletAddress',
      message: `Signature wallet '${sig.walletAddress}' does not match identity wallet '${identity.walletAddress}'`,
      severity: 'error',
    })
  }

  // Rule 2: signature.chain MUST match layers.identity.chain
  if (identity && sig.chain !== identity.chain) {
    errors.push({
      path: '/signature/chain',
      message: `Signature chain '${sig.chain}' does not match identity chain '${identity.chain}'`,
      severity: 'error',
    })
  }

  // Rule 3: export type 'identity' MUST have layers.identity
  if (doc.exportType === 'identity' && !identity) {
    errors.push({
      path: '/layers/identity',
      message: "Export type 'identity' requires the identity layer",
      severity: 'error',
    })
  }

  // Rule 4: export type 'profile' MUST have identity, SHOULD have persona and skills
  if (doc.exportType === 'profile') {
    if (!identity) {
      errors.push({
        path: '/layers/identity',
        message: "Export type 'profile' requires the identity layer",
        severity: 'error',
      })
    }
    if (!doc.layers?.persona) {
      warnings.push({
        path: '/layers/persona',
        message: "Export type 'profile' should include the persona layer",
        severity: 'warning',
      })
    }
    if (!doc.layers?.skills) {
      warnings.push({
        path: '/layers/skills',
        message: "Export type 'profile' should include the skills layer",
        severity: 'warning',
      })
    }
  }

  // Rule 5: transfer/clone/full SHOULD have all layers
  const fullTypes = ['transfer', 'clone', 'full'] as const
  if ((fullTypes as readonly string[]).includes(doc.exportType)) {
    const expectedLayers = [
      'identity',
      'persona',
      'cognitive',
      'memory',
      'skills',
      'taskHistory',
      'relationships',
      'environment',
    ] as const
    for (const layer of expectedLayers) {
      if (!doc.layers?.[layer]) {
        warnings.push({
          path: `/layers/${layer}`,
          message: `Export type '${doc.exportType}' should include the ${layer} layer`,
          severity: 'warning',
        })
      }
    }
  }

  // Rule 6: exportedAt MUST be a valid ISO 8601 timestamp
  if (doc.exportedAt && isNaN(Date.parse(doc.exportedAt))) {
    errors.push({
      path: '/exportedAt',
      message: `Invalid ISO 8601 timestamp: '${doc.exportedAt}'`,
      severity: 'error',
    })
  }

  // Rule 7: createdAt (if present) MUST be <= exportedAt
  if (doc.createdAt && doc.exportedAt) {
    const created = Date.parse(doc.createdAt)
    const exported = Date.parse(doc.exportedAt)
    if (!isNaN(created) && !isNaN(exported) && created > exported) {
      errors.push({
        path: '/createdAt',
        message: `createdAt (${doc.createdAt}) is after exportedAt (${doc.exportedAt})`,
        severity: 'error',
      })
    }
  }

  // Rule 8: if parentSagaId is set, cloneDepth MUST be > 0
  if (identity?.parentSagaId && (identity.cloneDepth === undefined || identity.cloneDepth === 0)) {
    errors.push({
      path: '/layers/identity/cloneDepth',
      message: 'cloneDepth must be > 0 when parentSagaId is set',
      severity: 'error',
    })
  }

  // Rule 9: privacy.encryptedLayers entries MUST reference existing layer paths
  if (doc.privacy?.encryptedLayers) {
    for (const layerPath of doc.privacy.encryptedLayers) {
      const topLevel = layerPath.split('.')[0]
      if (!doc.layers?.[topLevel as keyof typeof doc.layers]) {
        warnings.push({
          path: '/privacy/encryptedLayers',
          message: `Encrypted layer '${layerPath}' references missing layer '${topLevel}'`,
          severity: 'warning',
        })
      }
    }
  }

  // Rule 10: skill verificationProof URIs should be valid URLs
  const verified = doc.layers?.skills?.verified
  if (verified) {
    for (const skill of verified) {
      if (skill.verificationProof) {
        try {
          new URL(skill.verificationProof)
        } catch {
          warnings.push({
            path: '/layers/skills/verified',
            message: `Skill '${skill.name}' has invalid verificationProof URL: '${skill.verificationProof}'`,
            severity: 'warning',
          })
        }
      }
    }
  }

  // Rule 11: Phase 6 (A-Low#7) — markdown XSS-vector rejection on user-
  // authored markdown fields. The validator is the SDK-side gate; downstream
  // renderers MUST still sanitize via DOMPurify-or-equivalent before
  // innerHTML. See `validate/markdown-safety.ts` for the rule set and the
  // SECURITY.md "User-rendered markdown" section for the consumer contract.
  const markdownFields: Array<{ path: string; value: string | undefined }> = [
    { path: '/layers/persona/headline', value: doc.layers?.persona?.headline },
    { path: '/layers/persona/bio', value: doc.layers?.persona?.bio },
    {
      path: '/layers/persona/personality/communicationStyle',
      value: doc.layers?.persona?.personality?.communicationStyle,
    },
    { path: '/layers/persona/personality/tone', value: doc.layers?.persona?.personality?.tone },
    {
      path: '/layers/cognitive/systemPrompt/content',
      value: doc.layers?.cognitive?.systemPrompt?.content,
    },
  ]
  for (const { path, value } of markdownFields) {
    if (typeof value !== 'string' || value.length === 0) continue
    const r = checkMarkdownSafety(value)
    if (!r.ok) {
      errors.push({
        path,
        message: `Field contains unsafe content (${r.reason}); rejected by markdown safety check`,
        severity: 'error',
      })
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors, warnings }
  }
  return { valid: true, warnings }
}
