// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { TextInput } from '../../../components/TextInput'
import { colors, spacing, typography } from '../../../core/theme'
import type { HandleStatus } from '../types'

interface HandleCheckerProps {
  status: HandleStatus
  onCheck: (handle: string) => void
  onChangeHandle: (handle: string) => void
}

export function HandleChecker({
  status,
  onCheck,
  onChangeHandle,
}: HandleCheckerProps): React.JSX.Element {
  const [localHandle, setLocalHandle] = useState('')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleChange = useCallback(
    (text: string) => {
      const cleaned = text.toLowerCase().replace(/[^a-z0-9-_]/g, '')
      setLocalHandle(cleaned)
      onChangeHandle(cleaned)

      if (debounceRef.current) clearTimeout(debounceRef.current)
      if (cleaned.length >= 3) {
        debounceRef.current = setTimeout(() => onCheck(cleaned), 500)
      }
    },
    [onCheck, onChangeHandle]
  )

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  const statusColor =
    status.available === true
      ? colors.success
      : status.available === false
        ? colors.error
        : colors.textTertiary
  const statusText = status.checking
    ? 'Checking...'
    : status.available === true
      ? 'Available'
      : status.available === false
        ? 'Taken'
        : status.error
          ? status.error
          : localHandle.length < 3
            ? 'Min 3 characters'
            : ''

  return (
    <View>
      <TextInput
        label="Handle"
        value={localHandle}
        onChangeText={handleChange}
        placeholder="myhandle"
        autoCapitalize="none"
        autoCorrect={false}
      />
      {statusText ? (
        <Text style={[styles.status, { color: statusColor }]}>{statusText}</Text>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  status: {
    ...typography.caption,
    marginTop: spacing.xs,
    marginLeft: spacing.sm,
  },
})
