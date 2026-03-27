// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import React from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { DrawerContentScrollView, createDrawerNavigator } from '@react-navigation/drawer'
import { colors, spacing, typography } from '../core/theme'
import { StatusIndicator } from '../components/StatusIndicator'
import { TabNavigator } from './TabNavigator'
import type { DrawerParamList } from './types'

function DrawerContent(): React.JSX.Element {
  return (
    <DrawerContentScrollView style={styles.drawer}>
      <View style={styles.header}>
        <Text style={styles.appName}>SAGA</Text>
        <Text style={styles.subtitle}>Identity Manager</Text>
      </View>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>HUBS</Text>
        <View style={styles.hubItem}>
          <StatusIndicator status="disconnected" />
          <Text style={styles.hubText}>No hubs connected</Text>
        </View>
      </View>
    </DrawerContentScrollView>
  )
}

const Drawer = createDrawerNavigator<DrawerParamList>()

export function DrawerNavigator(): React.JSX.Element {
  return (
    <Drawer.Navigator
      drawerContent={() => <DrawerContent />}
      screenOptions={{
        headerShown: false,
        drawerStyle: styles.drawerPanel,
      }}
    >
      <Drawer.Screen name="MainTabs" component={TabNavigator} />
    </Drawer.Navigator>
  )
}

const styles = StyleSheet.create({
  drawer: {
    backgroundColor: colors.surface,
  },
  drawerPanel: {
    backgroundColor: colors.surface,
    width: 280,
  },
  header: {
    padding: spacing.xl,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  appName: {
    ...typography.h1,
    color: colors.textPrimary,
  },
  subtitle: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginTop: 4,
  },
  section: {
    padding: spacing.lg,
  },
  sectionTitle: {
    ...typography.label,
    color: colors.textTertiary,
    marginBottom: spacing.md,
  },
  hubItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  hubText: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
})
