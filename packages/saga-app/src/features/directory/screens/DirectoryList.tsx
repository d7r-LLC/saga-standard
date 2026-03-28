// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import React from 'react'
import { FlatList, StyleSheet, Text, View } from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { SafeArea } from '../../../components/SafeArea'
import { Header } from '../../../components/Header'
import { Card } from '../../../components/Card'
import { Badge } from '../../../components/Badge'
import { StatusIndicator } from '../../../components/StatusIndicator'
import { LoadingSpinner } from '../../../components/LoadingSpinner'
import { useDirectories } from '../hooks/useDirectories'
import { colors, spacing, typography } from '../../../core/theme'
import type { DirectoryStackParamList } from '../../../navigation/types'
import type { DirectorySummary } from '../types'

type Props = NativeStackScreenProps<DirectoryStackParamList, 'DirectoryList'>

const STATUS_MAP: Record<string, 'connected' | 'disconnected' | 'error' | 'syncing'> = {
  active: 'connected',
  suspended: 'syncing',
  flagged: 'error',
  revoked: 'disconnected',
}

function truncateAddress(addr: string): string {
  if (addr.length <= 12) return addr
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`
}

export function DirectoryList({ navigation }: Props): React.JSX.Element {
  const { directories, loading, error, hasMore, loadMore, refresh } = useDirectories()

  const renderItem = ({ item }: { item: DirectorySummary }) => (
    <Card style={styles.card}>
      <View style={styles.topRow}>
        <Text style={styles.dirId}>{item.directoryId}</Text>
        <StatusIndicator status={STATUS_MAP[item.status] ?? 'disconnected'} />
      </View>
      <Text style={styles.url} numberOfLines={1}>
        {item.url}
      </Text>
      <View style={styles.bottomRow}>
        <Badge label={item.conformanceLevel} variant="directory" />
        <Text style={styles.wallet}>{truncateAddress(item.operatorWallet)}</Text>
      </View>
    </Card>
  )

  return (
    <SafeArea>
      <Header
        title="Federated Directories"
        leftAction={{ label: 'Back', onPress: () => navigation.goBack() }}
      />
      {error ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : loading && directories.length === 0 ? (
        <LoadingSpinner message="Loading directories..." />
      ) : directories.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>No directories found.</Text>
        </View>
      ) : (
        <FlatList
          data={directories}
          keyExtractor={item => item.directoryId}
          renderItem={renderItem}
          onEndReached={hasMore ? loadMore : undefined}
          onEndReachedThreshold={0.5}
          refreshing={loading && directories.length > 0}
          onRefresh={refresh}
          ListFooterComponent={loading ? <LoadingSpinner size="small" /> : null}
          contentContainerStyle={styles.list}
        />
      )}
    </SafeArea>
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
  dirId: {
    ...typography.h3,
    color: colors.textPrimary,
  },
  url: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  wallet: {
    ...typography.caption,
    color: colors.textTertiary,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  emptyText: {
    ...typography.body,
    color: colors.textTertiary,
    textAlign: 'center',
  },
  errorText: {
    ...typography.body,
    color: colors.error,
    textAlign: 'center',
  },
  list: {
    paddingTop: spacing.sm,
  },
})
