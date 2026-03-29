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
