// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { Hono } from 'hono'
import { drizzle } from 'drizzle-orm/d1'
import { eq } from 'drizzle-orm'
import type { Env } from '../bindings'
import { agents, documents, transfers } from '../db/schema'
import { generateId, requireAuth } from '../middleware/auth'
import type { SessionData } from '../middleware/auth'
import { validateDocumentEncryption } from '../middleware/validate-document'

const HANDLE_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9._-]{1,62}[a-zA-Z0-9]$/

export const transferRoutes = new Hono<{
  Bindings: Env
  Variables: { session: SessionData }
}>()

/**
 * POST /v1/transfers/initiate
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

  const agentRows = await db
    .select()
    .from(agents)
    .where(eq(agents.handle, body.agentHandle))
    .limit(1)

  if (agentRows.length === 0) {
    return c.json({ error: 'Agent not found', code: 'NOT_FOUND' }, 404)
  }

  const agent = agentRows[0]

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
 * POST /v1/transfers/:transferId/consent
 */
transferRoutes.post('/:transferId/consent', requireAuth, async c => {
  const session = c.get('session')
  const transferId = c.req.param('transferId') as string
  const body = await c.req.json<{ signature: string }>()

  if (!body.signature) {
    return c.json({ error: 'signature is required', code: 'INVALID_REQUEST' }, 400)
  }

  const db = drizzle(c.env.DB)

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

  const agentRows = await db.select().from(agents).where(eq(agents.id, xfer.agentId)).limit(1)

  if (
    agentRows.length === 0 ||
    agentRows[0].walletAddress !== session.walletAddress.toLowerCase()
  ) {
    return c.json({ error: 'Not authorized', code: 'FORBIDDEN' }, 403)
  }

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
 * GET /v1/transfers/:transferId
 */
transferRoutes.get('/:transferId', async c => {
  const transferId = c.req.param('transferId') as string
  const db = drizzle(c.env.DB)

  const xferRows = await db.select().from(transfers).where(eq(transfers.id, transferId)).limit(1)

  if (xferRows.length === 0) {
    return c.json({ error: 'Transfer not found', code: 'NOT_FOUND' }, 404)
  }

  const xfer = xferRows[0]

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
 * POST /v1/transfers/import — Import a SAGA document from a transfer
 */
transferRoutes.post('/import', requireAuth, async c => {
  const session = c.get('session')
  const contentType = c.req.header('Content-Type') ?? ''

  let sagaDoc: Record<string, unknown>

  if (contentType.includes('application/json')) {
    sagaDoc = await c.req.json<Record<string, unknown>>()
  } else if (contentType.includes('application/octet-stream')) {
    const body = await c.req.arrayBuffer()
    if (body.byteLength === 0) {
      return c.json({ error: 'Empty container', code: 'INVALID_REQUEST' }, 400)
    }
    try {
      const text = new TextDecoder().decode(body)
      sagaDoc = JSON.parse(text)
    } catch {
      return c.json(
        {
          error:
            'Invalid format. Only JSON documents are currently supported for import. ZIP container (.saga) extraction is not yet implemented.',
          code: 'INVALID_FORMAT',
        },
        400
      )
    }
  } else {
    return c.json(
      {
        error: 'Content-Type must be application/json or application/octet-stream',
        code: 'INVALID_REQUEST',
      },
      400
    )
  }

  // Validate identity layer is present
  const layers = sagaDoc.layers as Record<string, unknown> | undefined
  const identity = layers?.identity as Record<string, unknown> | undefined
  if (!identity || !identity.handle || !identity.walletAddress || !identity.chain) {
    return c.json(
      {
        error: 'Identity layer with handle, walletAddress, and chain is required for import',
        code: 'MISSING_IDENTITY',
      },
      400
    )
  }

  // Validate handle format
  const handle = identity.handle as string
  if (!HANDLE_REGEX.test(handle)) {
    return c.json(
      {
        error: 'Handle must be 3-64 chars, alphanumeric with dots/hyphens/underscores',
        code: 'INVALID_HANDLE',
      },
      400
    )
  }

  // Validate that identity wallet matches the authenticated session
  const walletAddress = (identity.walletAddress as string).toLowerCase()
  if (walletAddress !== session.walletAddress.toLowerCase()) {
    return c.json(
      {
        error: 'Identity walletAddress does not match authenticated session',
        code: 'FORBIDDEN',
      },
      403
    )
  }

  // Validate encryption on vault if present
  const encError = validateDocumentEncryption(sagaDoc)
  if (encError) {
    return c.json({ error: encError, code: 'ENCRYPTION_REQUIRED' }, 400)
  }

  const db = drizzle(c.env.DB)
  const chain = identity.chain as string
  const now = new Date().toISOString()

  // Check if agent already exists
  const existing = await db
    .select({ id: agents.id, walletAddress: agents.walletAddress })
    .from(agents)
    .where(eq(agents.handle, handle))
    .limit(1)

  let agentId: string
  if (existing.length > 0) {
    // Verify the existing agent is owned by the authenticated session
    if (existing[0].walletAddress !== session.walletAddress.toLowerCase()) {
      return c.json(
        {
          error: 'Agent handle already registered to a different wallet',
          code: 'FORBIDDEN',
        },
        403
      )
    }
    agentId = existing[0].id
    await db
      .update(agents)
      .set({ walletAddress, chain, updatedAt: now })
      .where(eq(agents.id, agentId))
  } else {
    agentId = generateId('agent')
    await db.insert(agents).values({
      id: agentId,
      handle,
      walletAddress,
      chain,
      publicKey: (identity.publicKey as string) ?? null,
      registeredAt: now,
      updatedAt: now,
    })
  }

  // Store the document
  const documentId = generateId('saga')
  const jsonStr = JSON.stringify(sagaDoc)
  const storageKey = `documents/${agentId}/${documentId}.json`
  const sizeBytes = new TextEncoder().encode(jsonStr).length

  await c.env.STORAGE.put(storageKey, jsonStr, {
    httpMetadata: { contentType: 'application/json' },
  })

  const checksum = await computeImportChecksum(new TextEncoder().encode(jsonStr))
  await db.insert(documents).values({
    id: documentId,
    agentId,
    exportType: (sagaDoc.exportType as string) ?? 'transfer',
    sagaVersion: (sagaDoc.sagaVersion as string) ?? '1.0',
    storageKey,
    sizeBytes,
    checksum,
    createdAt: now,
  })

  const importedLayers = layers ? Object.keys(layers) : []

  return c.json(
    {
      agentId,
      handle,
      importedLayers,
      documentId,
      status: 'imported',
    },
    201
  )
})

async function computeImportChecksum(data: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', data)
  const hex = Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
  return `sha256:${hex}`
}
