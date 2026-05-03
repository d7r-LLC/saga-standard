// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { Hono } from 'hono'
import { and, eq } from 'drizzle-orm'
import { getDb } from '../db'
import type { Env } from '../bindings'
import { agents, directories, organizations } from '../db/schema'

export const resolveRoutes = new Hono<{ Bindings: Env }>()

/**
 * GET /v1/resolve/:identity — Resolve a handle (or handle@directoryId) to an entity.
 *
 * Formats accepted:
 *   - `handle`             — global resolution: checks agents → organizations → directories
 *   - `handle@directoryId` — directory-scoped: verifies the directory exists then looks
 *                            up the agent with that handle within that specific directory.
 *
 * On-chain, the HandleRegistry contract enforces cross-entity handle uniqueness so
 * collisions are prevented at the contract level. Off-chain registrations also check
 * both tables (see POST /v1/agents). If both tables somehow contain the same handle,
 * agent takes precedence.
 */
resolveRoutes.get('/:identity', async c => {
  const identity = c.req.param('identity') as string
  const db = getDb(c.env.DB)

  // Parse handle@directoryId format
  const atIndex = identity.indexOf('@')
  const handle = atIndex >= 0 ? identity.substring(0, atIndex) : identity
  const directoryId = atIndex >= 0 ? identity.substring(atIndex + 1) : null

  // Validate parsed parts
  if (atIndex >= 0 && (!handle || !directoryId)) {
    return c.json(
      {
        error: 'Invalid identity format. Use "handle" or "handle@directoryId"',
        code: 'BAD_REQUEST',
      },
      400
    )
  }

  // --- Directory-scoped resolution ---
  if (directoryId !== null) {
    // Verify directory exists
    const dirResults = await db
      .select()
      .from(directories)
      .where(eq(directories.directoryId, directoryId))
      .limit(1)

    if (dirResults.length === 0) {
      return c.json({ error: 'Directory not found', code: 'NOT_FOUND' }, 404)
    }

    // Look up agent scoped to this directory
    const agentResults = await db
      .select()
      .from(agents)
      .where(and(eq(agents.handle, handle), eq(agents.directoryId, directoryId)))
      .limit(1)

    if (agentResults.length === 0) {
      return c.json({ error: 'Handle not found', code: 'NOT_FOUND' }, 404)
    }

    const agent = agentResults[0]
    return c.json({
      entityType: 'agent',
      handle: agent.handle,
      walletAddress: agent.walletAddress,
      chain: agent.chain,
      directoryId: agent.directoryId,
      tokenId: agent.tokenId ?? null,
      tbaAddress: agent.tbaAddress ?? null,
      homeHubUrl: agent.homeHubUrl ?? null,
      contractAddress: agent.contractAddress ?? null,
      mintTxHash: agent.mintTxHash ?? null,
      registeredAt: agent.registeredAt,
    })
  }

  // --- Global resolution (no @ present) ---

  // Try agents first
  const agentResults = await db.select().from(agents).where(eq(agents.handle, handle)).limit(1)

  if (agentResults.length > 0) {
    const agent = agentResults[0]
    return c.json({
      entityType: 'agent',
      handle: agent.handle,
      walletAddress: agent.walletAddress,
      chain: agent.chain,
      tokenId: agent.tokenId ?? null,
      tbaAddress: agent.tbaAddress ?? null,
      homeHubUrl: agent.homeHubUrl ?? null,
      contractAddress: agent.contractAddress ?? null,
      mintTxHash: agent.mintTxHash ?? null,
      registeredAt: agent.registeredAt,
    })
  }

  // Try organizations
  const orgResults = await db
    .select()
    .from(organizations)
    .where(eq(organizations.handle, handle))
    .limit(1)

  if (orgResults.length > 0) {
    const org = orgResults[0]
    return c.json({
      entityType: 'org',
      handle: org.handle,
      name: org.name,
      walletAddress: org.walletAddress,
      chain: org.chain,
      tokenId: org.tokenId ?? null,
      tbaAddress: org.tbaAddress ?? null,
      contractAddress: org.contractAddress ?? null,
      mintTxHash: org.mintTxHash ?? null,
      registeredAt: org.registeredAt,
    })
  }

  // Try directories (handle == directoryId)
  const dirResults = await db
    .select()
    .from(directories)
    .where(eq(directories.directoryId, handle))
    .limit(1)

  if (dirResults.length > 0) {
    const dir = dirResults[0]
    return c.json({
      entityType: 'directory',
      directoryId: dir.directoryId,
      url: dir.url,
      operatorWallet: dir.operatorWallet,
      conformanceLevel: dir.conformanceLevel,
      status: dir.status,
      chain: dir.chain,
      tokenId: dir.tokenId ?? null,
      tbaAddress: dir.tbaAddress ?? null,
      contractAddress: dir.contractAddress ?? null,
      mintTxHash: dir.mintTxHash ?? null,
      registeredAt: dir.registeredAt,
    })
  }

  return c.json({ error: 'Handle not found', code: 'NOT_FOUND' }, 404)
})
