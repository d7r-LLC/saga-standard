// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import React, { useState } from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { SafeArea } from '../../../components/SafeArea'
import { Header } from '../../../components/Header'
import { Card } from '../../../components/Card'
import { TextInput } from '../../../components/TextInput'
import { Button } from '../../../components/Button'
import { Badge } from '../../../components/Badge'
import { ListItem } from '../../../components/ListItem'
import { colors, spacing, typography } from '../../../core/theme'
import { useIdentity } from '../hooks/useIdentity'
import { useHandle } from '../hooks/useHandle'
import type { ProfileStackParamList } from '../../../navigation/types'

type Props = NativeStackScreenProps<ProfileStackParamList, 'HandleManager'>

export function HandleManager({ navigation }: Props): React.JSX.Element {
  const { identities } = useIdentity()
  const { resolve } = useHandle()
  const [lookupHandle, setLookupHandle] = useState('')
  const [resolvedInfo, setResolvedInfo] = useState<{
    entityType: string
    tokenId: string
  } | null>(null)

  const handleLookup = async () => {
    if (!lookupHandle) return
    const result = await resolve(lookupHandle)
    if (result) {
      setResolvedInfo({
        entityType: result.entityType,
        tokenId: result.tokenId.toString(),
      })
    } else {
      setResolvedInfo(null)
    }
  }

  return (
    <SafeArea>
      <Header title="Handles" leftAction={{ label: 'Back', onPress: () => navigation.goBack() }} />
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <Text style={styles.sectionTitle}>My Handles</Text>
        {identities.length === 0 ? (
          <Text style={styles.emptyText}>No registered handles</Text>
        ) : (
          <Card>
            {identities.map(i => (
              <ListItem
                key={i.id}
                title={`@${i.handle}`}
                subtitle={i.hubUrl || 'No hub URL'}
                rightText={i.type}
              />
            ))}
          </Card>
        )}

        <Text style={[styles.sectionTitle, styles.topMargin]}>Resolve Handle</Text>
        <TextInput
          label="Handle"
          value={lookupHandle}
          onChangeText={setLookupHandle}
          placeholder="Enter handle to look up"
          autoCapitalize="none"
        />
        <Button title="Resolve" onPress={handleLookup} variant="secondary" />

        {resolvedInfo && (
          <Card>
            <View style={styles.resolvedInfo}>
              <Badge
                label={resolvedInfo.entityType}
                variant={resolvedInfo.entityType.toLowerCase() as 'agent' | 'org' | 'directory'}
              />
              <Text style={styles.resolvedText}>Token ID: {resolvedInfo.tokenId}</Text>
            </View>
          </Card>
        )}
      </ScrollView>
    </SafeArea>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.md },
  sectionTitle: { ...typography.h2, color: colors.textPrimary },
  topMargin: { marginTop: spacing.lg },
  emptyText: { ...typography.body, color: colors.textTertiary },
  resolvedInfo: { gap: spacing.sm },
  resolvedText: { ...typography.body, color: colors.textSecondary },
})
