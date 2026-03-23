// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { Hono } from 'hono'
import { drizzle } from 'drizzle-orm/d1'
import { eq, like, or, sql } from 'drizzle-orm'
import type { Env } from '../bindings'
import { organizations } from '../db/schema'
import { parseIntParam } from '../utils'

export const orgRoutes = new Hono<{ Bindings: Env }>()

/**
 * GET /v1/orgs — List organizations with pagination and search
 */
orgRoutes.get('/', async c => {
  const page = Math.max(1, parseIntParam(c.req.query('page'), 1))
  const limit = Math.min(100, Math.max(1, parseIntParam(c.req.query('limit'), 20)))
  const search = c.req.query('search')
  const offset = (page - 1) * limit

  const db = drizzle(c.env.DB)

  const whereClause = search
    ? or(like(organizations.handle, `%${search}%`), like(organizations.name, `%${search}%`))
    : undefined

  const [rows, countResult] = await Promise.all([
    db.select().from(organizations).where(whereClause).limit(limit).offset(offset),
    db
      .select({ count: sql<number>`count(*)` })
      .from(organizations)
      .where(whereClause),
  ])

  return c.json({
    organizations: rows.map(o => ({
      orgId: o.id,
      handle: o.handle,
      name: o.name,
      walletAddress: o.walletAddress,
      chain: o.chain,
      tokenId: o.tokenId ?? null,
      tbaAddress: o.tbaAddress ?? null,
      contractAddress: o.contractAddress ?? null,
      mintTxHash: o.mintTxHash ?? null,
      registeredAt: o.registeredAt,
      updatedAt: o.updatedAt,
    })),
    total: countResult[0]?.count ?? 0,
    page,
    limit,
  })
})

/**
 * GET /v1/orgs/:handle — Get organization by handle
 */
orgRoutes.get('/:handle', async c => {
  const handle = c.req.param('handle') as string
  const db = drizzle(c.env.DB)

  const results = await db
    .select()
    .from(organizations)
    .where(eq(organizations.handle, handle))
    .limit(1)

  if (results.length === 0) {
    return c.json({ error: 'Organization not found', code: 'NOT_FOUND' }, 404)
  }

  const org = results[0]
  return c.json({
    organization: {
      orgId: org.id,
      handle: org.handle,
      name: org.name,
      walletAddress: org.walletAddress,
      chain: org.chain,
      tokenId: org.tokenId ?? null,
      tbaAddress: org.tbaAddress ?? null,
      contractAddress: org.contractAddress ?? null,
      mintTxHash: org.mintTxHash ?? null,
      registeredAt: org.registeredAt,
      updatedAt: org.updatedAt,
    },
  })
})
