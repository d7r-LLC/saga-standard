// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import React, { useCallback, useState } from 'react'
import { Alert, FlatList, StyleSheet, Text, View } from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { SafeArea } from '../../../components/SafeArea'
import { Button } from '../../../components/Button'
import { Header } from '../../../components/Header'
import { useStorage } from '../../../core/providers/StorageProvider'
import { colors, spacing, typography } from '../../../core/theme'
import { SelfCustodyWallet } from '../class'
import { SecureKeychain } from '../../../core/storage/keychain'
import { KEYCHAIN_MNEMONIC_PREFIX } from '../constants'
import { WalletCard } from '../components/WalletCard'
import type { WalletStackParamList } from '../../../navigation/types'

type Props = NativeStackScreenProps<WalletStackParamList, 'WalletOverview'>

export function WalletOverview({ navigation }: Props): React.JSX.Element {
  const { wallets, activeWalletId, addWallet, setActiveWallet } = useStorage()
  const [creating, setCreating] = useState(false)

  const handleCreateWallet = useCallback(async () => {
    setCreating(true)
    try {
      const walletId = `w-${Date.now()}`
      const wallet = SelfCustodyWallet.createNew({
        id: walletId,
        label: `Wallet ${wallets.length + 1}`,
        chain: 'base-sepolia',
      })

      // Store mnemonic in keychain
      await SecureKeychain.set(`${KEYCHAIN_MNEMONIC_PREFIX}-${walletId}`, wallet.exportMnemonic())

      // Add wallet metadata to StorageProvider (persisted to Realm)
      addWallet({
        id: walletId,
        type: 'self-custody',
        label: wallet.label,
        address: wallet.address,
        chain: wallet.chain,
        balance: '0',
        derivationPath: wallet.derivationPath,
      })

      setActiveWallet(walletId)
    } catch {
      Alert.alert('Error', 'Failed to create wallet')
    } finally {
      setCreating(false)
    }
  }, [wallets.length, addWallet, setActiveWallet])

  return (
    <SafeArea>
      <Header title="Wallets" />
      {wallets.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No Wallets</Text>
          <Text style={styles.emptySubtitle}>Create a wallet to get started</Text>
          <Button title="Create Wallet" onPress={handleCreateWallet} loading={creating} size="lg" />
        </View>
      ) : (
        <FlatList
          data={wallets}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <WalletCard
              wallet={item}
              isActive={item.id === activeWalletId}
              onPress={() => navigation.navigate('WalletDetail', { walletId: item.id })}
            />
          )}
          ListFooterComponent={
            <Button
              title="Create New Wallet"
              onPress={handleCreateWallet}
              loading={creating}
              variant="secondary"
              style={styles.createButton}
            />
          }
        />
      )}
    </SafeArea>
  )
}

const styles = StyleSheet.create({
  empty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
    gap: spacing.lg,
  },
  emptyTitle: {
    ...typography.h2,
    color: colors.textPrimary,
  },
  emptySubtitle: {
    ...typography.body,
    color: colors.textSecondary,
  },
  list: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  createButton: {
    marginTop: spacing.lg,
  },
})
