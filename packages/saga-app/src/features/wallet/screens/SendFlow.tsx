// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import React, { useCallback, useState } from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { SafeArea } from '../../../components/SafeArea'
import { Header } from '../../../components/Header'
import { Button } from '../../../components/Button'
import { TextInput } from '../../../components/TextInput'
import { Card } from '../../../components/Card'
import { useStorage } from '../../../core/providers/StorageProvider'
import { colors, spacing, typography } from '../../../core/theme'
import { KEYCHAIN_MNEMONIC_PREFIX } from '../constants'
import type { WalletStackParamList } from '../../../navigation/types'
import type { ChainId } from '../types'

type Props = NativeStackScreenProps<WalletStackParamList, 'SendFlow'>

type Step = 'input' | 'confirm' | 'sending' | 'done'

export function SendFlow({ navigation, route }: Props): React.JSX.Element {
  const { wallets } = useStorage()
  const wallet = wallets.find(w => w.id === route.params.walletId)

  const [step, setStep] = useState<Step>('input')
  const [toAddress, setToAddress] = useState('')
  const [amount, setAmount] = useState('')
  const [txHash, setTxHash] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const isValidAddress = /^0x[0-9a-fA-F]{40}$/.test(toAddress)
  const isValidAmount = !isNaN(Number(amount)) && Number(amount) > 0

  const handleConfirm = useCallback(() => {
    if (!isValidAddress || !isValidAmount) return
    setStep('confirm')
  }, [isValidAddress, isValidAmount])

  const handleSend = useCallback(async () => {
    if (!wallet) return
    setStep('sending')
    setError(null)

    try {
      // Load mnemonic from keychain
      const { SecureKeychain } = await import('../../../core/storage/keychain')
      const mnemonic = await SecureKeychain.get(`${KEYCHAIN_MNEMONIC_PREFIX}-${wallet.id}`)
      if (!mnemonic) {
        throw new Error('Wallet mnemonic not found')
      }

      // Use viem to send the transaction
      const { createWalletClient, http, parseEther } = await import('viem')
      const { mnemonicToAccount } = await import('viem/accounts')
      const { CHAINS } = await import('../constants')

      const chainId = wallet.chain as ChainId
      const account = mnemonicToAccount(mnemonic, {
        path: (wallet.derivationPath || "m/44'/60'/0'/0/0") as `m/44'/60'/${string}`,
      })

      const walletClient = createWalletClient({
        account,
        chain: CHAINS[chainId],
        transport: http(),
      })

      const hash = await walletClient.sendTransaction({
        to: toAddress as `0x${string}`,
        value: parseEther(amount),
      })

      setTxHash(hash)
      setStep('done')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Transaction failed'
      setError(message)
      setStep('confirm')
    }
  }, [wallet, toAddress, amount])

  if (!wallet) {
    return (
      <SafeArea>
        <Header title="Send" leftAction={{ label: 'Back', onPress: () => navigation.goBack() }} />
        <View style={styles.center}>
          <Text style={styles.errorText}>Wallet not found</Text>
        </View>
      </SafeArea>
    )
  }

  return (
    <SafeArea>
      <Header
        title="Send"
        leftAction={
          step === 'input' ? { label: 'Back', onPress: () => navigation.goBack() } : undefined
        }
      />
      <ScrollView contentContainerStyle={styles.content}>
        {step === 'input' && (
          <>
            <TextInput
              label="TO ADDRESS"
              placeholder="0x..."
              value={toAddress}
              onChangeText={setToAddress}
              autoCapitalize="none"
              autoCorrect={false}
              error={toAddress.length > 0 && !isValidAddress ? 'Invalid address' : undefined}
            />
            <TextInput
              label="AMOUNT (ETH)"
              placeholder="0.0"
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
              error={amount.length > 0 && !isValidAmount ? 'Invalid amount' : undefined}
            />
            <Text style={styles.balanceHint}>Balance: {wallet.balance} ETH</Text>
            <Button
              title="Review"
              onPress={handleConfirm}
              disabled={!isValidAddress || !isValidAmount}
              size="lg"
            />
          </>
        )}

        {step === 'confirm' && (
          <>
            <Card>
              <Text style={styles.confirmLabel}>TO</Text>
              <Text style={styles.confirmValue}>
                {toAddress.slice(0, 10)}...{toAddress.slice(-8)}
              </Text>
              <Text style={styles.confirmLabel}>AMOUNT</Text>
              <Text style={styles.confirmValue}>{amount} ETH</Text>
              <Text style={styles.confirmLabel}>FROM</Text>
              <Text style={styles.confirmValue}>{wallet.label}</Text>
              <Text style={styles.confirmLabel}>NETWORK</Text>
              <Text style={styles.confirmValue}>{wallet.chain}</Text>
            </Card>
            {error && <Text style={styles.errorText}>{error}</Text>}
            <Button title="Confirm & Send" onPress={handleSend} size="lg" />
            <Button title="Edit" onPress={() => setStep('input')} variant="secondary" size="lg" />
          </>
        )}

        {step === 'sending' && (
          <View style={styles.center}>
            <Text style={styles.sendingText}>Sending transaction...</Text>
          </View>
        )}

        {step === 'done' && (
          <>
            <View style={styles.center}>
              <Text style={styles.doneTitle}>Transaction Sent</Text>
              {txHash && (
                <Text style={styles.txHash}>
                  {txHash.slice(0, 10)}...{txHash.slice(-8)}
                </Text>
              )}
            </View>
            <Button title="Done" onPress={() => navigation.goBack()} size="lg" />
          </>
        )}
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
    paddingVertical: spacing.xxxl,
  },
  balanceHint: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  confirmLabel: {
    ...typography.label,
    color: colors.textTertiary,
    marginTop: spacing.md,
  },
  confirmValue: {
    ...typography.body,
    color: colors.textPrimary,
    marginTop: spacing.xs,
  },
  errorText: {
    ...typography.body,
    color: colors.error,
    textAlign: 'center',
  },
  sendingText: {
    ...typography.h3,
    color: colors.textSecondary,
  },
  doneTitle: {
    ...typography.h2,
    color: colors.success,
    marginBottom: spacing.md,
  },
  txHash: {
    ...typography.mono,
    color: colors.textSecondary,
  },
})
