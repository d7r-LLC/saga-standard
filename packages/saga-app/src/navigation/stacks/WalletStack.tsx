// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import React from 'react'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { colors } from '../../core/theme'
import { WalletOverview } from '../../features/wallet/screens/WalletOverview'
import { WalletDetail } from '../../features/wallet/screens/WalletDetail'
import { WalletSettings } from '../../features/wallet/screens/WalletSettings'
import { SendFlow } from '../../features/wallet/screens/SendFlow'
import { ReceiveScreen } from '../../features/wallet/screens/ReceiveScreen'
import type { WalletStackParamList } from '../types'

const Stack = createNativeStackNavigator<WalletStackParamList>()

export function WalletStack(): React.JSX.Element {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="WalletOverview" component={WalletOverview} />
      <Stack.Screen name="WalletDetail" component={WalletDetail} />
      <Stack.Screen name="WalletSettings" component={WalletSettings} />
      <Stack.Screen name="SendFlow" component={SendFlow} />
      <Stack.Screen name="ReceiveScreen" component={ReceiveScreen} />
    </Stack.Navigator>
  )
}
