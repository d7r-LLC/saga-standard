// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import React from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { Badge } from '../../../components/Badge'
import { borderRadius, colors, spacing, typography } from '../../../core/theme'
import type { IdentityData } from '../types'

interface IdentityCardProps {
  identity: IdentityData
  onPress?: () => void
  isActive?: boolean
}

export function IdentityCard({
  identity,
  onPress,
  isActive,
}: IdentityCardProps): React.JSX.Element {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, isActive && styles.active, pressed && styles.pressed]}
    >
      <View style={styles.header}>
        <Badge label={identity.type.toUpperCase()} variant={identity.type} />
        {isActive && <Text style={styles.activeLabel}>Active</Text>}
      </View>
      <Text style={styles.handle}>@{identity.handle}</Text>
      <Text style={styles.detail} numberOfLines={1}>
        TBA: {identity.tbaAddress || 'Not created'}
      </Text>
      {identity.hubUrl ? (
        <Text style={styles.detail} numberOfLines={1}>
          Hub: {identity.hubUrl}
        </Text>
      ) : null}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  active: {
    borderColor: colors.primary,
  },
  pressed: {
    backgroundColor: colors.surfacePressed,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  activeLabel: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: '600',
  },
  handle: {
    ...typography.h3,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  detail: {
    ...typography.bodySmall,
    color: colors.textTertiary,
    marginTop: 2,
  },
})
