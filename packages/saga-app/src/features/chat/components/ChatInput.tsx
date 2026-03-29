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
