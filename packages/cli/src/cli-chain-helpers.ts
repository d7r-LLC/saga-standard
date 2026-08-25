// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { createPublicClient, createWalletClient, http } from 'viem'
import { base, baseSepolia } from 'viem/chains'
import { privateKeyToAccount } from 'viem/accounts'
import type { PublicClient, WalletClient } from 'viem'
import type { PrivateKeyAccount } from 'viem/accounts'
import type { ResolveResponse, SupportedChain } from '@d7r/saga-client'
import { SagaAuthError, SagaServerClient } from '@d7r/saga-client'

const RPC_URLS: Record<SupportedChain, string> = {
  'base-sepolia': 'https://sepolia.base.org',
  base: 'https://mainnet.base.org',
}

const VIEM_CHAINS = {
  'base-sepolia': baseSepolia,
  base,
} as const

/** Get the public RPC URL for a chain */
export function getRpcUrl(chain: SupportedChain): string {
  return RPC_URLS[chain]
}

/** Map a CAIP-2 chain ID string to a SupportedChain */
export function chainFromCaip2(caip2: string): SupportedChain {
  if (caip2 === 'eip155:84532' || caip2 === 'base-sepolia') return 'base-sepolia'
  if (caip2 === 'eip155:8453' || caip2 === 'base') return 'base'
  return 'base-sepolia'
}

/** Create viem PublicClient + WalletClient from a private key and chain */
export function createViemClients(options: { privateKeyHex: string; chain: SupportedChain }): {
  publicClient: PublicClient
  walletClient: WalletClient
  account: PrivateKeyAccount
} {
  const { privateKeyHex, chain } = options
  const account = privateKeyToAccount(privateKeyHex as `0x${string}`)
  const viemChain = VIEM_CHAINS[chain]
  const rpcUrl = getRpcUrl(chain)

  const publicClient = createPublicClient({
    chain: viemChain,
    transport: http(rpcUrl),
  })

  const walletClient = createWalletClient({
    account,
    chain: viemChain,
    transport: http(rpcUrl),
  })

  return { publicClient: publicClient as PublicClient, walletClient, account }
}

/**
 * Poll server resolve endpoint until handle appears or timeout.
 * Used after on-chain minting to wait for the server indexer.
 */
export async function waitForIndexer(options: {
  client: SagaServerClient
  handle: string
  maxAttempts?: number
  intervalMs?: number
}): Promise<ResolveResponse> {
  const { client, handle, maxAttempts = 15, intervalMs = 2000 } = options

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const result = await client.resolve(handle)
      return result
    } catch (err) {
      if (err instanceof SagaAuthError && err.statusCode === 404) {
        if (attempt === maxAttempts) {
          throw new Error(
            `Indexer did not pick up handle "${handle}" after ${maxAttempts} attempts (${(maxAttempts * intervalMs) / 1000}s)`
          )
        }
        await sleep(intervalMs)
        continue
      }
      throw err
    }
  }

  // Should be unreachable
  throw new Error('waitForIndexer: unexpected state')
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
