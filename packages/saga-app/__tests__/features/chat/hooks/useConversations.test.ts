// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { act, renderHook, waitFor } from '@testing-library/react-native'
import { useConversations } from '../../../../src/features/chat/hooks/useConversations'
import type { Conversation } from '../../../../src/features/chat/types'

jest.mock('../../../../src/features/chat/api/chat')

const mockGetToken = jest.fn().mockResolvedValue('test-token-123')

jest.mock('../../../../src/features/chat/hooks/useSession', () => ({
  useSession: () => ({
    token: 'test-token-123',
    isAuthenticated: true,
    authenticating: false,
    error: null,
    getToken: mockGetToken,
    clearSession: jest.fn(),
  }),
}))

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { listConversations, createConversation, deleteConversation } =
  require('../../../../src/features/chat/api/chat') as {
    listConversations: jest.MockedFunction<
      (agentHandle: string) => Promise<{ conversations: Conversation[]; total: number }>
    >
    createConversation: jest.MockedFunction<(params: unknown) => Promise<Conversation>>
    deleteConversation: jest.MockedFunction<(id: string) => Promise<void>>
  }

const MOCK_CONVERSATION: Conversation = {
  id: 'conv_test1',
  agentHandle: 'alice.saga',
  provider: 'anthropic',
  model: 'claude-sonnet-4-5-20250514',
  title: 'Test Chat',
  systemPrompt: null,
  createdAt: '2026-03-28T00:00:00Z',
  updatedAt: '2026-03-28T00:00:00Z',
}

const MOCK_CONVERSATION_2: Conversation = {
  id: 'conv_test2',
  agentHandle: 'alice.saga',
  provider: 'openai',
  model: 'gpt-4o',
  title: 'Second Chat',
  systemPrompt: null,
  createdAt: '2026-03-28T01:00:00Z',
  updatedAt: '2026-03-28T01:00:00Z',
}

beforeEach(() => {
  jest.clearAllMocks()
  listConversations.mockResolvedValue({ conversations: [MOCK_CONVERSATION], total: 1 })
  createConversation.mockResolvedValue(MOCK_CONVERSATION_2)
  deleteConversation.mockResolvedValue(undefined)
})

describe('useConversations', () => {
  it('lists conversations on mount', async () => {
    const { result } = renderHook(() => useConversations('alice.saga'))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(listConversations).toHaveBeenCalledWith('alice.saga')
    expect(result.current.conversations).toHaveLength(1)
    expect(result.current.conversations[0]).toEqual(MOCK_CONVERSATION)
    expect(result.current.error).toBeNull()
  })

  it('starts in loading state and transitions to false after fetch', async () => {
    const { result } = renderHook(() => useConversations('alice.saga'))

    expect(result.current.loading).toBe(true)

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })
  })

  it('create() adds the new conversation to the front of the list and returns it', async () => {
    const { result } = renderHook(() => useConversations('alice.saga'))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    let returned: Conversation | undefined
    await act(async () => {
      returned = await result.current.create({
        agentHandle: 'alice.saga',
        provider: 'openai',
        model: 'gpt-4o',
      })
    })

    expect(createConversation).toHaveBeenCalledWith({
      agentHandle: 'alice.saga',
      provider: 'openai',
      model: 'gpt-4o',
    })
    expect(returned).toEqual(MOCK_CONVERSATION_2)
    expect(result.current.conversations).toHaveLength(2)
    expect(result.current.conversations[0]).toEqual(MOCK_CONVERSATION_2)
    expect(result.current.conversations[1]).toEqual(MOCK_CONVERSATION)
  })

  it('remove() deletes the conversation and filters it out of local state', async () => {
    listConversations.mockResolvedValue({
      conversations: [MOCK_CONVERSATION, MOCK_CONVERSATION_2],
      total: 2,
    })

    const { result } = renderHook(() => useConversations('alice.saga'))

    await waitFor(() => {
      expect(result.current.conversations).toHaveLength(2)
    })

    await act(async () => {
      await result.current.remove(MOCK_CONVERSATION.id)
    })

    expect(deleteConversation).toHaveBeenCalledWith(MOCK_CONVERSATION.id)
    expect(result.current.conversations).toHaveLength(1)
    expect(result.current.conversations[0]).toEqual(MOCK_CONVERSATION_2)
  })

  it('refresh() re-fetches conversations from the API', async () => {
    const { result } = renderHook(() => useConversations('alice.saga'))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    listConversations.mockResolvedValue({
      conversations: [MOCK_CONVERSATION, MOCK_CONVERSATION_2],
      total: 2,
    })

    await act(async () => {
      result.current.refresh()
    })

    await waitFor(() => {
      expect(result.current.conversations).toHaveLength(2)
    })

    expect(listConversations).toHaveBeenCalledTimes(2)
  })

  it('sets error state on API failure', async () => {
    listConversations.mockRejectedValue(new Error('Network error'))

    const { result } = renderHook(() => useConversations('alice.saga'))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.error).toBe('Network error')
    expect(result.current.conversations).toHaveLength(0)
  })

  it('sets error from non-Error thrown values', async () => {
    listConversations.mockRejectedValue('string error')

    const { result } = renderHook(() => useConversations('alice.saga'))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.error).toBe('string error')
  })

  it('clears error on successful refresh after failure', async () => {
    listConversations.mockRejectedValueOnce(new Error('Temporary failure'))

    const { result } = renderHook(() => useConversations('alice.saga'))

    await waitFor(() => {
      expect(result.current.error).toBe('Temporary failure')
    })

    listConversations.mockResolvedValue({ conversations: [MOCK_CONVERSATION], total: 1 })

    await act(async () => {
      result.current.refresh()
    })

    await waitFor(() => {
      expect(result.current.error).toBeNull()
    })

    expect(result.current.conversations).toHaveLength(1)
  })
})
