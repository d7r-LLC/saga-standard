// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import type { DrizzleD1Database } from 'drizzle-orm/d1'
import { eq } from 'drizzle-orm'
import { agents, organizations } from '../db/schema'
import { generateId } from '../middleware/auth'
import type {
  AgentRegisteredEvent,
  EventMeta,
  HomeHubUpdatedEvent,
  OrgNameUpdatedEvent,
  OrgRegisteredEvent,
  TransferEvent,
} from './types'

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
  const existing = await db
    .select({ id: agents.id })
    .from(agents)
    .where(eq(agents.handle, event.handle))
    .limit(1)

  if (existing.length > 0) {
    await db
      .update(agents)
      .set({
        tokenId: Number(event.tokenId),
        contractAddress: meta.contractAddress,
        mintTxHash: meta.txHash,
        homeHubUrl: event.hubUrl,
        walletAddress: event.owner.toLowerCase(),
        entityType: 'agent',
        updatedAt: now,
      })
      .where(eq(agents.handle, event.handle))
  } else {
    await db.insert(agents).values({
      id: generateId('agent'),
      handle: event.handle,
      walletAddress: event.owner.toLowerCase(),
      chain: meta.chain,
      tokenId: Number(event.tokenId),
      contractAddress: meta.contractAddress,
      mintTxHash: meta.txHash,
      homeHubUrl: event.hubUrl,
      entityType: 'agent',
      registeredAt: now,
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
  await db
    .update(agents)
    .set({
      walletAddress: event.to.toLowerCase(),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(agents.tokenId, Number(event.tokenId)))
}

/**
 * Handle HomeHubUpdated event.
 */
export async function handleHomeHubUpdated(
  db: DrizzleD1Database<Record<string, unknown>>,
  event: HomeHubUpdatedEvent
): Promise<void> {
  await db
    .update(agents)
    .set({
      homeHubUrl: event.newUrl,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(agents.tokenId, Number(event.tokenId)))
}

/**
 * Handle OrgRegistered event.
 */
export async function handleOrgRegistered(
  db: DrizzleD1Database<Record<string, unknown>>,
  event: OrgRegisteredEvent,
  meta: EventMeta
): Promise<void> {
  const now = new Date().toISOString()
  await db.insert(organizations).values({
    id: generateId('org'),
    handle: event.handle,
    name: event.name,
    walletAddress: event.owner.toLowerCase(),
    chain: meta.chain,
    tokenId: Number(event.tokenId),
    contractAddress: meta.contractAddress,
    mintTxHash: meta.txHash,
    registeredAt: now,
    updatedAt: now,
  })
}

/**
 * Handle ERC-721 Transfer event for an org identity.
 */
export async function handleOrgTransfer(
  db: DrizzleD1Database<Record<string, unknown>>,
  event: TransferEvent
): Promise<void> {
  await db
    .update(organizations)
    .set({
      walletAddress: event.to.toLowerCase(),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(organizations.tokenId, Number(event.tokenId)))
}

/**
 * Handle OrgNameUpdated event.
 */
export async function handleOrgNameUpdated(
  db: DrizzleD1Database<Record<string, unknown>>,
  event: OrgNameUpdatedEvent
): Promise<void> {
  await db
    .update(organizations)
    .set({
      name: event.newName,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(organizations.tokenId, Number(event.tokenId)))
}
