// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { describe, expect, it } from 'vitest'
import type { SagaDocument } from '../types/saga-document'
import { validateSemantics } from './semantic-validator'

function makeDoc(overrides?: Partial<SagaDocument>): SagaDocument {
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
  } as SagaDocument
}

describe('validateSemantics', () => {
  it('accepts a valid document with no warnings', () => {
    const result = validateSemantics(makeDoc())
    expect(result.valid).toBe(true)
    expect(result.warnings).toHaveLength(0)
  })

  it('Rule 1: rejects mismatched signature.walletAddress vs identity.walletAddress', () => {
    const doc = makeDoc()
    doc.signature.walletAddress = '0xDIFFERENT'
    const result = validateSemantics(doc)
    expect(result.valid).toBe(false)
    if (!result.valid) {
      expect(result.errors.some(e => e.path === '/signature/walletAddress')).toBe(true)
    }
  })

  it('Rule 2: rejects mismatched signature.chain vs identity.chain', () => {
    const doc = makeDoc()
    doc.signature.chain = 'eip155:1'
    const result = validateSemantics(doc)
    expect(result.valid).toBe(false)
    if (!result.valid) {
      expect(result.errors.some(e => e.path === '/signature/chain')).toBe(true)
    }
  })

  it('Rule 3: rejects identity export type without identity layer', () => {
    const doc = makeDoc({ layers: {} })
    const result = validateSemantics(doc)
    expect(result.valid).toBe(false)
    if (!result.valid) {
      expect(result.errors.some(e => e.message.includes("'identity' requires"))).toBe(true)
    }
  })

  it('Rule 4: rejects profile export without identity, warns on missing persona/skills', () => {
    const doc = makeDoc({ exportType: 'profile', layers: {} })
    const result = validateSemantics(doc)
    expect(result.valid).toBe(false)
    if (!result.valid) {
      expect(result.errors.some(e => e.message.includes("'profile' requires the identity"))).toBe(
        true
      )
    }
    expect(result.warnings.some(w => w.message.includes('persona'))).toBe(true)
    expect(result.warnings.some(w => w.message.includes('skills'))).toBe(true)
  })

  it('Rule 5: warns on missing layers for full export type', () => {
    const doc = makeDoc({ exportType: 'full' })
    const result = validateSemantics(doc)
    expect(result.valid).toBe(true)
    expect(result.warnings.length).toBeGreaterThan(0)
    expect(result.warnings.some(w => w.message.includes('cognitive'))).toBe(true)
    expect(result.warnings.some(w => w.message.includes('memory'))).toBe(true)
  })

  it('Rule 6: rejects invalid exportedAt timestamp', () => {
    const doc = makeDoc({ exportedAt: 'not-a-date' })
    const result = validateSemantics(doc)
    expect(result.valid).toBe(false)
    if (!result.valid) {
      expect(result.errors.some(e => e.path === '/exportedAt')).toBe(true)
    }
  })

  it('Rule 7: rejects createdAt after exportedAt', () => {
    const doc = makeDoc({
      createdAt: '2027-01-01T00:00:00Z',
      exportedAt: '2026-03-20T10:00:00Z',
    })
    const result = validateSemantics(doc)
    expect(result.valid).toBe(false)
    if (!result.valid) {
      expect(result.errors.some(e => e.path === '/createdAt')).toBe(true)
    }
  })

  it('Rule 8: rejects cloneDepth=0 when parentSagaId is set', () => {
    const doc = makeDoc()
    doc.layers.identity = {
      ...doc.layers.identity!,
      parentSagaId: 'saga_parent12345abcdef',
      cloneDepth: 0,
    }
    const result = validateSemantics(doc)
    expect(result.valid).toBe(false)
    if (!result.valid) {
      expect(result.errors.some(e => e.message.includes('cloneDepth'))).toBe(true)
    }
  })

  it('Rule 9: warns on encrypted layer referencing missing layer', () => {
    const doc = makeDoc({
      privacy: {
        encryptedLayers: ['cognitive'],
      },
    })
    const result = validateSemantics(doc)
    expect(result.valid).toBe(true)
    expect(result.warnings.some(w => w.message.includes("'cognitive'"))).toBe(true)
  })

  it('Rule 10: warns on invalid skill verificationProof URL', () => {
    const doc = makeDoc()
    doc.layers.skills = {
      verified: [
        {
          name: 'TypeScript',
          verificationSource: 'flowstate',
          verificationProof: 'not a url',
          confidence: 0.9,
        },
      ],
    }
    const result = validateSemantics(doc)
    expect(result.valid).toBe(true)
    expect(result.warnings.some(w => w.message.includes('verificationProof'))).toBe(true)
  })

  it('accepts valid clone with parentSagaId and cloneDepth > 0', () => {
    const doc = makeDoc()
    doc.layers.identity = {
      ...doc.layers.identity!,
      parentSagaId: 'saga_parent12345abcdef',
      cloneDepth: 1,
    }
    const result = validateSemantics(doc)
    expect(result.valid).toBe(true)
  })
})
