// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { renderHook, act, waitFor } from '@testing-library/react-native'
import { useChat } from '../../../../src/features/chat/hooks/useChat'
import type { StreamCallbacks } from '../../../../src/features/chat/types'

const mockGetConversation = jest.fn()
const mockGetToken = jest.fn().mockResolvedValue('test-token-123')
const mockClearSession = jest.fn()
let capturedCallbacks: StreamCallbacks
const mockClose = jest.fn()

const mockCreateMessageStream = jest.fn().mockImplementation(
  (_conversationId: string, _content: string, callbacks: StreamCallbacks) => {
    capturedCallbacks = callbacks
    return { close: mockClose }
  }
)

jest.mock('../../../../src/features/chat/api/chat', () => ({
  getConversation: (...args: unknown[]) => mockGetConversation(...args),
}))

jest.mock('../../../../src/features/chat/api/stream', () => ({
  createMessageStream: (...args: unknown[]) => mockCreateMessageStream(...args),
}))

jest.mock('../../../../src/features/chat/hooks/useSession', () => ({
  useSession: () => ({
    token: 'test-token-123',
    isAuthenticated: true,
    authenticating: false,
    error: null,
    getToken: mockGetToken,
    clearSession: mockClearSession,
  }),
}))

const MOCK_MESSAGES = [
  {
    id: 'msg-1',
    conversationId: 'conv-1',
    role: 'user' as const,
    content: 'Hello',
    tokensPrompt: 5,
    tokensCompletion: null,
    costUsd: null,
    latencyMs: null,
    createdAt: '2026-03-28T00:00:00Z',
  },
  {
    id: 'msg-2',
    conversationId: 'conv-1',
    role: 'assistant' as const,
    content: 'Hi there!',
    tokensPrompt: null,
    tokensCompletion: 10,
    costUsd: null,
    latencyMs: 200,
    createdAt: '2026-03-28T00:00:01Z',
  },
]

beforeEach(() => {
  jest.clearAllMocks()
  mockClose.mockReset()
  mockGetConversation.mockResolvedValue({
    conversation: {
      id: 'conv-1',
      title: 'Test Chat',
      provider: 'anthropic',
      model: 'claude-sonnet-4-5-20250514',
    },
    messages: MOCK_MESSAGES,
  })
})

describe('useChat', () => {
  it('loads conversation and messages on mount', async () => {
    const { result } = renderHook(() => useChat('conv-1'))

    expect(result.current.loading).toBe(true)

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(mockGetToken).toHaveBeenCalled()
    expect(mockGetConversation).toHaveBeenCalledWith('conv-1')
    expect(result.current.messages).toEqual(MOCK_MESSAGES)
    expect(result.current.title).toBe('Test Chat')
    expect(result.current.error).toBeNull()
  })

  it('sets error when load fails', async () => {
    mockGetConversation.mockRejectedValue(new Error('Network error'))

    const { result } = renderHook(() => useChat('conv-1'))

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.error).toBe('Network error')
    expect(result.current.messages).toEqual([])
  })

  it('send() adds optimistic user message and starts stream', async () => {
    const { result } = renderHook(() => useChat('conv-1'))

    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      result.current.send('New message')
    })

    expect(result.current.sending).toBe(true)
    expect(result.current.messages).toHaveLength(3) // 2 loaded + 1 optimistic
    expect(result.current.messages[2].content).toBe('New message')
    expect(result.current.messages[2].role).toBe('user')
    expect(result.current.streamingText).toBe('')

    expect(mockCreateMessageStream).toHaveBeenCalledWith(
      'conv-1',
      'New message',
      expect.objectContaining({
        onTextDelta: expect.any(Function),
        onFinish: expect.any(Function),
        onError: expect.any(Function),
      })
    )
  })

  it('accumulates streaming text from onTextDelta callbacks', async () => {
    const { result } = renderHook(() => useChat('conv-1'))

    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      result.current.send('Hello')
    })

    act(() => {
      capturedCallbacks.onTextDelta('Hi ')
    })
    expect(result.current.streamingText).toBe('Hi ')

    act(() => {
      capturedCallbacks.onTextDelta('there!')
    })
    expect(result.current.streamingText).toBe('Hi there!')
  })

  it('onFinish moves streaming text to a message and clears streaming state', async () => {
    const { result } = renderHook(() => useChat('conv-1'))

    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      result.current.send('Hello')
    })

    act(() => {
      capturedCallbacks.onTextDelta('Response text')
    })

    act(() => {
      capturedCallbacks.onFinish({
        finishReason: 'stop',
        usage: { inputTokens: 10, outputTokens: 15, totalTokens: 25 },
        cost: { totalCostUSD: 0.001, model: 'claude-sonnet-4-5-20250514' },
      })
    })

    expect(result.current.streamingText).toBeNull()
    expect(result.current.sending).toBe(false)
    // 2 loaded + 1 user + 1 assistant
    expect(result.current.messages).toHaveLength(4)
    const assistantMsg = result.current.messages[3]
    expect(assistantMsg.role).toBe('assistant')
    expect(assistantMsg.content).toBe('Response text')
    expect(assistantMsg.tokensPrompt).toBe(10)
    expect(assistantMsg.tokensCompletion).toBe(15)
  })

  it('onError preserves partial text as a message', async () => {
    const { result } = renderHook(() => useChat('conv-1'))

    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      result.current.send('Hello')
    })

    act(() => {
      capturedCallbacks.onTextDelta('Partial ')
    })

    act(() => {
      capturedCallbacks.onError('Stream interrupted')
    })

    expect(result.current.streamingText).toBeNull()
    expect(result.current.sending).toBe(false)
    expect(result.current.error).toBe('Stream interrupted')
    // Partial text preserved as assistant message
    expect(result.current.messages).toHaveLength(4)
    expect(result.current.messages[3].content).toBe('Partial ')
  })

  it('onError with no partial text does not add an empty message', async () => {
    const { result } = renderHook(() => useChat('conv-1'))

    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      result.current.send('Hello')
    })

    act(() => {
      capturedCallbacks.onError('Auth expired')
    })

    expect(result.current.sending).toBe(false)
    expect(result.current.error).toBe('Auth expired')
    // Only 2 loaded + 1 user, no empty assistant message
    expect(result.current.messages).toHaveLength(3)
  })

  it('stop() closes stream and preserves partial text', async () => {
    const { result } = renderHook(() => useChat('conv-1'))

    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      result.current.send('Hello')
    })

    act(() => {
      capturedCallbacks.onTextDelta('Stopped mid-')
    })

    act(() => {
      result.current.stop()
    })

    expect(mockClose).toHaveBeenCalledTimes(1)
    expect(result.current.streamingText).toBeNull()
    expect(result.current.sending).toBe(false)
    // Partial text preserved
    expect(result.current.messages).toHaveLength(4)
    expect(result.current.messages[3].content).toBe('Stopped mid-')
  })

  it('stop() with no accumulated text does not add an empty message', async () => {
    const { result } = renderHook(() => useChat('conv-1'))

    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      result.current.send('Hello')
    })

    act(() => {
      result.current.stop()
    })

    expect(result.current.messages).toHaveLength(3) // no empty assistant
  })

  it('sets title from first message when title is null', async () => {
    mockGetConversation.mockResolvedValue({
      conversation: { id: 'conv-1', title: null },
      messages: [],
    })

    const { result } = renderHook(() => useChat('conv-1'))

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.title).toBeNull()

    await act(async () => {
      result.current.send('My first message to this conversation')
    })

    expect(result.current.title).toBe('My first message to this conversation')
  })
})
