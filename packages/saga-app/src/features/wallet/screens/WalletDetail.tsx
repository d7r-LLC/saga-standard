// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import React from 'react'
import { FlatList, StyleSheet, Text, View } from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { SafeArea } from '../../../components/SafeArea'
import { Header } from '../../../components/Header'
import { Button } from '../../../components/Button'
import { Card } from '../../../components/Card'
import { useStorage } from '../../../core/providers/StorageProvider'
import { useBalance } from '../hooks/useBalance'
import { useTransactions } from '../hooks/useTransactions'
import { TransactionItem } from '../components/TransactionItem'
import { colors, spacing, typography } from '../../../core/theme'
import type { WalletStackParamList } from '../../../navigation/types'
import type { ChainId } from '../types'

type Props = NativeStackScreenProps<WalletStackParamList, 'WalletDetail'>

export function WalletDetail({ navigation, route }: Props): React.JSX.Element {
  const { wallets } = useStorage()
  const wallet = wallets.find(w => w.id === route.params.walletId)

  const address = wallet?.address as `0x${string}` | null
  const chainId = (wallet?.chain ?? 'base-sepolia') as ChainId

  const { balances, loading: balanceLoading } = useBalance(address ?? null, chainId)
  const { transactions } = useTransactions(address ?? null, chainId)

  if (!wallet) {
    return (
      <SafeArea>
        <Header title="Wallet" leftAction={{ label: 'Back', onPress: () => navigation.goBack() }} />
        <View style={styles.center}>
          <Text style={styles.errorText}>Wallet not found</Text>
        </View>
      </SafeArea>
    )
  }

  const shortAddress = `${wallet.address.slice(0, 6)}...${wallet.address.slice(-4)}`

  return (
    <SafeArea>
      <Header
        title={wallet.label}
        subtitle={shortAddress}
        leftAction={{ label: 'Back', onPress: () => navigation.goBack() }}
        rightAction={{
          label: 'Settings',
          onPress: () => navigation.navigate('WalletSettings', { walletId: wallet.id }),
        }}
      />
      <FlatList
        data={transactions}
        keyExtractor={item => item.hash}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <>
            <Card style={styles.balanceCard}>
              {balanceLoading ? (
                <Text style={styles.loadingText}>Loading balances...</Text>
              ) : (
                balances.map(token => (
                  <View key={token.symbol} style={styles.tokenRow}>
                    <Text style={styles.tokenSymbol}>{token.symbol}</Text>
                    <Text style={styles.tokenBalance}>{token.balance}</Text>
                  </View>
                ))
              )}
            </Card>

            <View style={styles.actions}>
              <Button
                title="Send"
                onPress={() => navigation.navigate('SendFlow', { walletId: wallet.id })}
                style={styles.actionButton}
              />
              <Button
                title="Receive"
                onPress={() =>
                  navigation.navigate('ReceiveScreen', {
                    walletId: wallet.id,
                    address: wallet.address,
                  })
                }
                variant="secondary"
                style={styles.actionButton}
              />
            </View>

            <Text style={styles.sectionTitle}>TRANSACTIONS</Text>
            {transactions.length === 0 && <Text style={styles.emptyText}>No transactions yet</Text>}
          </>
        }
        renderItem={({ item }) => <TransactionItem tx={item} />}
      />
    </SafeArea>
  )
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.lg,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  balanceCard: {
    gap: spacing.sm,
  },
  tokenRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  tokenSymbol: {
    ...typography.body,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  tokenBalance: {
    ...typography.h3,
    color: colors.textPrimary,
  },
  loadingText: {
    ...typography.body,
    color: colors.textTertiary,
    textAlign: 'center',
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  actionButton: {
    flex: 1,
  },
  sectionTitle: {
    ...typography.label,
    color: colors.textTertiary,
    marginTop: spacing.xl,
    marginBottom: spacing.md,
  },
  emptyText: {
    ...typography.body,
    color: colors.textTertiary,
    textAlign: 'center',
    paddingVertical: spacing.xl,
  },
  errorText: {
    ...typography.body,
    color: colors.error,
  },
})
