// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import React from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { colors, spacing, typography } from '../core/theme'

interface HeaderProps {
  title: string
  subtitle?: string
  leftAction?: { label: string; onPress: () => void }
  rightAction?: { label: string; onPress: () => void }
}

export function Header({
  title,
  subtitle,
  leftAction,
  rightAction,
}: HeaderProps): React.JSX.Element {
  return (
    <View style={styles.container}>
      <View style={styles.side}>
        {leftAction && (
          <Pressable onPress={leftAction.onPress} hitSlop={8}>
            <Text style={styles.action}>{leftAction.label}</Text>
          </Pressable>
        )}
      </View>
      <View style={styles.center}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        {subtitle && (
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        )}
      </View>
      <View style={styles.side}>
        {rightAction && (
          <Pressable onPress={rightAction.onPress} hitSlop={8}>
            <Text style={styles.action}>{rightAction.label}</Text>
          </Pressable>
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  side: {
    width: 60,
  },
  center: {
    flex: 1,
    alignItems: 'center',
  },
  title: {
    ...typography.h3,
    color: colors.textPrimary,
  },
  subtitle: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  action: {
    ...typography.body,
    color: colors.primary,
  },
})
