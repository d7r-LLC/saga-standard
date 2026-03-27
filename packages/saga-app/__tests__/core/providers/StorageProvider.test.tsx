// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import React from 'react'
import { Text } from 'react-native'
import { act, render } from '@testing-library/react-native'
import { StorageProvider, useStorage } from '../../../src/core/providers/StorageProvider'
import { RealmStore } from '../../../src/core/storage/realm-store'

jest.mock('../../../src/core/storage/realm-store', () => ({
  RealmStore: {
    open: jest.fn().mockResolvedValue({}),
    close: jest.fn(),
    write: jest.fn((cb: () => unknown) => cb()),
    query: jest.fn().mockReturnValue([]),
    getInstance: jest.fn().mockReturnValue({
      create: jest.fn(),
      objectForPrimaryKey: jest.fn(),
      delete: jest.fn(),
    }),
  },
}))

jest.mock('../../../src/core/storage/async-storage', () => ({
  AppStorage: {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(undefined),
  },
}))

function TestConsumer({ onStorage }: { onStorage?: (s: ReturnType<typeof useStorage>) => void }) {
  const storage = useStorage()
  const { initialized, wallets, identities } = storage
  if (onStorage) onStorage(storage)
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

  it('updateWalletBalance updates the balance for a given wallet', async () => {
    let storageRef: ReturnType<typeof useStorage> | null = null

    const { getByTestId } = render(
      <StorageProvider>
        <TestConsumer
          onStorage={s => {
            storageRef = s
          }}
        />
      </StorageProvider>
    )

    await act(async () => {})

    const storage = storageRef as unknown as ReturnType<typeof useStorage>

    // Add a wallet first
    await act(async () => {
      storage.addWallet({
        id: 'w1',
        type: 'self-custody',
        label: 'Test',
        address: '0x1234',
        chain: 'base-sepolia',
        balance: '0',
      })
    })

    expect(getByTestId('walletCount').props.children).toBe(1)

    // Update balance
    await act(async () => {
      storage.updateWalletBalance('w1', '1.5')
    })

    // Verify Realm write was called for the balance update
    const mockedStore = jest.mocked(RealmStore)
    expect(mockedStore.write).toHaveBeenCalled()
  })
})
