// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { createPublicClient, erc20Abi, formatEther, formatUnits, http } from 'viem'
import type { PublicClient } from 'viem'
import { CHAINS, USDC_ADDRESSES } from './constants'
import type { ChainId, TokenBalance } from './types'

const clients = new Map<ChainId, PublicClient>()

export function getPublicClient(chainId: ChainId): PublicClient {
  let client = clients.get(chainId)
  if (!client) {
    client = createPublicClient({
      chain: CHAINS[chainId],
      transport: http(),
    })
    clients.set(chainId, client)
  }
  return client
}

export async function fetchETHBalance(chainId: ChainId, address: `0x${string}`): Promise<string> {
  const client = getPublicClient(chainId)
  const balance = await client.getBalance({ address })
  return formatEther(balance)
}

export async function fetchUSDCBalance(chainId: ChainId, address: `0x${string}`): Promise<string> {
  const client = getPublicClient(chainId)
  const usdcAddress = USDC_ADDRESSES[chainId]
  const balance = await client.readContract({
    address: usdcAddress,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [address],
  })
  return formatUnits(balance as bigint, 6)
}

export async function fetchAllBalances(
  chainId: ChainId,
  address: `0x${string}`
): Promise<TokenBalance[]> {
  const [ethBalance, usdcBalance] = await Promise.all([
    fetchETHBalance(chainId, address),
    fetchUSDCBalance(chainId, address),
  ])

  return [
    {
      symbol: 'ETH',
      name: 'Ethereum',
      balance: ethBalance,
      decimals: 18,
    },
    {
      symbol: 'USDC',
      name: 'USD Coin',
      balance: usdcBalance,
      decimals: 6,
      contractAddress: USDC_ADDRESSES[chainId],
    },
  ]
}
