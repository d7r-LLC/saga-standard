// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import React from 'react'
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'
import { colors, spacing, typography } from '../core/theme'

interface LoadingSpinnerProps {
  message?: string
  size?: 'small' | 'large'
}

export function LoadingSpinner({
  message,
  size = 'large',
}: LoadingSpinnerProps): React.JSX.Element {
  return (
    <View style={styles.container}>
      <ActivityIndicator size={size} color={colors.primary} />
      {message && <Text style={styles.message}>{message}</Text>}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.lg,
  },
  message: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
})
