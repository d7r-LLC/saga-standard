// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

export type WalletType = 'self-custody' | 'managed'

export type ChainId = 'base' | 'base-sepolia'

export interface WalletData {
  id: string
  type: WalletType
  label: string
  address: string
  chain: ChainId
  balance: string
  lastSync: number
}

export interface TokenBalance {
  symbol: string
  name: string
  balance: string
  decimals: number
  contractAddress?: string
}

export interface TransactionRecord {
  hash: string
  from: string
  to: string
  value: string
  gasUsed: string
  timestamp: number
  status: 'pending' | 'confirmed' | 'failed'
  type: 'send' | 'receive'
  tokenSymbol?: string
}

export interface SendParams {
  to: `0x${string}`
  value: bigint
  tokenAddress?: `0x${string}`
}

export interface GasEstimate {
  gasLimit: bigint
  maxFeePerGas: bigint
  maxPriorityFeePerGas: bigint
  totalCostWei: bigint
  totalCostEth: string
}
