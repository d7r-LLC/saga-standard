// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import React from 'react'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import type { MessagesStackParamList } from '../types'
import { ConversationList } from '../../features/chat/screens/ConversationList'
import { NewChat } from '../../features/chat/screens/NewChat'
import { ChatScreen } from '../../features/chat/screens/ChatScreen'

const Stack = createNativeStackNavigator<MessagesStackParamList>()

export function MessagesStack(): React.JSX.Element {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="ConversationList" component={ConversationList} />
      <Stack.Screen name="NewChat" component={NewChat} />
      <Stack.Screen name="ChatScreen" component={ChatScreen} />
    </Stack.Navigator>
  )
}
