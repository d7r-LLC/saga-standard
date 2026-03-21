// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { describe, expect, it } from 'vitest'
import { createStorageRef, generateDocumentId, isValidDocumentId } from './document-id'

describe('generateDocumentId', () => {
  it('generates IDs with saga_ prefix', () => {
    const id = generateDocumentId()
    expect(id.startsWith('saga_')).toBe(true)
  })

  it('generates IDs matching the schema pattern', () => {
    const id = generateDocumentId()
    expect(isValidDocumentId(id)).toBe(true)
  })

  it('generates unique IDs', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateDocumentId()))
    expect(ids.size).toBe(100)
  })

  it('generates IDs of consistent length', () => {
    const id = generateDocumentId()
    expect(id.length).toBe(25) // saga_ (5) + 20 chars
  })
})

describe('isValidDocumentId', () => {
  it('accepts valid IDs', () => {
    expect(isValidDocumentId('saga_testdoc12345abcde')).toBe(true)
  })

  it('rejects IDs without saga_ prefix', () => {
    expect(isValidDocumentId('doc_testdoc12345abcde')).toBe(false)
  })

  it('rejects IDs with invalid characters', () => {
    expect(isValidDocumentId('saga_test!doc')).toBe(false)
  })

  it('rejects empty strings', () => {
    expect(isValidDocumentId('')).toBe(false)
  })
})

describe('createStorageRef', () => {
  it('creates a ref without checksum when no data provided', () => {
    const ref = createStorageRef({
      type: 'ipfs',
      ref: 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi',
    })
    expect(ref.type).toBe('ipfs')
    expect(ref.ref).toBe('bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi')
    expect(ref.checksum).toBeUndefined()
  })

  it('creates a ref with sha256 checksum when data provided', () => {
    const data = Buffer.from('test data')
    const ref = createStorageRef({ type: 'url', ref: 'https://example.com/file', data })
    expect(ref.checksum).toMatch(/^sha256:[a-f0-9]{64}$/)
  })
})
