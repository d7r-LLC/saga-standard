// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { Hono } from 'hono'
import { drizzle } from 'drizzle-orm/d1'
import { eq } from 'drizzle-orm'
import type { Env } from '../bindings'
import { agents, transfers } from '../db/schema'
import { generateId, requireAuth } from '../middleware/auth'
import type { SessionData } from '../middleware/auth'

export const transferRoutes = new Hono<{
  Bindings: Env
  Variables: { session: SessionData }
}>()

/**
 * POST /v1/transfers/initiate — Start a transfer
 */
transferRoutes.post('/initiate', requireAuth, async c => {
  const session = c.get('session')
  const body = await c.req.json<{
    agentHandle: string
    destinationServerUrl: string
    requestedLayers?: string[]
  }>()

  if (!body.agentHandle || !body.destinationServerUrl) {
    return c.json(
      { error: 'agentHandle and destinationServerUrl are required', code: 'INVALID_REQUEST' },
      400
    )
  }

  const db = drizzle(c.env.DB)

  // Look up agent
  const agentRows = await db
    .select()
    .from(agents)
    .where(eq(agents.handle, body.agentHandle))
    .limit(1)

  if (agentRows.length === 0) {
    return c.json({ error: 'Agent not found', code: 'NOT_FOUND' }, 404)
  }

  const agent = agentRows[0]

  // Must own the agent
  if (agent.walletAddress !== session.walletAddress.toLowerCase()) {
    return c.json({ error: 'Not authorized to transfer this agent', code: 'FORBIDDEN' }, 403)
  }

  const transferId = generateId('xfer')
  const now = new Date().toISOString()
  const consentMessage = `I authorize transfer of agent "${body.agentHandle}" to ${body.destinationServerUrl} at ${now}`

  await db.insert(transfers).values({
    id: transferId,
    agentId: agent.id,
    sourceServerUrl: c.req.url.split('/v1')[0],
    destinationServerUrl: body.destinationServerUrl,
    status: 'pending_consent',
    requestedLayers: body.requestedLayers ? JSON.stringify(body.requestedLayers) : null,
    initiatedAt: now,
  })

  return c.json(
    {
      transferId,
      agentHandle: body.agentHandle,
      sourceServerUrl: c.req.url.split('/v1')[0],
      destinationServerUrl: body.destinationServerUrl,
      status: 'pending_consent',
      consentMessage,
      requestedLayers: body.requestedLayers,
      initiatedAt: now,
    },
    201
  )
})

/**
 * POST /v1/transfers/:transferId/consent — Sign consent for a transfer
 */
transferRoutes.post('/:transferId/consent', requireAuth, async c => {
  const session = c.get('session')
  const transferId = c.req.param('transferId') as string
  const body = await c.req.json<{ signature: string }>()

  if (!body.signature) {
    return c.json({ error: 'signature is required', code: 'INVALID_REQUEST' }, 400)
  }

  const db = drizzle(c.env.DB)

  // Look up transfer
  const xferRows = await db.select().from(transfers).where(eq(transfers.id, transferId)).limit(1)

  if (xferRows.length === 0) {
    return c.json({ error: 'Transfer not found', code: 'NOT_FOUND' }, 404)
  }

  const xfer = xferRows[0]

  if (xfer.status !== 'pending_consent') {
    return c.json(
      {
        error: `Transfer is in state "${xfer.status}", expected "pending_consent"`,
        code: 'INVALID_STATE',
      },
      400
    )
  }

  // Verify agent ownership
  const agentRows = await db.select().from(agents).where(eq(agents.id, xfer.agentId)).limit(1)

  if (
    agentRows.length === 0 ||
    agentRows[0].walletAddress !== session.walletAddress.toLowerCase()
  ) {
    return c.json({ error: 'Not authorized', code: 'FORBIDDEN' }, 403)
  }

  // Update transfer status
  await db
    .update(transfers)
    .set({
      status: 'packaging',
      consentSignature: body.signature,
    })
    .where(eq(transfers.id, transferId))

  return c.json({
    transferId,
    agentHandle: agentRows[0].handle,
    sourceServerUrl: xfer.sourceServerUrl,
    destinationServerUrl: xfer.destinationServerUrl,
    status: 'packaging',
    requestedLayers: xfer.requestedLayers ? JSON.parse(xfer.requestedLayers) : undefined,
    initiatedAt: xfer.initiatedAt,
  })
})

/**
 * GET /v1/transfers/:transferId — Get transfer status
 */
transferRoutes.get('/:transferId', async c => {
  const transferId = c.req.param('transferId') as string
  const db = drizzle(c.env.DB)

  const xferRows = await db.select().from(transfers).where(eq(transfers.id, transferId)).limit(1)

  if (xferRows.length === 0) {
    return c.json({ error: 'Transfer not found', code: 'NOT_FOUND' }, 404)
  }

  const xfer = xferRows[0]

  // Get agent handle
  const agentRows = await db
    .select({ handle: agents.handle })
    .from(agents)
    .where(eq(agents.id, xfer.agentId))
    .limit(1)

  return c.json({
    transferId: xfer.id,
    agentHandle: agentRows[0]?.handle ?? 'unknown',
    sourceServerUrl: xfer.sourceServerUrl,
    destinationServerUrl: xfer.destinationServerUrl,
    status: xfer.status,
    requestedLayers: xfer.requestedLayers ? JSON.parse(xfer.requestedLayers) : undefined,
    documentId: xfer.documentId,
    initiatedAt: xfer.initiatedAt,
    completedAt: xfer.completedAt,
  })
})

/**
 * POST /v1/transfers/import — Import a .saga container from a transfer
 */
transferRoutes.post('/import', requireAuth, async c => {
  const contentType = c.req.header('Content-Type') ?? ''

  if (!contentType.includes('application/octet-stream')) {
    return c.json(
      { error: 'Content-Type must be application/octet-stream', code: 'INVALID_REQUEST' },
      400
    )
  }

  const body = await c.req.arrayBuffer()
  if (body.byteLength === 0) {
    return c.json({ error: 'Empty container', code: 'INVALID_REQUEST' }, 400)
  }

  // In a full implementation, this would:
  // 1. Extract the .saga container
  // 2. Validate the document
  // 3. Verify signatures
  // 4. Create or update the agent
  // 5. Store the document
  // For the reference server, we return a stub response

  const agentId = generateId('agent')
  const documentId = generateId('saga')

  return c.json(
    {
      agentId,
      handle: 'imported-agent',
      importedLayers: ['identity', 'persona', 'memory'],
      documentId,
      status: 'imported',
    },
    201
  )
})
