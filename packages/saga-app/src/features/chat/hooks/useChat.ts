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
        onFinish: (data) => {
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
