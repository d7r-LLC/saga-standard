// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { describe, expect, it } from 'vitest'
import { canonicalize } from './canonicalize'

describe('canonicalize (RFC 8785)', () => {
  it('handles empty object', () => {
    expect(canonicalize({})).toBe('{}')
  })

  it('sorts object keys lexicographically', () => {
    expect(canonicalize({ z: 1, a: 2, m: 3 })).toBe('{"a":2,"m":3,"z":1}')
  })

  it('sorts nested objects recursively', () => {
    expect(canonicalize({ b: { z: 1, a: 2 }, a: 1 })).toBe('{"a":1,"b":{"a":2,"z":1}}')
  })

  it('preserves array order', () => {
    expect(canonicalize([3, 1, 2])).toBe('[3,1,2]')
  })

  it('handles unicode strings', () => {
    const result = canonicalize({ '\u20ac': 'euro' })
    expect(result).toBe('{"\u20ac":"euro"}')
  })

  it('normalizes -0 to 0', () => {
    expect(canonicalize(-0)).toBe('0')
  })

  it('handles large integers', () => {
    expect(canonicalize(9007199254740991)).toBe('9007199254740991')
  })

  it('handles floats', () => {
    expect(canonicalize(0.1)).toBe('0.1')
    expect(canonicalize(1.0)).toBe('1')
  })

  it('handles null', () => {
    expect(canonicalize(null)).toBe('null')
  })

  it('handles booleans', () => {
    expect(canonicalize(true)).toBe('true')
    expect(canonicalize(false)).toBe('false')
  })

  it('handles strings with special characters', () => {
    expect(canonicalize('hello\nworld')).toBe('"hello\\nworld"')
  })

  it('handles Infinity/NaN as null', () => {
    expect(canonicalize(Infinity)).toBe('null')
    expect(canonicalize(NaN)).toBe('null')
  })

  it('skips undefined values in objects', () => {
    expect(canonicalize({ a: 1, b: undefined, c: 3 })).toBe('{"a":1,"c":3}')
  })

  it('round-trip: canonicalize(parse(canonicalize(x))) === canonicalize(x)', () => {
    const obj = { z: [3, 1], a: { c: true, b: 'hello' } }
    const first = canonicalize(obj)
    const second = canonicalize(JSON.parse(first))
    expect(second).toBe(first)
  })

  it('handles deeply nested structures', () => {
    const result = canonicalize({ a: { b: { c: { d: 1 } } } })
    expect(result).toBe('{"a":{"b":{"c":{"d":1}}}}')
  })

  it('handles empty arrays', () => {
    expect(canonicalize([])).toBe('[]')
  })

  it('handles mixed array contents', () => {
    expect(canonicalize([1, 'two', null, true, { a: 1 }])).toBe('[1,"two",null,true,{"a":1}]')
  })
})
