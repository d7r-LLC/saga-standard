// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import React from 'react'
import { FlatList, StyleSheet, Text, View } from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Button } from '../../../components/Button'
import { SafeArea } from '../../../components/SafeArea'
import { Header } from '../../../components/Header'
import { colors, spacing, typography } from '../../../core/theme'
import { useIdentity } from '../hooks/useIdentity'
import { IdentityCard } from '../components/IdentityCard'
import type { ProfileStackParamList } from '../../../navigation/types'

type Props = NativeStackScreenProps<ProfileStackParamList, 'IdentityManager'>

export function IdentityManager({ navigation }: Props): React.JSX.Element {
  const { identities, activeIdentity, setActive } = useIdentity()

  return (
    <SafeArea>
      <Header
        title="Identities"
        leftAction={{ label: 'Back', onPress: () => navigation.goBack() }}
      />
      <View style={styles.container}>
        {identities.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No Identities</Text>
            <Text style={styles.emptySubtitle}>Mint an Agent or Org NFT to get started</Text>
          </View>
        ) : (
          <FlatList
            data={identities}
            keyExtractor={item => item.id}
            contentContainerStyle={styles.list}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
            renderItem={({ item }) => (
              <IdentityCard
                identity={item}
                isActive={item.id === activeIdentity?.id}
                onPress={() => {
                  setActive(item.id)
                  navigation.navigate('IdentityDetail', { identityId: item.id })
                }}
              />
            )}
          />
        )}
        <View style={styles.actions}>
          <Button title="Mint New Identity" onPress={() => navigation.navigate('MintWizard')} />
          <Button
            title="Manage Handles"
            variant="secondary"
            onPress={() => navigation.navigate('HandleManager')}
          />
        </View>
      </View>
    </SafeArea>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  list: { padding: spacing.lg },
  separator: { height: spacing.md },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.xl },
  emptyTitle: { ...typography.h2, color: colors.textPrimary, marginBottom: spacing.sm },
  emptySubtitle: { ...typography.body, color: colors.textTertiary, textAlign: 'center' },
  actions: { padding: spacing.lg, gap: spacing.md },
})
