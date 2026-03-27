// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import React from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { colors, spacing, typography } from '../../../core/theme'
import type { TransactionRecord } from '../types'

interface TransactionItemProps {
  tx: TransactionRecord
  onPress?: () => void
}

export function TransactionItem({ tx, onPress }: TransactionItemProps): React.JSX.Element {
  const isSend = tx.type === 'send'
  const prefix = isSend ? '-' : '+'
  const color = isSend ? colors.error : colors.success
  const shortHash = `${tx.hash.slice(0, 8)}...${tx.hash.slice(-6)}`
  const shortAddress = isSend
    ? `To: ${tx.to.slice(0, 6)}...${tx.to.slice(-4)}`
    : `From: ${tx.from.slice(0, 6)}...${tx.from.slice(-4)}`
  const date = new Date(tx.timestamp * 1000).toLocaleDateString()

  const content = (
    <View style={styles.container}>
      <View style={styles.left}>
        <Text style={styles.type}>{isSend ? 'Sent' : 'Received'}</Text>
        <Text style={styles.address}>{shortAddress}</Text>
        <Text style={styles.hash}>{shortHash}</Text>
      </View>
      <View style={styles.right}>
        <Text style={[styles.amount, { color }]}>
          {prefix}
          {tx.value} {tx.tokenSymbol ?? 'ETH'}
        </Text>
        <Text style={styles.date}>{date}</Text>
        <Text style={[styles.status, tx.status === 'pending' && styles.pending]}>{tx.status}</Text>
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
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  left: {
    flex: 1,
    gap: 2,
  },
  right: {
    alignItems: 'flex-end',
    gap: 2,
  },
  type: {
    ...typography.body,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  address: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  hash: {
    ...typography.caption,
    color: colors.textTertiary,
  },
  amount: {
    ...typography.body,
    fontWeight: '600',
  },
  date: {
    ...typography.caption,
    color: colors.textTertiary,
  },
  status: {
    ...typography.caption,
    color: colors.success,
  },
  pending: {
    color: colors.warning,
  },
  pressed: {
    backgroundColor: colors.surfacePressed,
  },
})
