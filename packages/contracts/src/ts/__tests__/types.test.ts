// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { describe, expect, it } from 'vitest'
import {
  type DirectoryIdentity,
  ENTITY_TYPE_VALUES,
  type EntityType,
  entityTypeFromNumber,
} from '../types'

describe('entityTypeFromNumber', () => {
  it('maps 0 to NONE', () => {
    expect(entityTypeFromNumber(0)).toBe('NONE')
  })

  it('maps 1 to AGENT', () => {
    expect(entityTypeFromNumber(1)).toBe('AGENT')
  })

  it('maps 2 to ORG', () => {
    expect(entityTypeFromNumber(2)).toBe('ORG')
  })

  it('maps 3 to DIRECTORY', () => {
    expect(entityTypeFromNumber(3)).toBe('DIRECTORY')
  })

  it('maps unknown numbers to NONE', () => {
    expect(entityTypeFromNumber(99)).toBe('NONE')
  })
})

describe('ENTITY_TYPE_VALUES', () => {
  it('includes DIRECTORY with value 3', () => {
    expect(ENTITY_TYPE_VALUES.DIRECTORY).toBe(3)
  })

  it('preserves existing values', () => {
    expect(ENTITY_TYPE_VALUES.NONE).toBe(0)
    expect(ENTITY_TYPE_VALUES.AGENT).toBe(1)
    expect(ENTITY_TYPE_VALUES.ORG).toBe(2)
  })
})

describe('DirectoryIdentity type', () => {
  it('is assignable with correct shape', () => {
    const dir: DirectoryIdentity = {
      tokenId: 0n,
      directoryId: 'epic-hub',
      url: 'https://hub.epic.com',
      operatorWallet: '0x1234567890abcdef1234567890abcdef12345678',
      conformanceLevel: 'full',
      status: 'active',
      registeredAt: 1700000000n,
    }
    expect(dir.directoryId).toBe('epic-hub')
    expect(dir.status).toBe('active')
  })
})

describe('EntityType type', () => {
  it('supports DIRECTORY variant', () => {
    const dirType: EntityType = 'DIRECTORY'
    expect(dirType).toBe('DIRECTORY')
  })
})
