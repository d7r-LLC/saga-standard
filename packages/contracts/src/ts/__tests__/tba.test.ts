// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { describe, expect, it } from 'vitest'
import { type Hash, isAddress } from 'viem'
import { computeTBAAddress } from '../tba'

const MOCK_IMPL = '0x1234567890abcdef1234567890abcdef12345678' as const
const MOCK_TOKEN_CONTRACT = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd' as const

describe('computeTBAAddress', () => {
  it('returns a valid address', () => {
    const addr = computeTBAAddress({
      implementation: MOCK_IMPL,
      chainId: 84532,
      tokenContract: MOCK_TOKEN_CONTRACT,
      tokenId: 0n,
    })
    expect(isAddress(addr)).toBe(true)
  })

  it('is deterministic (same inputs, same output)', () => {
    const opts = {
      implementation: MOCK_IMPL,
      chainId: 84532,
      tokenContract: MOCK_TOKEN_CONTRACT,
      tokenId: 42n,
    }
    const addr1 = computeTBAAddress(opts)
    const addr2 = computeTBAAddress(opts)
    expect(addr1).toBe(addr2)
  })

  it('different tokenId produces different address', () => {
    const base = {
      implementation: MOCK_IMPL,
      chainId: 84532,
      tokenContract: MOCK_TOKEN_CONTRACT,
    }
    const addr0 = computeTBAAddress({ ...base, tokenId: 0n })
    const addr1 = computeTBAAddress({ ...base, tokenId: 1n })
    expect(addr0).not.toBe(addr1)
  })

  it('different chainId produces different address', () => {
    const base = {
      implementation: MOCK_IMPL,
      tokenContract: MOCK_TOKEN_CONTRACT,
      tokenId: 0n,
    }
    const sepolia = computeTBAAddress({ ...base, chainId: 84532 })
    const mainnet = computeTBAAddress({ ...base, chainId: 8453 })
    expect(sepolia).not.toBe(mainnet)
  })

  it('different tokenContract produces different address', () => {
    const base = {
      implementation: MOCK_IMPL,
      chainId: 84532,
      tokenId: 0n,
    }
    const addr1 = computeTBAAddress({
      ...base,
      tokenContract: MOCK_TOKEN_CONTRACT,
    })
    const addr2 = computeTBAAddress({
      ...base,
      tokenContract: '0x0000000000000000000000000000000000000001',
    })
    expect(addr1).not.toBe(addr2)
  })

  it('rejects salt that is not 32 bytes', () => {
    expect(() =>
      computeTBAAddress({
        implementation: MOCK_IMPL,
        chainId: 84532,
        tokenContract: MOCK_TOKEN_CONTRACT,
        tokenId: 0n,
        salt: '0xdead' as Hash,
      })
    ).toThrow('salt must be 32 bytes')
  })

  it('accepts a valid 32-byte custom salt', () => {
    const customSalt: Hash = '0x0000000000000000000000000000000000000000000000000000000000000001'
    const addr = computeTBAAddress({
      implementation: MOCK_IMPL,
      chainId: 84532,
      tokenContract: MOCK_TOKEN_CONTRACT,
      tokenId: 0n,
      salt: customSalt,
    })
    expect(isAddress(addr)).toBe(true)
  })
})
