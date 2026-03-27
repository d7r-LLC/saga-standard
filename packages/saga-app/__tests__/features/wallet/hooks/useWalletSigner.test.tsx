// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { act, renderHook } from '@testing-library/react-native'
import { useWalletSigner } from '../../../../src/features/wallet/hooks/useWalletSigner'

const TEST_MNEMONIC = 'test test test test test test test test test test test junk'

jest.mock('../../../../src/core/storage/keychain', () => ({
  SecureKeychain: {
    get: jest.fn(),
  },
}))

jest.mock('../../../../src/core/providers/ChainProvider', () => ({
  useChain: () => ({ chainId: 'base-sepolia' }),
}))

jest.mock('../../../../src/core/providers/StorageProvider', () => ({
  useStorage: () => ({
    wallets: [
      {
        id: 'w1',
        type: 'self-custody',
        label: 'Test Wallet',
        address: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
        chain: 'base-sepolia',
        balance: '1.0',
        derivationPath: "m/44'/60'/0'/0/0",
      },
    ],
  }),
}))

describe('useWalletSigner', () => {
  const { SecureKeychain } = jest.requireMock('../../../../src/core/storage/keychain')

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('returns a WalletClient when mnemonic is found', async () => {
    SecureKeychain.get.mockResolvedValue(TEST_MNEMONIC)

    const { result } = renderHook(() => useWalletSigner('w1'))

    let client: unknown
    await act(async () => {
      client = await result.current.getWalletClient()
    })

    expect(client).toBeDefined()
    expect(SecureKeychain.get).toHaveBeenCalledWith('wallet-mnemonic-w1')
    expect(result.current.error).toBeNull()
  })

  it('sets error when mnemonic is not found', async () => {
    SecureKeychain.get.mockResolvedValue(null)

    const { result } = renderHook(() => useWalletSigner('w1'))

    let thrown: Error | undefined
    await act(async () => {
      try {
        await result.current.getWalletClient()
      } catch (e) {
        thrown = e as Error
      }
    })

    expect(thrown?.message).toBe('Wallet key not found')
    expect(result.current.error).toBe('Wallet key not found. Re-import your wallet.')
  })

  it('sets error when walletId is null', async () => {
    const { result } = renderHook(() => useWalletSigner(null))

    let thrown: Error | undefined
    await act(async () => {
      try {
        await result.current.getWalletClient()
      } catch (e) {
        thrown = e as Error
      }
    })

    expect(thrown?.message).toBe('No wallet selected')
    expect(result.current.error).toBe('No wallet selected.')
  })

  it('clears error with clearError', async () => {
    SecureKeychain.get.mockResolvedValue(null)

    const { result } = renderHook(() => useWalletSigner('w1'))

    await act(async () => {
      await result.current.getWalletClient().catch(() => {})
    })

    expect(result.current.error).not.toBeNull()

    act(() => {
      result.current.clearError()
    })

    expect(result.current.error).toBeNull()
  })
})
