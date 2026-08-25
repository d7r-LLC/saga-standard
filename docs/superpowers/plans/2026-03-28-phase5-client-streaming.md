> **FlowState Document:** `docu_zeSFoev2vg`

# Phase 5: Client Streaming + Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add real-time SSE streaming to the SAGA mobile app's chat feature so users see LLM responses appear word-by-word with a blinking cursor, can stop generation mid-stream, and get clear error feedback.

**Architecture:** A new `api/stream.ts` module wraps `react-native-sse` EventSource to parse the server's SSE format (`text-delta`, `finish`, `error`, `[DONE]`). A `useChat` hook manages the full lifecycle: initial message load, optimistic user messages, streaming text accumulation via ref, and stop/error handling. The existing `ChatScreen` swaps from send-and-refetch to streaming, and `ChatInput` gains a stop button. A `StreamingMessage` component renders growing text with a blinking cursor.

**Tech Stack:** React Native 0.84, React 19, TypeScript, react-native-sse, Jest + React Native Testing Library, React Navigation 7.x native stack

---

## File Structure

```
Create:  src/features/chat/api/stream.ts                           - SSE stream creation and event parsing
Create:  src/features/chat/hooks/useChat.ts                        - Stream lifecycle management hook
Create:  src/features/chat/components/StreamingMessage.tsx          - Growing text display with blinking cursor
Modify:  src/features/chat/types.ts                                - Add StreamEvent, StreamCallbacks types
Modify:  src/features/chat/api/chat.ts:38-56                       - Remove sendMessage (replaced by stream)
Modify:  src/features/chat/components/ChatInput.tsx                 - Add streaming/onStop props, stop button
Modify:  src/features/chat/screens/ChatScreen.tsx                   - Replace send-refetch with useChat hook
Modify:  package.json                                               - Add react-native-sse dependency
Modify:  jest.config.js                                             - Add react-native-sse mock path

Tests:
Create:  __tests__/features/chat/api/stream.test.ts
Create:  __tests__/features/chat/hooks/useChat.test.tsx
Modify:  __tests__/features/chat/api/chat.test.ts:225-274          - Remove sendMessage tests
Modify:  __tests__/features/chat/components/ChatInput.test.tsx      - Add stop button tests
Modify:  __tests__/features/chat/screens/ChatScreen.test.tsx        - Update for streaming behavior

Mocks:
Create:  __mocks__/react-native-sse.js                             - EventSource mock for tests
```

All paths relative to `packages/saga-app/`.

---

### Task 1: Add Dependencies and Streaming Types

**Files:**

- Modify: `package.json`
- Modify: `jest.config.js`
- Create: `__mocks__/react-native-sse.js`
- Modify: `src/features/chat/types.ts`

- [ ] **Step 1: Install react-native-sse**

Run: `cd packages/saga-app && pnpm add react-native-sse`

Expected: Package added to dependencies in `package.json`.

- [ ] **Step 2: Create EventSource mock for tests**

Create `__mocks__/react-native-sse.js`:

```javascript
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

class MockEventSource {
  constructor(url, config) {
    this.url = url
    this.config = config
    this._listeners = {}
    MockEventSource._instances.push(this)
  }

  addEventListener(event, handler) {
    if (!this._listeners[event]) {
      this._listeners[event] = []
    }
    this._listeners[event].push(handler)
  }

  removeAllEventListeners() {
    this._listeners = {}
  }

  close() {
    this._closed = true
  }

  // Test helper: emit an event to all registered listeners
  __emit(event, data) {
    const handlers = this._listeners[event] || []
    handlers.forEach(handler => handler(data))
  }
}

MockEventSource._instances = []
MockEventSource._reset = () => {
  MockEventSource._instances = []
}

module.exports = MockEventSource
module.exports.default = MockEventSource
```

- [ ] **Step 3: Add mock path to jest.config.js**

In `jest.config.js`, add the following entry to the `moduleNameMapper` object:

```javascript
'react-native-sse': '<rootDir>/__mocks__/react-native-sse.js',
```

- [ ] **Step 4: Add streaming types to types.ts**

Append the following types to `src/features/chat/types.ts` after the `CHAT_PROVIDERS` array:

```typescript
export interface StreamUsage {
  inputTokens: number
  outputTokens: number
  totalTokens: number
}

export interface StreamCost {
  totalCostUSD: number
  model: string
}

export interface StreamFinishData {
  finishReason: string
  usage: StreamUsage
  cost: StreamCost
}

export type StreamEvent =
  | { type: 'text-delta'; textDelta: string }
  | { type: 'finish'; finishReason: string; usage: StreamUsage; cost: StreamCost }
  | { type: 'error'; error: string }

export interface StreamCallbacks {
  onTextDelta: (text: string) => void
  onFinish: (data: StreamFinishData) => void
  onError: (error: string) => void
}

export interface StreamHandle {
  close: () => void
}
```

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-lock.yaml jest.config.js __mocks__/react-native-sse.js src/features/chat/types.ts
git commit -m "feat(saga-app): add react-native-sse and streaming types

Built with d7r FlowState"
```

---

### Task 2: SSE Stream API Client

**Files:**

- Create: `src/features/chat/api/stream.ts`
- Test: `__tests__/features/chat/api/stream.test.ts`

- [ ] **Step 1: Write failing tests**

Create `__tests__/features/chat/api/stream.test.ts`:

```typescript
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { createMessageStream } from '../../../../src/features/chat/api/stream'
import type { StreamCallbacks } from '../../../../src/features/chat/types'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const MockEventSource = require('../../../../__mocks__/react-native-sse')

jest.mock('../../../../src/core/api/hub', () => ({
  hubAuthManager: {
    getToken: jest.fn(),
  },
  HUB_URL: 'http://localhost:8787',
  ApiError: class ApiError extends Error {
    status: number
    constructor(status: number, message?: string) {
      super(message ?? `Server error: ${status}`)
      this.status = status
      this.name = 'ApiError'
    }
  },
}))

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { hubAuthManager } = require('../../../../src/core/api/hub') as {
  hubAuthManager: { getToken: jest.MockedFunction<() => string | null> }
}

let callbacks: StreamCallbacks

beforeEach(() => {
  jest.clearAllMocks()
  MockEventSource._reset()
  hubAuthManager.getToken.mockReturnValue('test-token-123')
  callbacks = {
    onTextDelta: jest.fn(),
    onFinish: jest.fn(),
    onError: jest.fn(),
  }
})

describe('createMessageStream', () => {
  it('creates EventSource with POST method and auth header', () => {
    createMessageStream('conv-1', 'Hello', callbacks)

    expect(MockEventSource._instances).toHaveLength(1)
    const es = MockEventSource._instances[0]
    expect(es.url).toBe('http://localhost:8787/v1/chat/conversations/conv-1/messages')
    expect(es.config.method).toBe('POST')
    expect(es.config.headers.Authorization).toBe('Bearer test-token-123')
    expect(es.config.headers['Content-Type']).toBe('application/json')
    expect(JSON.parse(es.config.body)).toEqual({ content: 'Hello' })
  })

  it('throws ApiError when not authenticated', () => {
    hubAuthManager.getToken.mockReturnValue(null)

    expect(() => createMessageStream('conv-1', 'Hello', callbacks)).toThrow('Not authenticated')
  })

  it('calls onTextDelta for text-delta events', () => {
    createMessageStream('conv-1', 'Hello', callbacks)

    const es = MockEventSource._instances[0]
    es.__emit('message', {
      data: JSON.stringify({ type: 'text-delta', textDelta: 'Hi ' }),
    })
    es.__emit('message', {
      data: JSON.stringify({ type: 'text-delta', textDelta: 'there!' }),
    })

    expect(callbacks.onTextDelta).toHaveBeenCalledTimes(2)
    expect(callbacks.onTextDelta).toHaveBeenNthCalledWith(1, 'Hi ')
    expect(callbacks.onTextDelta).toHaveBeenNthCalledWith(2, 'there!')
  })

  it('calls onFinish for finish events and closes the stream', () => {
    createMessageStream('conv-1', 'Hello', callbacks)

    const es = MockEventSource._instances[0]
    const finishData = {
      type: 'finish',
      finishReason: 'stop',
      usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
      cost: { totalCostUSD: 0.001, model: 'claude-sonnet-4-5-20250514' },
    }
    es.__emit('message', { data: JSON.stringify(finishData) })

    expect(callbacks.onFinish).toHaveBeenCalledTimes(1)
    expect(callbacks.onFinish).toHaveBeenCalledWith({
      finishReason: 'stop',
      usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
      cost: { totalCostUSD: 0.001, model: 'claude-sonnet-4-5-20250514' },
    })
  })

  it('closes EventSource on [DONE] signal', () => {
    createMessageStream('conv-1', 'Hello', callbacks)

    const es = MockEventSource._instances[0]
    es.__emit('message', { data: '[DONE]' })

    expect(es._closed).toBe(true)
  })

  it('calls onError for error events', () => {
    createMessageStream('conv-1', 'Hello', callbacks)

    const es = MockEventSource._instances[0]
    es.__emit('message', {
      data: JSON.stringify({ type: 'error', error: 'Provider rate limited' }),
    })

    expect(callbacks.onError).toHaveBeenCalledWith('Provider rate limited')
  })

  it('calls onError when EventSource emits error event', () => {
    createMessageStream('conv-1', 'Hello', callbacks)

    const es = MockEventSource._instances[0]
    es.__emit('error', { message: 'Connection lost' })

    expect(callbacks.onError).toHaveBeenCalledWith('Connection lost')
  })

  it('returns a handle with close()', () => {
    const handle = createMessageStream('conv-1', 'Hello', callbacks)

    const es = MockEventSource._instances[0]
    handle.close()

    expect(es._closed).toBe(true)
  })

  it('handles malformed JSON data gracefully', () => {
    createMessageStream('conv-1', 'Hello', callbacks)

    const es = MockEventSource._instances[0]
    es.__emit('message', { data: 'not valid json' })

    expect(callbacks.onError).toHaveBeenCalledWith(expect.stringContaining('Failed to parse'))
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/saga-app && npx jest __tests__/features/chat/api/stream.test.ts --no-coverage`
Expected: FAIL - `Cannot find module '../../../../src/features/chat/api/stream'`

- [ ] **Step 3: Implement the stream API client**

Create `src/features/chat/api/stream.ts`:

```typescript
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import EventSource from 'react-native-sse'
import { ApiError, HUB_URL, hubAuthManager } from '../../../core/api/hub'
import type { StreamCallbacks, StreamEvent, StreamHandle } from '../types'

export function createMessageStream(
  conversationId: string,
  content: string,
  callbacks: StreamCallbacks
): StreamHandle {
  const token = hubAuthManager.getToken()
  if (!token) throw new ApiError(401, 'Not authenticated')

  const url = `${HUB_URL}/v1/chat/conversations/${conversationId}/messages`

  const es = new EventSource(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ content }),
  })

  es.addEventListener('message', (event: { data?: string }) => {
    const raw = event.data
    if (!raw) return

    if (raw === '[DONE]') {
      es.close()
      return
    }

    let parsed: StreamEvent
    try {
      parsed = JSON.parse(raw) as StreamEvent
    } catch {
      callbacks.onError(`Failed to parse stream event: ${raw}`)
      return
    }

    switch (parsed.type) {
      case 'text-delta':
        callbacks.onTextDelta(parsed.textDelta)
        break
      case 'finish':
        callbacks.onFinish({
          finishReason: parsed.finishReason,
          usage: parsed.usage,
          cost: parsed.cost,
        })
        break
      case 'error':
        callbacks.onError(parsed.error)
        break
    }
  })

  es.addEventListener('error', (event: { message?: string }) => {
    callbacks.onError(event.message ?? 'Stream connection error')
  })

  return {
    close: () => es.close(),
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/saga-app && npx jest __tests__/features/chat/api/stream.test.ts --no-coverage`
Expected: PASS (9 tests)

- [ ] **Step 5: Commit**

```bash
git add src/features/chat/api/stream.ts __tests__/features/chat/api/stream.test.ts
git commit -m "feat(saga-app): add SSE stream API client for chat messages

Built with d7r FlowState"
```

---

### Task 3: useChat Hook

**Files:**

- Create: `src/features/chat/hooks/useChat.ts`
- Test: `__tests__/features/chat/hooks/useChat.test.tsx`

- [ ] **Step 1: Write failing tests**

Create `__tests__/features/chat/hooks/useChat.test.tsx`:

```typescript
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

const mockCreateMessageStream = jest
  .fn()
  .mockImplementation((_conversationId: string, _content: string, callbacks: StreamCallbacks) => {
    capturedCallbacks = callbacks
    return { close: mockClose }
  })

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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/saga-app && npx jest __tests__/features/chat/hooks/useChat.test.tsx --no-coverage`
Expected: FAIL - `Cannot find module '../../../../src/features/chat/hooks/useChat'`

- [ ] **Step 3: Implement the hook**

Create `src/features/chat/hooks/useChat.ts`:

```typescript
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { useCallback, useEffect, useRef, useState } from 'react'
import { getConversation } from '../api/chat'
import { createMessageStream } from '../api/stream'
import { useSession } from './useSession'
import type { Message, StreamHandle } from '../types'

export interface UseChatResult {
  messages: Message[]
  streamingText: string | null
  title: string | null
  loading: boolean
  error: string | null
  sending: boolean
  send: (text: string) => Promise<void>
  stop: () => void
  clearError: () => void
}

export function useChat(conversationId: string): UseChatResult {
  const { getToken } = useSession()

  const [messages, setMessages] = useState<Message[]>([])
  const [streamingText, setStreamingText] = useState<string | null>(null)
  const [title, setTitle] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)

  const streamRef = useRef<StreamHandle | null>(null)
  const accumulatedTextRef = useRef('')

  // Load conversation on mount
  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        await getToken()
        const data = await getConversation(conversationId)
        if (cancelled) return
        setMessages(data.messages)
        setTitle(data.conversation.title ?? null)
        setError(null)
      } catch (err) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Failed to load conversation')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [conversationId, getToken])

  // Cleanup stream on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.close()
      }
    }
  }, [])

  const finalizePartialText = useCallback(() => {
    const partial = accumulatedTextRef.current
    if (partial) {
      setMessages(prev => [
        ...prev,
        {
          id: `msg_${Date.now()}`,
          conversationId,
          role: 'assistant',
          content: partial,
          tokensPrompt: null,
          tokensCompletion: null,
          costUsd: null,
          latencyMs: null,
          createdAt: new Date().toISOString(),
        },
      ])
    }
  }, [conversationId])

  const send = useCallback(
    async (text: string) => {
      setError(null)

      try {
        await getToken()
      } catch {
        setError('Authentication required')
        return
      }

      // Set title from first message if not set
      setTitle(prev => prev ?? text.slice(0, 100))

      // Add optimistic user message
      const optimistic: Message = {
        id: `temp_${Date.now()}`,
        conversationId,
        role: 'user',
        content: text,
        tokensPrompt: null,
        tokensCompletion: null,
        costUsd: null,
        latencyMs: null,
        createdAt: new Date().toISOString(),
      }

      setMessages(prev => [...prev, optimistic])
      setSending(true)
      accumulatedTextRef.current = ''
      setStreamingText('')

      const stream = createMessageStream(conversationId, text, {
        onTextDelta: (delta: string) => {
          accumulatedTextRef.current += delta
          setStreamingText(accumulatedTextRef.current)
        },
        onFinish: data => {
          const finalText = accumulatedTextRef.current
          setMessages(prev => [
            ...prev,
            {
              id: `msg_${Date.now()}`,
              conversationId,
              role: 'assistant',
              content: finalText,
              tokensPrompt: data.usage.inputTokens,
              tokensCompletion: data.usage.outputTokens,
              costUsd: data.cost.totalCostUSD,
              latencyMs: null,
              createdAt: new Date().toISOString(),
            },
          ])
          setStreamingText(null)
          setSending(false)
          streamRef.current = null
        },
        onError: (errorMsg: string) => {
          finalizePartialText()
          setStreamingText(null)
          setError(errorMsg)
          setSending(false)
          streamRef.current = null
        },
      })

      streamRef.current = stream
    },
    [conversationId, getToken, finalizePartialText]
  )

  const stop = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.close()
      streamRef.current = null
    }
    finalizePartialText()
    setStreamingText(null)
    setSending(false)
  }, [finalizePartialText])

  const clearError = useCallback(() => {
    setError(null)
  }, [])

  return {
    messages,
    streamingText,
    title,
    loading,
    error,
    sending,
    send,
    stop,
    clearError,
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/saga-app && npx jest __tests__/features/chat/hooks/useChat.test.tsx --no-coverage`
Expected: PASS (11 tests)

- [ ] **Step 5: Commit**

```bash
git add src/features/chat/hooks/useChat.ts __tests__/features/chat/hooks/useChat.test.tsx
git commit -m "feat(saga-app): add useChat hook for SSE stream management

Built with d7r FlowState"
```

---

### Task 4: StreamingMessage Component

**Files:**

- Create: `src/features/chat/components/StreamingMessage.tsx`

- [ ] **Step 1: Create the component**

Create `src/features/chat/components/StreamingMessage.tsx`:

```typescript
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import React, { useEffect, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { borderRadius, colors, spacing, typography } from '../../../core/theme'

interface StreamingMessageProps {
  text: string
  testID?: string
}

export function StreamingMessage({
  text,
  testID,
}: StreamingMessageProps): React.JSX.Element {
  const [showCursor, setShowCursor] = useState(true)

  useEffect(() => {
    const timer = setInterval(() => setShowCursor(v => !v), 500)
    return () => clearInterval(timer)
  }, [])

  return (
    <View style={styles.row} testID={testID}>
      <View style={styles.bubble}>
        <Text style={styles.text}>
          {text}
          {showCursor ? '\u2589' : ' '}
        </Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    alignItems: 'flex-start',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
  },
  bubble: {
    maxWidth: '80%',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.surfaceElevated,
    borderTopLeftRadius: borderRadius.lg,
    borderTopRightRadius: borderRadius.lg,
    borderBottomLeftRadius: borderRadius.sm,
    borderBottomRightRadius: borderRadius.lg,
  },
  text: {
    ...typography.body,
    color: colors.textPrimary,
  },
})
```

- [ ] **Step 2: Commit**

```bash
git add src/features/chat/components/StreamingMessage.tsx
git commit -m "feat(saga-app): add StreamingMessage component with blinking cursor

Built with d7r FlowState"
```

---

### Task 5: Update ChatInput with Stop Button

**Files:**

- Modify: `src/features/chat/components/ChatInput.tsx`
- Modify: `__tests__/features/chat/components/ChatInput.test.tsx`

- [ ] **Step 1: Read the existing test file**

Read: `__tests__/features/chat/components/ChatInput.test.tsx`

- [ ] **Step 2: Add failing tests for stop button behavior**

Append the following tests to the existing `describe` block in `__tests__/features/chat/components/ChatInput.test.tsx`:

```typescript
  it('shows stop button when streaming is true', () => {
    const { getByLabelText } = render(
      <ChatInput onSend={jest.fn()} onStop={jest.fn()} streaming />
    )

    expect(getByLabelText('Stop generation')).toBeTruthy()
  })

  it('calls onStop when stop button is pressed', () => {
    const onStop = jest.fn()
    const { getByLabelText } = render(
      <ChatInput onSend={jest.fn()} onStop={onStop} streaming />
    )

    fireEvent.press(getByLabelText('Stop generation'))

    expect(onStop).toHaveBeenCalledTimes(1)
  })

  it('disables text input when streaming', () => {
    const { getByLabelText } = render(
      <ChatInput onSend={jest.fn()} onStop={jest.fn()} streaming />
    )

    const input = getByLabelText('Message input')
    expect(input.props.editable).toBe(false)
  })

  it('shows send button when not streaming', () => {
    const { getByLabelText } = render(
      <ChatInput onSend={jest.fn()} onStop={jest.fn()} />
    )

    expect(getByLabelText('Send message')).toBeTruthy()
  })
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd packages/saga-app && npx jest __tests__/features/chat/components/ChatInput.test.tsx --no-coverage`
Expected: FAIL - stop button not found

- [ ] **Step 4: Update ChatInput component**

Replace the entire contents of `src/features/chat/components/ChatInput.tsx`:

```typescript
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import React, { useState } from 'react'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { borderRadius, colors, spacing, typography } from '../../../core/theme'

interface ChatInputProps {
  onSend: (text: string) => void
  onStop?: () => void
  disabled?: boolean
  streaming?: boolean
  placeholder?: string
}

export function ChatInput({
  onSend,
  onStop,
  disabled = false,
  streaming = false,
  placeholder = 'Type a message...',
}: ChatInputProps): React.JSX.Element {
  const [text, setText] = useState('')

  const canSend = text.trim().length > 0 && !disabled && !streaming

  function handleSend() {
    if (!canSend) return
    onSend(text.trim())
    setText('')
  }

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.input}
        value={text}
        onChangeText={setText}
        placeholder={placeholder}
        placeholderTextColor={colors.textTertiary}
        multiline
        maxLength={4000}
        editable={!disabled && !streaming}
        accessibilityLabel="Message input"
      />
      {streaming ? (
        <Pressable
          onPress={onStop}
          style={styles.stopButton}
          accessibilityLabel="Stop generation"
          accessibilityRole="button"
        >
          <View style={styles.stopIcon} />
        </Pressable>
      ) : (
        <Pressable
          onPress={handleSend}
          disabled={!canSend}
          style={[styles.sendButton, !canSend && styles.sendButtonDisabled]}
          accessibilityLabel="Send message"
          accessibilityRole="button"
        >
          <Text style={[styles.sendIcon, !canSend && styles.sendIconDisabled]}>
            {'>'}
          </Text>
        </Pressable>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
    gap: spacing.sm,
  },
  input: {
    flex: 1,
    ...typography.body,
    color: colors.textPrimary,
    backgroundColor: colors.surfaceElevated,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    maxHeight: 100,
    minHeight: 40,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
  sendIcon: {
    ...typography.body,
    fontWeight: '700',
    color: colors.textInverse,
  },
  sendIconDisabled: {
    color: colors.textTertiary,
  },
  stopButton: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.full,
    backgroundColor: colors.error,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stopIcon: {
    width: 14,
    height: 14,
    backgroundColor: colors.textInverse,
    borderRadius: 2,
  },
})
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd packages/saga-app && npx jest __tests__/features/chat/components/ChatInput.test.tsx --no-coverage`
Expected: PASS (all existing + 4 new tests)

- [ ] **Step 6: Commit**

```bash
git add src/features/chat/components/ChatInput.tsx __tests__/features/chat/components/ChatInput.test.tsx
git commit -m "feat(saga-app): add stop button to ChatInput during streaming

Built with d7r FlowState"
```

---

### Task 6: Integrate Streaming into ChatScreen

**Files:**

- Modify: `src/features/chat/screens/ChatScreen.tsx`
- Modify: `__tests__/features/chat/screens/ChatScreen.test.tsx`
- Modify: `src/features/chat/api/chat.ts` (remove `sendMessage`)
- Modify: `__tests__/features/chat/api/chat.test.ts` (remove `sendMessage` tests)

- [ ] **Step 1: Remove sendMessage from chat.ts**

In `src/features/chat/api/chat.ts`, remove the entire `sendMessage` function (lines 38-56) and the `hubAuthManager` import (no longer needed in this file). Also remove the unused `ApiError` import.

The file should become:

```typescript
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { authenticatedFetch } from '../../../core/api/hub'
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
```

- [ ] **Step 2: Remove sendMessage tests from chat.test.ts**

In `__tests__/features/chat/api/chat.test.ts`:

1. Remove the `sendMessage` import from the import statement (line 9).
2. Remove the `sendMessage` describe block (lines 225-274).
3. Remove the global `mockFetch`, `originalFetch`, `beforeAll`, and `afterAll` blocks (lines 62-70) since they were only needed for `sendMessage`.
4. Remove `mockFetch.mockReset()` from the `beforeEach` block (line 74).

The import line becomes:

```typescript
import {
  createConversation,
  deleteConversation,
  getConversation,
  listConversations,
} from '../../../../src/features/chat/api/chat'
```

The hub mock no longer needs `hubAuthManager`:

```typescript
jest.mock('../../../../src/core/api/hub', () => ({
  authenticatedFetch: jest.fn(),
  HUB_URL: 'http://localhost:8787',
}))

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { authenticatedFetch } = require('../../../../src/core/api/hub') as {
  authenticatedFetch: jest.MockedFunction<
    (method: string, path: string, body?: unknown) => Promise<unknown>
  >
}
```

Remove the global fetch mock setup (lines 62-75). The `beforeEach` becomes:

```typescript
beforeEach(() => {
  authenticatedFetch.mockReset()
})
```

- [ ] **Step 3: Run chat API tests to verify cleanup is clean**

Run: `cd packages/saga-app && npx jest __tests__/features/chat/api/chat.test.ts --no-coverage`
Expected: PASS (11 tests - the sendMessage tests are removed)

- [ ] **Step 4: Rewrite ChatScreen to use useChat hook**

Replace the entire contents of `src/features/chat/screens/ChatScreen.tsx`:

```typescript
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import React, { useCallback, useMemo } from 'react'
import { FlatList, StyleSheet, Text, View } from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Header } from '../../../components/Header'
import { LoadingSpinner } from '../../../components/LoadingSpinner'
import { SafeArea } from '../../../components/SafeArea'
import { colors, spacing, typography } from '../../../core/theme'
import type { MessagesStackParamList } from '../../../navigation/types'
import { ChatInput } from '../components/ChatInput'
import { MessageBubble } from '../components/MessageBubble'
import { StreamingMessage } from '../components/StreamingMessage'
import { useChat } from '../hooks/useChat'
import type { Message } from '../types'

type Props = NativeStackScreenProps<MessagesStackParamList, 'ChatScreen'>

const STREAMING_ID = '__streaming__'

export function ChatScreen({ navigation, route }: Props): React.JSX.Element {
  const { conversationId, title: routeTitle } = route.params
  const {
    messages,
    streamingText,
    title,
    loading,
    error,
    sending,
    send,
    stop,
  } = useChat(conversationId)

  const headerTitle = title ?? routeTitle ?? 'Chat'

  const displayItems = useMemo(() => {
    const items: (Message | { id: string; __streaming: true; text: string })[] = [
      ...messages,
    ]
    if (streamingText !== null) {
      items.push({ id: STREAMING_ID, __streaming: true, text: streamingText })
    }
    return items.reverse()
  }, [messages, streamingText])

  const renderItem = useCallback(
    ({ item }: { item: (typeof displayItems)[number] }) => {
      if ('__streaming' in item) {
        return <StreamingMessage text={item.text} testID="streaming-message" />
      }
      return (
        <MessageBubble
          role={item.role}
          content={item.content}
          testID={`message-${item.id}`}
        />
      )
    },
    []
  )

  const keyExtractor = useCallback(
    (item: (typeof displayItems)[number]) => item.id,
    []
  )

  return (
    <SafeArea>
      <Header
        title={headerTitle}
        leftAction={{ label: 'Back', onPress: () => navigation.goBack() }}
      />
      {loading ? (
        <LoadingSpinner message="Loading messages..." />
      ) : error && messages.length === 0 ? (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : (
        <>
          <FlatList
            data={displayItems}
            renderItem={renderItem}
            keyExtractor={keyExtractor}
            inverted
            contentContainerStyle={styles.listContent}
          />
          {error && (
            <View style={styles.inlineError}>
              <Text style={styles.inlineErrorText}>{error}</Text>
            </View>
          )}
        </>
      )}
      <ChatInput
        onSend={send}
        onStop={stop}
        disabled={sending && streamingText === null}
        streaming={streamingText !== null}
      />
    </SafeArea>
  )
}

const styles = StyleSheet.create({
  listContent: {
    paddingVertical: spacing.sm,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
  },
  errorText: {
    ...typography.body,
    color: colors.error,
    textAlign: 'center',
  },
  inlineError: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: `${colors.error}15`,
  },
  inlineErrorText: {
    ...typography.bodySmall,
    color: colors.error,
    textAlign: 'center',
  },
})
```

- [ ] **Step 5: Rewrite ChatScreen tests for streaming behavior**

Replace the entire contents of `__tests__/features/chat/screens/ChatScreen.test.tsx`:

```typescript
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import React from 'react'
import { fireEvent, render, waitFor } from '@testing-library/react-native'
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
```

- [ ] **Step 6: Run all chat tests to verify they pass**

Run: `cd packages/saga-app && npx jest --testPathPattern='features/chat' --no-coverage`
Expected: PASS (all chat test suites pass)

- [ ] **Step 7: Commit**

```bash
git add src/features/chat/api/chat.ts src/features/chat/screens/ChatScreen.tsx __tests__/features/chat/api/chat.test.ts __tests__/features/chat/screens/ChatScreen.test.tsx
git commit -m "feat(saga-app): integrate SSE streaming into ChatScreen

Replace send-and-refetch with streaming via useChat hook. ChatScreen
now shows streaming text with a blinking cursor as the LLM responds.
Users can stop generation mid-stream.

Built with d7r FlowState"
```

---

### Task 7: Final Verification

**Files:** None (verification only)

- [ ] **Step 1: Run all tests**

Run: `cd packages/saga-app && npx jest --no-coverage`
Expected: All tests pass. Previous 162 tests - sendMessage tests (4) + new stream/useChat/ChatScreen tests.

- [ ] **Step 2: Run typecheck**

Run: `cd packages/saga-app && npx tsc --noEmit`
Expected: No errors related to the chat feature (pre-existing errors in other features are acceptable).

- [ ] **Step 3: Verify SPDX headers**

Run: `grep -rL "SPDX-License-Identifier" packages/saga-app/src/features/chat/`
Expected: No output (all files have SPDX headers).

- [ ] **Step 4: Verify new files have correct structure**

Run: `ls -la packages/saga-app/src/features/chat/api/stream.ts packages/saga-app/src/features/chat/hooks/useChat.ts packages/saga-app/src/features/chat/components/StreamingMessage.tsx`
Expected: All three new files exist.

- [ ] **Step 5: Run git status**

Run: `git status`
Expected: Clean working tree, all changes committed.
