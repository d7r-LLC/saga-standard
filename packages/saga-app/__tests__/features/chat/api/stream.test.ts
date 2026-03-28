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
