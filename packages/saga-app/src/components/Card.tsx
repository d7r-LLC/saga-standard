// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import React from 'react'
import { Pressable, StyleSheet, View, ViewStyle } from 'react-native'
import { borderRadius, colors, spacing } from '../core/theme'

interface CardProps {
  children: React.ReactNode
  onPress?: () => void
  style?: ViewStyle
}

export function Card({ children, onPress, style }: CardProps): React.JSX.Element {
  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.card, pressed && styles.pressed, style]}
      >
        {children}
      </Pressable>
    )
  }

  return <View style={[styles.card, style]}>{children}</View>
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pressed: {
    backgroundColor: colors.surfacePressed,
  },
})
