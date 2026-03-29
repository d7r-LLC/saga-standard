// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import React from 'react'
import { fireEvent, render } from '@testing-library/react-native'
import { ChatScreen } from '../../../../src/features/chat/screens/ChatScreen'

let mockUseChat: {
  messages: Array<{
    id: string
    conversationId: string
    role: 'user' | 'assistant' | 'system'
    content: string
    tokensPrompt: number | null
    tokensCompletion: number | null
    costUsd: number | null
    latencyMs: number | null
    createdAt: string
  }>
  streamingText: string | null
  title: string | null
  loading: boolean
  error: string | null
  sending: boolean
  send: jest.Mock
  stop: jest.Mock
  clearError: jest.Mock
}

jest.mock('../../../../src/features/chat/hooks/useChat', () => ({
  useChat: () => mockUseChat,
}))

const MOCK_MESSAGES = [
  {
    id: 'msg-1',
    conversationId: 'conv-1',
    role: 'user' as const,
    content: 'Hello there',
    tokensPrompt: 5,
    tokensCompletion: null,
    costUsd: null,
    latencyMs: null,
    createdAt: '2026-03-28T00:01:00Z',
  },
  {
    id: 'msg-2',
    conversationId: 'conv-1',
    role: 'assistant' as const,
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
        conversationId: params?.conversationId ?? 'conv-1',
        title: params?.title,
      },
    },
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  mockUseChat = {
    messages: MOCK_MESSAGES,
    streamingText: null,
    title: 'Test Chat Title',
    loading: false,
    error: null,
    sending: false,
    send: jest.fn(),
    stop: jest.fn(),
    clearError: jest.fn(),
  }
})

describe('ChatScreen', () => {
  it('shows loading spinner when loading', () => {
    mockUseChat.loading = true
    mockUseChat.messages = []

    const props = createNavigation()
    const { getByText } = render(<ChatScreen {...props} />)

    expect(getByText('Loading messages...')).toBeTruthy()
  })

  it('displays messages after loading', () => {
    const props = createNavigation()
    const { getByText } = render(<ChatScreen {...props} />)

    expect(getByText('Hello there')).toBeTruthy()
    expect(getByText('Hi! How can I help?')).toBeTruthy()
  })

  it('shows conversation title in header', () => {
    const props = createNavigation()
    const { getByText } = render(<ChatScreen {...props} />)

    expect(getByText('Test Chat Title')).toBeTruthy()
  })

  it('falls back to route title when hook title is null', () => {
    mockUseChat.title = null
    const props = createNavigation({ title: 'Route Title' })
    const { getByText } = render(<ChatScreen {...props} />)

    expect(getByText('Route Title')).toBeTruthy()
  })

  it('back button calls navigation.goBack()', () => {
    const props = createNavigation()
    const { getByText } = render(<ChatScreen {...props} />)

    fireEvent.press(getByText('Back'))
    expect(mockGoBack).toHaveBeenCalledTimes(1)
  })

  it('calls send when a message is submitted', () => {
    const props = createNavigation()
    const { getByLabelText } = render(<ChatScreen {...props} />)

    const input = getByLabelText('Message input')
    fireEvent.changeText(input, 'New message')

    const sendButton = getByLabelText('Send message')
    fireEvent.press(sendButton)

    expect(mockUseChat.send).toHaveBeenCalledWith('New message')
  })

  it('shows streaming message when streamingText is set', () => {
    mockUseChat.streamingText = 'Streaming response...'

    const props = createNavigation()
    const { getByTestId } = render(<ChatScreen {...props} />)

    expect(getByTestId('streaming-message')).toBeTruthy()
  })

  it('shows stop button when streaming', () => {
    mockUseChat.streamingText = 'Partial text'

    const props = createNavigation()
    const { getByLabelText } = render(<ChatScreen {...props} />)

    const stopButton = getByLabelText('Stop generation')
    fireEvent.press(stopButton)

    expect(mockUseChat.stop).toHaveBeenCalledTimes(1)
  })

  it('shows inline error when error occurs during chat', () => {
    mockUseChat.error = 'Stream interrupted'

    const props = createNavigation()
    const { getByText } = render(<ChatScreen {...props} />)

    expect(getByText('Stream interrupted')).toBeTruthy()
    // Messages should still be visible
    expect(getByText('Hello there')).toBeTruthy()
  })

  it('shows full error screen when error on initial load', () => {
    mockUseChat.loading = false
    mockUseChat.messages = []
    mockUseChat.error = 'Network failure'

    const props = createNavigation()
    const { getByText } = render(<ChatScreen {...props} />)

    expect(getByText('Network failure')).toBeTruthy()
  })

  it('shows Chat fallback when all titles are null', () => {
    mockUseChat.title = null

    const props = createNavigation()
    const { getByText } = render(<ChatScreen {...props} />)

    expect(getByText('Chat')).toBeTruthy()
  })
})
