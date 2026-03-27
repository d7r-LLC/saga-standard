// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { getPublicClient } from '../../../src/features/wallet/chain'

jest.mock('viem', () => ({
  createPublicClient: jest.fn().mockReturnValue({
    getBalance: jest.fn().mockResolvedValue(1000000000000000000n),
    readContract: jest.fn().mockResolvedValue(5000000n),
  }),
  http: jest.fn().mockReturnValue('http-transport'),
  formatEther: jest.fn().mockReturnValue('1.0'),
  formatUnits: jest.fn().mockReturnValue('5.0'),
  erc20Abi: [],
}))

jest.mock('viem/chains', () => ({
  base: { id: 8453, name: 'Base' },
  baseSepolia: { id: 84532, name: 'Base Sepolia' },
}))

describe('chain client', () => {
  it('creates a public client for base-sepolia', () => {
    const client = getPublicClient('base-sepolia')
    expect(client).toBeDefined()
    expect(client.getBalance).toBeDefined()
  })

  it('creates a public client for base', () => {
    const client = getPublicClient('base')
    expect(client).toBeDefined()
  })
})
