// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import React from 'react'
import { StyleSheet, View } from 'react-native'
import { colors } from '../core/theme'

interface StatusIndicatorProps {
  status: 'connected' | 'disconnected' | 'error' | 'syncing'
  size?: number
}

const statusColors = {
  connected: colors.success,
  disconnected: colors.textTertiary,
  error: colors.error,
  syncing: colors.warning,
}

export function StatusIndicator({ status, size = 8 }: StatusIndicatorProps): React.JSX.Element {
  return (
    <View
      style={[
        styles.dot,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: statusColors[status],
        },
      ]}
    />
  )
}

const styles = StyleSheet.create({
  dot: {},
})
