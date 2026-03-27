// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import React from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { SafeArea } from '../../../components/SafeArea'
import { Header } from '../../../components/Header'
import { Card } from '../../../components/Card'
import { StatusIndicator } from '../../../components/StatusIndicator'
import { colors, spacing, typography } from '../../../core/theme'
import { useChain } from '../../../core/providers/ChainProvider'
import type { ProfileStackParamList } from '../../../navigation/types'
import type { ChainId } from '../../wallet/types'

type Props = NativeStackScreenProps<ProfileStackParamList, 'NetworkSettings'>

const NETWORKS: { id: ChainId; name: string; description: string }[] = [
  { id: 'base-sepolia', name: 'Base Sepolia', description: 'Testnet (free transactions)' },
  { id: 'base', name: 'Base', description: 'Mainnet (real transactions)' },
]

export function NetworkSettings({ navigation }: Props): React.JSX.Element {
  const { chainId, setChainId } = useChain()

  return (
    <SafeArea>
      <Header title="Network" leftAction={{ label: 'Back', onPress: () => navigation.goBack() }} />
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <Text style={styles.sectionTitle}>Select Network</Text>
        <Text style={styles.description}>
          Choose which blockchain network to use for identity and wallet operations.
        </Text>
        {NETWORKS.map(network => (
          <Card key={network.id} onPress={() => setChainId(network.id)}>
            <View style={styles.networkRow}>
              <View style={styles.networkInfo}>
                <Text style={styles.networkName}>{network.name}</Text>
                <Text style={styles.networkDesc}>{network.description}</Text>
              </View>
              {chainId === network.id && <StatusIndicator status="connected" />}
            </View>
          </Card>
        ))}
      </ScrollView>
    </SafeArea>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.md },
  sectionTitle: { ...typography.h2, color: colors.textPrimary },
  description: { ...typography.body, color: colors.textSecondary },
  networkRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  networkInfo: { flex: 1 },
  networkName: { ...typography.h3, color: colors.textPrimary },
  networkDesc: { ...typography.bodySmall, color: colors.textTertiary, marginTop: 2 },
})
