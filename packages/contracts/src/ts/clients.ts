// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { SAGAAgentIdentityAbi, SAGAHandleRegistryAbi, SAGAOrgIdentityAbi } from './abis'
import { type SupportedChain, getDeployedAddress } from './addresses'

/**
 * Get address + ABI config for SAGAHandleRegistry.
 *
 * Usage with viem:
 * ```ts
 * import { getContract } from 'viem'
 * const contract = getContract({ ...getHandleRegistryConfig('base-sepolia'), client })
 * ```
 */
export function getHandleRegistryConfig(chain: SupportedChain) {
  return {
    address: getDeployedAddress('SAGAHandleRegistry', chain),
    abi: SAGAHandleRegistryAbi,
  } as const
}

/**
 * Get address + ABI config for SAGAAgentIdentity.
 *
 * Usage with viem:
 * ```ts
 * import { getContract } from 'viem'
 * const contract = getContract({ ...getAgentIdentityConfig('base-sepolia'), client })
 * ```
 */
export function getAgentIdentityConfig(chain: SupportedChain) {
  return {
    address: getDeployedAddress('SAGAAgentIdentity', chain),
    abi: SAGAAgentIdentityAbi,
  } as const
}

/**
 * Get address + ABI config for SAGAOrgIdentity.
 *
 * Usage with viem:
 * ```ts
 * import { getContract } from 'viem'
 * const contract = getContract({ ...getOrgIdentityConfig('base-sepolia'), client })
 * ```
 */
export function getOrgIdentityConfig(chain: SupportedChain) {
  return {
    address: getDeployedAddress('SAGAOrgIdentity', chain),
    abi: SAGAOrgIdentityAbi,
  } as const
}
