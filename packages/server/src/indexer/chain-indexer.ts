// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { type Log, createPublicClient, http, toEventSelector } from 'viem'
import { baseSepolia } from 'viem/chains'
import { drizzle } from 'drizzle-orm/d1'
import type { Env } from '../bindings'
import { INDEXER_CURSOR_KEY } from './types'
import { handleAgentTransfer, handleOrgTransfer } from './event-handlers'

/** Maximum blocks to fetch per poll (stay within CF CPU limits) */
const MAX_BLOCKS_PER_POLL = 2000n

/** Pre-computed event topic0 selectors */
const AGENT_REGISTERED_TOPIC = toEventSelector(
  'AgentRegistered(uint256,string,address,string,uint256)'
)
const HOME_HUB_UPDATED_TOPIC = toEventSelector('HomeHubUpdated(uint256,string,string)')
const ORG_REGISTERED_TOPIC = toEventSelector('OrgRegistered(uint256,string,string,address,uint256)')
const ORG_NAME_UPDATED_TOPIC = toEventSelector('OrgNameUpdated(uint256,string,string)')
const TRANSFER_TOPIC = toEventSelector('Transfer(address,address,uint256)')

/**
 * Run the on-chain event indexer.
 * Called by the Cloudflare Worker scheduled handler.
 */
export async function runIndexer(env: Env): Promise<void> {
  // Skip if not configured
  if (!env.BASE_RPC_URL || !env.AGENT_IDENTITY_CONTRACT || !env.ORG_IDENTITY_CONTRACT) {
    return
  }

  const client = createPublicClient({
    chain: baseSepolia,
    transport: http(env.BASE_RPC_URL),
  })

  const db = drizzle(env.DB)
  const chain = 'eip155:84532' // Base Sepolia

  // Read cursor from KV
  const cursorStr = await env.INDEXER_STATE.get(INDEXER_CURSOR_KEY)
  const fromBlock = cursorStr ? BigInt(cursorStr) + 1n : 0n

  // Get current block
  const latestBlock = await client.getBlockNumber()
  if (fromBlock > latestBlock) return

  const toBlock =
    latestBlock - fromBlock > MAX_BLOCKS_PER_POLL ? fromBlock + MAX_BLOCKS_PER_POLL : latestBlock

  const agentContract = env.AGENT_IDENTITY_CONTRACT as `0x${string}`
  const orgContract = env.ORG_IDENTITY_CONTRACT as `0x${string}`

  // Fetch logs for both contracts
  const logs = await client.getLogs({
    address: [agentContract, orgContract],
    fromBlock,
    toBlock,
  })

  // Process each log
  for (const log of logs) {
    const meta = {
      txHash: log.transactionHash ?? '',
      contractAddress: log.address.toLowerCase(),
      chain,
      blockNumber: log.blockNumber ?? 0n,
    }

    try {
      await processLog(db, log, meta, agentContract.toLowerCase(), orgContract.toLowerCase())
    } catch (err) {
      // Log error but continue processing remaining events
      // eslint-disable-next-line no-console
      console.error(`Failed to process log in tx ${meta.txHash}:`, err)
    }
  }

  // Advance cursor
  await env.INDEXER_STATE.put(INDEXER_CURSOR_KEY, toBlock.toString())
}

async function processLog(
  db: ReturnType<typeof drizzle>,
  log: Log,
  meta: { txHash: string; contractAddress: string; chain: string; blockNumber: bigint },
  agentAddress: string,
  orgAddress: string
): Promise<void> {
  const topic0 = log.topics[0]
  if (!topic0) return

  const isAgent = log.address.toLowerCase() === agentAddress
  const isOrg = log.address.toLowerCase() === orgAddress

  // Handle Transfer events (skip mints, handled by Registered events)
  if (topic0 === TRANSFER_TOPIC) {
    const from = `0x${log.topics[1]?.slice(26)}` as `0x${string}`
    const to = `0x${log.topics[2]?.slice(26)}` as `0x${string}`
    const tokenId = BigInt(log.topics[3] ?? '0')

    // Skip mint events (from = zero address)
    if (from === '0x0000000000000000000000000000000000000000') return

    if (isAgent) {
      await handleAgentTransfer(db, { from, to, tokenId })
    } else if (isOrg) {
      await handleOrgTransfer(db, { from, to, tokenId })
    }
    return
  }

  // AgentRegistered, OrgRegistered, HomeHubUpdated, OrgNameUpdated
  // These require decoding log.data which needs the full ABI.
  // For now, we handle only Transfer events. Full event decoding
  // will be added when contracts are deployed and we can test against
  // real event data. The event handlers are ready (see event-handlers.ts).
  if (topic0 === AGENT_REGISTERED_TOPIC && isAgent) {
    // TODO: decode log.data with decodeEventLog and call handleAgentRegistered
    return
  }

  if (topic0 === ORG_REGISTERED_TOPIC && isOrg) {
    // TODO: decode log.data with decodeEventLog and call handleOrgRegistered
    return
  }

  if (topic0 === HOME_HUB_UPDATED_TOPIC && isAgent) {
    // TODO: decode log.data with decodeEventLog and call handleHomeHubUpdated
    return
  }

  if (topic0 === ORG_NAME_UPDATED_TOPIC && isOrg) {
    // TODO: decode log.data with decodeEventLog and call handleOrgNameUpdated
    return
  }
}

// Re-export selectors for testing
export {
  AGENT_REGISTERED_TOPIC,
  ORG_REGISTERED_TOPIC,
  TRANSFER_TOPIC,
  HOME_HUB_UPDATED_TOPIC,
  ORG_NAME_UPDATED_TOPIC,
}
