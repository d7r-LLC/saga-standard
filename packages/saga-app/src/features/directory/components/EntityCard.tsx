// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import React from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { Card } from '../../../components/Card'
import { Badge } from '../../../components/Badge'
import { colors, spacing, typography } from '../../../core/theme'
import type { EntityCardData } from '../types'

interface EntityCardProps {
  entity: EntityCardData
  onPress: () => void
}

function truncateAddress(addr: string): string {
  if (addr.length <= 12) return addr
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`
}

export function EntityCard({ entity, onPress }: EntityCardProps): React.JSX.Element {
  return (
    <Card onPress={onPress} style={styles.card}>
      <View style={styles.topRow}>
        <Badge
          label={entity.entityType === 'agent' ? 'AGENT' : 'ORG'}
          variant={entity.entityType}
        />
        <Text style={styles.chain}>{entity.chain}</Text>
      </View>
      <Text style={styles.handle}>@{entity.handle}</Text>
      <Text style={styles.wallet}>{truncateAddress(entity.walletAddress)}</Text>
    </Card>
  )
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  handle: {
    ...typography.h3,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  wallet: {
    ...typography.bodySmall,
    color: colors.textTertiary,
  },
  chain: {
    ...typography.caption,
    color: colors.textSecondary,
  },
})
