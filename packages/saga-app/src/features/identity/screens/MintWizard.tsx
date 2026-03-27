// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import React, { useState } from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Button } from '../../../components/Button'
import { SafeArea } from '../../../components/SafeArea'
import { Header } from '../../../components/Header'
import { TextInput } from '../../../components/TextInput'
import { LoadingSpinner } from '../../../components/LoadingSpinner'
import { Card } from '../../../components/Card'
import { Badge } from '../../../components/Badge'
import { colors, spacing, typography } from '../../../core/theme'
import { useMint } from '../hooks/useMint'
import { useHandle } from '../hooks/useHandle'
import { HandleChecker } from '../components/HandleChecker'
import { useStorage } from '../../../core/providers/StorageProvider'
import { useWalletSigner } from '../../wallet/hooks/useWalletSigner'
import type { ProfileStackParamList } from '../../../navigation/types'
import type { EntityType, MintEntityType } from '../types'

type Props = NativeStackScreenProps<ProfileStackParamList, 'MintWizard'>

export function MintWizard({ navigation }: Props): React.JSX.Element {
  const mint = useMint()
  const handle = useHandle()
  const { wallets, activeWalletId } = useStorage()
  const { state } = mint

  const [selectedWalletId, setSelectedWalletId] = useState<string | null>(activeWalletId)
  const signer = useWalletSigner(selectedWalletId)

  const handleCancel = () => {
    mint.reset()
    handle.reset()
    navigation.goBack()
  }

  const handleMint = async () => {
    try {
      const walletClient = await signer.getWalletClient()
      await mint.executeMint(walletClient)
    } catch {
      // Error is set in signer.error or useMint state.error
    }
  }

  return (
    <SafeArea>
      <Header title="Mint Identity" leftAction={{ label: 'Cancel', onPress: handleCancel }} />
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        {state.step === 'type' && <TypeSelection onSelect={mint.selectType} />}
        {state.step === 'handle' && (
          <HandleEntry
            entityType={state.entityType!}
            handleStatus={handle.status}
            currentHandle={state.handle}
            orgName={state.orgName}
            hubUrl={state.hubUrl}
            onCheck={handle.checkAvailability}
            onChangeHandle={mint.setHandle}
            onChangeOrgName={mint.setOrgName}
            onChangeHubUrl={mint.setHubUrl}
            onConfirm={mint.confirmHandle}
            onBack={() => {
              mint.reset()
              handle.reset()
            }}
          />
        )}
        {state.step === 'confirm' && (
          <Confirmation
            state={state}
            wallets={wallets}
            selectedWalletId={selectedWalletId}
            onSelectWallet={setSelectedWalletId}
            signerError={signer.error}
            signing={signer.signing}
            onMint={handleMint}
            onBack={() => mint.reset()}
          />
        )}
        {state.step === 'minting' && (
          <View style={styles.center}>
            <LoadingSpinner />
            <Text style={styles.mintingText}>Minting your identity...</Text>
            <Text style={styles.mintingSubtext}>Waiting for transaction confirmation</Text>
          </View>
        )}
        {state.step === 'done' && (
          <MintSuccess
            state={state}
            onDone={() => {
              mint.reset()
              navigation.goBack()
            }}
          />
        )}
        {state.step === 'error' && (
          <View style={styles.center}>
            <Text style={styles.errorTitle}>Minting Failed</Text>
            <Text style={styles.errorText}>{state.error}</Text>
            <Button title="Try Again" onPress={mint.reset} />
          </View>
        )}
      </ScrollView>
    </SafeArea>
  )
}

function TypeSelection({ onSelect }: { onSelect: (type: MintEntityType) => void }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Choose Identity Type</Text>
      <Card onPress={() => onSelect('agent')}>
        <View style={styles.typeCard}>
          <Badge label="AGENT" variant="agent" />
          <Text style={styles.typeTitle}>Agent Identity</Text>
          <Text style={styles.typeDesc}>For AI agents, bots, and automated services</Text>
        </View>
      </Card>
      <View style={styles.spacer} />
      <Card onPress={() => onSelect('org')}>
        <View style={styles.typeCard}>
          <Badge label="ORG" variant="org" />
          <Text style={styles.typeTitle}>Organization Identity</Text>
          <Text style={styles.typeDesc}>For companies, teams, and groups</Text>
        </View>
      </Card>
    </View>
  )
}

function HandleEntry({
  entityType,
  handleStatus,
  currentHandle,
  orgName,
  hubUrl,
  onCheck,
  onChangeHandle,
  onChangeOrgName,
  onChangeHubUrl,
  onConfirm,
  onBack,
}: {
  entityType: EntityType
  handleStatus: {
    available: boolean | null
    checking: boolean
    error: string | null
    handle: string
  }
  currentHandle: string
  orgName: string
  hubUrl: string
  onCheck: (h: string) => void
  onChangeHandle: (h: string) => void
  onChangeOrgName: (n: string) => void
  onChangeHubUrl: (u: string) => void
  onConfirm: () => void
  onBack: () => void
}) {
  const canConfirm =
    handleStatus.available === true &&
    !handleStatus.checking &&
    currentHandle.length >= 3 &&
    handleStatus.handle === currentHandle

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>
        {entityType === 'agent' ? 'Agent Details' : 'Organization Details'}
      </Text>
      <HandleChecker status={handleStatus} onCheck={onCheck} onChangeHandle={onChangeHandle} />
      {entityType === 'org' && (
        <TextInput
          label="Organization Name"
          value={orgName}
          onChangeText={onChangeOrgName}
          placeholder="My Organization"
        />
      )}
      {entityType === 'agent' && (
        <TextInput
          label="Home Hub URL"
          value={hubUrl}
          onChangeText={onChangeHubUrl}
          placeholder="https://hub.example.com"
          autoCapitalize="none"
          autoCorrect={false}
        />
      )}
      <View style={styles.buttonRow}>
        <Button title="Back" variant="secondary" onPress={onBack} />
        <Button title="Continue" onPress={onConfirm} disabled={!canConfirm} />
      </View>
    </View>
  )
}

function Confirmation({
  state,
  wallets,
  selectedWalletId,
  onSelectWallet,
  signerError,
  signing,
  onMint,
  onBack,
}: {
  state: { entityType: EntityType | null; handle: string; hubUrl: string; orgName: string }
  wallets: Array<{ id: string; label: string; address: string }>
  selectedWalletId: string | null
  onSelectWallet: (id: string) => void
  signerError: string | null
  signing: boolean
  onMint: () => void
  onBack: () => void
}) {
  const hasWallets = wallets.length > 0
  const canMint = hasWallets && selectedWalletId !== null && !signing

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Confirm Mint</Text>
      <Card>
        <View style={styles.confirmDetails}>
          <Badge
            label={(state.entityType ?? 'agent').toUpperCase()}
            variant={state.entityType ?? 'agent'}
          />
          <Text style={styles.confirmHandle}>@{state.handle}</Text>
          {state.entityType === 'org' && (
            <Text style={styles.confirmDetail}>Name: {state.orgName}</Text>
          )}
          {state.hubUrl ? <Text style={styles.confirmDetail}>Hub: {state.hubUrl}</Text> : null}
          <Text style={styles.confirmNote}>
            This will send a transaction to mint your identity NFT. Network fees apply.
          </Text>
        </View>
      </Card>

      {!hasWallets && (
        <Card>
          <View style={styles.confirmDetails}>
            <Text style={styles.confirmDetail}>
              Create a wallet first to sign the minting transaction.
            </Text>
          </View>
        </Card>
      )}

      {hasWallets && (
        <View style={styles.walletSection}>
          <Text style={styles.walletLabel}>Signing Wallet</Text>
          {wallets.map(w => (
            <Card key={w.id} onPress={() => onSelectWallet(w.id)}>
              <View style={styles.walletOption}>
                <View style={styles.walletRadio}>
                  <View
                    style={[
                      styles.radioOuter,
                      selectedWalletId === w.id && styles.radioOuterSelected,
                    ]}
                  >
                    {selectedWalletId === w.id && <View style={styles.radioInner} />}
                  </View>
                </View>
                <View style={styles.walletInfo}>
                  <Text style={styles.walletName}>{w.label}</Text>
                  <Text style={styles.walletAddress}>
                    {w.address.slice(0, 6)}...{w.address.slice(-4)}
                  </Text>
                </View>
              </View>
            </Card>
          ))}
        </View>
      )}

      {signerError && <Text style={styles.errorText}>{signerError}</Text>}

      <View style={styles.buttonRow}>
        <Button title="Back" variant="secondary" onPress={onBack} />
        <Button
          title={signing ? 'Signing...' : 'Mint Identity'}
          onPress={onMint}
          disabled={!canMint}
        />
      </View>
    </View>
  )
}

function MintSuccess({
  state,
  onDone,
}: {
  state: {
    handle: string
    txHash: string | null
    tokenId: string | null
    tbaAddress: string | null
  }
  onDone: () => void
}) {
  return (
    <View style={styles.center}>
      <Text style={styles.successTitle}>Identity Minted!</Text>
      <Card>
        <View style={styles.confirmDetails}>
          <Text style={styles.confirmHandle}>@{state.handle}</Text>
          <Text style={styles.confirmDetail}>Token ID: {state.tokenId}</Text>
          <Text style={styles.confirmDetail} numberOfLines={1}>
            TBA: {state.tbaAddress}
          </Text>
          <Text style={styles.confirmDetail} numberOfLines={1}>
            TX: {state.txHash}
          </Text>
        </View>
      </Card>
      <Button title="Done" onPress={onDone} />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg },
  section: { gap: spacing.md },
  sectionTitle: { ...typography.h2, color: colors.textPrimary, marginBottom: spacing.sm },
  typeCard: { gap: spacing.xs },
  typeTitle: { ...typography.h3, color: colors.textPrimary },
  typeDesc: { ...typography.bodySmall, color: colors.textSecondary },
  spacer: { height: spacing.md },
  buttonRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.lg,
    padding: spacing.xl,
  },
  mintingText: { ...typography.h2, color: colors.textPrimary },
  mintingSubtext: { ...typography.body, color: colors.textTertiary },
  confirmDetails: { gap: spacing.sm },
  confirmHandle: { ...typography.h2, color: colors.textPrimary },
  confirmDetail: { ...typography.bodySmall, color: colors.textSecondary },
  confirmNote: { ...typography.caption, color: colors.textTertiary, marginTop: spacing.sm },
  successTitle: { ...typography.h1, color: colors.success },
  errorTitle: { ...typography.h2, color: colors.error },
  errorText: { ...typography.body, color: colors.textSecondary, textAlign: 'center' },
  walletSection: { gap: spacing.sm, marginTop: spacing.md },
  walletLabel: { ...typography.label, color: colors.textTertiary },
  walletOption: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  walletRadio: { justifyContent: 'center', alignItems: 'center' },
  radioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioOuterSelected: { borderColor: colors.primary },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.primary,
  },
  walletInfo: { flex: 1 },
  walletName: { ...typography.body, color: colors.textPrimary },
  walletAddress: { ...typography.mono, color: colors.textTertiary, fontSize: 12 },
})
