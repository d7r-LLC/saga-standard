// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import React, { useCallback, useEffect, useState } from 'react'
import { FlatList, StyleSheet, Text, View } from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Header } from '../../../components/Header'
import { LoadingSpinner } from '../../../components/LoadingSpinner'
import { SafeArea } from '../../../components/SafeArea'
import { colors, spacing, typography } from '../../../core/theme'
import type { MessagesStackParamList } from '../../../navigation/types'
import { getConversation, sendMessage } from '../api/chat'
import { ChatInput } from '../components/ChatInput'
import { MessageBubble } from '../components/MessageBubble'
import { useSession } from '../hooks/useSession'
import type { Message } from '../types'

type Props = NativeStackScreenProps<MessagesStackParamList, 'ChatScreen'>

export function ChatScreen({ navigation, route }: Props): React.JSX.Element {
  const { conversationId, title: routeTitle } = route.params
  const { getToken } = useSession()

  const [messages, setMessages] = useState<Message[]>([])
  const [conversationTitle, setConversationTitle] = useState<string | null>(routeTitle ?? null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)

  const loadConversation = useCallback(async () => {
    try {
      await getToken()
      const data = await getConversation(conversationId)
      setMessages(data.messages)
      setConversationTitle(data.conversation.title)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load conversation')
    } finally {
      setLoading(false)
    }
  }, [conversationId, getToken])

  useEffect(() => {
    loadConversation()
  }, [loadConversation])

  const handleSend = useCallback(
    async (text: string) => {
      const optimisticMessage: Message = {
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

      setMessages(prev => [...prev, optimisticMessage])
      setSending(true)

      try {
        await getToken()
        await sendMessage(conversationId, text)
        const data = await getConversation(conversationId)
        setMessages(data.messages)
        setConversationTitle(data.conversation.title)
      } catch {
        // Keep the optimistic message visible so the user sees what they typed
      } finally {
        setSending(false)
      }
    },
    [conversationId, getToken]
  )

  const headerTitle = conversationTitle ?? 'Chat'

  const renderItem = useCallback(
    ({ item }: { item: Message }) => (
      <MessageBubble role={item.role} content={item.content} testID={`message-${item.id}`} />
    ),
    []
  )

  const reversedMessages = [...messages].reverse()

  return (
    <SafeArea>
      <Header
        title={headerTitle}
        leftAction={{ label: 'Back', onPress: () => navigation.goBack() }}
      />
      {loading ? (
        <LoadingSpinner message="Loading messages..." />
      ) : error ? (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : (
        <FlatList
          data={reversedMessages}
          renderItem={renderItem}
          keyExtractor={item => item.id}
          inverted
          contentContainerStyle={styles.listContent}
        />
      )}
      <ChatInput onSend={handleSend} disabled={sending} />
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
})
