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
  DirectoryHome: undefined
  EntityDetail: { handle: string; entityType: 'agent' | 'org' }
  DirectoryList: undefined
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
  IdentityManager: undefined
  MintWizard: undefined
  IdentityDetail: { identityId: string }
  HandleManager: undefined
  NetworkSettings: undefined
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
