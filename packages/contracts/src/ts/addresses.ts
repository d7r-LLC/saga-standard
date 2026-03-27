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
    SAGAHandleRegistry: '0xec2f53f2cfa24553c4ad6e585965490f839b28f0',
    SAGAAgentIdentity: '0x1a706cc37ea90af568dce0f637aeb60884c9fadb',
    SAGAOrgIdentity: '0x4f297f7b3439d1bdd548ba897d3b82b5fc2bdd26',
    SAGATBAHelper: '0xcbd2a8193901eb838439dd2bb3303ce177989dbe',
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
