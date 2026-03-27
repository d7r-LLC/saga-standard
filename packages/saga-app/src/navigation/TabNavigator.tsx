// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import React from 'react'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { StyleSheet, Text } from 'react-native'
import { colors, typography } from '../core/theme'
import { MessagesStack } from './stacks/MessagesStack'
import { DocumentsStack } from './stacks/DocumentsStack'
import { DirectoryStack } from './stacks/DirectoryStack'
import { WalletStack } from './stacks/WalletStack'
import { ProfileStack } from './stacks/ProfileStack'
import type { TabParamList } from './types'

const Tab = createBottomTabNavigator<TabParamList>()

const tabIcons: Record<keyof TabParamList, string> = {
  MessagesTab: '💬',
  DocumentsTab: '📁',
  DirectoryTab: '🔍',
  WalletTab: '💰',
  ProfileTab: '👤',
}

const tabLabels: Record<keyof TabParamList, string> = {
  MessagesTab: 'Messages',
  DocumentsTab: 'Documents',
  DirectoryTab: 'Directory',
  WalletTab: 'Wallet',
  ProfileTab: 'Profile',
}

export function TabNavigator(): React.JSX.Element {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textTertiary,
        tabBarLabelStyle: styles.tabLabel,
        tabBarIcon: ({ focused }) => (
          <Text style={[styles.icon, focused && styles.iconFocused]}>{tabIcons[route.name]}</Text>
        ),
        tabBarLabel: tabLabels[route.name],
      })}
    >
      <Tab.Screen name="MessagesTab" component={MessagesStack} />
      <Tab.Screen name="DocumentsTab" component={DocumentsStack} />
      <Tab.Screen name="DirectoryTab" component={DirectoryStack} />
      <Tab.Screen name="WalletTab" component={WalletStack} />
      <Tab.Screen name="ProfileTab" component={ProfileStack} />
    </Tab.Navigator>
  )
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: colors.surface,
    borderTopColor: colors.border,
    borderTopWidth: 1,
    paddingTop: 4,
  },
  tabLabel: {
    ...typography.caption,
    fontWeight: '500',
  },
  icon: {
    fontSize: 20,
    opacity: 0.5,
  },
  iconFocused: {
    opacity: 1,
  },
})
