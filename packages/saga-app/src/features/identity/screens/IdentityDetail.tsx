// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import React from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { SafeArea } from '../../../components/SafeArea'
import { Header } from '../../../components/Header'
import { Card } from '../../../components/Card'
import { Badge } from '../../../components/Badge'
import { ListItem } from '../../../components/ListItem'
import { colors, spacing, typography } from '../../../core/theme'
import { useIdentity } from '../hooks/useIdentity'
import type { ProfileStackParamList } from '../../../navigation/types'

type Props = NativeStackScreenProps<ProfileStackParamList, 'IdentityDetail'>

export function IdentityDetail({ navigation, route }: Props): React.JSX.Element {
  const { identities, activeIdentity, setActive } = useIdentity()
  const identity = identities.find(i => i.id === route.params.identityId)

  if (!identity) {
    return (
      <SafeArea>
        <Header
          title="Identity"
          leftAction={{ label: 'Back', onPress: () => navigation.goBack() }}
        />
        <View style={styles.center}>
          <Text style={styles.notFound}>Identity not found</Text>
        </View>
      </SafeArea>
    )
  }

  const isActive = identity.id === activeIdentity?.id

  return (
    <SafeArea>
      <Header
        title={`@${identity.handle}`}
        leftAction={{ label: 'Back', onPress: () => navigation.goBack() }}
      />
      <ScrollView style={styles.container}>
        <View style={styles.headerSection}>
          <Badge label={identity.type.toUpperCase()} variant={identity.type} />
          <Text style={styles.handle}>@{identity.handle}</Text>
          {isActive && <Text style={styles.activeLabel}>Active Identity</Text>}
        </View>

        <Card>
          <View style={styles.details}>
            <ListItem title="Token ID" rightText={identity.tokenId} />
            <ListItem title="Type" rightText={identity.type} />
            <ListItem title="TBA Address" subtitle={identity.tbaAddress || 'Not created'} />
            {identity.hubUrl ? <ListItem title="Home Hub" subtitle={identity.hubUrl} /> : null}
            {identity.contractAddress ? (
              <ListItem title="Contract" subtitle={identity.contractAddress} />
            ) : null}
          </View>
        </Card>

        {!isActive && (
          <View style={styles.actions}>
            <Text style={styles.actionLink} onPress={() => setActive(identity.id)}>
              Set as Active Identity
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeArea>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  headerSection: { padding: spacing.lg, alignItems: 'center', gap: spacing.sm },
  handle: { ...typography.h1, color: colors.textPrimary },
  activeLabel: { ...typography.caption, color: colors.primary, fontWeight: '600' },
  details: {},
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  notFound: { ...typography.body, color: colors.textTertiary },
  actions: { padding: spacing.lg, alignItems: 'center' },
  actionLink: { ...typography.body, color: colors.primary },
})
