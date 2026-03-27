// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import type { NavigatorScreenParams } from '@react-navigation/native'

// Tab screens
export type MessagesStackParamList = {
  MessagesList: undefined
}

export type DocumentsStackParamList = {
  DocumentExplorer: undefined
}

export type DirectoryStackParamList = {
  DirectorySearch: undefined
}

export type WalletStackParamList = {
  WalletOverview: undefined
  WalletDetail: { walletId: string }
  WalletSettings: { walletId: string }
  SendFlow: { walletId: string }
  ReceiveScreen: { walletId: string; address: string }
}

export type ProfileStackParamList = {
  MyProfile: undefined
}

// Tab navigator
export type TabParamList = {
  MessagesTab: NavigatorScreenParams<MessagesStackParamList>
  DocumentsTab: NavigatorScreenParams<DocumentsStackParamList>
  DirectoryTab: NavigatorScreenParams<DirectoryStackParamList>
  WalletTab: NavigatorScreenParams<WalletStackParamList>
  ProfileTab: NavigatorScreenParams<ProfileStackParamList>
}

// Drawer
export type DrawerParamList = {
  MainTabs: NavigatorScreenParams<TabParamList>
}

// Onboarding
export type OnboardingStackParamList = {
  Welcome: undefined
}

// Root
export type RootStackParamList = {
  Unlock: undefined
  Onboarding: NavigatorScreenParams<OnboardingStackParamList>
  Main: NavigatorScreenParams<DrawerParamList>
}
