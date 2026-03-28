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
