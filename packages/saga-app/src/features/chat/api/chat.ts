// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { ApiError, HUB_URL, authenticatedFetch, hubAuthManager } from '../../../core/api/hub'
import type { Conversation, CreateConversationParams, Message } from '../types'

export async function createConversation(params: CreateConversationParams): Promise<Conversation> {
  const data = await authenticatedFetch<{ conversation: Conversation }>(
    'POST',
    '/v1/chat/conversations',
    params
  )
  return data.conversation
}

export async function listConversations(
  agentHandle: string
): Promise<{ conversations: Conversation[]; total: number }> {
  return authenticatedFetch<{ conversations: Conversation[]; total: number }>(
    'GET',
    `/v1/chat/conversations?agentHandle=${encodeURIComponent(agentHandle)}`
  )
}

export async function getConversation(
  id: string
): Promise<{ conversation: Conversation; messages: Message[] }> {
  return authenticatedFetch<{ conversation: Conversation; messages: Message[] }>(
    'GET',
    `/v1/chat/conversations/${id}`
  )
}

export async function deleteConversation(id: string): Promise<void> {
  await authenticatedFetch<void>('DELETE', `/v1/chat/conversations/${id}`)
}

export async function sendMessage(conversationId: string, content: string): Promise<void> {
  // sendMessage returns an SSE stream, not JSON. Use raw fetch instead of authenticatedFetch.
  const token = hubAuthManager.getToken()
  if (!token) throw new ApiError(401, 'Not authenticated')

  const res = await fetch(`${HUB_URL}/v1/chat/conversations/${conversationId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ content }),
  })

  if (!res.ok) throw new ApiError(res.status)

  // Consume the SSE response body (Phase 4: static display, no streaming parse)
  await res.text()
}
