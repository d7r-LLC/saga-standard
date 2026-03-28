// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { useCallback, useEffect, useRef, useState } from 'react'
import { createConversation, deleteConversation, listConversations } from '../api/chat'
import type { Conversation, CreateConversationParams } from '../types'
import { useSession } from './useSession'

export interface UseConversationsResult {
  conversations: Conversation[]
  loading: boolean
  error: string | null
  refresh: () => void
  create: (params: CreateConversationParams) => Promise<Conversation>
  remove: (id: string) => Promise<void>
}

export function useConversations(agentHandle: string): UseConversationsResult {
  const { getToken } = useSession()
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const requestIdRef = useRef(0)

  const refresh = useCallback(async () => {
    if (!agentHandle) {
      setConversations([])
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    const requestId = ++requestIdRef.current
    try {
      await getToken()
      const result = await listConversations(agentHandle)
      if (requestId !== requestIdRef.current) return
      setConversations(result.conversations)
    } catch (err: unknown) {
      if (requestId !== requestIdRef.current) return
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false)
      }
    }
  }, [agentHandle, getToken])

  const create = useCallback(
    async (params: CreateConversationParams): Promise<Conversation> => {
      await getToken()
      const conversation = await createConversation(params)
      setConversations(prev => [conversation, ...prev])
      return conversation
    },
    [getToken]
  )

  const remove = useCallback(
    async (id: string): Promise<void> => {
      await getToken()
      await deleteConversation(id)
      setConversations(prev => prev.filter(c => c.id !== id))
    },
    [getToken]
  )

  useEffect(() => {
    refresh()
  }, [refresh])

  return { conversations, loading, error, refresh, create, remove }
}
