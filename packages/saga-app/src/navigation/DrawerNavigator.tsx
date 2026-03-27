// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import React from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { DrawerContentScrollView, createDrawerNavigator } from '@react-navigation/drawer'
import { colors, spacing, typography } from '../core/theme'
import { StatusIndicator } from '../components/StatusIndicator'
import { useStorage } from '../core/providers/StorageProvider'
import { TabNavigator } from './TabNavigator'
import type { DrawerParamList } from './types'

function DrawerContent(): React.JSX.Element {
  const { wallets, activeWalletId, setActiveWallet } = useStorage()

  return (
    <DrawerContentScrollView style={styles.drawer}>
      <View style={styles.header}>
        <Text style={styles.appName}>SAGA</Text>
        <Text style={styles.subtitle}>Identity Manager</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>WALLETS</Text>
        {wallets.length === 0 ? (
          <Text style={styles.emptyText}>No wallets yet</Text>
        ) : (
          wallets.map(wallet => {
            const isActive = wallet.id === activeWalletId
            const shortAddr = `${wallet.address.slice(0, 6)}...${wallet.address.slice(-4)}`
            return (
              <Pressable
                key={wallet.id}
                onPress={() => setActiveWallet(wallet.id)}
                style={[styles.walletItem, isActive && styles.walletItemActive]}
              >
                <View style={styles.walletInfo}>
                  <Text style={[styles.walletLabel, isActive && styles.walletLabelActive]}>
                    {wallet.label}
                  </Text>
                  <Text style={styles.walletAddress}>{shortAddr}</Text>
                </View>
                {isActive && <StatusIndicator status="connected" />}
              </Pressable>
            )
          })
        )}
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
  emptyText: {
    ...typography.bodySmall,
    color: colors.textTertiary,
  },
  walletItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: 8,
    marginBottom: spacing.xs,
  },
  walletItemActive: {
    backgroundColor: colors.surfaceElevated,
  },
  walletInfo: {
    flex: 1,
  },
  walletLabel: {
    ...typography.body,
    color: colors.textSecondary,
  },
  walletLabelActive: {
    color: colors.textPrimary,
    fontWeight: '600',
  },
  walletAddress: {
    ...typography.caption,
    color: colors.textTertiary,
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
