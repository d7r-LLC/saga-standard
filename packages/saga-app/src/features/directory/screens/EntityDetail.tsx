// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import React from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import Clipboard from '@react-native-clipboard/clipboard'
import { SafeArea } from '../../../components/SafeArea'
import { Header } from '../../../components/Header'
import { Badge } from '../../../components/Badge'
import { ListItem } from '../../../components/ListItem'
import { LoadingSpinner } from '../../../components/LoadingSpinner'
import { useEntityDetail } from '../hooks/useEntityDetail'
import { colors, spacing, typography } from '../../../core/theme'
import type { DirectoryStackParamList } from '../../../navigation/types'
import type { AgentDetail as AgentDetailType, OrgDetail as OrgDetailType } from '../types'

type Props = NativeStackScreenProps<DirectoryStackParamList, 'EntityDetail'>

export function EntityDetail({ route, navigation }: Props): React.JSX.Element {
  const { handle, entityType } = route.params
  const { entity, loading, error } = useEntityDetail(handle, entityType)

  const goBack = () => navigation.goBack()

  if (loading) {
    return (
      <SafeArea>
        <Header title="Details" leftAction={{ label: 'Back', onPress: goBack }} />
        <LoadingSpinner message="Loading identity..." />
      </SafeArea>
    )
  }

  if (error || !entity) {
    return (
      <SafeArea>
        <Header title="Details" leftAction={{ label: 'Back', onPress: goBack }} />
        <View style={styles.center}>
          <Text style={styles.errorText}>{error ?? 'Identity not found.'}</Text>
        </View>
      </SafeArea>
    )
  }

  return (
    <SafeArea>
      <Header title="Details" leftAction={{ label: 'Back', onPress: goBack }} />
      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        <View style={styles.headerSection}>
          <Badge label={entityType === 'agent' ? 'AGENT' : 'ORG'} variant={entityType} />
          <Text style={styles.handle}>@{entity.handle}</Text>
        </View>

        {entityType === 'org' && (
          <ListItem title="Organization" subtitle={(entity as OrgDetailType).name} />
        )}

        <ListItem
          title="Wallet Address"
          subtitle={entity.walletAddress}
          rightText="Copy"
          onPress={() => Clipboard.setString(entity.walletAddress)}
        />
        <ListItem title="Chain" subtitle={entity.chain} />

        {entity.tokenId && <ListItem title="Token ID" subtitle={entity.tokenId} />}
        {entity.contractAddress && (
          <ListItem
            title="Contract Address"
            subtitle={entity.contractAddress}
            rightText="Copy"
            onPress={() => Clipboard.setString(entity.contractAddress!)}
          />
        )}
        {entity.tbaAddress && (
          <ListItem
            title="TBA Address"
            subtitle={entity.tbaAddress}
            rightText="Copy"
            onPress={() => Clipboard.setString(entity.tbaAddress!)}
          />
        )}
        {entity.mintTxHash && <ListItem title="Mint TX Hash" subtitle={entity.mintTxHash} />}

        {entityType === 'agent' && (entity as AgentDetailType).homeHubUrl && (
          <ListItem title="Home Hub" subtitle={(entity as AgentDetailType).homeHubUrl!} />
        )}

        <ListItem
          title="Registered"
          subtitle={new Date(entity.registeredAt).toLocaleDateString()}
        />
      </ScrollView>
    </SafeArea>
  )
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: spacing.lg,
  },
  headerSection: {
    alignItems: 'center',
    marginBottom: spacing.xl,
    gap: spacing.md,
  },
  handle: {
    ...typography.h2,
    color: colors.textPrimary,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  errorText: {
    ...typography.body,
    color: colors.error,
    textAlign: 'center',
  },
})
