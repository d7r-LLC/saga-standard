// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { type Chain, createPublicClient, http } from 'viem'
import { base, baseSepolia } from 'viem/chains'
import { getDb } from '../db'
import type { Env } from '../bindings'
import { INDEXER_CURSOR_KEY } from './types'
import type {
  AgentRegisteredEvent,
  DirectoryRegisteredEvent,
  DirectoryStatusUpdatedEvent,
  DirectoryUrlUpdatedEvent,
  EventMeta,
  HomeHubUpdatedEvent,
  OrgNameUpdatedEvent,
  OrgRegisteredEvent,
  TransferEvent,
} from './types'
import {
  handleAgentRegistered,
  handleAgentTransfer,
  handleDirectoryRegistered,
  handleDirectoryStatusUpdated,
  handleDirectoryTransfer,
  handleDirectoryUrlUpdated,
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
      { name: 'owner', type: 'address', indexed: true },
      { name: 'homeHubUrl', type: 'string', indexed: false },
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
      { name: 'owner', type: 'address', indexed: true },
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
    name: 'DirectoryRegistered',
    inputs: [
      { name: 'tokenId', type: 'uint256', indexed: true },
      { name: 'directoryId', type: 'string', indexed: false },
      { name: 'operator', type: 'address', indexed: true },
      { name: 'url', type: 'string', indexed: false },
      { name: 'conformanceLevel', type: 'string', indexed: false },
      { name: 'registeredAt', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'DirectoryStatusUpdated',
    inputs: [
      { name: 'tokenId', type: 'uint256', indexed: true },
      { name: 'oldStatus', type: 'string', indexed: false },
      { name: 'newStatus', type: 'string', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'DirectoryUrlUpdated',
    inputs: [
      { name: 'tokenId', type: 'uint256', indexed: true },
      { name: 'oldUrl', type: 'string', indexed: false },
      { name: 'newUrl', type: 'string', indexed: false },
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
  switch (caip2) {
    case 'eip155:8453':
      return base
    case 'eip155:84532':
      return baseSepolia
    default:
      throw new Error(
        `Unsupported INDEXER_CHAIN value "${caip2}". Supported: "eip155:8453" (Base) and "eip155:84532" (Base Sepolia).`
      )
  }
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

  const db = getDb(env.DB)
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
  const directoryContract = env.DIRECTORY_IDENTITY_CONTRACT as `0x${string}` | undefined

  // Fetch logs for contracts with server-side topic0 filtering.
  // The `events` parameter tells the RPC to only return logs matching
  // these event signatures, avoiding unnecessary client-side filtering.
  const watchAddresses: `0x${string}`[] = [agentContract, orgContract]
  if (directoryContract) watchAddresses.push(directoryContract)

  const logs = await client.getLogs({
    address: watchAddresses,
    events: EVENT_ABIS,
    fromBlock,
    toBlock,
  })

  // Process each log, tracking the FIRST block in the range that had any
  // failure. The cursor advances cleanly to (firstFailureBlock - 1) on
  // any failure — i.e. we re-fetch the failing block and everything
  // after on the next poll. This is the only safe semantic given that:
  //
  //   1. A single block typically contains MULTIPLE related events from
  //      one transaction (e.g. mint emits Transfer + AgentRegistered).
  //   2. The Transfer-mint case in processDecodedLog is an early-return
  //      success (the catch branch is never taken) — so an old
  //      "advance lastSuccessBlock on every successful log" approach
  //      would advance INTO the same block where the immediately-
  //      following AgentRegistered fails. That tracking-per-log model
  //      let cursor land on a partially-failed block, dropping the
  //      Registered event silently.
  //   3. We don't have per-handler retry / DLQ infrastructure, so the
  //      only retry mechanism is "leave the cursor unmoved past the
  //      first failure". Block-level granularity is the simplest unit
  //      that's guaranteed to retry every log we couldn't process.
  let firstFailureBlock: bigint | null = null

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
        orgContract.toLowerCase(),
        directoryContract?.toLowerCase(),
        env.SESSIONS
      )
    } catch (err) {
      if (firstFailureBlock === null || logBlock < firstFailureBlock) {
        firstFailureBlock = logBlock
      }
      // eslint-disable-next-line no-console
      console.error(`Failed to process log in tx ${meta.txHash}:`, err)
    }
  }

  const newCursor = decideCursorAdvance(firstFailureBlock, fromBlock, toBlock)
  if (newCursor !== null) {
    await env.INDEXER_STATE.put(INDEXER_CURSOR_KEY, newCursor.toString())
  }
}

/**
 * Decide where to write the indexer cursor after a poll, given the
 * first-failure block (if any) and the scanned range.
 *
 * Pure function — no I/O — so it can be unit-tested without mocking
 * out viem, the RPC, or KV. Three possible outcomes:
 *
 *   1. firstFailureBlock === null            → cursor = toBlock
 *      All logs in the range processed. Resume past `toBlock` next poll.
 *
 *   2. firstFailureBlock > fromBlock         → cursor = firstFailureBlock - 1
 *      At least one earlier block in the range processed cleanly.
 *      Roll back to the block BEFORE the failure so the failing block
 *      (and everything after it) is re-scanned next poll. The caller
 *      must NEVER advance cursor INTO the failure block; doing so
 *      drops failed events silently. (This was the prior bug — the
 *      lastSuccessBlock approach could land cursor on a block where
 *      a Transfer-mint succeeded via early-return BEFORE the
 *      AgentRegistered failure in the same tx.)
 *
 *   3. firstFailureBlock === fromBlock       → return null (don't advance)
 *      The first block in the scan range itself failed. We have no
 *      successful blocks to commit. Leaving the cursor unmoved means
 *      the next poll re-attempts the same range, which is the loud-
 *      stuck behavior we want — operators should see "indexer not
 *      progressing" in metrics before silently dropping events.
 *
 * Caller convention: write `cursor` to KV iff the return value is
 * non-null. Null means "do nothing".
 */
export function decideCursorAdvance(
  firstFailureBlock: bigint | null,
  fromBlock: bigint,
  toBlock: bigint
): bigint | null {
  if (firstFailureBlock === null) return toBlock
  if (firstFailureBlock > fromBlock) return firstFailureBlock - 1n
  return null
}

/**
 * Process a single decoded event log by dispatching to the appropriate handler.
 * Accepts a simple interface for testability (no dependency on viem's complex
 * decoded log types).
 */
export async function processDecodedLog(
  db: ReturnType<typeof getDb>,
  log: DecodedEventLog,
  meta: EventMeta,
  agentAddress: string,
  orgAddress: string,
  directoryAddress?: string,
  kv?: KVNamespace
): Promise<void> {
  const isAgent = log.address.toLowerCase() === agentAddress
  const isOrg = log.address.toLowerCase() === orgAddress
  const isDirectory = directoryAddress ? log.address.toLowerCase() === directoryAddress : false
  if (!isAgent && !isOrg && !isDirectory) return

  switch (log.eventName) {
    case 'Transfer': {
      const args = log.args as unknown as TransferEvent
      // Skip mint events (from = zero address)
      if (args.from === '0x0000000000000000000000000000000000000000') return
      if (isAgent) {
        await handleAgentTransfer(db, args)
      } else if (isOrg) {
        await handleOrgTransfer(db, args)
      } else if (isDirectory) {
        // Pass SESSIONS KV so the handler can write the federation
        // rotation sentinel that gates active federation links.
        // (Phase 3 / A-Med#12 — see handleDirectoryTransfer doc.)
        await handleDirectoryTransfer(db, args, kv)
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

    case 'DirectoryRegistered': {
      if (!isDirectory) break
      await handleDirectoryRegistered(db, log.args as unknown as DirectoryRegisteredEvent, meta)
      break
    }

    case 'DirectoryStatusUpdated': {
      if (!isDirectory) break
      await handleDirectoryStatusUpdated(db, log.args as unknown as DirectoryStatusUpdatedEvent)
      break
    }

    case 'DirectoryUrlUpdated': {
      if (!isDirectory) break
      await handleDirectoryUrlUpdated(db, log.args as unknown as DirectoryUrlUpdatedEvent)
      break
    }
  }
}
