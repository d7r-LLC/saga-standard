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
    SAGAHandleRegistry: '0x347948059E8aBA66F45fAcb853bb5d5064a2309e',
    SAGAAgentIdentity: '0x097FA17d59A072920063D7F85817239066ED3595',
    SAGAOrgIdentity: '0xF27b400f0E00b9e316BD5cBed9241ad9284C31f6',
    SAGATBAHelper: '0x00613a2b5Ca4b457b45BC20B8D1E182a13614142',
    SAGADirectoryIdentity: '0xC54c7958719c3bC3aB0e524be56eCb1c0408dFf6',
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
