// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { Hono } from 'hono'
import { drizzle } from 'drizzle-orm/d1'
import { eq, and, desc, sql } from 'drizzle-orm'
import type { Env } from '../bindings'
import { chatConversations, chatMessages } from '../db/schema'
import { generateId, requireAuth } from '../middleware/auth'
import type { SessionData } from '../middleware/auth'
import { parseIntParam } from '../utils'

export const chatRoutes = new Hono<{
  Bindings: Env
  Variables: { session: SessionData }
}>()

/**
 * POST /v1/chat/conversations — Create a new conversation
 */
chatRoutes.post('/conversations', requireAuth, async c => {
  const session = c.get('session')
  const body = await c.req.json<{
    agentHandle: string
    provider: string
    model: string
    systemPrompt?: string
  }>()

  if (!body.agentHandle || !body.provider || !body.model) {
    return c.json(
      { error: 'agentHandle, provider, and model are required', code: 'INVALID_REQUEST' },
      400
    )
  }

  const db = drizzle(c.env.DB)
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
