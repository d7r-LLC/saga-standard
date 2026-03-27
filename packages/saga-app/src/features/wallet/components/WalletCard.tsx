// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import React from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { borderRadius, colors, spacing, typography } from '../../../core/theme'
import { Badge } from '../../../components/Badge'
import type { Wallet } from '../../../core/providers/StorageProvider'

interface WalletCardProps {
  wallet: Wallet
  isActive: boolean
  onPress: () => void
}

export function WalletCard({ wallet, isActive, onPress }: WalletCardProps): React.JSX.Element {
  const shortAddress = `${wallet.address.slice(0, 6)}...${wallet.address.slice(-4)}`

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        isActive && styles.activeCard,
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.header}>
        <Text style={styles.label}>{wallet.label}</Text>
        <Badge
          label={wallet.type === 'self-custody' ? 'Self-Custody' : 'Managed'}
          variant={wallet.type === 'self-custody' ? 'agent' : 'org'}
        />
      </View>
      <Text style={styles.balance}>{wallet.balance} ETH</Text>
      <Text style={styles.address}>{shortAddress}</Text>
      <Text style={styles.chain}>{wallet.chain}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.xs,
  },
  activeCard: {
    borderColor: colors.primary,
    borderWidth: 2,
  },
  pressed: {
    backgroundColor: colors.surfacePressed,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  label: {
    ...typography.h3,
    color: colors.textPrimary,
  },
  balance: {
    ...typography.h1,
    color: colors.textPrimary,
    marginTop: spacing.sm,
  },
  address: {
    ...typography.mono,
    color: colors.textSecondary,
  },
  chain: {
    ...typography.caption,
    color: colors.textTertiary,
  },
})
