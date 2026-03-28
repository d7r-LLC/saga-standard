// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import React, { useState } from 'react'
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { SafeArea } from '../../../components/SafeArea'
import { Header } from '../../../components/Header'
import { Button } from '../../../components/Button'
import { Card } from '../../../components/Card'
import { useConversations } from '../hooks/useConversations'
import { useStorage } from '../../../core/providers/StorageProvider'
import { borderRadius, colors, spacing, typography } from '../../../core/theme'
import type { MessagesStackParamList } from '../../../navigation/types'
import { CHAT_PROVIDERS } from '../types'
import type { ChatConfig } from '../types'

type Props = NativeStackScreenProps<MessagesStackParamList, 'NewChat'>

export function NewChat({ navigation }: Props): React.JSX.Element {
  const { identities, activeIdentityId } = useStorage()
  const activeIdentity = identities.find(i => i.id === activeIdentityId)
  const agentHandle = activeIdentity?.handle ?? ''

  const { create } = useConversations(agentHandle)

  const [selectedConfig, setSelectedConfig] = useState<ChatConfig | null>(null)
  const [systemPrompt, setSystemPrompt] = useState('')
  const [creating, setCreating] = useState(false)

  if (!agentHandle) {
    return (
      <SafeArea>
        <Header
          title="New Chat"
          leftAction={{ label: 'Back', onPress: () => navigation.goBack() }}
        />
        <View style={styles.center}>
          <Text style={styles.noIdentityText}>
            Set up an identity in the Profile tab to start chatting.
          </Text>
        </View>
      </SafeArea>
    )
  }

  async function handleCreate(): Promise<void> {
    if (!selectedConfig) return

    setCreating(true)
    try {
      const conversation = await create({
        agentHandle,
        provider: selectedConfig.provider,
        model: selectedConfig.model,
        systemPrompt: systemPrompt.trim() || undefined,
      })
      navigation.replace('ChatScreen', {
        conversationId: conversation.id,
        title: conversation.title ?? undefined,
      })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      Alert.alert('Failed to create conversation', message)
    } finally {
      setCreating(false)
    }
  }

  return (
    <SafeArea>
      <Header
        title="New Chat"
        leftAction={{ label: 'Back', onPress: () => navigation.goBack() }}
      />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.sectionLabel}>Model</Text>
        {CHAT_PROVIDERS.map(config => {
          const isSelected =
            selectedConfig?.provider === config.provider &&
            selectedConfig?.model === config.model
          return (
            <Card
              key={`${config.provider}-${config.model}`}
              onPress={() => setSelectedConfig(config)}
              style={[styles.providerCard, isSelected && styles.providerCardSelected]}
            >
              <Text style={styles.providerLabel}>{config.label}</Text>
              <Text style={styles.providerModel}>{config.model}</Text>
            </Card>
          )
        })}

        <Text style={[styles.sectionLabel, styles.sectionLabelSpaced]}>
          System Prompt (optional)
        </Text>
        <TextInput
          style={styles.input}
          placeholder="Enter a system prompt..."
          placeholderTextColor={colors.textTertiary}
          value={systemPrompt}
          onChangeText={setSystemPrompt}
          multiline
          numberOfLines={4}
          textAlignVertical="top"
          accessibilityLabel="System prompt"
        />

        <Button
          title="Start Conversation"
          onPress={handleCreate}
          disabled={!selectedConfig}
          loading={creating}
          style={styles.createButton}
          size="lg"
        />
      </ScrollView>
    </SafeArea>
  )
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  sectionLabel: {
    ...typography.label,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  sectionLabelSpaced: {
    marginTop: spacing.xl,
  },
  providerCard: {
    marginBottom: spacing.sm,
  },
  providerCardSelected: {
    borderColor: colors.primary,
    borderWidth: 2,
  },
  providerLabel: {
    ...typography.body,
    color: colors.textPrimary,
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
  providerModel: {
    ...typography.bodySmall,
    color: colors.textTertiary,
  },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    color: colors.textPrimary,
    ...typography.body,
    minHeight: 100,
  },
  createButton: {
    marginTop: spacing.xl,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  noIdentityText: {
    ...typography.body,
    color: colors.textTertiary,
    textAlign: 'center',
  },
})
