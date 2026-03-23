// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { Hono } from 'hono'
import { drizzle } from 'drizzle-orm/d1'
import { eq } from 'drizzle-orm'
import type { Env } from '../bindings'
import { agents, organizations } from '../db/schema'

export const resolveRoutes = new Hono<{ Bindings: Env }>()

/**
 * GET /v1/resolve/:handle — Resolve a handle to an agent or organization.
 *
 * Checks agents first, then organizations. On-chain, the HandleRegistry
 * contract enforces cross-entity handle uniqueness so collisions are
 * prevented at the contract level. Off-chain registrations also check
 * both tables (see POST /v1/agents). If both tables somehow contain the
 * same handle, agent takes precedence.
 */
resolveRoutes.get('/:handle', async c => {
  const handle = c.req.param('handle') as string
  const db = drizzle(c.env.DB)

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

  return c.json({ error: 'Handle not found', code: 'NOT_FOUND' }, 404)
})
