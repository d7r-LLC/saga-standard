// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import React, { useCallback, useState } from 'react'
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { SafeArea } from '../../../components/SafeArea'
import { Header } from '../../../components/Header'
import { ListItem } from '../../../components/ListItem'
import { Button } from '../../../components/Button'
import { Card } from '../../../components/Card'
import { useStorage } from '../../../core/providers/StorageProvider'
import { SecureKeychain } from '../../../core/storage/keychain'
import { KEYCHAIN_MNEMONIC_PREFIX } from '../constants'
import { colors, spacing, typography } from '../../../core/theme'
import type { WalletStackParamList } from '../../../navigation/types'

type Props = NativeStackScreenProps<WalletStackParamList, 'WalletSettings'>

export function WalletSettings({ navigation, route }: Props): React.JSX.Element {
  const { wallets, deleteWallet } = useStorage()
  const wallet = wallets.find(w => w.id === route.params.walletId)

  const [showMnemonic, setShowMnemonic] = useState(false)
  const [mnemonic, setMnemonic] = useState<string | null>(null)

  const handleShowMnemonic = useCallback(async () => {
    if (!wallet) return
    if (showMnemonic) {
      setShowMnemonic(false)
      setMnemonic(null)
      return
    }

    Alert.alert(
      'Show Recovery Phrase',
      'Your recovery phrase gives full access to this wallet. Make sure no one is watching your screen.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Show',
          style: 'destructive',
          onPress: async () => {
            const stored = await SecureKeychain.get(`${KEYCHAIN_MNEMONIC_PREFIX}-${wallet.id}`)
            if (stored) {
              setMnemonic(stored)
              setShowMnemonic(true)
            } else {
              Alert.alert('Error', 'Mnemonic not found in keychain')
            }
          },
        },
      ]
    )
  }, [wallet, showMnemonic])

  const handleDelete = useCallback(() => {
    if (!wallet) return
    Alert.alert(
      'Delete Wallet',
      'This will remove the wallet from this device. Make sure you have backed up your recovery phrase.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await SecureKeychain.remove(`${KEYCHAIN_MNEMONIC_PREFIX}-${wallet.id}`)
            deleteWallet(wallet.id)
            navigation.goBack()
          },
        },
      ]
    )
  }, [wallet, deleteWallet, navigation])

  if (!wallet) {
    return (
      <SafeArea>
        <Header
          title="Settings"
          leftAction={{ label: 'Back', onPress: () => navigation.goBack() }}
        />
        <View style={styles.center}>
          <Text style={styles.errorText}>Wallet not found</Text>
        </View>
      </SafeArea>
    )
  }

  return (
    <SafeArea>
      <Header
        title="Wallet Settings"
        leftAction={{ label: 'Back', onPress: () => navigation.goBack() }}
      />
      <ScrollView contentContainerStyle={styles.content}>
        <Card>
          <Text style={styles.sectionTitle}>WALLET INFO</Text>
          <ListItem title="Name" rightText={wallet.label} />
          <ListItem title="Type" rightText={wallet.type} />
          <ListItem title="Chain" rightText={wallet.chain} />
          <ListItem title="Address" rightText={`${wallet.address.slice(0, 10)}...`} />
          {wallet.derivationPath && (
            <ListItem title="Derivation Path" rightText={wallet.derivationPath} />
          )}
        </Card>

        {wallet.type === 'self-custody' && (
          <Card>
            <Text style={styles.sectionTitle}>BACKUP</Text>
            <Button
              title={showMnemonic ? 'Hide Recovery Phrase' : 'Show Recovery Phrase'}
              onPress={handleShowMnemonic}
              variant="secondary"
            />
            {showMnemonic && mnemonic && (
              <View style={styles.mnemonicContainer}>
                {mnemonic.split(' ').map((word, i) => (
                  <View key={i} style={styles.wordRow}>
                    <Text style={styles.wordIndex}>{i + 1}.</Text>
                    <Text style={styles.word}>{word}</Text>
                  </View>
                ))}
              </View>
            )}
          </Card>
        )}

        <View style={styles.dangerZone}>
          <Button title="Delete Wallet" onPress={handleDelete} variant="ghost" />
        </View>
      </ScrollView>
    </SafeArea>
  )
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sectionTitle: {
    ...typography.label,
    color: colors.textTertiary,
    marginBottom: spacing.sm,
  },
  mnemonicContainer: {
    marginTop: spacing.md,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  wordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '45%',
    gap: spacing.xs,
  },
  wordIndex: {
    ...typography.caption,
    color: colors.textTertiary,
    width: 24,
    textAlign: 'right',
  },
  word: {
    ...typography.mono,
    color: colors.textPrimary,
  },
  dangerZone: {
    marginTop: spacing.xl,
    alignItems: 'center',
  },
  errorText: {
    ...typography.body,
    color: colors.error,
  },
})
