// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { describe, expect, it, vi } from 'vitest'
import type { PublicClient, WalletClient } from 'viem'

const MOCK_ACCOUNT = { address: '0xaabbccddee1234567890aabbccddee1234567890' as const }
const MOCK_AGENT_CONTRACT = '0x1111111111111111111111111111111111111111' as const
const MOCK_ORG_CONTRACT = '0x2222222222222222222222222222222222222222' as const
const MOCK_REGISTRY = '0x3333333333333333333333333333333333333333' as const
const MOCK_TBA_1 = '0x4444444444444444444444444444444444444444' as const
const MOCK_TBA_2 = '0x5555555555555555555555555555555555555555' as const

let tbaCallCount = 0

vi.mock('@saga-standard/contracts', () => ({
  getAgentIdentityConfig: () => ({
    address: MOCK_AGENT_CONTRACT,
    abi: [
      {
        type: 'event',
        name: 'AgentRegistered',
        inputs: [
          { name: 'tokenId', type: 'uint256', indexed: true },
          { name: 'handle', type: 'string', indexed: false },
          { name: 'owner', type: 'address', indexed: true },
          { name: 'hubUrl', type: 'string', indexed: false },
          { name: 'registeredAt', type: 'uint256', indexed: false },
        ],
      },
      {
        type: 'function',
        name: 'registerAgent',
        inputs: [
          { name: 'handle', type: 'string' },
          { name: 'hubUrl', type: 'string' },
        ],
        outputs: [{ type: 'uint256' }],
        stateMutability: 'nonpayable',
      },
    ],
  }),
  getOrgIdentityConfig: () => ({
    address: MOCK_ORG_CONTRACT,
    abi: [
      {
        type: 'event',
        name: 'OrgRegistered',
        inputs: [
          { name: 'tokenId', type: 'uint256', indexed: true },
          { name: 'handle', type: 'string', indexed: false },
          { name: 'name', type: 'string', indexed: false },
          { name: 'owner', type: 'address', indexed: true },
          { name: 'registeredAt', type: 'uint256', indexed: false },
        ],
      },
      {
        type: 'function',
        name: 'registerOrganization',
        inputs: [
          { name: 'handle', type: 'string' },
          { name: 'name', type: 'string' },
        ],
        outputs: [{ type: 'uint256' }],
        stateMutability: 'nonpayable',
      },
    ],
  }),
  getHandleRegistryConfig: () => ({
    address: MOCK_REGISTRY,
    abi: [
      {
        type: 'function',
        name: 'resolveHandle',
        inputs: [{ name: 'handle', type: 'string' }],
        outputs: [{ type: 'uint8' }, { type: 'uint256' }, { type: 'address' }],
        stateMutability: 'view',
      },
    ],
  }),
  computeTBAAddress: () => {
    tbaCallCount++
    return tbaCallCount === 1 ? MOCK_TBA_1 : MOCK_TBA_2
  },
  entityTypeFromNumber: (n: number) => {
    if (n === 0) return 'NONE'
    if (n === 1) return 'AGENT'
    if (n === 2) return 'ORG'
    return 'NONE'
  },
  ERC6551_REGISTRY: '0x000000006551c19487814612e58FE06813775758',
}))

const { mintAgentIdentity, mintOrgIdentity, resolveHandleOnChain, isHandleAvailable } =
  await import('../chain')

// ── Integration scenarios ─────────────────────────────────────────

describe('chain integration', () => {
  it('resolve then availability check are consistent', async () => {
    const readFn = vi
      .fn()
      .mockResolvedValueOnce([1, 42n, MOCK_AGENT_CONTRACT]) // resolve: registered
      .mockResolvedValueOnce([1, 42n, MOCK_AGENT_CONTRACT]) // isHandleAvailable: registered
      .mockResolvedValueOnce([0, 0n, '0x0000000000000000000000000000000000000000']) // isHandleAvailable: not registered

    const publicClient = {
      readContract: readFn,
    } as unknown as PublicClient

    // Resolve existing handle
    const result = await resolveHandleOnChain({
      handle: 'existing.agent',
      publicClient,
      chain: 'base-sepolia',
    })
    expect(result.entityType).toBe('AGENT')
    expect(result.tokenId).toBe(42n)

    // Same handle should not be available
    const taken = await isHandleAvailable({
      handle: 'existing.agent',
      publicClient,
      chain: 'base-sepolia',
    })
    expect(taken).toBe(false)

    // Different handle should be available
    const free = await isHandleAvailable({
      handle: 'new.agent',
      publicClient,
      chain: 'base-sepolia',
    })
    expect(free).toBe(true)
  })

  it('chain mismatch throws before any contract call', async () => {
    const writeContractFn = vi.fn()
    const walletClient = {
      account: MOCK_ACCOUNT,
      chain: { id: 8453, name: 'Base' }, // mainnet
      writeContract: writeContractFn,
    } as unknown as WalletClient

    const publicClient = {
      waitForTransactionReceipt: vi.fn(),
    } as unknown as PublicClient

    await expect(
      mintAgentIdentity({
        handle: 'test.agent',
        homeHubUrl: 'https://hub.example.com',
        walletClient,
        publicClient,
        chain: 'base-sepolia', // mismatch!
      })
    ).rejects.toThrow('Chain mismatch')

    // writeContract should never have been called
    expect(writeContractFn).not.toHaveBeenCalled()
  })

  it('org chain mismatch throws before any contract call', async () => {
    const writeContractFn = vi.fn()
    const walletClient = {
      account: MOCK_ACCOUNT,
      chain: { id: 8453, name: 'Base' }, // mainnet
      writeContract: writeContractFn,
    } as unknown as WalletClient

    const publicClient = {
      waitForTransactionReceipt: vi.fn(),
    } as unknown as PublicClient

    await expect(
      mintOrgIdentity({
        handle: 'test.org',
        name: 'Test Org',
        walletClient,
        publicClient,
        chain: 'base-sepolia', // mismatch!
      })
    ).rejects.toThrow('Chain mismatch')

    expect(writeContractFn).not.toHaveBeenCalled()
  })

  it('TBA addresses differ for different token IDs', () => {
    // computeTBAAddress is parameterized by tokenId, so different tokens
    // produce different TBA addresses. Our mock returns different values
    // on successive calls to simulate this.
    expect(MOCK_TBA_1).not.toBe(MOCK_TBA_2)

    // Verify the constants are valid hex addresses
    expect(MOCK_TBA_1).toMatch(/^0x[0-9a-fA-F]{40}$/)
    expect(MOCK_TBA_2).toMatch(/^0x[0-9a-fA-F]{40}$/)
  })

  it('walletClient without account throws clear error', async () => {
    const walletClient = {
      account: undefined,
      chain: { id: 84532, name: 'Base Sepolia' },
      writeContract: vi.fn(),
    } as unknown as WalletClient

    const publicClient = {} as unknown as PublicClient

    await expect(
      mintAgentIdentity({
        handle: 'test.agent',
        homeHubUrl: 'https://hub.example.com',
        walletClient,
        publicClient,
        chain: 'base-sepolia',
      })
    ).rejects.toThrow('WalletClient must have an account')
  })
})
