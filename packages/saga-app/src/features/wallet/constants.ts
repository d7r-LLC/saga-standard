// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { base, baseSepolia } from 'viem/chains'
import type { ChainId } from './types'
import type { Chain } from 'viem'

export const CHAINS: Record<ChainId, Chain> = {
  base,
  'base-sepolia': baseSepolia,
}

export const DEFAULT_CHAIN: ChainId = 'base-sepolia'

export const USDC_ADDRESSES: Record<ChainId, `0x${string}`> = {
  base: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  'base-sepolia': '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
}

export const DEFAULT_DERIVATION_PATH = "m/44'/60'/0'/0/0"

export const KEYCHAIN_MNEMONIC_PREFIX = 'wallet-mnemonic'
