// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import React from 'react'
import { StyleSheet, View } from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { SafeArea } from '../../../components/SafeArea'
import { Header } from '../../../components/Header'
import { QRAddress } from '../components/QRAddress'
import { spacing } from '../../../core/theme'
import type { WalletStackParamList } from '../../../navigation/types'

type Props = NativeStackScreenProps<WalletStackParamList, 'ReceiveScreen'>

export function ReceiveScreen({ navigation, route }: Props): React.JSX.Element {
  const { address } = route.params

  return (
    <SafeArea>
      <Header title="Receive" leftAction={{ label: 'Back', onPress: () => navigation.goBack() }} />
      <View style={styles.content}>
        <QRAddress address={address} size={220} />
      </View>
    </SafeArea>
  )
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
})
