// packages/server/src/routes/groups.ts
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { Hono } from 'hono'
import { drizzle } from 'drizzle-orm/d1'
import { and, eq } from 'drizzle-orm'
import type { Env } from '../bindings'
import { groupMembers } from '../db/schema'
import { requireAuth } from '../middleware/auth'

export const groupRoutes = new Hono<{ Bindings: Env }>()

/**
 * Insert a member into a group, skipping if the (groupId, handle) pair already exists.
 * We use raw SQL to work around the mock D1's limitation with composite primary keys
 * and INSERT OR IGNORE (the mock only checks the first column as primary key).
 */
async function upsertGroupMember(
  db: D1Database,
  groupId: string,
  handle: string,
  addedAt: string
): Promise<void> {
  await db
    .prepare(`INSERT OR IGNORE INTO group_members (group_id, handle, added_at) VALUES (?, ?, ?)`)
    .bind(groupId, handle, addedAt)
    .run()
}

/** POST /v1/groups — Create a group with initial members */
groupRoutes.post('/', requireAuth, async c => {
  const body = await c.req.json<{ groupId: string; members: string[] }>()
  if (!body.groupId || !Array.isArray(body.members) || body.members.length === 0) {
    return c.json({ error: 'groupId and members[] are required', code: 'INVALID_REQUEST' }, 400)
  }

  const now = new Date().toISOString()
  for (const handle of body.members) {
    await upsertGroupMember(c.env.DB, body.groupId, handle, now)
  }

  return c.json({ groupId: body.groupId, members: body.members }, 201)
})

/** GET /v1/groups/:groupId/members — List group members */
groupRoutes.get('/:groupId/members', async c => {
  const groupId = c.req.param('groupId') as string
  const db = drizzle(c.env.DB)

  const rows = await db
    .select({ handle: groupMembers.handle })
    .from(groupMembers)
    .where(eq(groupMembers.groupId, groupId))

  if (rows.length === 0) {
    return c.json({ error: 'Group not found', code: 'NOT_FOUND' }, 404)
  }

  return c.json({ groupId, members: rows.map(r => r.handle) })
})

/** PUT /v1/groups/:groupId/members — Add members to a group */
groupRoutes.put('/:groupId/members', requireAuth, async c => {
  const groupId = c.req.param('groupId') as string
  const body = await c.req.json<{ add: string[] }>()
  if (!Array.isArray(body.add) || body.add.length === 0) {
    return c.json({ error: 'add[] is required', code: 'INVALID_REQUEST' }, 400)
  }

  const now = new Date().toISOString()
  for (const handle of body.add) {
    await upsertGroupMember(c.env.DB, groupId, handle, now)
  }

  const db = drizzle(c.env.DB)
  const rows = await db
    .select({ handle: groupMembers.handle })
    .from(groupMembers)
    .where(eq(groupMembers.groupId, groupId))

  return c.json({ groupId, members: rows.map(r => r.handle) })
})

/** DELETE /v1/groups/:groupId/members — Remove members from a group */
groupRoutes.delete('/:groupId/members', requireAuth, async c => {
  const groupId = c.req.param('groupId') as string
  const body = await c.req.json<{ remove: string[] }>()
  if (!Array.isArray(body.remove) || body.remove.length === 0) {
    return c.json({ error: 'remove[] is required', code: 'INVALID_REQUEST' }, 400)
  }

  const db = drizzle(c.env.DB)

  for (const handle of body.remove) {
    await db
      .delete(groupMembers)
      .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.handle, handle)))
  }

  const rows = await db
    .select({ handle: groupMembers.handle })
    .from(groupMembers)
    .where(eq(groupMembers.groupId, groupId))

  return c.json({ groupId, members: rows.map(r => r.handle) })
})
