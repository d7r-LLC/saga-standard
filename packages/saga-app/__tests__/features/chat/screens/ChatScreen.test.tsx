// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import React from 'react'
import { fireEvent, render, waitFor } from '@testing-library/react-native'
import { ChatScreen } from '../../../../src/features/chat/screens/ChatScreen'
import type { Conversation, Message } from '../../../../src/features/chat/types'

const mockGetConversation = jest.fn()
const mockSendMessage = jest.fn()

jest.mock('../../../../src/features/chat/api/chat', () => ({
  getConversation: (...args: unknown[]) => mockGetConversation(...args),
  sendMessage: (...args: unknown[]) => mockSendMessage(...args),
}))

const MOCK_CONVERSATION: Conversation = {
  id: 'conv-test-1',
  agentHandle: 'alice.saga',
  provider: 'anthropic',
  model: 'claude-sonnet-4-5-20250514',
  title: 'Test Chat Title',
  systemPrompt: null,
  createdAt: '2026-03-28T00:00:00Z',
  updatedAt: '2026-03-28T00:00:00Z',
}

const MOCK_MESSAGES: Message[] = [
  {
    id: 'msg-1',
    conversationId: 'conv-test-1',
    role: 'user',
    content: 'Hello there',
    tokensPrompt: 5,
    tokensCompletion: null,
    costUsd: null,
    latencyMs: null,
    createdAt: '2026-03-28T00:01:00Z',
  },
  {
    id: 'msg-2',
    conversationId: 'conv-test-1',
    role: 'assistant',
    content: 'Hi! How can I help?',
    tokensPrompt: null,
    tokensCompletion: 10,
    costUsd: null,
    latencyMs: 200,
    createdAt: '2026-03-28T00:01:01Z',
  },
]

const mockGoBack = jest.fn()

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function createNavigation(params?: { conversationId?: string; title?: string }): any {
  return {
    navigation: {
      goBack: mockGoBack,
      navigate: jest.fn(),
      dispatch: jest.fn(),
      reset: jest.fn(),
      setOptions: jest.fn(),
      setParams: jest.fn(),
      isFocused: jest.fn().mockReturnValue(true),
      canGoBack: jest.fn().mockReturnValue(true),
      getId: jest.fn(),
      getParent: jest.fn(),
      getState: jest.fn(),
      addListener: jest.fn().mockReturnValue(jest.fn()),
      removeListener: jest.fn(),
      replace: jest.fn(),
    },
    route: {
      key: 'ChatScreen-test',
      name: 'ChatScreen' as const,
      params: {
        conversationId: params?.conversationId ?? 'conv-test-1',
        title: params?.title,
      },
    },
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  mockGetConversation.mockResolvedValue({
    conversation: MOCK_CONVERSATION,
    messages: MOCK_MESSAGES,
  })
  mockSendMessage.mockResolvedValue(undefined)
})

describe('ChatScreen', () => {
  it('shows loading spinner initially', () => {
    // Never resolves so we stay in loading state
    mockGetConversation.mockReturnValue(new Promise(() => {}))

    const props = createNavigation()
    const { getByText } = render(<ChatScreen {...props} />)

    expect(getByText('Loading messages...')).toBeTruthy()
  })

  it('displays messages after loading', async () => {
    const props = createNavigation()
    const { getByText } = render(<ChatScreen {...props} />)

    await waitFor(() => {
      expect(getByText('Hello there')).toBeTruthy()
      expect(getByText('Hi! How can I help?')).toBeTruthy()
    })
  })

  it('shows conversation title in header', async () => {
    const props = createNavigation()
    const { getByText } = render(<ChatScreen {...props} />)

    await waitFor(() => {
      expect(getByText('Test Chat Title')).toBeTruthy()
    })
  })

  it('back button calls navigation.goBack()', async () => {
    const props = createNavigation()
    const { getByText } = render(<ChatScreen {...props} />)

    await waitFor(() => {
      expect(getByText('Test Chat Title')).toBeTruthy()
    })

    fireEvent.press(getByText('Back'))
    expect(mockGoBack).toHaveBeenCalledTimes(1)
  })

  it('sending a message adds optimistic user message and calls sendMessage', async () => {
    const props = createNavigation()
    const { getByText, getByLabelText } = render(<ChatScreen {...props} />)

    // Wait for messages to load
    await waitFor(() => {
      expect(getByText('Hello there')).toBeTruthy()
    })

    // Type and send a message
    const input = getByLabelText('Message input')
    fireEvent.changeText(input, 'New message')

    const sendButton = getByLabelText('Send message')
    fireEvent.press(sendButton)

    // Optimistic message should appear
    await waitFor(() => {
      expect(getByText('New message')).toBeTruthy()
    })

    expect(mockSendMessage).toHaveBeenCalledWith('conv-test-1', 'New message')
  })

  it('refreshes messages after send completes', async () => {
    const updatedMessages = [
      ...MOCK_MESSAGES,
      {
        id: 'msg-3',
        conversationId: 'conv-test-1',
        role: 'user' as const,
        content: 'Follow-up',
        tokensPrompt: 5,
        tokensCompletion: null,
        costUsd: null,
        latencyMs: null,
        createdAt: '2026-03-28T00:02:00Z',
      },
      {
        id: 'msg-4',
        conversationId: 'conv-test-1',
        role: 'assistant' as const,
        content: 'Got it!',
        tokensPrompt: null,
        tokensCompletion: 8,
        costUsd: null,
        latencyMs: 150,
        createdAt: '2026-03-28T00:02:01Z',
      },
    ]

    // First call: initial load
    mockGetConversation.mockResolvedValueOnce({
      conversation: MOCK_CONVERSATION,
      messages: MOCK_MESSAGES,
    })
    // Second call: after send (refresh)
    mockGetConversation.mockResolvedValueOnce({
      conversation: MOCK_CONVERSATION,
      messages: updatedMessages,
    })

    const props = createNavigation()
    const { getByText, getByLabelText } = render(<ChatScreen {...props} />)

    await waitFor(() => {
      expect(getByText('Hello there')).toBeTruthy()
    })

    const input = getByLabelText('Message input')
    fireEvent.changeText(input, 'Follow-up')

    const sendButton = getByLabelText('Send message')
    fireEvent.press(sendButton)

    // After refresh, the server-returned assistant reply should appear
    await waitFor(() => {
      expect(getByText('Got it!')).toBeTruthy()
    })

    // getConversation called twice: initial load + post-send refresh
    expect(mockGetConversation).toHaveBeenCalledTimes(2)
  })

  it('shows error text when loading fails', async () => {
    mockGetConversation.mockRejectedValueOnce(new Error('Network failure'))

    const props = createNavigation()
    const { getByText } = render(<ChatScreen {...props} />)

    await waitFor(() => {
      expect(getByText('Network failure')).toBeTruthy()
    })
  })

  it('shows fallback Chat title when conversation title is null', async () => {
    mockGetConversation.mockResolvedValueOnce({
      conversation: { ...MOCK_CONVERSATION, title: null },
      messages: [],
    })

    const props = createNavigation()
    const { getByText } = render(<ChatScreen {...props} />)

    await waitFor(() => {
      expect(getByText('Chat')).toBeTruthy()
    })
  })
})
