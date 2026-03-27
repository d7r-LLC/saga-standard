// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import React from 'react'
import { Text } from 'react-native'
import { act, render } from '@testing-library/react-native'
import { StorageProvider, useStorage } from '../../../src/core/providers/StorageProvider'

jest.mock('../../../src/core/storage/realm-store', () => ({
  RealmStore: {
    open: jest.fn().mockResolvedValue({}),
    close: jest.fn(),
    write: jest.fn((cb: () => unknown) => cb()),
    query: jest.fn().mockReturnValue([]),
  },
}))

jest.mock('../../../src/core/storage/async-storage', () => ({
  AppStorage: {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(undefined),
  },
}))

function TestConsumer() {
  const { initialized, wallets, identities } = useStorage()
  return (
    <>
      <Text testID="initialized">{String(initialized)}</Text>
      <Text testID="walletCount">{wallets.length}</Text>
      <Text testID="identityCount">{identities.length}</Text>
    </>
  )
}

describe('StorageProvider', () => {
  it('initializes with empty wallets and identities', async () => {
    const { getByTestId } = render(
      <StorageProvider>
        <TestConsumer />
      </StorageProvider>
    )

    await act(async () => {})

    expect(getByTestId('walletCount').props.children).toBe(0)
    expect(getByTestId('identityCount').props.children).toBe(0)
  })
})
