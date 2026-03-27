// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import type { DrizzleD1Database } from 'drizzle-orm/d1'
import { eq } from 'drizzle-orm'
import { computeTBAAddress } from '@saga-standard/contracts'
import { agents, directories, organizations } from '../db/schema'
import { generateId } from '../middleware/auth'
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
import { CHAIN_ID_MAP, TBA_IMPLEMENTATION } from './types'

/**
 * Convert a bigint token ID to a JS number, throwing if the value
 * exceeds Number.MAX_SAFE_INTEGER (2^53 - 1). ERC-721 token IDs are
 * uint256 on-chain but practically always small sequential values.
 * If we ever encounter oversized IDs, a schema migration to store
 * them as text will be needed.
 */
export function safeTokenId(tokenId: bigint): number {
  if (tokenId > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(
      `Token ID ${tokenId} exceeds Number.MAX_SAFE_INTEGER — cannot store safely as integer`
    )
  }
  return Number(tokenId)
}

/** Convert a Solidity uint256 timestamp (seconds since epoch) to ISO 8601 string */
function timestampToISO(timestamp: bigint): string {
  return new Date(Number(timestamp) * 1000).toISOString()
}

/** Compute the ERC-6551 TBA address for a token. Returns null if chain is unknown or address is invalid. */
function computeTBA(tokenId: bigint, contractAddress: string, chain: string): string | null {
  const chainId = CHAIN_ID_MAP[chain]
  if (!chainId) return null
  try {
    return computeTBAAddress({
      implementation: TBA_IMPLEMENTATION,
      chainId,
      tokenContract: contractAddress as `0x${string}`,
      tokenId,
    })
  } catch {
    return null
  }
}

/**
 * Handle AgentRegistered event.
 * If the handle already exists (off-chain registration), upsert NFT fields.
 * Otherwise insert a new row.
 */
export async function handleAgentRegistered(
  db: DrizzleD1Database<Record<string, unknown>>,
  event: AgentRegisteredEvent,
  meta: EventMeta
): Promise<void> {
  const now = new Date().toISOString()
  const id = safeTokenId(event.tokenId)
  const tbaAddress = computeTBA(event.tokenId, meta.contractAddress, meta.chain)

  const existing = await db
    .select({ id: agents.id })
    .from(agents)
    .where(eq(agents.handle, event.handle))
    .limit(1)

  if (existing.length > 0) {
    await db
      .update(agents)
      .set({
        tokenId: id,
        contractAddress: meta.contractAddress,
        mintTxHash: meta.txHash,
        homeHubUrl: event.homeHubUrl,
        walletAddress: event.owner.toLowerCase(),
        entityType: 'agent',
        tbaAddress,
        updatedAt: now,
      })
      .where(eq(agents.handle, event.handle))
  } else {
    await db.insert(agents).values({
      id: generateId('agent'),
      handle: event.handle,
      walletAddress: event.owner.toLowerCase(),
      chain: meta.chain,
      tokenId: id,
      contractAddress: meta.contractAddress,
      mintTxHash: meta.txHash,
      homeHubUrl: event.homeHubUrl,
      entityType: 'agent',
      tbaAddress,
      registeredAt: timestampToISO(event.registeredAt),
      updatedAt: now,
    })
  }
}

/**
 * Handle ERC-721 Transfer event for an agent identity.
 * Updates the wallet address to the new owner.
 */
export async function handleAgentTransfer(
  db: DrizzleD1Database<Record<string, unknown>>,
  event: TransferEvent
): Promise<void> {
  const id = safeTokenId(event.tokenId)
  await db
    .update(agents)
    .set({
      walletAddress: event.to.toLowerCase(),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(agents.tokenId, id))
}

/**
 * Handle HomeHubUpdated event.
 */
export async function handleHomeHubUpdated(
  db: DrizzleD1Database<Record<string, unknown>>,
  event: HomeHubUpdatedEvent
): Promise<void> {
  const id = safeTokenId(event.tokenId)
  await db
    .update(agents)
    .set({
      homeHubUrl: event.newUrl,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(agents.tokenId, id))
}

/**
 * Handle OrgRegistered event.
 * Uses upsert pattern: if the handle already exists (off-chain registration),
 * updates with on-chain fields. Otherwise inserts a new row.
 * This makes the handler idempotent against replays and reorgs.
 */
export async function handleOrgRegistered(
  db: DrizzleD1Database<Record<string, unknown>>,
  event: OrgRegisteredEvent,
  meta: EventMeta
): Promise<void> {
  const now = new Date().toISOString()
  const id = safeTokenId(event.tokenId)
  const tbaAddress = computeTBA(event.tokenId, meta.contractAddress, meta.chain)

  const existing = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.handle, event.handle))
    .limit(1)

  if (existing.length > 0) {
    await db
      .update(organizations)
      .set({
        tokenId: id,
        name: event.name,
        contractAddress: meta.contractAddress,
        mintTxHash: meta.txHash,
        walletAddress: event.owner.toLowerCase(),
        tbaAddress,
        updatedAt: now,
      })
      .where(eq(organizations.handle, event.handle))
  } else {
    await db.insert(organizations).values({
      id: generateId('org'),
      handle: event.handle,
      name: event.name,
      walletAddress: event.owner.toLowerCase(),
      chain: meta.chain,
      tokenId: id,
      contractAddress: meta.contractAddress,
      mintTxHash: meta.txHash,
      tbaAddress,
      registeredAt: timestampToISO(event.registeredAt),
      updatedAt: now,
    })
  }
}

/**
 * Handle ERC-721 Transfer event for an org identity.
 */
export async function handleOrgTransfer(
  db: DrizzleD1Database<Record<string, unknown>>,
  event: TransferEvent
): Promise<void> {
  const id = safeTokenId(event.tokenId)
  await db
    .update(organizations)
    .set({
      walletAddress: event.to.toLowerCase(),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(organizations.tokenId, id))
}

/**
 * Handle OrgNameUpdated event.
 */
export async function handleOrgNameUpdated(
  db: DrizzleD1Database<Record<string, unknown>>,
  event: OrgNameUpdatedEvent
): Promise<void> {
  const id = safeTokenId(event.tokenId)
  await db
    .update(organizations)
    .set({
      name: event.newName,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(organizations.tokenId, id))
}

/**
 * Handle DirectoryRegistered event.
 * Uses upsert pattern: if the directoryId already exists (off-chain registration),
 * updates with on-chain fields. Otherwise inserts a new row.
 * This makes the handler idempotent against replays and reorgs.
 */
export async function handleDirectoryRegistered(
  db: DrizzleD1Database<Record<string, unknown>>,
  event: DirectoryRegisteredEvent,
  meta: EventMeta
): Promise<void> {
  const now = new Date().toISOString()
  const id = safeTokenId(event.tokenId)
  const tbaAddress = computeTBA(event.tokenId, meta.contractAddress, meta.chain)

  const existing = await db
    .select({ id: directories.id })
    .from(directories)
    .where(eq(directories.directoryId, event.directoryId))
    .limit(1)

  if (existing.length > 0) {
    await db
      .update(directories)
      .set({
        tokenId: id,
        url: event.url,
        operatorWallet: event.operator.toLowerCase(),
        conformanceLevel: event.conformanceLevel,
        contractAddress: meta.contractAddress,
        mintTxHash: meta.txHash,
        tbaAddress,
        updatedAt: now,
      })
      .where(eq(directories.directoryId, event.directoryId))
  } else {
    await db.insert(directories).values({
      id: generateId('dir'),
      directoryId: event.directoryId,
      url: event.url,
      operatorWallet: event.operator.toLowerCase(),
      conformanceLevel: event.conformanceLevel,
      status: 'active',
      chain: meta.chain,
      tokenId: id,
      contractAddress: meta.contractAddress,
      mintTxHash: meta.txHash,
      tbaAddress,
      registeredAt: timestampToISO(event.registeredAt),
      updatedAt: now,
    })
  }
}

/**
 * Handle DirectoryStatusUpdated event.
 */
export async function handleDirectoryStatusUpdated(
  db: DrizzleD1Database<Record<string, unknown>>,
  event: DirectoryStatusUpdatedEvent
): Promise<void> {
  const id = safeTokenId(event.tokenId)
  await db
    .update(directories)
    .set({
      status: event.newStatus,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(directories.tokenId, id))
}

/**
 * Handle DirectoryUrlUpdated event.
 */
export async function handleDirectoryUrlUpdated(
  db: DrizzleD1Database<Record<string, unknown>>,
  event: DirectoryUrlUpdatedEvent
): Promise<void> {
  const id = safeTokenId(event.tokenId)
  await db
    .update(directories)
    .set({
      url: event.newUrl,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(directories.tokenId, id))
}

/**
 * Handle ERC-721 Transfer event for a directory identity.
 * Updates the operatorWallet to the new owner.
 */
export async function handleDirectoryTransfer(
  db: DrizzleD1Database<Record<string, unknown>>,
  event: TransferEvent
): Promise<void> {
  const id = safeTokenId(event.tokenId)
  await db
    .update(directories)
    .set({
      operatorWallet: event.to.toLowerCase(),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(directories.tokenId, id))
}
