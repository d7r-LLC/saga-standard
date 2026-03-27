// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { useCallback, useRef, useState } from 'react'
import { createWalletClient, http } from 'viem'
import type { WalletClient } from 'viem'
import { mnemonicToAccount } from 'viem/accounts'
import { SecureKeychain } from '../../../core/storage/keychain'
import { useChain } from '../../../core/providers/ChainProvider'
import { useStorage } from '../../../core/providers/StorageProvider'
import { DEFAULT_DERIVATION_PATH, KEYCHAIN_MNEMONIC_PREFIX } from '../constants'
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
  const [error, setError] = useState<string | null>(null)
  const cachedClient = useRef<{ walletId: string; chainId: ChainId; client: WalletClient } | null>(
    null
  )

  const getWalletClient = useCallback(async (): Promise<WalletClient> => {
    if (!walletId) {
      const msg = 'No wallet selected.'
      setError(msg)
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
    setError(null)
    let errorSet = false

    try {
      const wallet = wallets.find(w => w.id === walletId)
      const derivationPath = (wallet?.derivationPath ||
        DEFAULT_DERIVATION_PATH) as `m/44'/60'/${string}`

      const mnemonic = await SecureKeychain.get(`${KEYCHAIN_MNEMONIC_PREFIX}-${walletId}`)

      if (!mnemonic) {
        const msg = 'Wallet key not found. Re-import your wallet.'
        setError(msg)
        errorSet = true
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
    } catch (err) {
      if (!errorSet) {
        const msg =
          err instanceof Error && err.message
            ? err.message
            : 'Unexpected error while preparing wallet client.'
        setError(msg)
      }
      throw err
    } finally {
      setSigning(false)
    }
  }, [walletId, chainId, wallets])

  const clearError = useCallback(() => {
    setError(null)
  }, [])

  return { getWalletClient, signing, error, clearError }
}
