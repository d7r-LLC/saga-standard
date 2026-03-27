// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import React, { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { createPublicClient, http } from 'viem'
import type { PublicClient } from 'viem'
import type { ChainId } from '../../features/wallet/types'
import { CHAINS, DEFAULT_CHAIN_ID, RPC_URLS } from '../chain/config'

interface ChainContextValue {
  chainId: ChainId
  setChainId: (chainId: ChainId) => void
  publicClient: PublicClient
}

const ChainContext = createContext<ChainContextValue | null>(null)

export function useChain(): ChainContextValue {
  const context = useContext(ChainContext)
  if (!context) {
    throw new Error('useChain must be used within a ChainProvider')
  }
  return context
}

interface ChainProviderProps {
  children: React.ReactNode
}

export function ChainProvider({ children }: ChainProviderProps): React.JSX.Element {
  const [chainId, setChainIdState] = useState<ChainId>(DEFAULT_CHAIN_ID)

  const publicClient = useMemo(
    () =>
      createPublicClient({
        chain: CHAINS[chainId],
        transport: http(RPC_URLS[chainId]),
      }),
    [chainId]
  )

  const setChainId = useCallback((id: ChainId) => {
    setChainIdState(id)
  }, [])

  const value: ChainContextValue = useMemo(
    () => ({ chainId, setChainId, publicClient }),
    [chainId, setChainId, publicClient]
  )

  return <ChainContext.Provider value={value}>{children}</ChainContext.Provider>
}
