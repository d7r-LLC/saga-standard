// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import React from 'react'
import { Text } from 'react-native'
import { act, render } from '@testing-library/react-native'
import { StorageProvider, useStorage } from '../../../../src/core/providers/StorageProvider'

jest.mock('../../../../src/core/storage/realm-store', () => ({
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

jest.mock('../../../../src/core/storage/async-storage', () => ({
  AppStorage: {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(undefined),
  },
}))

function TestConsumer() {
  const { wallets, addWallet, deleteWallet, activeWalletId, setActiveWallet } = useStorage()
  return (
    <>
      <Text testID="walletCount">{wallets.length}</Text>
      <Text testID="activeWalletId">{activeWalletId ?? 'none'}</Text>
      <Text
        testID="addWallet"
        onPress={() =>
          addWallet({
            id: 'w-1',
            type: 'self-custody',
            label: 'Test',
            address: '0x123',
            chain: 'base-sepolia',
            balance: '1.0',
          })
        }
      />
      <Text testID="deleteWallet" onPress={() => deleteWallet('w-1')} />
      <Text testID="setActive" onPress={() => setActiveWallet('w-1')} />
    </>
  )
}

describe('StorageProvider wallet operations', () => {
  it('starts with empty wallets', async () => {
    const { getByTestId } = render(
      <StorageProvider>
        <TestConsumer />
      </StorageProvider>
    )
    await act(async () => {})
    expect(getByTestId('walletCount').props.children).toBe(0)
  })

  it('adds a wallet', async () => {
    const { getByTestId } = render(
      <StorageProvider>
        <TestConsumer />
      </StorageProvider>
    )
    await act(async () => {})
    await act(async () => {
      getByTestId('addWallet').props.onPress()
    })
    expect(getByTestId('walletCount').props.children).toBe(1)
  })

  it('sets active wallet', async () => {
    const { getByTestId } = render(
      <StorageProvider>
        <TestConsumer />
      </StorageProvider>
    )
    await act(async () => {})
    await act(async () => {
      getByTestId('addWallet').props.onPress()
    })
    await act(async () => {
      getByTestId('setActive').props.onPress()
    })
    expect(getByTestId('activeWalletId').props.children).toBe('w-1')
  })
})
