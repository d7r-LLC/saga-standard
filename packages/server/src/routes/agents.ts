// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { Hono } from 'hono'
import { drizzle } from 'drizzle-orm/d1'
import { eq, like, or, sql } from 'drizzle-orm'
import type { Env } from '../bindings'
import { agents, documents } from '../db/schema'
import { generateId, requireAuth } from '../middleware/auth'
import type { SessionData } from '../middleware/auth'

const HANDLE_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9._-]{1,62}[a-zA-Z0-9]$/

export const agentRoutes = new Hono<{
  Bindings: Env
  Variables: { session: SessionData }
}>()

/**
 * POST /v1/agents — Register a new agent (off-chain, legacy)
 */
agentRoutes.post('/', requireAuth, async c => {
  const session = c.get('session')
  const body = await c.req.json<{
    handle: string
    walletAddress: string
    chain: string
    publicKey?: string
  }>()

  if (!body.handle || !body.walletAddress || !body.chain) {
    return c.json(
      { error: 'handle, walletAddress, and chain are required', code: 'INVALID_REQUEST' },
      400
    )
  }

  // Validate handle format
  if (!HANDLE_REGEX.test(body.handle)) {
    return c.json(
      {
        error: 'Handle must be 3-64 chars, alphanumeric with dots/hyphens/underscores',
        code: 'INVALID_HANDLE',
      },
      400
    )
  }

  // Wallet must match authenticated session
  if (body.walletAddress.toLowerCase() !== session.walletAddress.toLowerCase()) {
    return c.json(
      { error: 'Wallet address must match authenticated session', code: 'WALLET_MISMATCH' },
      403
    )
  }

  const db = drizzle(c.env.DB)
  const agentId = generateId('agent')
  const now = new Date().toISOString()

  // Check handle uniqueness
  const existing = await db
    .select({ id: agents.id })
    .from(agents)
    .where(eq(agents.handle, body.handle))
    .limit(1)

  if (existing.length > 0) {
    return c.json({ error: 'Handle already taken', code: 'HANDLE_TAKEN' }, 409)
  }

  await db.insert(agents).values({
    id: agentId,
    handle: body.handle,
    walletAddress: body.walletAddress.toLowerCase(),
    chain: body.chain,
    publicKey: body.publicKey,
    registeredAt: now,
    updatedAt: now,
  })

  return c.json(
    {
      agentId,
      handle: body.handle,
      walletAddress: body.walletAddress.toLowerCase(),
      chain: body.chain,
      publicKey: body.publicKey ?? null,
      registeredAt: now,
    },
    201
  )
})

/**
 * GET /v1/agents/:handleOrAddress — Get agent details
 */
agentRoutes.get('/:handleOrAddress', async c => {
  const param = c.req.param('handleOrAddress') as string
  const db = drizzle(c.env.DB)

  // Try by handle first, then by wallet address
  const isAddress = param.startsWith('0x')
  const results = await db
    .select()
    .from(agents)
    .where(isAddress ? eq(agents.walletAddress, param.toLowerCase()) : eq(agents.handle, param))
    .limit(1)

  if (results.length === 0) {
    return c.json({ error: 'Agent not found', code: 'NOT_FOUND' }, 404)
  }

  const agent = results[0]

  // Get latest document
  const docs = await db
    .select()
    .from(documents)
    .where(eq(documents.agentId, agent.id))
    .orderBy(sql`created_at DESC`)
    .limit(1)

  return c.json({
    agent: {
      agentId: agent.id,
      handle: agent.handle,
      walletAddress: agent.walletAddress,
      chain: agent.chain,
      publicKey: agent.publicKey,
      registeredAt: agent.registeredAt,
      updatedAt: agent.updatedAt,
      // NFT fields (null for legacy off-chain registrations)
      tokenId: agent.tokenId ?? null,
      tbaAddress: agent.tbaAddress ?? null,
      contractAddress: agent.contractAddress ?? null,
      mintTxHash: agent.mintTxHash ?? null,
      entityType: agent.entityType ?? 'agent',
      homeHubUrl: agent.homeHubUrl ?? null,
    },
    latestDocument:
      docs.length > 0
        ? {
            documentId: docs[0].id,
            exportType: docs[0].exportType,
            sagaVersion: docs[0].sagaVersion,
            sizeBytes: docs[0].sizeBytes,
            checksum: docs[0].checksum,
            createdAt: docs[0].createdAt,
          }
        : undefined,
  })
})

/**
 * GET /v1/agents — List agents with pagination and search
 */
agentRoutes.get('/', async c => {
  const page = Math.max(1, Number(c.req.query('page') ?? 1))
  const limit = Math.min(100, Math.max(1, Number(c.req.query('limit') ?? 20)))
  const search = c.req.query('search')
  const offset = (page - 1) * limit

  const db = drizzle(c.env.DB)

  const whereClause = search
    ? or(like(agents.handle, `%${search}%`), like(agents.walletAddress, `%${search}%`))
    : undefined

  const [rows, countResult] = await Promise.all([
    db.select().from(agents).where(whereClause).limit(limit).offset(offset),
    db
      .select({ count: sql<number>`count(*)` })
      .from(agents)
      .where(whereClause),
  ])

  return c.json({
    agents: rows.map(a => ({
      agentId: a.id,
      handle: a.handle,
      walletAddress: a.walletAddress,
      chain: a.chain,
      publicKey: a.publicKey,
      registeredAt: a.registeredAt,
      updatedAt: a.updatedAt,
      // NFT fields
      tokenId: a.tokenId ?? null,
      tbaAddress: a.tbaAddress ?? null,
      contractAddress: a.contractAddress ?? null,
      mintTxHash: a.mintTxHash ?? null,
      entityType: a.entityType ?? 'agent',
      homeHubUrl: a.homeHubUrl ?? null,
    })),
    total: countResult[0]?.count ?? 0,
    page,
    limit,
  })
})
