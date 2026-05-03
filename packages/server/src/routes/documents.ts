// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { Hono } from 'hono'
import { and, eq, sql } from 'drizzle-orm'
import { getDb } from '../db'
import type { Env } from '../bindings'
import { agents, documents } from '../db/schema'
import { generateId, requireAuth } from '../middleware/auth'
import type { SessionData } from '../middleware/auth'
import { validateDocumentEncryption } from '../middleware/validate-document'
import { computeChecksum } from '../utils'

export const documentRoutes = new Hono<{
  Bindings: Env
  Variables: { session: SessionData }
}>()

/**
 * Maximum size of an uploaded document. Phase 5 (O-High#2) — closes the
 * "attacker uploads arbitrarily large bodies to R2" finding by capping
 * Content-Length BEFORE the body is read.
 *
 * 50 MB is the agreed product cap for a single document. Aligns with the
 * 100 MB total-extract cap on the .saga container extractor in 5.6 (one
 * document can't exceed 50% of an entire container's extract budget).
 */
export const MAX_DOCUMENT_SIZE_BYTES = 50 * 1024 * 1024

/**
 * POST /v1/agents/:handle/documents — Upload a document
 */
documentRoutes.post('/:handle/documents', requireAuth, async c => {
  const session = c.get('session')
  const handle = c.req.param('handle') as string

  // Phase 5 (O-High#2): Content-Length pre-check. When present (real
  // Cloudflare Workers always populate it from the inbound HTTP request),
  // reject oversized uploads BEFORE we touch the body so we don't pull a
  // gigabyte into the worker's memory just to throw it away. When the
  // header is absent (some test rigs and a few legitimate clients that
  // chunk-encode), fall through to the post-read size check below.
  //
  // Chunked-upload memory caveat: when Content-Length is absent, the
  // fallback path uses `c.req.arrayBuffer()` / `.json()` which fully buffer
  // the request body in memory before the post-read check fires. That
  // means a chunked upload could in theory force the worker to allocate
  // up to the platform's request body cap before we reject. Real defense
  // for this scenario lives at the Cloudflare Workers boundary: Workers
  // cap inbound request bodies at 100 MB by default, which is already
  // 2× our MAX_DOCUMENT_SIZE_BYTES. A streaming-with-early-abort
  // implementation is tracked for a follow-up; the current two-layer
  // check (CF boundary + Content-Length pre-check + post-read fallback)
  // is sufficient for the audit finding's threat model.
  const lenHeader = c.req.header('content-length')
  if (lenHeader != null) {
    const len = Number(lenHeader)
    if (!Number.isFinite(len) || len < 0) {
      return c.json({ error: 'Invalid Content-Length', code: 'INVALID_REQUEST' }, 400)
    }
    if (len > MAX_DOCUMENT_SIZE_BYTES) {
      return c.json(
        {
          error: `Document exceeds ${MAX_DOCUMENT_SIZE_BYTES} byte limit`,
          code: 'PAYLOAD_TOO_LARGE',
        },
        413
      )
    }
  }

  const db = getDb(c.env.DB)

  // Look up agent
  const agentRows = await db.select().from(agents).where(eq(agents.handle, handle)).limit(1)

  if (agentRows.length === 0) {
    return c.json({ error: 'Agent not found', code: 'NOT_FOUND' }, 404)
  }

  const agent = agentRows[0]

  // Must own the agent
  if (agent.walletAddress !== session.walletAddress.toLowerCase()) {
    return c.json({ error: 'Not authorized to upload for this agent', code: 'FORBIDDEN' }, 403)
  }

  const contentType = c.req.header('Content-Type') ?? ''
  const documentId = generateId('saga')
  const now = new Date().toISOString()
  let sizeBytes: number
  let checksum: string
  let exportType = 'full'
  let sagaVersion = '1.0'

  if (contentType.includes('application/octet-stream')) {
    // Binary .saga container upload
    // TODO: Extract agent.saga.json from ZIP container and validate encryption.
    // For now, binary uploads are stored without encryption validation.
    const body = await c.req.arrayBuffer()
    sizeBytes = body.byteLength

    // Phase 5 (O-High#2): post-read fallback when Content-Length was absent.
    // Belt-and-suspenders against clients that omit the header but still
    // send oversized bodies.
    if (sizeBytes > MAX_DOCUMENT_SIZE_BYTES) {
      return c.json(
        {
          error: `Document exceeds ${MAX_DOCUMENT_SIZE_BYTES} byte limit`,
          code: 'PAYLOAD_TOO_LARGE',
        },
        413
      )
    }

    checksum = await computeChecksum(new Uint8Array(body))

    // Attempt to extract and validate JSON from the container
    try {
      const text = new TextDecoder().decode(body)
      const parsed = JSON.parse(text) as Record<string, unknown>
      const encError = validateDocumentEncryption(parsed)
      if (encError) {
        return c.json({ error: encError, code: 'ENCRYPTION_REQUIRED' }, 400)
      }
    } catch {
      // Not parseable as JSON (likely a real ZIP container).
      // Skip encryption validation until ZIP extraction is implemented.
    }

    // Store in R2
    const storageKey = `documents/${agent.id}/${documentId}.saga`
    await c.env.STORAGE.put(storageKey, body)

    // Insert metadata
    await db.insert(documents).values({
      id: documentId,
      agentId: agent.id,
      exportType,
      sagaVersion,
      storageKey,
      sizeBytes,
      checksum,
      createdAt: now,
    })
  } else {
    // JSON document upload
    const body = await c.req.json<{
      sagaVersion?: string
      exportType?: string
      [key: string]: unknown
    }>()

    // Validate encryption requirements
    const encryptionError = validateDocumentEncryption(body as Record<string, unknown>)
    if (encryptionError) {
      return c.json({ error: encryptionError, code: 'ENCRYPTION_REQUIRED' }, 400)
    }

    const jsonStr = JSON.stringify(body)
    const jsonBytes = new TextEncoder().encode(jsonStr)
    sizeBytes = jsonBytes.length

    // Phase 5 (O-High#2): post-read fallback for JSON path.
    if (sizeBytes > MAX_DOCUMENT_SIZE_BYTES) {
      return c.json(
        {
          error: `Document exceeds ${MAX_DOCUMENT_SIZE_BYTES} byte limit`,
          code: 'PAYLOAD_TOO_LARGE',
        },
        413
      )
    }

    checksum = await computeChecksum(jsonBytes)

    if (body.exportType) exportType = body.exportType as string
    if (body.sagaVersion) sagaVersion = body.sagaVersion as string

    // Store JSON in R2
    const storageKey = `documents/${agent.id}/${documentId}.json`
    await c.env.STORAGE.put(storageKey, jsonStr, {
      httpMetadata: { contentType: 'application/json' },
    })

    await db.insert(documents).values({
      id: documentId,
      agentId: agent.id,
      exportType,
      sagaVersion,
      storageKey,
      sizeBytes,
      checksum,
      createdAt: now,
    })
  }

  return c.json(
    {
      documentId,
      exportType,
      sagaVersion,
      sizeBytes,
      checksum,
      createdAt: now,
      uploadedAt: now,
    },
    201
  )
})

/**
 * GET /v1/agents/:handle/documents — List documents (auth required, owner only)
 */
documentRoutes.get('/:handle/documents', requireAuth, async c => {
  const session = c.get('session')
  const handle = c.req.param('handle') as string
  const exportType = c.req.query('exportType')
  const limit = Math.min(100, Math.max(1, Number(c.req.query('limit') ?? 50)))

  const db = getDb(c.env.DB)

  // Look up agent
  const agentRows = await db.select().from(agents).where(eq(agents.handle, handle)).limit(1)

  if (agentRows.length === 0) {
    return c.json({ error: 'Agent not found', code: 'NOT_FOUND' }, 404)
  }

  const agent = agentRows[0]

  // Must own the agent to list documents
  if (agent.walletAddress !== session.walletAddress.toLowerCase()) {
    return c.json(
      { error: "Not authorized to access this agent's documents", code: 'FORBIDDEN' },
      403
    )
  }

  const whereClause = exportType
    ? and(eq(documents.agentId, agent.id), eq(documents.exportType, exportType))
    : eq(documents.agentId, agent.id)

  const docs = await db
    .select()
    .from(documents)
    .where(whereClause)
    .orderBy(sql`created_at DESC`)
    .limit(limit)

  return c.json({
    documents: docs.map(d => ({
      documentId: d.id,
      exportType: d.exportType,
      sagaVersion: d.sagaVersion,
      sizeBytes: d.sizeBytes,
      checksum: d.checksum,
      createdAt: d.createdAt,
    })),
  })
})

/**
 * GET /v1/agents/:handle/documents/:documentId — Get a document (auth required, owner only)
 */
documentRoutes.get('/:handle/documents/:documentId', requireAuth, async c => {
  const session = c.get('session')
  const handle = c.req.param('handle') as string
  const documentId = c.req.param('documentId') as string
  const accept = c.req.header('Accept') ?? 'application/json'

  const db = getDb(c.env.DB)

  // Look up agent
  const agentRows = await db.select().from(agents).where(eq(agents.handle, handle)).limit(1)

  if (agentRows.length === 0) {
    return c.json({ error: 'Agent not found', code: 'NOT_FOUND' }, 404)
  }

  const agent = agentRows[0]

  // Must own the agent to retrieve documents
  if (agent.walletAddress !== session.walletAddress.toLowerCase()) {
    return c.json(
      { error: "Not authorized to access this agent's documents", code: 'FORBIDDEN' },
      403
    )
  }

  // Look up document
  const docRows = await db
    .select()
    .from(documents)
    .where(and(eq(documents.id, documentId), eq(documents.agentId, agent.id)))
    .limit(1)

  if (docRows.length === 0) {
    return c.json({ error: 'Document not found', code: 'NOT_FOUND' }, 404)
  }

  const doc = docRows[0]

  // Fetch from R2
  const obj = await c.env.STORAGE.get(doc.storageKey)
  if (!obj) {
    return c.json({ error: 'Document data not found in storage', code: 'STORAGE_ERROR' }, 500)
  }

  if (accept.includes('application/octet-stream')) {
    const data = await obj.arrayBuffer()
    return new Response(data, {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Length': String(data.byteLength),
      },
    })
  }

  // Default: return as JSON
  const text = await obj.text()
  return new Response(text, {
    headers: { 'Content-Type': 'application/json' },
  })
})

/**
 * DELETE /v1/agents/:handle/documents/:documentId — Delete a document
 */
documentRoutes.delete('/:handle/documents/:documentId', requireAuth, async c => {
  const session = c.get('session')
  const handle = c.req.param('handle') as string
  const documentId = c.req.param('documentId') as string

  const db = getDb(c.env.DB)

  // Look up agent
  const agentRows = await db.select().from(agents).where(eq(agents.handle, handle)).limit(1)

  if (agentRows.length === 0) {
    return c.json({ error: 'Agent not found', code: 'NOT_FOUND' }, 404)
  }

  const agent = agentRows[0]

  // Must own the agent
  if (agent.walletAddress !== session.walletAddress.toLowerCase()) {
    return c.json({ error: 'Not authorized', code: 'FORBIDDEN' }, 403)
  }

  // Look up document
  const docRows = await db
    .select()
    .from(documents)
    .where(and(eq(documents.id, documentId), eq(documents.agentId, agent.id)))
    .limit(1)

  if (docRows.length === 0) {
    return c.json({ error: 'Document not found', code: 'NOT_FOUND' }, 404)
  }

  const doc = docRows[0]

  // Delete from R2 and D1
  await c.env.STORAGE.delete(doc.storageKey)
  await db.delete(documents).where(eq(documents.id, documentId))

  return new Response(null, { status: 204 })
})
