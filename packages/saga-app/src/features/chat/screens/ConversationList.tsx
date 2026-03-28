// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import React from 'react'
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { SafeArea } from '../../../components/SafeArea'
import { Header } from '../../../components/Header'
import { LoadingSpinner } from '../../../components/LoadingSpinner'
import { Button } from '../../../components/Button'
import { useConversations } from '../hooks/useConversations'
import { useStorage } from '../../../core/providers/StorageProvider'
import { colors, spacing, typography } from '../../../core/theme'
import type { MessagesStackParamList } from '../../../navigation/types'
import type { Conversation } from '../types'

type Props = NativeStackScreenProps<MessagesStackParamList, 'ConversationList'>

function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  if (diffDays === 0) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }
  if (diffDays === 1) {
    return 'Yesterday'
  }
  if (diffDays < 7) {
    return date.toLocaleDateString([], { weekday: 'short' })
  }
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

export function ConversationList({ navigation }: Props): React.JSX.Element {
  const { identities, activeIdentityId } = useStorage()
  const activeIdentity = identities.find(i => i.id === activeIdentityId)
  const agentHandle = activeIdentity?.handle ?? ''

  const { conversations, loading, error, refresh, remove } = useConversations(agentHandle)

  function handleDelete(item: Conversation): void {
    Alert.alert('Delete conversation', `Delete "${item.title ?? 'New conversation'}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await remove(item.id)
          } catch {
            Alert.alert('Delete failed', 'Unable to delete this conversation. Please try again.')
            refresh()
          }
        },
      },
    ])
  }

  const renderItem = ({ item }: { item: Conversation }) => (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      onPress={() =>
        navigation.navigate('ChatScreen', {
          conversationId: item.id,
          title: item.title ?? undefined,
        })
      }
      onLongPress={() => handleDelete(item)}
      accessibilityRole="button"
      accessibilityLabel={item.title ?? 'New conversation'}
    >
      <View style={styles.rowContent}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {item.title ?? 'New conversation'}
        </Text>
        <View style={styles.rowMeta}>
          <Text style={styles.rowModel} numberOfLines={1}>
            {item.model}
          </Text>
          <Text style={styles.rowDate}>{formatDate(item.updatedAt)}</Text>
        </View>
      </View>
    </Pressable>
  )

  const isInitialLoad = loading && conversations.length === 0

  if (!activeIdentity) {
    return (
      <SafeArea>
        <Header title="Messages" />
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>No identity set</Text>
          <Text style={styles.emptySubtitle}>
            Set up an identity in the Profile tab to start chatting.
          </Text>
        </View>
      </SafeArea>
    )
  }

  return (
    <SafeArea>
      <Header
        title="Messages"
        rightAction={{ label: 'New', onPress: () => navigation.navigate('NewChat') }}
      />
      {isInitialLoad ? (
        <LoadingSpinner message="Loading conversations..." />
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>{error}</Text>
          <Button title="Retry" onPress={refresh} variant="secondary" style={styles.retryButton} />
        </View>
      ) : conversations.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>No conversations yet</Text>
          <Text style={styles.emptySubtitle}>Start a conversation with any AI provider.</Text>
          <Button
            title="Start a conversation"
            onPress={() => navigation.navigate('NewChat')}
            style={styles.emptyButton}
          />
        </View>
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          refreshing={loading}
          onRefresh={refresh}
          contentContainerStyle={styles.list}
        />
      )}
    </SafeArea>
  )
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  errorText: {
    ...typography.body,
    color: colors.error,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  retryButton: {
    marginTop: spacing.md,
  },
  emptyTitle: {
    ...typography.h2,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  emptySubtitle: {
    ...typography.body,
    color: colors.textTertiary,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  emptyButton: {
    minWidth: 200,
  },
  list: {
    paddingVertical: spacing.sm,
  },
  row: {
    backgroundColor: colors.surface,
    marginHorizontal: spacing.lg,
    marginVertical: spacing.sm / 2,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rowPressed: {
    backgroundColor: colors.surfacePressed,
  },
  rowContent: {
    padding: spacing.lg,
  },
  rowTitle: {
    ...typography.body,
    color: colors.textPrimary,
    fontWeight: '600',
    marginBottom: spacing.sm / 2,
  },
  rowMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  rowModel: {
    ...typography.bodySmall,
    color: colors.textTertiary,
    flex: 1,
  },
  rowDate: {
    ...typography.caption,
    color: colors.textTertiary,
  },
})
