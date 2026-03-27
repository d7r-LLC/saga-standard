// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import React, { useState } from 'react'
import {
  TextInput as RNTextInput,
  TextInputProps as RNTextInputProps,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { borderRadius, colors, spacing, typography } from '../core/theme'

interface TextInputProps extends Omit<RNTextInputProps, 'style'> {
  label?: string
  error?: string
}

export function TextInput({ label, error, ...props }: TextInputProps): React.JSX.Element {
  const [focused, setFocused] = useState(false)

  return (
    <View style={styles.container}>
      {label && <Text style={styles.label}>{label}</Text>}
      <RNTextInput
        {...props}
        style={[styles.input, focused && styles.focused, error && styles.errorBorder]}
        placeholderTextColor={colors.textTertiary}
        onFocus={e => {
          setFocused(true)
          props.onFocus?.(e)
        }}
        onBlur={e => {
          setFocused(false)
          props.onBlur?.(e)
        }}
      />
      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.xs,
  },
  label: {
    ...typography.label,
    color: colors.textSecondary,
  },
  input: {
    ...typography.body,
    color: colors.textPrimary,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  focused: {
    borderColor: colors.borderFocused,
  },
  errorBorder: {
    borderColor: colors.error,
  },
  error: {
    ...typography.caption,
    color: colors.error,
  },
})
