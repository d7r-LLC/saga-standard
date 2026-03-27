// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import React from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { DefaultTheme, NavigationContainer } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { colors, spacing, typography } from '../core/theme'
import { useAuth } from '../core/providers/AuthProvider'
import { useStorage } from '../core/providers/StorageProvider'
import { Button } from '../components/Button'
import { LoadingSpinner } from '../components/LoadingSpinner'
import { DrawerNavigator } from './DrawerNavigator'
import type { RootStackParamList } from './types'

const sagaTheme = {
  ...DefaultTheme,
  dark: true,
  colors: {
    ...DefaultTheme.colors,
    primary: colors.primary,
    background: colors.background,
    card: colors.surface,
    text: colors.textPrimary,
    border: colors.border,
    notification: colors.error,
  },
}

function UnlockScreen(): React.JSX.Element {
  const { unlock, biometricType } = useAuth()

  return (
    <View style={unlockStyles.container}>
      <Text style={unlockStyles.logo}>SAGA</Text>
      <Text style={unlockStyles.subtitle}>Tap to unlock</Text>
      <Button
        title={biometricType === 'FaceID' ? 'Unlock with Face ID' : 'Unlock'}
        onPress={() => unlock()}
        size="lg"
      />
    </View>
  )
}

const Stack = createNativeStackNavigator<RootStackParamList>()

export function RootNavigator(): React.JSX.Element {
  const { isLocked } = useAuth()
  const { initialized } = useStorage()

  if (!initialized) {
    return <LoadingSpinner message="Loading..." />
  }

  if (isLocked) {
    return <UnlockScreen />
  }

  return (
    <NavigationContainer theme={sagaTheme}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Main" component={DrawerNavigator} />
      </Stack.Navigator>
    </NavigationContainer>
  )
}

const unlockStyles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
    padding: spacing.xl,
    gap: spacing.xl,
  },
  logo: {
    ...typography.h1,
    fontSize: 48,
    color: colors.primary,
    fontWeight: '700',
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
  },
})
