// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { describe, expect, it } from 'vitest'
import { validateSagaDocument, validateSchema } from './schema-validator'

/** Minimal valid identity-only SAGA document */
function minimalDoc(overrides?: Record<string, unknown>) {
  return {
    $schema: 'https://saga-standard.dev/schema/v1',
    sagaVersion: '1.0',
    documentId: 'saga_testdoc12345abcde',
    exportedAt: '2026-03-20T10:00:00Z',
    exportType: 'identity',
    signature: {
      walletAddress: '0xabc123',
      chain: 'eip155:8453',
      message: 'SAGA export saga_testdoc12345abcde at 2026-03-20T10:00:00Z',
      sig: '0xdef456',
    },
    layers: {
      identity: {
        handle: 'test-agent',
        walletAddress: '0xabc123',
        chain: 'eip155:8453',
        createdAt: '2026-01-15T08:00:00Z',
      },
    },
    ...overrides,
  }
}

/** Full document with all 8 layers */
function fullDoc() {
  return {
    ...minimalDoc({ exportType: 'full' }),
    createdAt: '2026-01-15T08:00:00Z',
    privacy: {
      encryptedLayers: ['cognitive'],
      redactedFields: [],
      encryptionScheme: 'x25519-xsalsa20-poly1305',
    },
    layers: {
      identity: {
        handle: 'aria-chen',
        walletAddress: '0xabc123',
        chain: 'eip155:8453',
        createdAt: '2026-01-15T08:00:00Z',
        parentSagaId: null,
        cloneDepth: 0,
      },
      persona: {
        name: 'Aria Chen',
        headline: 'Senior Backend Engineer',
        profileType: 'agent',
        personality: {
          traits: ['direct', 'methodical'],
          tone: 'professional',
        },
      },
      cognitive: {
        baseModel: { provider: 'anthropic', model: 'claude-3-5-sonnet', contextWindow: 200000 },
        parameters: { temperature: 0.7, topP: 0.9 },
      },
      memory: {
        episodic: {
          events: [
            {
              eventId: 'evt_001',
              type: 'task-completed',
              timestamp: '2026-02-10T14:23:00Z',
              summary: 'Refactored auth layer',
            },
          ],
        },
        semantic: {
          knowledgeDomains: ['TypeScript', 'OAuth 2.0'],
        },
      },
      skills: {
        verified: [
          { name: 'TypeScript', verificationSource: 'flowstate-task-completion', confidence: 0.97 },
        ],
        selfReported: [{ name: 'Drizzle ORM' }],
      },
      taskHistory: {
        summary: { totalCompleted: 234, totalFailed: 12 },
        recentTasks: [{ taskId: 'task_001', status: 'completed', outcome: 'success' }],
      },
      relationships: {
        principals: [{ walletAddress: '0xowner123', authorityLevel: 'owner' }],
        peers: [{ walletAddress: '0xpeer123', relationship: 'collaborator' }],
      },
      environment: {
        runtime: { type: 'cloudflare-worker' },
        tools: { nativeTools: ['file-system', 'web-search'] },
      },
    },
  }
}

describe('validateSchema', () => {
  it('accepts a valid minimal identity-only document', () => {
    const result = validateSchema(minimalDoc())
    expect(result.valid).toBe(true)
  })

  it('accepts a valid full document with all 8 layers', () => {
    const result = validateSchema(fullDoc())
    expect(result.valid).toBe(true)
  })

  it('rejects missing required documentId', () => {
    const doc = minimalDoc()
    delete (doc as Record<string, unknown>).documentId
    const result = validateSchema(doc)
    expect(result.valid).toBe(false)
    if (!result.valid) {
      expect(result.errors.some(e => e.message.includes('documentId'))).toBe(true)
    }
  })

  it('rejects missing required signature', () => {
    const doc = minimalDoc()
    delete (doc as Record<string, unknown>).signature
    const result = validateSchema(doc)
    expect(result.valid).toBe(false)
    if (!result.valid) {
      expect(result.errors.some(e => e.message.includes('signature'))).toBe(true)
    }
  })

  it('rejects invalid exportType value', () => {
    const result = validateSchema(minimalDoc({ exportType: 'invalid-type' }))
    expect(result.valid).toBe(false)
    if (!result.valid) {
      expect(result.errors.some(e => e.path.includes('exportType'))).toBe(true)
    }
  })

  it('rejects invalid chain pattern', () => {
    const doc = minimalDoc()
    doc.signature.chain = 'not-a-chain' as string
    const result = validateSchema(doc)
    expect(result.valid).toBe(false)
    if (!result.valid) {
      expect(result.errors.some(e => e.message.includes('pattern'))).toBe(true)
    }
  })

  it('accepts a valid profile export type with persona and skills', () => {
    const doc = {
      ...minimalDoc({ exportType: 'profile' }),
      layers: {
        identity: minimalDoc().layers.identity,
        persona: { name: 'Test', profileType: 'agent' },
        skills: { selfReported: [{ name: 'TypeScript' }] },
      },
    }
    const result = validateSchema(doc)
    expect(result.valid).toBe(true)
  })

  it('rejects invalid sagaVersion pattern', () => {
    const result = validateSchema(minimalDoc({ sagaVersion: 'v1' }))
    expect(result.valid).toBe(false)
    if (!result.valid) {
      expect(result.errors.some(e => e.message.includes('pattern'))).toBe(true)
    }
  })

  it('rejects extra properties on the envelope', () => {
    const result = validateSchema(minimalDoc({ unknownField: 'should fail' }))
    expect(result.valid).toBe(false)
    if (!result.valid) {
      expect(result.errors.some(e => e.message.includes('unknownField'))).toBe(true)
    }
  })

  it('accepts an empty layers object', () => {
    const doc = minimalDoc()
    doc.layers = {}
    const result = validateSchema(doc)
    expect(result.valid).toBe(true)
  })

  it('rejects invalid documentId pattern', () => {
    const result = validateSchema(minimalDoc({ documentId: 'bad_id' }))
    expect(result.valid).toBe(false)
    if (!result.valid) {
      expect(result.errors.some(e => e.message.includes('pattern'))).toBe(true)
    }
  })
})

describe('validateSagaDocument', () => {
  it('returns typed SagaDocument on valid input', () => {
    const result = validateSagaDocument(minimalDoc())
    expect(result.valid).toBe(true)
    if (result.valid) {
      expect(result.document.documentId).toBe('saga_testdoc12345abcde')
      expect(result.document.layers.identity?.handle).toBe('test-agent')
    }
  })

  it('returns errors array on invalid input', () => {
    const result = validateSagaDocument({})
    expect(result.valid).toBe(false)
    if (!result.valid) {
      expect(result.errors.length).toBeGreaterThan(0)
    }
  })
})
