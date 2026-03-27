// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import React from 'react'
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
import type { ProfileStackParamList } from '../../../navigation/types'
import type { EntityType } from '../types'

type Props = NativeStackScreenProps<ProfileStackParamList, 'MintWizard'>

export function MintWizard({ navigation }: Props): React.JSX.Element {
  const mint = useMint()
  const handle = useHandle()
  const { state } = mint

  const handleCancel = () => {
    mint.reset()
    handle.reset()
    navigation.goBack()
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
            onMint={() => {
              // walletClient will come from wallet signing in future phase
            }}
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

function TypeSelection({ onSelect }: { onSelect: (type: EntityType) => void }) {
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
  orgName: string
  hubUrl: string
  onCheck: (h: string) => void
  onChangeHandle: (h: string) => void
  onChangeOrgName: (n: string) => void
  onChangeHubUrl: (u: string) => void
  onConfirm: () => void
  onBack: () => void
}) {
  const canConfirm = handleStatus.available === true && handleStatus.handle.length >= 3

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
  onMint,
  onBack,
}: {
  state: { entityType: EntityType | null; handle: string; hubUrl: string; orgName: string }
  onMint: () => void
  onBack: () => void
}) {
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
            This will send a transaction to mint your identity NFT on Base Sepolia. Gas fees apply.
          </Text>
        </View>
      </Card>
      <View style={styles.buttonRow}>
        <Button title="Back" variant="secondary" onPress={onBack} />
        <Button title="Mint Identity" onPress={onMint} />
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
})
