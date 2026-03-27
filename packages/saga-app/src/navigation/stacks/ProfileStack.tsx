// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import React from 'react'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { StyleSheet, Text, View } from 'react-native'
import { colors, typography } from '../../core/theme'
import type { ProfileStackParamList } from '../types'

function MyProfileScreen(): React.JSX.Element {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>Profile</Text>
      <Text style={styles.subtitle}>Identity &amp; Settings</Text>
    </View>
  )
}

const Stack = createNativeStackNavigator<ProfileStackParamList>()

export function ProfileStack(): React.JSX.Element {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="MyProfile" component={MyProfileScreen} />
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
