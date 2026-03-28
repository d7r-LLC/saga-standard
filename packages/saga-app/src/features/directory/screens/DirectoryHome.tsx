// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import React from 'react'
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { SafeArea } from '../../../components/SafeArea'
import { Header } from '../../../components/Header'
import { TextInput } from '../../../components/TextInput'
import { LoadingSpinner } from '../../../components/LoadingSpinner'
import { EntityCard } from '../components/EntityCard'
import { useDirectorySearch } from '../hooks/useDirectorySearch'
import { colors, spacing, typography } from '../../../core/theme'
import type { DirectoryStackParamList } from '../../../navigation/types'
import type { EntityCardData, SearchFilter } from '../types'

type Props = NativeStackScreenProps<DirectoryStackParamList, 'DirectoryHome'>

const FILTERS: SearchFilter[] = ['all', 'agents', 'orgs']

export function DirectoryHome({ navigation }: Props): React.JSX.Element {
  const {
    query,
    setQuery,
    filter,
    setFilter,
    results,
    loading,
    error,
    hasMore,
    loadMore,
    refresh,
  } = useDirectorySearch()

  const renderItem = ({ item }: { item: EntityCardData }) => (
    <EntityCard
      entity={item}
      onPress={() =>
        navigation.navigate('EntityDetail', {
          handle: item.handle,
          entityType: item.entityType,
        })
      }
    />
  )

  return (
    <SafeArea>
      <Header
        title="Directory"
        rightAction={{ label: 'Hubs', onPress: () => navigation.navigate('DirectoryList') }}
      />
      <View style={styles.searchContainer}>
        <TextInput
          placeholder="Search by handle..."
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
        />
      </View>
      <View style={styles.filterRow}>
        {FILTERS.map(f => (
          <TouchableOpacity
            key={f}
            style={[styles.filterTab, filter === f && styles.filterTabActive]}
            onPress={() => setFilter(f)}
          >
            <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      {error ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : loading && results.length === 0 ? (
        <LoadingSpinner message="Loading..." />
      ) : results.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>
            {query
              ? `No identities found for "${query}".`
              : 'Search for agents and orgs by handle.'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={item => `${item.entityType}-${item.handle}`}
          renderItem={renderItem}
          onEndReached={hasMore ? loadMore : undefined}
          onEndReachedThreshold={0.5}
          refreshing={loading && results.length > 0}
          onRefresh={refresh}
          ListFooterComponent={loading ? <LoadingSpinner size="small" /> : null}
          contentContainerStyle={styles.list}
        />
      )}
    </SafeArea>
  )
}

const styles = StyleSheet.create({
  searchContainer: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  filterTab: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterTabActive: {
    backgroundColor: `${colors.primary}20`,
    borderColor: colors.primary,
  },
  filterText: {
    ...typography.bodySmall,
    color: colors.textTertiary,
  },
  filterTextActive: {
    color: colors.primary,
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
