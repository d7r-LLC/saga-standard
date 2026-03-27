// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import React from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { colors, spacing, typography } from '../core/theme'

interface ListItemProps {
  title: string
  subtitle?: string
  rightText?: string
  onPress?: () => void
  showChevron?: boolean
}

export function ListItem({
  title,
  subtitle,
  rightText,
  onPress,
  showChevron = false,
}: ListItemProps): React.JSX.Element {
  const content = (
    <View style={styles.container}>
      <View style={styles.left}>
        <Text style={styles.title}>{title}</Text>
        {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
      </View>
      <View style={styles.right}>
        {rightText && <Text style={styles.rightText}>{rightText}</Text>}
        {showChevron && <Text style={styles.chevron}>›</Text>}
      </View>
    </View>
  )

  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => pressed && styles.pressed}>
        {content}
      </Pressable>
    )
  }

  return content
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  left: {
    flex: 1,
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  title: {
    ...typography.body,
    color: colors.textPrimary,
  },
  subtitle: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginTop: 2,
  },
  rightText: {
    ...typography.bodySmall,
    color: colors.textTertiary,
  },
  chevron: {
    ...typography.h2,
    color: colors.textTertiary,
  },
  pressed: {
    backgroundColor: colors.surfacePressed,
  },
})
