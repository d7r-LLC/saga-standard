// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import React from 'react'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { StyleSheet } from 'react-native'
import { StorageProvider } from './core/providers/StorageProvider'
import { AuthProvider } from './core/providers/AuthProvider'
import { RootNavigator } from './navigation'

export default function App(): React.JSX.Element {
  return (
    <GestureHandlerRootView style={styles.root}>
      <StorageProvider>
        <AuthProvider>
          <RootNavigator />
        </AuthProvider>
      </StorageProvider>
    </GestureHandlerRootView>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
})
