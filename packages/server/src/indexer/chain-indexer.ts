// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { type Chain, createPublicClient, http } from 'viem'
import { base, baseSepolia } from 'viem/chains'
import { drizzle } from 'drizzle-orm/d1'
import type { Env } from '../bindings'
import { INDEXER_CURSOR_KEY } from './types'
import type {
  AgentRegisteredEvent,
  EventMeta,
  HomeHubUpdatedEvent,
  OrgNameUpdatedEvent,
  OrgRegisteredEvent,
  TransferEvent,
} from './types'
import {
  handleAgentRegistered,
  handleAgentTransfer,
  handleHomeHubUpdated,
  handleOrgNameUpdated,
  handleOrgRegistered,
  handleOrgTransfer,
} from './event-handlers'

/** Maximum blocks to fetch per poll (stay within CF CPU limits) */
const MAX_BLOCKS_PER_POLL = 2000n

/**
 * Event ABIs for log filtering and decoding.
 * Passed to viem's getLogs `events` parameter for server-side topic0 filtering
 * and automatic decoding of indexed/non-indexed parameters.
 */
export const EVENT_ABIS = [
  {
    type: 'event',
    name: 'AgentRegistered',
    inputs: [
      { name: 'tokenId', type: 'uint256', indexed: true },
      { name: 'handle', type: 'string', indexed: false },
      { name: 'owner', type: 'address', indexed: false },
      { name: 'hubUrl', type: 'string', indexed: false },
      { name: 'registeredAt', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'HomeHubUpdated',
    inputs: [
      { name: 'tokenId', type: 'uint256', indexed: true },
      { name: 'oldUrl', type: 'string', indexed: false },
      { name: 'newUrl', type: 'string', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'OrgRegistered',
    inputs: [
      { name: 'tokenId', type: 'uint256', indexed: true },
      { name: 'handle', type: 'string', indexed: false },
      { name: 'name', type: 'string', indexed: false },
      { name: 'owner', type: 'address', indexed: false },
      { name: 'registeredAt', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'OrgNameUpdated',
    inputs: [
      { name: 'tokenId', type: 'uint256', indexed: true },
      { name: 'oldName', type: 'string', indexed: false },
      { name: 'newName', type: 'string', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'Transfer',
    inputs: [
      { name: 'from', type: 'address', indexed: true },
      { name: 'to', type: 'address', indexed: true },
      { name: 'tokenId', type: 'uint256', indexed: true },
    ],
  },
] as const

/** A decoded event log, abstracted from viem's return type for testability */
export interface DecodedEventLog {
  eventName: string
  args: Record<string, unknown>
  address: string
}

/** Select the viem Chain object based on CAIP-2 identifier */
function getViemChain(caip2: string): Chain {
  if (caip2 === 'eip155:8453') return base
  return baseSepolia
}

/**
 * Run the on-chain event indexer.
 * Called by the Cloudflare Worker scheduled handler.
 */
export async function runIndexer(env: Env): Promise<void> {
  // Skip if not configured
  if (!env.BASE_RPC_URL || !env.AGENT_IDENTITY_CONTRACT || !env.ORG_IDENTITY_CONTRACT) {
    return
  }

  const db = drizzle(env.DB)
  const chain = env.INDEXER_CHAIN ?? 'eip155:84532'

  const client = createPublicClient({
    chain: getViemChain(chain),
    transport: http(env.BASE_RPC_URL),
  })

  // Read cursor from KV, fall back to configured start block
  const cursorStr = await env.INDEXER_STATE.get(INDEXER_CURSOR_KEY)
  const startBlock = env.INDEXER_START_BLOCK ? BigInt(env.INDEXER_START_BLOCK) : 0n
  const fromBlock = cursorStr ? BigInt(cursorStr) + 1n : startBlock

  // Get current block
  const latestBlock = await client.getBlockNumber()
  if (fromBlock > latestBlock) return

  const toBlock =
    latestBlock - fromBlock > MAX_BLOCKS_PER_POLL ? fromBlock + MAX_BLOCKS_PER_POLL : latestBlock

  const agentContract = env.AGENT_IDENTITY_CONTRACT as `0x${string}`
  const orgContract = env.ORG_IDENTITY_CONTRACT as `0x${string}`

  // Fetch logs for both contracts with server-side topic0 filtering.
  // The `events` parameter tells the RPC to only return logs matching
  // these event signatures, avoiding unnecessary client-side filtering.
  const logs = await client.getLogs({
    address: [agentContract, orgContract],
    events: EVENT_ABIS,
    fromBlock,
    toBlock,
  })

  // Process each log, tracking failures for safe cursor advancement
  let lastSuccessBlock = fromBlock > 0n ? fromBlock - 1n : 0n
  let hasFailure = false

  for (const log of logs) {
    const logBlock = log.blockNumber ?? 0n
    const meta: EventMeta = {
      txHash: log.transactionHash ?? '',
      contractAddress: log.address.toLowerCase(),
      chain,
      blockNumber: logBlock,
    }

    try {
      await processDecodedLog(
        db,
        {
          eventName: log.eventName,
          args: log.args as Record<string, unknown>,
          address: log.address,
        },
        meta,
        agentContract.toLowerCase(),
        orgContract.toLowerCase()
      )
      // Only advance success marker if no prior failure (preserve ordering)
      if (!hasFailure) {
        lastSuccessBlock = logBlock
      }
    } catch (err) {
      hasFailure = true
      // eslint-disable-next-line no-console
      console.error(`Failed to process log in tx ${meta.txHash}:`, err)
    }
  }

  // Advance cursor safely:
  // - If all logs succeeded (or no logs at all), advance to toBlock
  // - If there were failures, advance to the last block before the first failure
  //   so failed events will be retried on the next poll
  if (!hasFailure) {
    await env.INDEXER_STATE.put(INDEXER_CURSOR_KEY, toBlock.toString())
  } else if (lastSuccessBlock >= fromBlock) {
    await env.INDEXER_STATE.put(INDEXER_CURSOR_KEY, lastSuccessBlock.toString())
  }
  // If the very first log failed, don't advance the cursor at all
}

/**
 * Process a single decoded event log by dispatching to the appropriate handler.
 * Accepts a simple interface for testability (no dependency on viem's complex
 * decoded log types).
 */
export async function processDecodedLog(
  db: ReturnType<typeof drizzle>,
  log: DecodedEventLog,
  meta: EventMeta,
  agentAddress: string,
  orgAddress: string
): Promise<void> {
  const isAgent = log.address.toLowerCase() === agentAddress
  const isOrg = log.address.toLowerCase() === orgAddress
  if (!isAgent && !isOrg) return

  switch (log.eventName) {
    case 'Transfer': {
      const args = log.args as unknown as TransferEvent
      // Skip mint events (from = zero address)
      if (args.from === '0x0000000000000000000000000000000000000000') return
      if (isAgent) {
        await handleAgentTransfer(db, args)
      } else if (isOrg) {
        await handleOrgTransfer(db, args)
      }
      break
    }

    case 'AgentRegistered': {
      if (!isAgent) break
      await handleAgentRegistered(db, log.args as unknown as AgentRegisteredEvent, meta)
      break
    }

    case 'OrgRegistered': {
      if (!isOrg) break
      await handleOrgRegistered(db, log.args as unknown as OrgRegisteredEvent, meta)
      break
    }

    case 'HomeHubUpdated': {
      if (!isAgent) break
      await handleHomeHubUpdated(db, log.args as unknown as HomeHubUpdatedEvent)
      break
    }

    case 'OrgNameUpdated': {
      if (!isOrg) break
      await handleOrgNameUpdated(db, log.args as unknown as OrgNameUpdatedEvent)
      break
    }
  }
}
