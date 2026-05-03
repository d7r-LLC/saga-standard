// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { getDb } from '../db'
import type { Env } from '../bindings'
import { replicationPolicies } from '../db/schema'
import { requireAuth } from '../middleware/auth'

export const policyRoutes = new Hono<{ Bindings: Env }>()

/** GET /v1/orgs/:orgId/policy — Retrieve the replication policy for an org */
policyRoutes.get('/:orgId/policy', requireAuth, async c => {
  const orgId = c.req.param('orgId') as string
  const db = getDb(c.env.DB)

  const rows = await db
    .select()
    .from(replicationPolicies)
    .where(eq(replicationPolicies.orgId, orgId))
    .limit(1)

  if (rows.length === 0) {
    return c.json({ error: 'No policy found for this organization', code: 'NOT_FOUND' }, 404)
  }

  let policy: unknown
  try {
    policy = JSON.parse(rows[0].policyJson)
  } catch {
    return c.json({ error: 'Stored policy is invalid JSON', code: 'INVALID_POLICY_JSON' }, 500)
  }

  return c.json({ policy })
})

/** PUT /v1/orgs/:orgId/policy — Create or update the replication policy */
policyRoutes.put('/:orgId/policy', requireAuth, async c => {
  const orgId = c.req.param('orgId') as string
  const body = await c.req.json<{
    orgId?: string
    defaultScope?: string
    restricted?: unknown
    retention?: unknown
  }>()

  if (!body.defaultScope || !body.restricted || !body.retention) {
    return c.json(
      { error: 'defaultScope, restricted, and retention are required', code: 'INVALID_REQUEST' },
      400
    )
  }

  const policy = { ...body, orgId }
  const now = new Date().toISOString()

  await c.env.DB.prepare(
    `INSERT OR REPLACE INTO replication_policies (org_id, policy_json, updated_at) VALUES (?, ?, ?)`
  )
    .bind(orgId, JSON.stringify(policy), now)
    .run()

  return c.json({ orgId, updatedAt: now })
})
