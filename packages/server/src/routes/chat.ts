// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { Hono } from 'hono'
import { and, desc, eq, sql } from 'drizzle-orm'
import { getDb } from '../db'
import { streamText } from 'ai'
import type { ModelMessage } from 'ai'
import type { Env } from '../bindings'
import { chatConversations, chatMessages } from '../db/schema'
import { generateId, requireAuth } from '../middleware/auth'
import { makeWalletRateLimit } from '../middleware/rate-limit'
import type { SessionData } from '../middleware/auth'
import { createModel, estimateCost, getProviderEnvKey, resolveApiKey } from '../services/llm'
import { createAmsClient } from '../services/ams'
import { HANDLE_REGEX, parseIntParam } from '../utils'

/** Create AMS client if configured, or null */
function getAmsClient(env: Env) {
  if (!env.AMS_BASE_URL) return null
  return createAmsClient(env.AMS_BASE_URL, env.AMS_AUTH_TOKEN ?? '')
}

const MAX_HISTORY = 50

async function loadD1Messages(
  db: ReturnType<typeof getDb>,
  conversationId: string
): Promise<ModelMessage[]> {
  // Count total so we can skip old messages in long conversations
  const countResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(chatMessages)
    .where(eq(chatMessages.conversationId, conversationId))

  const total = countResult[0]?.count ?? 0
  const skip = Math.max(0, total - MAX_HISTORY)

  const dbMessages = await db
    .select({ role: chatMessages.role, content: chatMessages.content })
    .from(chatMessages)
    .where(eq(chatMessages.conversationId, conversationId))
    .orderBy(chatMessages.createdAt)
    .offset(skip)
    .limit(MAX_HISTORY)

  return dbMessages.map(m => ({
    role: m.role as 'user' | 'assistant' | 'system',
    content: m.content,
  }))
}

export const chatRoutes = new Hono<{
  Bindings: Env
  Variables: { session: SessionData }
}>()

/**
 * POST /v1/chat/conversations — Create a new conversation
 */
chatRoutes.post('/conversations', requireAuth, async c => {
  const session = c.get('session')

  let body: { agentHandle: string; provider: string; model: string; systemPrompt?: string }
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid JSON body', code: 'INVALID_REQUEST' }, 400)
  }

  if (!body.agentHandle || !body.provider || !body.model) {
    return c.json(
      { error: 'agentHandle, provider, and model are required', code: 'INVALID_REQUEST' },
      400
    )
  }

  if (!HANDLE_REGEX.test(body.agentHandle)) {
    return c.json({ error: 'Invalid agentHandle format', code: 'INVALID_REQUEST' }, 400)
  }

  const db = getDb(c.env.DB)
  const id = generateId('conv')
  const now = new Date().toISOString()

  await db.insert(chatConversations).values({
    id,
    agentHandle: body.agentHandle,
    walletAddress: session.walletAddress.toLowerCase(),
    provider: body.provider,
    model: body.model,
    systemPrompt: body.systemPrompt ?? null,
    title: null,
    amsSessionId: null,
    createdAt: now,
    updatedAt: now,
  })

  // Initialize AMS session (best-effort, don't block conversation creation)
  const ams = getAmsClient(c.env)
  let amsSessionId: string | null = null
  if (ams) {
    try {
      const session = await ams.initSession(id, body.agentHandle, body.systemPrompt)
      amsSessionId = session.sessionId
      await db.update(chatConversations).set({ amsSessionId }).where(eq(chatConversations.id, id))
    } catch {
      // AMS unavailable; conversation works without it
    }
  }

  return c.json(
    {
      conversation: {
        id,
        agentHandle: body.agentHandle,
        provider: body.provider,
        model: body.model,
        systemPrompt: body.systemPrompt ?? null,
        title: null,
        createdAt: now,
        updatedAt: now,
      },
    },
    201
  )
})

/**
 * GET /v1/chat/conversations — List conversations for an agent
 */
chatRoutes.get('/conversations', requireAuth, async c => {
  const session = c.get('session')
  const agentHandle = c.req.query('agentHandle')

  if (!agentHandle) {
    return c.json({ error: 'agentHandle query param is required', code: 'INVALID_REQUEST' }, 400)
  }

  const page = Math.max(1, parseIntParam(c.req.query('page'), 1))
  const limit = Math.min(100, Math.max(1, parseIntParam(c.req.query('limit'), 20)))
  const offset = (page - 1) * limit

  const db = getDb(c.env.DB)
  const wallet = session.walletAddress.toLowerCase()

  const [rows, countResult] = await Promise.all([
    db
      .select()
      .from(chatConversations)
      .where(
        and(
          eq(chatConversations.walletAddress, wallet),
          eq(chatConversations.agentHandle, agentHandle)
        )
      )
      .orderBy(desc(chatConversations.updatedAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)` })
      .from(chatConversations)
      .where(
        and(
          eq(chatConversations.walletAddress, wallet),
          eq(chatConversations.agentHandle, agentHandle)
        )
      ),
  ])

  return c.json({
    conversations: rows.map(r => ({
      id: r.id,
      agentHandle: r.agentHandle,
      title: r.title,
      provider: r.provider,
      model: r.model,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    })),
    total: countResult[0]?.count ?? 0,
    page,
    limit,
  })
})

/**
 * GET /v1/chat/conversations/:id — Get conversation with messages
 */
chatRoutes.get('/conversations/:id', requireAuth, async c => {
  const session = c.get('session')
  const id = c.req.param('id') as string
  const wallet = session.walletAddress.toLowerCase()

  const db = getDb(c.env.DB)

  const rows = await db
    .select()
    .from(chatConversations)
    .where(and(eq(chatConversations.id, id), eq(chatConversations.walletAddress, wallet)))
    .limit(1)

  if (rows.length === 0) {
    return c.json({ error: 'Conversation not found', code: 'NOT_FOUND' }, 404)
  }

  const conversation = rows[0]

  const messages = await db
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.conversationId, id as string))
    .orderBy(chatMessages.createdAt)

  return c.json({
    conversation: {
      id: conversation.id,
      agentHandle: conversation.agentHandle,
      title: conversation.title,
      provider: conversation.provider,
      model: conversation.model,
      systemPrompt: conversation.systemPrompt,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
    },
    messages: messages.map(m => ({
      id: m.id,
      role: m.role,
      content: m.content,
      tokensPrompt: m.tokensPrompt,
      tokensCompletion: m.tokensCompletion,
      costUsd: m.costUsd,
      latencyMs: m.latencyMs,
      createdAt: m.createdAt,
    })),
  })
})

/**
 * POST /v1/chat/conversations/:id/messages — Send user message and stream LLM response via SSE.
 */
chatRoutes.post(
  '/conversations/:id/messages',
  requireAuth,
  makeWalletRateLimit('chat'),
  async c => {
    const session = c.get('session')
    const conversationId = c.req.param('id') as string
    const wallet = session.walletAddress.toLowerCase()

    let body: { content: string; apiKey?: string }
    try {
      body = await c.req.json()
    } catch {
      return c.json({ error: 'Invalid JSON body', code: 'INVALID_REQUEST' }, 400)
    }

    if (!body.content) {
      return c.json({ error: 'content is required', code: 'INVALID_REQUEST' }, 400)
    }

    const db = getDb(c.env.DB)

    // Verify conversation exists and belongs to this wallet
    const convRows = await db
      .select()
      .from(chatConversations)
      .where(
        and(eq(chatConversations.id, conversationId), eq(chatConversations.walletAddress, wallet))
      )
      .limit(1)

    if (convRows.length === 0) {
      return c.json({ error: 'Conversation not found', code: 'NOT_FOUND' }, 404)
    }

    const conversation = convRows[0]

    // Resolve API key: header > body > env > 400
    const apiKey = resolveApiKey({
      header: c.req.header('X-LLM-API-Key'),
      bodyApiKey: body.apiKey,
      envApiKey: getProviderEnvKey(conversation.provider, c.env),
    })

    if (!apiKey) {
      return c.json(
        {
          error: `No API key available for provider "${conversation.provider}". Provide via X-LLM-API-Key header, apiKey body field, or configure server environment.`,
          code: 'API_KEY_REQUIRED',
        },
        400
      )
    }

    const now = new Date().toISOString()
    const msgId = generateId('msg')

    // Save user message to D1
    await db.insert(chatMessages).values({
      id: msgId,
      conversationId,
      role: 'user',
      content: body.content,
      createdAt: now,
    })

    // Auto-set title from first message if not set
    if (!conversation.title) {
      const title = body.content.slice(0, 100)
      await db
        .update(chatConversations)
        .set({ title, updatedAt: now })
        .where(eq(chatConversations.id, conversationId))
    } else {
      await db
        .update(chatConversations)
        .set({ updatedAt: now })
        .where(eq(chatConversations.id, conversationId))
    }

    // Build context messages: try AMS first, fall back to D1
    const ams = getAmsClient(c.env)
    const amsSessionId = conversation.amsSessionId
    let messages: ModelMessage[]
    let amsAvailable = false

    if (ams && amsSessionId) {
      try {
        // Sync user message to AMS
        await ams.addMessage(amsSessionId, 'user', body.content)

        // Get context-managed messages from AMS
        const contextMessages = await ams.getContextMessages(amsSessionId)
        messages = contextMessages.map(m => ({
          role: m.role as 'user' | 'assistant' | 'system',
          content: m.content,
        }))
        amsAvailable = true
      } catch {
        // AMS failed; fall back to D1
        messages = await loadD1Messages(db, conversationId)
      }
    } else {
      messages = await loadD1Messages(db, conversationId)
    }

    // Create AI SDK model
    let model
    try {
      model = createModel(conversation.provider, conversation.model, apiKey, c.env)
    } catch (err) {
      return c.json(
        {
          error: err instanceof Error ? err.message : 'Failed to create LLM provider',
          code: 'PROVIDER_ERROR',
        },
        400
      )
    }

    // Stream response via SSE
    const startTime = Date.now()
    const encoder = new TextEncoder()
    const { readable, writable } = new TransformStream()
    const writer = writable.getWriter()

    // Swallow write errors caused by client disconnect (readable side canceled)
    const safeWrite = async (data: Uint8Array) => {
      try {
        await writer.write(data)
      } catch {
        // Client disconnected; nothing to send
      }
    }

    ;(async () => {
      try {
        const result = streamText({
          model,
          messages,
          ...(conversation.systemPrompt && { system: conversation.systemPrompt }),
        })

        const chunks: string[] = []
        for await (const chunk of result.textStream) {
          chunks.push(chunk)
          await safeWrite(
            encoder.encode(`data: ${JSON.stringify({ type: 'text-delta', textDelta: chunk })}\n\n`)
          )
        }

        const fullText = chunks.join('')
        const usage = await result.usage
        const finishReason = await result.finishReason
        const latencyMs = Date.now() - startTime
        const promptTokens = usage.inputTokens ?? 0
        const completionTokens = usage.outputTokens ?? 0
        const totalTokens = promptTokens + completionTokens
        const costUsd = estimateCost(conversation.model, promptTokens, completionTokens)

        // Save assistant message to D1
        await db.insert(chatMessages).values({
          id: generateId('msg'),
          conversationId,
          role: 'assistant',
          content: fullText,
          tokensPrompt: promptTokens,
          tokensCompletion: completionTokens,
          costUsd,
          latencyMs,
          createdAt: new Date().toISOString(),
        })

        // Sync assistant message to AMS (best-effort)
        if (ams && amsSessionId && amsAvailable) {
          try {
            await ams.addMessage(amsSessionId, 'assistant', fullText)
          } catch {
            // AMS sync failure doesn't affect the response
          }
        }

        // Send finish event
        await safeWrite(
          encoder.encode(
            `data: ${JSON.stringify({
              type: 'finish',
              finishReason,
              usage: {
                inputTokens: promptTokens,
                outputTokens: completionTokens,
                totalTokens,
              },
              cost: { totalCostUSD: costUsd, model: conversation.model },
            })}\n\n`
          )
        )

        await safeWrite(encoder.encode('data: [DONE]\n\n'))
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Stream failed'
        await safeWrite(
          encoder.encode(`data: ${JSON.stringify({ type: 'error', error: errorMessage })}\n\n`)
        )
        await safeWrite(encoder.encode('data: [DONE]\n\n'))
      } finally {
        try {
          await writer.close()
        } catch {
          // Already closed or client disconnected
        }
      }
    })()

    return new Response(readable, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
      },
    })
  }
)

/**
 * DELETE /v1/chat/conversations/:id — Delete conversation and messages
 */
chatRoutes.delete('/conversations/:id', requireAuth, async c => {
  const session = c.get('session')
  const id = c.req.param('id') as string
  const wallet = session.walletAddress.toLowerCase()

  const db = getDb(c.env.DB)

  // Verify ownership
  const rows = await db
    .select({ id: chatConversations.id, amsSessionId: chatConversations.amsSessionId })
    .from(chatConversations)
    .where(and(eq(chatConversations.id, id), eq(chatConversations.walletAddress, wallet)))
    .limit(1)

  if (rows.length === 0) {
    return c.json({ error: 'Conversation not found', code: 'NOT_FOUND' }, 404)
  }

  // Remove AMS session (best-effort)
  const ams = getAmsClient(c.env)
  const conversation = rows[0]
  if (ams && conversation.amsSessionId) {
    try {
      await ams.removeSession(conversation.amsSessionId)
    } catch {
      // AMS cleanup failure doesn't block deletion
    }
  }

  // Delete messages first, then conversation
  await db.delete(chatMessages).where(eq(chatMessages.conversationId, id))
  await db.delete(chatConversations).where(eq(chatConversations.id, id))

  return new Response(null, { status: 204 })
})
