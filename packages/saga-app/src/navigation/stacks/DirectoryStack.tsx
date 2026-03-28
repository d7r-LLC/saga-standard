// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import React from 'react'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { DirectoryHome } from '../../features/directory/screens/DirectoryHome'
import { EntityDetail } from '../../features/directory/screens/EntityDetail'
import { DirectoryList } from '../../features/directory/screens/DirectoryList'
import type { DirectoryStackParamList } from '../types'

const Stack = createNativeStackNavigator<DirectoryStackParamList>()

export function DirectoryStack(): React.JSX.Element {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="DirectoryHome" component={DirectoryHome} />
      <Stack.Screen name="EntityDetail" component={EntityDetail} />
      <Stack.Screen name="DirectoryList" component={DirectoryList} />
    </Stack.Navigator>
  )
}
