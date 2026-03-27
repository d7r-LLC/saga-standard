// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import React from 'react'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { StyleSheet, Text, View } from 'react-native'
import { colors, typography } from '../../core/theme'
import type { WalletStackParamList } from '../types'

function WalletOverviewScreen(): React.JSX.Element {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>Wallet</Text>
      <Text style={styles.subtitle}>Coming in Phase 2</Text>
    </View>
  )
}

const Stack = createNativeStackNavigator<WalletStackParamList>()

export function WalletStack(): React.JSX.Element {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="WalletOverview" component={WalletOverviewScreen} />
    </Stack.Navigator>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  text: { ...typography.h2, color: colors.textPrimary },
  subtitle: { ...typography.bodySmall, color: colors.textTertiary, marginTop: 8 },
})
