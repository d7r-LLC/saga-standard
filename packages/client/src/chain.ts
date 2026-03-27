// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import type { PublicClient, WalletClient } from 'viem'
import { decodeEventLog } from 'viem'
import {
  type SupportedChain,
  computeTBAAddress,
  entityTypeFromNumber,
  getAgentIdentityConfig,
  getHandleRegistryConfig,
  getOrgIdentityConfig,
} from '@saga-standard/contracts'
import type { MintResult, OnChainResolveResult } from './types'

/** Map from SupportedChain to CAIP-2 chain ID number */
const CHAIN_IDS: Record<SupportedChain, number> = {
  'base-sepolia': 84532,
  base: 8453,
}

/** ERC-6551 TBA implementation address (same across all chains) */
const TBA_IMPLEMENTATION = '0x55266d75D1a14E4572138116aF39863Ed6596E7F' as const

/** Assert that the viem client's chain ID matches the declared chain parameter */
function assertChainMatch(
  walletClient: WalletClient,
  publicClient: PublicClient,
  chain: SupportedChain
): void {
  const clientChainId = walletClient.chain?.id ?? publicClient.chain?.id
  if (clientChainId == null) return // no chain set on clients, trust the parameter

  const expectedChainId = CHAIN_IDS[chain]
  if (expectedChainId !== clientChainId) {
    throw new Error(
      `Chain mismatch: options.chain ("${chain}", id ${expectedChainId}) does not match client chain id (${clientChainId})`
    )
  }
}

/**
 * Mint a SAGA Agent Identity NFT on-chain.
 *
 * Calls SAGAAgentIdentity.registerAgent(handle, hubUrl) and waits
 * for the transaction receipt. Extracts tokenId from the
 * AgentRegistered event log and computes the TBA address.
 */
export async function mintAgentIdentity(options: {
  handle: string
  homeHubUrl: string
  walletClient: WalletClient
  publicClient: PublicClient
  chain: SupportedChain
}): Promise<MintResult> {
  const { handle, homeHubUrl, walletClient, publicClient, chain } = options
  const config = getAgentIdentityConfig(chain)

  assertChainMatch(walletClient, publicClient, chain)

  const account = walletClient.account
  if (!account) {
    throw new Error('WalletClient must have an account')
  }

  const txHash = await walletClient.writeContract({
    ...config,
    functionName: 'registerAgent',
    args: [handle, homeHubUrl],
    account,
    chain: walletClient.chain,
  })

  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash })

  if (receipt.status === 'reverted') {
    throw new Error('Transaction reverted while minting agent identity')
  }

  // Find AgentRegistered event in logs
  let tokenId: bigint | undefined
  for (const log of receipt.logs) {
    try {
      const decoded = decodeEventLog({
        abi: config.abi,
        data: log.data,
        topics: log.topics,
      })
      if (decoded.eventName === 'AgentRegistered') {
        const args = decoded.args as { tokenId: bigint }
        tokenId = args.tokenId
        break
      }
    } catch {
      // Not an event from this ABI, skip
    }
  }

  if (tokenId === undefined) {
    throw new Error('AgentRegistered event not found in transaction receipt')
  }

  const tbaAddress = computeTBAAddress({
    implementation: TBA_IMPLEMENTATION,
    chainId: CHAIN_IDS[chain],
    tokenContract: config.address,
    tokenId,
  })

  return { tokenId, txHash, tbaAddress }
}

/**
 * Mint a SAGA Org Identity NFT on-chain.
 *
 * Calls SAGAOrgIdentity.registerOrganization(handle, name) and waits
 * for the transaction receipt. Extracts tokenId from the
 * OrgRegistered event log and computes the TBA address.
 */
export async function mintOrgIdentity(options: {
  handle: string
  name: string
  walletClient: WalletClient
  publicClient: PublicClient
  chain: SupportedChain
}): Promise<MintResult> {
  const { handle, name, walletClient, publicClient, chain } = options
  const config = getOrgIdentityConfig(chain)

  assertChainMatch(walletClient, publicClient, chain)

  const account = walletClient.account
  if (!account) {
    throw new Error('WalletClient must have an account')
  }

  const txHash = await walletClient.writeContract({
    ...config,
    functionName: 'registerOrganization',
    args: [handle, name],
    account,
    chain: walletClient.chain,
  })

  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash })

  if (receipt.status === 'reverted') {
    throw new Error('Transaction reverted while minting org identity')
  }

  // Find OrgRegistered event in logs
  let tokenId: bigint | undefined
  for (const log of receipt.logs) {
    try {
      const decoded = decodeEventLog({
        abi: config.abi,
        data: log.data,
        topics: log.topics,
      })
      if (decoded.eventName === 'OrgRegistered') {
        const args = decoded.args as { tokenId: bigint }
        tokenId = args.tokenId
        break
      }
    } catch {
      // Not an event from this ABI, skip
    }
  }

  if (tokenId === undefined) {
    throw new Error('OrgRegistered event not found in transaction receipt')
  }

  const tbaAddress = computeTBAAddress({
    implementation: TBA_IMPLEMENTATION,
    chainId: CHAIN_IDS[chain],
    tokenContract: config.address,
    tokenId,
  })

  return { tokenId, txHash, tbaAddress }
}

/**
 * Resolve a handle on-chain via the SAGAHandleRegistry.
 *
 * Returns entityType, tokenId, and contractAddress.
 * Throws if handle is not registered (entityType === NONE).
 */
export async function resolveHandleOnChain(options: {
  handle: string
  publicClient: PublicClient
  chain: SupportedChain
}): Promise<OnChainResolveResult> {
  const { handle, publicClient, chain } = options
  const config = getHandleRegistryConfig(chain)

  // resolveHandle reverts with "SAGAHandleRegistry: not found" when handle doesn't exist
  const result = await publicClient.readContract({
    ...config,
    functionName: 'resolveHandle',
    args: [handle],
  })

  // result is [uint8 entityType, uint256 tokenId, address contractAddress]
  const [rawEntityType, tokenId, contractAddress] = result as [number, bigint, string]
  const entityType = entityTypeFromNumber(rawEntityType)

  return { entityType, tokenId, contractAddress }
}

/**
 * Check if a handle is available (not registered) on-chain.
 *
 * Uses the `handleExists` view function which returns a boolean,
 * rather than `resolveHandle` which reverts when the handle is not found.
 */
export async function isHandleAvailable(options: {
  handle: string
  publicClient: PublicClient
  chain: SupportedChain
}): Promise<boolean> {
  const { handle, publicClient, chain } = options
  const config = getHandleRegistryConfig(chain)

  const exists = await publicClient.readContract({
    ...config,
    functionName: 'handleExists',
    args: [handle],
  })

  return !(exists as boolean)
}
