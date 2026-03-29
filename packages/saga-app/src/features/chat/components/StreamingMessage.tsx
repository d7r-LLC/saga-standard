// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import React, { useEffect, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { borderRadius, colors, spacing, typography } from '../../../core/theme'

interface StreamingMessageProps {
  text: string
  testID?: string
}

export function StreamingMessage({
  text,
  testID,
}: StreamingMessageProps): React.JSX.Element {
  const [showCursor, setShowCursor] = useState(true)

  useEffect(() => {
    const timer = setInterval(() => setShowCursor(v => !v), 500)
    return () => clearInterval(timer)
  }, [])

  return (
    <View style={styles.row} testID={testID}>
      <View style={styles.bubble}>
        <Text style={styles.text}>
          {text}
          {showCursor ? '\u2589' : ' '}
        </Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    alignItems: 'flex-start',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
  },
  bubble: {
    maxWidth: '80%',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.surfaceElevated,
    borderTopLeftRadius: borderRadius.lg,
    borderTopRightRadius: borderRadius.lg,
    borderBottomLeftRadius: borderRadius.sm,
    borderBottomRightRadius: borderRadius.lg,
  },
  text: {
    ...typography.body,
    color: colors.textPrimary,
  },
})
