// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import React from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { borderRadius, colors, spacing, typography } from '../../../core/theme'

interface MessageBubbleProps {
  role: 'user' | 'assistant' | 'system'
  content: string
  testID?: string
}

export function MessageBubble({ role, content, testID }: MessageBubbleProps): React.JSX.Element {
  if (role === 'system') {
    return (
      <View style={styles.systemRow} testID={testID}>
        <Text style={styles.systemText}>{content}</Text>
      </View>
    )
  }

  const isUser = role === 'user'

  return (
    <View
      style={[styles.row, isUser ? styles.rowUser : styles.rowAssistant]}
      testID={testID}
    >
      <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAssistant]}>
        <Text style={[styles.bubbleText, isUser ? styles.textUser : styles.textAssistant]}>
          {content}
        </Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
  },
  rowUser: {
    alignItems: 'flex-end',
  },
  rowAssistant: {
    alignItems: 'flex-start',
  },
  bubble: {
    maxWidth: '80%',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  bubbleUser: {
    backgroundColor: colors.primary,
    borderTopLeftRadius: borderRadius.lg,
    borderTopRightRadius: borderRadius.lg,
    borderBottomLeftRadius: borderRadius.lg,
    borderBottomRightRadius: borderRadius.sm,
  },
  bubbleAssistant: {
    backgroundColor: colors.surfaceElevated,
    borderTopLeftRadius: borderRadius.lg,
    borderTopRightRadius: borderRadius.lg,
    borderBottomLeftRadius: borderRadius.sm,
    borderBottomRightRadius: borderRadius.lg,
  },
  bubbleText: {
    ...typography.body,
  },
  textUser: {
    color: colors.textInverse,
  },
  textAssistant: {
    color: colors.textPrimary,
  },
  systemRow: {
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
  },
  systemText: {
    ...typography.caption,
    color: colors.textTertiary,
    textAlign: 'center',
  },
})
