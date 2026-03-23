// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { describe, expect, it, vi } from 'vitest'
import type { PublicClient, WalletClient } from 'viem'

const MOCK_TX = '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890' as const
const MOCK_ACCOUNT = { address: '0xaabbccddee1234567890aabbccddee1234567890' as const }
const MOCK_AGENT_CONTRACT = '0x1111111111111111111111111111111111111111' as const
const MOCK_ORG_CONTRACT = '0x2222222222222222222222222222222222222222' as const
const MOCK_REGISTRY_CONTRACT = '0x3333333333333333333333333333333333333333' as const
const MOCK_TBA = '0x4444444444444444444444444444444444444444' as const

// Mock @saga-standard/contracts before importing chain.ts
vi.mock('@saga-standard/contracts', () => ({
  getAgentIdentityConfig: () => ({
    address: MOCK_AGENT_CONTRACT,
    abi: [
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
    address: MOCK_REGISTRY_CONTRACT,
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
  computeTBAAddress: () => MOCK_TBA,
  entityTypeFromNumber: (n: number) => {
    if (n === 0) return 'NONE'
    if (n === 1) return 'AGENT'
    if (n === 2) return 'ORG'
    return 'NONE'
  },
  ERC6551_REGISTRY: '0x000000006551c19487814612e58FE06813775758',
}))

// Import after mock
const { mintAgentIdentity, mintOrgIdentity, resolveHandleOnChain, isHandleAvailable } =
  await import('../chain')

function createMockWalletClient(): WalletClient {
  return {
    account: MOCK_ACCOUNT,
    chain: { id: 84532, name: 'Base Sepolia' },
    writeContract: vi.fn().mockResolvedValue(MOCK_TX),
  } as unknown as WalletClient
}

function createMockPublicClient(overrides?: Record<string, unknown>): PublicClient {
  return {
    waitForTransactionReceipt: vi.fn().mockResolvedValue({ logs: [] }),
    readContract: vi.fn().mockResolvedValue([1, 42n, MOCK_AGENT_CONTRACT]),
    ...overrides,
  } as unknown as PublicClient
}

// ── mintAgentIdentity ────────────────────────────────────────────────

describe('mintAgentIdentity', () => {
  it('calls writeContract with registerAgent and correct args', async () => {
    const walletClient = createMockWalletClient()
    const publicClient = createMockPublicClient()

    // Will throw because no AgentRegistered event in empty logs, but writeContract is called
    await mintAgentIdentity({
      handle: 'test.agent',
      homeHubUrl: 'https://hub.example.com',
      walletClient,
      publicClient,
      chain: 'base-sepolia',
    }).catch(() => {
      /* expected */
    })

    expect(walletClient.writeContract).toHaveBeenCalledWith(
      expect.objectContaining({
        functionName: 'registerAgent',
        args: ['test.agent', 'https://hub.example.com'],
      })
    )
  })

  it('waits for transaction receipt after writeContract', async () => {
    const walletClient = createMockWalletClient()
    const waitFn = vi.fn().mockResolvedValue({ logs: [] })
    const publicClient = createMockPublicClient({
      waitForTransactionReceipt: waitFn,
    })

    await mintAgentIdentity({
      handle: 'test.agent',
      homeHubUrl: 'https://hub.example.com',
      walletClient,
      publicClient,
      chain: 'base-sepolia',
    }).catch(() => {
      /* expected */
    })

    expect(waitFn).toHaveBeenCalledWith({ hash: MOCK_TX })
  })

  it('throws when AgentRegistered event is missing from receipt', async () => {
    const walletClient = createMockWalletClient()
    const publicClient = createMockPublicClient()

    await expect(
      mintAgentIdentity({
        handle: 'test.agent',
        homeHubUrl: 'https://hub.example.com',
        walletClient,
        publicClient,
        chain: 'base-sepolia',
      })
    ).rejects.toThrow('AgentRegistered event not found')
  })
})

// ── mintOrgIdentity ──────────────────────────────────────────────────

describe('mintOrgIdentity', () => {
  it('calls writeContract with registerOrganization and correct args', async () => {
    const walletClient = createMockWalletClient()
    const publicClient = createMockPublicClient()

    await mintOrgIdentity({
      handle: 'test.org',
      name: 'Test Org',
      walletClient,
      publicClient,
      chain: 'base-sepolia',
    }).catch(() => {
      /* expected */
    })

    expect(walletClient.writeContract).toHaveBeenCalledWith(
      expect.objectContaining({
        functionName: 'registerOrganization',
        args: ['test.org', 'Test Org'],
      })
    )
  })

  it('throws when OrgRegistered event is missing from receipt', async () => {
    const walletClient = createMockWalletClient()
    const publicClient = createMockPublicClient()

    await expect(
      mintOrgIdentity({
        handle: 'test.org',
        name: 'Test Org',
        walletClient,
        publicClient,
        chain: 'base-sepolia',
      })
    ).rejects.toThrow('OrgRegistered event not found')
  })
})

// ── resolveHandleOnChain ─────────────────────────────────────────────

describe('resolveHandleOnChain', () => {
  it('returns parsed handle record for registered AGENT handle', async () => {
    const readFn = vi.fn().mockResolvedValue([1, 42n, '0xagentContract'])
    const publicClient = createMockPublicClient({ readContract: readFn })

    const result = await resolveHandleOnChain({
      handle: 'existing.agent',
      publicClient,
      chain: 'base-sepolia',
    })

    expect(result.entityType).toBe('AGENT')
    expect(result.tokenId).toBe(42n)
    expect(result.contractAddress).toBe('0xagentContract')
    expect(readFn).toHaveBeenCalledWith(
      expect.objectContaining({
        functionName: 'resolveHandle',
        args: ['existing.agent'],
      })
    )
  })

  it('returns ORG entity type for org handles', async () => {
    const publicClient = createMockPublicClient({
      readContract: vi.fn().mockResolvedValue([2, 7n, '0xorgContract']),
    })

    const result = await resolveHandleOnChain({
      handle: 'test.org',
      publicClient,
      chain: 'base-sepolia',
    })

    expect(result.entityType).toBe('ORG')
    expect(result.tokenId).toBe(7n)
  })

  it('throws for unregistered handle (NONE entity type)', async () => {
    const publicClient = createMockPublicClient({
      readContract: vi
        .fn()
        .mockResolvedValue([0, 0n, '0x0000000000000000000000000000000000000000']),
    })

    await expect(
      resolveHandleOnChain({
        handle: 'nonexistent',
        publicClient,
        chain: 'base-sepolia',
      })
    ).rejects.toThrow('Handle "nonexistent" is not registered on-chain')
  })
})

// ── isHandleAvailable ────────────────────────────────────────────────

describe('isHandleAvailable', () => {
  it('returns true for unregistered handle', async () => {
    const publicClient = createMockPublicClient({
      readContract: vi
        .fn()
        .mockResolvedValue([0, 0n, '0x0000000000000000000000000000000000000000']),
    })

    const available = await isHandleAvailable({
      handle: 'new.agent',
      publicClient,
      chain: 'base-sepolia',
    })

    expect(available).toBe(true)
  })

  it('returns false for registered handle', async () => {
    const publicClient = createMockPublicClient({
      readContract: vi.fn().mockResolvedValue([1, 42n, '0xagentContract']),
    })

    const available = await isHandleAvailable({
      handle: 'taken.agent',
      publicClient,
      chain: 'base-sepolia',
    })

    expect(available).toBe(false)
  })
})
