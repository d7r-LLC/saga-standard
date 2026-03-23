// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { describe, expect, it } from 'vitest'
import { ENTITY_TYPE_VALUES, entityTypeFromNumber } from '../types'

describe('types', () => {
  it('ENTITY_TYPE_VALUES maps correctly', () => {
    expect(ENTITY_TYPE_VALUES.NONE).toBe(0)
    expect(ENTITY_TYPE_VALUES.AGENT).toBe(1)
    expect(ENTITY_TYPE_VALUES.ORG).toBe(2)
  })

  it('entityTypeFromNumber maps 0 to NONE', () => {
    expect(entityTypeFromNumber(0)).toBe('NONE')
  })

  it('entityTypeFromNumber maps 1 to AGENT', () => {
    expect(entityTypeFromNumber(1)).toBe('AGENT')
  })

  it('entityTypeFromNumber maps 2 to ORG', () => {
    expect(entityTypeFromNumber(2)).toBe('ORG')
  })

  it('entityTypeFromNumber defaults unknown values to NONE', () => {
    expect(entityTypeFromNumber(99)).toBe('NONE')
  })
})
