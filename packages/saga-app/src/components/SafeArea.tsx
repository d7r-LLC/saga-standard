// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import React from 'react'
import { SafeAreaView, StyleSheet, ViewStyle } from 'react-native'
import { colors } from '../core/theme'

interface SafeAreaProps {
  children: React.ReactNode
  style?: ViewStyle
}

export function SafeArea({ children, style }: SafeAreaProps): React.JSX.Element {
  return <SafeAreaView style={[styles.container, style]}>{children}</SafeAreaView>
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
})
