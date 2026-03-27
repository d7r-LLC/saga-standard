// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import React from 'react'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { StyleSheet, Text, View } from 'react-native'
import { Button } from '../../components/Button'
import { SafeArea } from '../../components/SafeArea'
import { Header } from '../../components/Header'
import { colors, spacing, typography } from '../../core/theme'
import { useIdentity } from '../../features/identity/hooks/useIdentity'
import { IdentityCard } from '../../features/identity/components/IdentityCard'
import { IdentityManager } from '../../features/identity/screens/IdentityManager'
import { MintWizard } from '../../features/identity/screens/MintWizard'
import { IdentityDetail } from '../../features/identity/screens/IdentityDetail'
import { HandleManager } from '../../features/identity/screens/HandleManager'
import { NetworkSettings } from '../../features/identity/screens/NetworkSettings'
import type { ProfileStackParamList } from '../types'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'

type MyProfileProps = NativeStackScreenProps<ProfileStackParamList, 'MyProfile'>

function MyProfileScreen({ navigation }: MyProfileProps): React.JSX.Element {
  const { activeIdentity } = useIdentity()

  return (
    <SafeArea>
      <Header title="Profile" />
      <View style={styles.container}>
        <Text style={styles.sectionTitle}>Identity</Text>
        {activeIdentity ? (
          <IdentityCard
            identity={activeIdentity}
            isActive
            onPress={() => navigation.navigate('IdentityDetail', { identityId: activeIdentity.id })}
          />
        ) : (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No active identity</Text>
          </View>
        )}
        <View style={styles.actions}>
          <Button
            title="Manage Identities"
            onPress={() => navigation.navigate('IdentityManager')}
          />
          <Button
            title="Network Settings"
            variant="secondary"
            onPress={() => navigation.navigate('NetworkSettings')}
          />
        </View>
      </View>
    </SafeArea>
  )
}

const Stack = createNativeStackNavigator<ProfileStackParamList>()

export function ProfileStack(): React.JSX.Element {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="MyProfile" component={MyProfileScreen} />
      <Stack.Screen name="IdentityManager" component={IdentityManager} />
      <Stack.Screen name="MintWizard" component={MintWizard} />
      <Stack.Screen name="IdentityDetail" component={IdentityDetail} />
      <Stack.Screen name="HandleManager" component={HandleManager} />
      <Stack.Screen name="NetworkSettings" component={NetworkSettings} />
    </Stack.Navigator>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: spacing.lg,
  },
  sectionTitle: {
    ...typography.h2,
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  empty: {
    backgroundColor: colors.surface,
    padding: spacing.xl,
    borderRadius: 12,
    alignItems: 'center',
  },
  emptyText: {
    ...typography.body,
    color: colors.textTertiary,
  },
  actions: {
    marginTop: spacing.lg,
    gap: spacing.md,
  },
})
