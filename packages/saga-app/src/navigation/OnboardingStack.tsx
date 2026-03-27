// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import React from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { colors, spacing, typography } from '../core/theme'
import { Button } from '../components/Button'
import type { OnboardingStackParamList } from './types'

function WelcomeScreen(): React.JSX.Element {
  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.logo}>SAGA</Text>
        <Text style={styles.tagline}>Own your identity</Text>
      </View>
      <View style={styles.actions}>
        <Button title="Get Started" onPress={() => {}} size="lg" />
        <Button title="I have a wallet" onPress={() => {}} variant="secondary" size="lg" />
      </View>
    </View>
  )
}

const Stack = createNativeStackNavigator<OnboardingStackParamList>()

export function OnboardingStack(): React.JSX.Element {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Welcome" component={WelcomeScreen} />
    </Stack.Navigator>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'space-between',
    padding: spacing.xl,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logo: {
    ...typography.h1,
    fontSize: 48,
    color: colors.primary,
    fontWeight: '700',
  },
  tagline: {
    ...typography.h3,
    color: colors.textSecondary,
    marginTop: spacing.md,
  },
  actions: {
    gap: spacing.md,
    paddingBottom: spacing.xxl,
  },
})
