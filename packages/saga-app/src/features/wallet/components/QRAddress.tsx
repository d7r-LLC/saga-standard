// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import React, { useCallback } from 'react'
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native'
import QRCode from 'react-native-qrcode-svg'
import Clipboard from '@react-native-clipboard/clipboard'
import { borderRadius, colors, spacing, typography } from '../../../core/theme'

interface QRAddressProps {
  address: string
  size?: number
}

export function QRAddress({ address, size = 200 }: QRAddressProps): React.JSX.Element {
  const shortAddress = `${address.slice(0, 6)}...${address.slice(-4)}`

  const handleCopy = useCallback(() => {
    Clipboard.setString(address)
    Alert.alert('Copied', 'Address copied to clipboard')
  }, [address])

  return (
    <View style={styles.container}>
      <View style={styles.qrWrapper}>
        <QRCode
          value={address}
          size={size}
          backgroundColor={colors.textPrimary}
          color={colors.background}
        />
      </View>
      <Pressable onPress={handleCopy} style={styles.addressRow}>
        <Text style={styles.address}>{shortAddress}</Text>
        <Text style={styles.copyHint}>Tap to copy</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: spacing.lg,
  },
  qrWrapper: {
    padding: spacing.lg,
    backgroundColor: colors.textPrimary,
    borderRadius: borderRadius.lg,
  },
  addressRow: {
    alignItems: 'center',
    gap: spacing.xs,
  },
  address: {
    ...typography.mono,
    color: colors.textPrimary,
    fontSize: 16,
  },
  copyHint: {
    ...typography.caption,
    color: colors.primary,
  },
})
