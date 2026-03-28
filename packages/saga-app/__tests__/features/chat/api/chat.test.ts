// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import {
  createConversation,
  deleteConversation,
  getConversation,
  listConversations,
} from '../../../../src/features/chat/api/chat'
import type { Conversation, Message } from '../../../../src/features/chat/types'

jest.mock('../../../../src/core/api/hub', () => ({
  authenticatedFetch: jest.fn(),
}))

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { authenticatedFetch } = require('../../../../src/core/api/hub') as {
  authenticatedFetch: jest.MockedFunction<
    (method: string, path: string, body?: unknown) => Promise<unknown>
  >
}

const mockConversation: Conversation = {
  id: 'conv-123',
  agentHandle: 'alice',
  provider: 'anthropic',
  model: 'claude-sonnet-4-5-20250514',
  title: 'Test Conversation',
  systemPrompt: null,
  createdAt: '2026-03-28T00:00:00Z',
  updatedAt: '2026-03-28T00:00:00Z',
}

const mockMessage: Message = {
  id: 'msg-456',
  conversationId: 'conv-123',
  role: 'user',
  content: 'Hello!',
  tokensPrompt: 10,
  tokensCompletion: null,
  costUsd: null,
  latencyMs: null,
  createdAt: '2026-03-28T00:00:00Z',
}

beforeEach(() => {
  authenticatedFetch.mockReset()
})

describe('createConversation()', () => {
  it('calls POST /v1/chat/conversations with body params', async () => {
    authenticatedFetch.mockResolvedValueOnce({ conversation: mockConversation })

    const result = await createConversation({
      agentHandle: 'alice',
      provider: 'anthropic',
      model: 'claude-sonnet-4-5-20250514',
    })

    expect(authenticatedFetch).toHaveBeenCalledTimes(1)
    expect(authenticatedFetch).toHaveBeenCalledWith('POST', '/v1/chat/conversations', {
      agentHandle: 'alice',
      provider: 'anthropic',
      model: 'claude-sonnet-4-5-20250514',
    })
    expect(result).toEqual(mockConversation)
  })

  it('includes systemPrompt when provided', async () => {
    authenticatedFetch.mockResolvedValueOnce({ conversation: mockConversation })

    await createConversation({
      agentHandle: 'alice',
      provider: 'anthropic',
      model: 'claude-sonnet-4-5-20250514',
      systemPrompt: 'You are a helpful assistant.',
    })

    expect(authenticatedFetch).toHaveBeenCalledWith('POST', '/v1/chat/conversations', {
      agentHandle: 'alice',
      provider: 'anthropic',
      model: 'claude-sonnet-4-5-20250514',
      systemPrompt: 'You are a helpful assistant.',
    })
  })

  it('returns the conversation from the response', async () => {
    const other: Conversation = { ...mockConversation, id: 'conv-999', title: 'Other' }
    authenticatedFetch.mockResolvedValueOnce({ conversation: other })

    const result = await createConversation({
      agentHandle: 'bob',
      provider: 'openai',
      model: 'gpt-4o',
    })

    expect(result.id).toBe('conv-999')
    expect(result.title).toBe('Other')
  })
})

describe('listConversations()', () => {
  it('calls GET /v1/chat/conversations with encoded agentHandle', async () => {
    authenticatedFetch.mockResolvedValueOnce({
      conversations: [mockConversation],
      total: 1,
    })

    const result = await listConversations('alice')

    expect(authenticatedFetch).toHaveBeenCalledTimes(1)
    expect(authenticatedFetch).toHaveBeenCalledWith(
      'GET',
      '/v1/chat/conversations?agentHandle=alice'
    )
    expect(result.conversations).toHaveLength(1)
    expect(result.total).toBe(1)
  })

  it('URL-encodes agentHandle with special characters', async () => {
    authenticatedFetch.mockResolvedValueOnce({ conversations: [], total: 0 })

    await listConversations('alice@example.com')

    expect(authenticatedFetch).toHaveBeenCalledWith(
      'GET',
      '/v1/chat/conversations?agentHandle=alice%40example.com'
    )
  })

  it('returns conversations array and total', async () => {
    const conversations = [mockConversation, { ...mockConversation, id: 'conv-2' }]
    authenticatedFetch.mockResolvedValueOnce({ conversations, total: 2 })

    const result = await listConversations('alice')

    expect(result.conversations).toHaveLength(2)
    expect(result.total).toBe(2)
  })
})

describe('getConversation()', () => {
  it('calls GET /v1/chat/conversations/:id', async () => {
    authenticatedFetch.mockResolvedValueOnce({
      conversation: mockConversation,
      messages: [mockMessage],
    })

    const result = await getConversation('conv-123')

    expect(authenticatedFetch).toHaveBeenCalledTimes(1)
    expect(authenticatedFetch).toHaveBeenCalledWith('GET', '/v1/chat/conversations/conv-123')
    expect(result.conversation).toEqual(mockConversation)
    expect(result.messages).toHaveLength(1)
    expect(result.messages[0]).toEqual(mockMessage)
  })

  it('returns conversation and messages from response', async () => {
    const messages = [mockMessage, { ...mockMessage, id: 'msg-2', role: 'assistant' as const }]
    authenticatedFetch.mockResolvedValueOnce({
      conversation: mockConversation,
      messages,
    })

    const result = await getConversation('conv-123')

    expect(result.conversation.id).toBe('conv-123')
    expect(result.messages).toHaveLength(2)
    expect(result.messages[1].role).toBe('assistant')
  })
})

describe('deleteConversation()', () => {
  it('calls DELETE /v1/chat/conversations/:id', async () => {
    authenticatedFetch.mockResolvedValueOnce({})

    await deleteConversation('conv-123')

    expect(authenticatedFetch).toHaveBeenCalledTimes(1)
    expect(authenticatedFetch).toHaveBeenCalledWith('DELETE', '/v1/chat/conversations/conv-123')
  })

  it('returns void (does not throw) on success', async () => {
    authenticatedFetch.mockResolvedValueOnce({})

    await expect(deleteConversation('conv-abc')).resolves.toBeUndefined()
  })

  it('uses the provided conversation id in the path', async () => {
    authenticatedFetch.mockResolvedValueOnce({})

    await deleteConversation('conv-xyz-999')

    expect(authenticatedFetch).toHaveBeenCalledWith('DELETE', '/v1/chat/conversations/conv-xyz-999')
  })
})
