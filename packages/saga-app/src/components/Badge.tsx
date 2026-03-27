// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import React from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { borderRadius, colors, spacing, typography } from '../core/theme'

interface BadgeProps {
  label: string
  variant?: 'agent' | 'org' | 'directory' | 'default'
}

const badgeColors = {
  agent: colors.agent,
  org: colors.org,
  directory: colors.directory,
  default: colors.textTertiary,
}

export function Badge({ label, variant = 'default' }: BadgeProps): React.JSX.Element {
  return (
    <View style={[styles.badge, { backgroundColor: `${badgeColors[variant]}20` }]}>
      <Text style={[styles.label, { color: badgeColors[variant] }]}>{label}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  badge: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.sm,
  },
  label: {
    ...typography.caption,
    fontWeight: '600',
  },
})
