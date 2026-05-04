// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import {
  SAGAAgentIdentityAbi,
  SAGADirectoryIdentityAbi,
  SAGAHandleRegistryAbi,
  SAGAOrgIdentityAbi,
  SAGATBAHelperAbi,
} from './abis'
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

/**
 * Get address + ABI config for SAGADirectoryIdentity.
 *
 * Usage with viem:
 * ```ts
 * import { getContract } from 'viem'
 * const contract = getContract({ ...getDirectoryIdentityConfig('base-sepolia'), client })
 * ```
 */
export function getDirectoryIdentityConfig(chain: SupportedChain) {
  return {
    address: getDeployedAddress('SAGADirectoryIdentity', chain),
    abi: SAGADirectoryIdentityAbi,
  } as const
}

/**
 * Get address + ABI config for SAGATBAHelper.
 *
 * Phase 10 (M-8): exposes the helper's ERC-6551 entry points
 * (`computeAccount`, `computeAccountForChain`, `createAccount`) so
 * frontends can call the deployed helper instead of reimplementing the
 * derivation off-chain. The helper's `registry` and `accountImplementation`
 * are immutable once deployed; calling through the helper guarantees
 * consumers stay aligned with whatever the on-chain self-TBA guard sees.
 *
 * Usage with viem:
 * ```ts
 * import { getContract } from 'viem'
 * const contract = getContract({ ...getTBAHelperConfig('base-sepolia'), client })
 * ```
 */
export function getTBAHelperConfig(chain: SupportedChain) {
  return {
    address: getDeployedAddress('SAGATBAHelper', chain),
    abi: SAGATBAHelperAbi,
  } as const
}
