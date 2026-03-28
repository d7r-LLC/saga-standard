// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { useCallback, useEffect, useState } from 'react'
import { createConversation, deleteConversation, listConversations } from '../api/chat'
import type { Conversation, CreateConversationParams } from '../types'

export interface UseConversationsResult {
  conversations: Conversation[]
  loading: boolean
  error: string | null
  refresh: () => void
  create: (params: CreateConversationParams) => Promise<Conversation>
  remove: (id: string) => Promise<void>
}

export function useConversations(agentHandle: string): UseConversationsResult {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await listConversations(agentHandle)
      setConversations(result.conversations)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [agentHandle])

  const create = useCallback(
    async (params: CreateConversationParams): Promise<Conversation> => {
      const conversation = await createConversation(params)
      setConversations(prev => [conversation, ...prev])
      return conversation
    },
    []
  )

  const remove = useCallback(async (id: string): Promise<void> => {
    await deleteConversation(id)
    setConversations(prev => prev.filter(c => c.id !== id))
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { conversations, loading, error, refresh, create, remove }
}
