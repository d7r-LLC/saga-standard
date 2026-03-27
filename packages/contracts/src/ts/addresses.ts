// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import type { Address } from 'viem'

export type SupportedChain = 'base-sepolia' | 'base'

export type ContractName =
  | 'SAGAHandleRegistry'
  | 'SAGAAgentIdentity'
  | 'SAGAOrgIdentity'
  | 'SAGATBAHelper'
  | 'SAGADirectoryIdentity'

const ZERO: Address = '0x0000000000000000000000000000000000000000'

const ADDRESSES: Record<SupportedChain, Record<ContractName, Address>> = {
  'base-sepolia': {
    SAGAHandleRegistry: ZERO, // populated after testnet deploy
    SAGAAgentIdentity: ZERO,
    SAGAOrgIdentity: ZERO,
    SAGATBAHelper: ZERO,
    SAGADirectoryIdentity: ZERO,
  },
  base: {
    SAGAHandleRegistry: ZERO,
    SAGAAgentIdentity: ZERO,
    SAGAOrgIdentity: ZERO,
    SAGATBAHelper: ZERO,
    SAGADirectoryIdentity: ZERO,
  },
}

/** Canonical ERC-6551 registry deployed on all EVM chains */
export const ERC6551_REGISTRY: Address = '0x000000006551c19487814612e58FE06813775758'

/** Get the deployed address for a contract on a specific chain */
export function getDeployedAddress(contract: ContractName, chain: SupportedChain): Address {
  const addr = ADDRESSES[chain][contract]
  if (addr === ZERO) {
    throw new Error(`${contract} not yet deployed on ${chain}`)
  }
  return addr
}

/** Check if a contract is deployed on a chain (without throwing) */
export function isDeployed(contract: ContractName, chain: SupportedChain): boolean {
  return ADDRESSES[chain][contract] !== ZERO
}
