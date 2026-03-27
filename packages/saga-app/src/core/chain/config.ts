// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import type { Chain } from 'viem'
import { base, baseSepolia } from 'viem/chains'
import type { ChainId } from '../../features/wallet/types'

export const CHAINS: Record<ChainId, Chain> = {
  base,
  'base-sepolia': baseSepolia,
}

export const RPC_URLS: Record<ChainId, string> = {
  base: 'https://mainnet.base.org',
  'base-sepolia': 'https://sepolia.base.org',
}

export const DEFAULT_CHAIN_ID: ChainId = 'base-sepolia'

export const TBA_IMPLEMENTATION = '0x55266d75D1a14E4572138116aF39863Ed6596E7F' as const

export const CHAIN_IDS: Record<ChainId, number> = {
  base: 8453,
  'base-sepolia': 84532,
}
