// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { useCallback, useMemo, useRef, useState } from 'react'
import { createWalletClient, http } from 'viem'
import type { WalletClient } from 'viem'
import { mnemonicToAccount } from 'viem/accounts'
import { SecureKeychain } from '../../../core/storage/keychain'
import { useChain } from '../../../core/providers/ChainProvider'
import { useStorage } from '../../../core/providers/StorageProvider'
import { KEYCHAIN_MNEMONIC_PREFIX } from '../constants'
import { CHAINS, RPC_URLS } from '../../../core/chain/config'
import type { ChainId } from '../types'

export interface UseWalletSignerResult {
  getWalletClient: () => Promise<WalletClient>
  signing: boolean
  error: string | null
  clearError: () => void
}

export function useWalletSigner(walletId: string | null): UseWalletSignerResult {
  const { chainId } = useChain()
  const { wallets } = useStorage()
  const [signing, setSigning] = useState(false)
  const errorRef = useRef<string | null>(null)
  const cachedClient = useRef<{ walletId: string; chainId: ChainId; client: WalletClient } | null>(
    null
  )

  const getWalletClient = useCallback(async (): Promise<WalletClient> => {
    if (!walletId) {
      errorRef.current = 'No wallet selected.'
      throw new Error('No wallet selected')
    }

    // Return cached client if walletId and chainId match
    if (
      cachedClient.current &&
      cachedClient.current.walletId === walletId &&
      cachedClient.current.chainId === chainId
    ) {
      return cachedClient.current.client
    }

    setSigning(true)
    errorRef.current = null

    try {
      const wallet = wallets.find(w => w.id === walletId)
      const derivationPath = (wallet?.derivationPath ?? "m/44'/60'/0'/0/0") as `m/44'/60'/${string}`

      const mnemonic = await SecureKeychain.get(`${KEYCHAIN_MNEMONIC_PREFIX}-${walletId}`)

      if (!mnemonic) {
        errorRef.current = 'Wallet key not found. Re-import your wallet.'
        throw new Error('Wallet key not found')
      }

      const account = mnemonicToAccount(mnemonic, { path: derivationPath })

      const client = createWalletClient({
        account,
        chain: CHAINS[chainId],
        transport: http(RPC_URLS[chainId]),
      })

      cachedClient.current = { walletId, chainId, client }
      return client
    } finally {
      setSigning(false)
    }
  }, [walletId, chainId, wallets])

  const clearError = useCallback(() => {
    errorRef.current = null
  }, [])

  const result = useMemo(() => {
    const obj: UseWalletSignerResult = {
      getWalletClient,
      signing,
      error: null,
      clearError,
    }
    Object.defineProperty(obj, 'error', {
      get: () => errorRef.current,
      enumerable: true,
      configurable: true,
    })
    return obj
  }, [getWalletClient, signing, clearError])

  return result
}
