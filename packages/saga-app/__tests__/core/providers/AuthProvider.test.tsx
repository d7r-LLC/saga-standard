// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import React from 'react'
import { Text } from 'react-native'
import { act, fireEvent, render } from '@testing-library/react-native'
import { AuthProvider, useAuth } from '../../../src/core/providers/AuthProvider'
import { Button } from '../../../src/components/Button'

jest.mock('react-native-biometrics', () => {
  return jest.fn().mockImplementation(() => ({
    isSensorAvailable: jest.fn().mockResolvedValue({ available: true, biometryType: 'FaceID' }),
    simplePrompt: jest.fn().mockResolvedValue({ success: true }),
  }))
})

jest.mock('../../../src/core/storage/async-storage', () => ({
  AppStorage: {
    get: jest.fn().mockResolvedValue(true),
    set: jest.fn().mockResolvedValue(undefined),
  },
}))

function TestConsumer() {
  const { isLocked, biometricType, unlock } = useAuth()
  return (
    <>
      <Text testID="locked">{String(isLocked)}</Text>
      <Text testID="biometricType">{biometricType ?? 'none'}</Text>
      <Button title="Unlock" onPress={() => unlock()} />
    </>
  )
}

describe('AuthProvider', () => {
  it('starts in locked state', async () => {
    const { getByTestId } = render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    )
    await act(async () => {})
    expect(getByTestId('locked').props.children).toBe('true')
  })

  it('unlocks via biometric prompt', async () => {
    const { getByTestId, getByText } = render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    )
    await act(async () => {})
    await act(async () => {
      fireEvent.press(getByText('Unlock'))
    })
    expect(getByTestId('locked').props.children).toBe('false')
  })
})
