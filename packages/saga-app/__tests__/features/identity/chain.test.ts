// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { checkHandleAvailability, resolveHandle } from '../../../src/features/identity/chain'

const mockIsHandleAvailable = jest.fn()
const mockResolveHandleOnChain = jest.fn()

jest.mock('@d7r/saga-client', () => ({
  isHandleAvailable: (...args: unknown[]) => mockIsHandleAvailable(...args),
  resolveHandleOnChain: (...args: unknown[]) => mockResolveHandleOnChain(...args),
}))

const mockPublicClient = {} as never

describe('identity chain helpers', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('checkHandleAvailability returns true for available handle', async () => {
    mockIsHandleAvailable.mockResolvedValue(true)

    const result = await checkHandleAvailability('myhandle', mockPublicClient, 'base-sepolia')

    expect(result).toBe(true)
    expect(mockIsHandleAvailable).toHaveBeenCalledWith({
      handle: 'myhandle',
      publicClient: mockPublicClient,
      chain: 'base-sepolia',
    })
  })

  it('checkHandleAvailability returns false for taken handle', async () => {
    mockIsHandleAvailable.mockResolvedValue(false)

    const result = await checkHandleAvailability('taken', mockPublicClient, 'base-sepolia')

    expect(result).toBe(false)
  })

  it('resolveHandle returns entity data', async () => {
    mockResolveHandleOnChain.mockResolvedValue({
      entityType: 'AGENT',
      tokenId: BigInt(1),
      contractAddress: '0x1234',
    })

    const result = await resolveHandle('myhandle', mockPublicClient, 'base-sepolia')

    expect(result).toEqual({
      entityType: 'AGENT',
      tokenId: BigInt(1),
      contractAddress: '0x1234',
    })
  })
})
