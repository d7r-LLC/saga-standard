// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { getDb } from '../db'
import type { Env } from '../bindings'
import { agents, organizations } from '../db/schema'

export const keyRoutes = new Hono<{ Bindings: Env }>()

keyRoutes.get('/:handle', async c => {
  const handle = c.req.param('handle') as string
  const db = getDb(c.env.DB)

  const agentRows = await db
    .select({ publicKey: agents.publicKey })
    .from(agents)
    .where(eq(agents.handle, handle))
    .limit(1)

  if (agentRows.length > 0) {
    if (!agentRows[0].publicKey) {
      return c.json({ error: 'No public key registered', code: 'NO_KEY' }, 404)
    }
    return c.json({ handle, publicKey: agentRows[0].publicKey, entityType: 'agent' })
  }

  const orgRows = await db
    .select({ publicKey: organizations.publicKey })
    .from(organizations)
    .where(eq(organizations.handle, handle))
    .limit(1)

  if (orgRows.length > 0) {
    if (!orgRows[0].publicKey) {
      return c.json({ error: 'No public key registered', code: 'NO_KEY' }, 404)
    }
    return c.json({ handle, publicKey: orgRows[0].publicKey, entityType: 'organization' })
  }

  return c.json({ error: 'Handle not found', code: 'NOT_FOUND' }, 404)
})
