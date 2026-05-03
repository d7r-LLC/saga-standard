// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { Hono } from 'hono'
import { eq, sql } from 'drizzle-orm'
import { getDb } from '../db'
import type { Env } from '../bindings'
import { directories } from '../db/schema'
import { parseIntParam } from '../utils'

export const directoryRoutes = new Hono<{ Bindings: Env }>()

/**
 * GET /v1/directories — List directories with pagination and optional status filter
 */
directoryRoutes.get('/', async c => {
  const page = Math.max(1, parseIntParam(c.req.query('page'), 1))
  const limit = Math.min(100, Math.max(1, parseIntParam(c.req.query('limit'), 20)))
  const status = c.req.query('status')
  const offset = (page - 1) * limit

  const validStatuses = ['active', 'suspended', 'flagged', 'revoked']
  if (status && !validStatuses.includes(status)) {
    return c.json(
      { error: `Invalid status. Must be one of: ${validStatuses.join(', ')}`, code: 'BAD_REQUEST' },
      400
    )
  }

  const db = getDb(c.env.DB)

  const whereClause = status ? eq(directories.status, status) : undefined

  const [rows, countResult] = await Promise.all([
    db.select().from(directories).where(whereClause).limit(limit).offset(offset),
    db
      .select({ count: sql<number>`count(*)` })
      .from(directories)
      .where(whereClause),
  ])

  return c.json({
    directories: rows.map(d => ({
      directoryId: d.directoryId,
      url: d.url,
      operatorWallet: d.operatorWallet,
      conformanceLevel: d.conformanceLevel,
      status: d.status,
      tokenId: d.tokenId ?? null,
      contractAddress: d.contractAddress ?? null,
      chain: d.chain,
      mintTxHash: d.mintTxHash ?? null,
      tbaAddress: d.tbaAddress ?? null,
      registeredAt: d.registeredAt,
      updatedAt: d.updatedAt,
    })),
    total: countResult[0]?.count ?? 0,
    page,
    limit,
  })
})

/**
 * GET /v1/directories/:directoryId — Get a single directory by directoryId
 */
directoryRoutes.get('/:directoryId', async c => {
  const directoryId = c.req.param('directoryId') as string
  const db = getDb(c.env.DB)

  const results = await db
    .select()
    .from(directories)
    .where(eq(directories.directoryId, directoryId))
    .limit(1)

  if (results.length === 0) {
    return c.json({ error: 'Directory not found', code: 'NOT_FOUND' }, 404)
  }

  const d = results[0]
  return c.json({
    directory: {
      directoryId: d.directoryId,
      url: d.url,
      operatorWallet: d.operatorWallet,
      conformanceLevel: d.conformanceLevel,
      status: d.status,
      tokenId: d.tokenId ?? null,
      contractAddress: d.contractAddress ?? null,
      chain: d.chain,
      mintTxHash: d.mintTxHash ?? null,
      tbaAddress: d.tbaAddress ?? null,
      registeredAt: d.registeredAt,
      updatedAt: d.updatedAt,
    },
  })
})
