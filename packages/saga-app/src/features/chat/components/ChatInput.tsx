// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import React, { useState } from 'react'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { borderRadius, colors, spacing, typography } from '../../../core/theme'

interface ChatInputProps {
  onSend: (text: string) => void
  disabled?: boolean
  placeholder?: string
}

export function ChatInput({
  onSend,
  disabled = false,
  placeholder = 'Type a message...',
}: ChatInputProps): React.JSX.Element {
  const [text, setText] = useState('')

  const canSend = text.trim().length > 0 && !disabled

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
        editable={!disabled}
        accessibilityLabel="Message input"
      />
      <Pressable
        onPress={handleSend}
        disabled={!canSend}
        style={[styles.sendButton, !canSend && styles.sendButtonDisabled]}
        accessibilityLabel="Send message"
        accessibilityRole="button"
      >
        <Text style={[styles.sendIcon, !canSend && styles.sendIconDisabled]}>{'>'}</Text>
      </Pressable>
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
})
