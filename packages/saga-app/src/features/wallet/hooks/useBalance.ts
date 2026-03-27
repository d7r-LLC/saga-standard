// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { useCallback, useEffect, useState } from 'react'
import { fetchAllBalances } from '../chain'
import type { ChainId, TokenBalance } from '../types'

interface UseBalanceResult {
  balances: TokenBalance[]
  loading: boolean
  error: string | null
  refresh: () => void
}

export function useBalance(address: `0x${string}` | null, chainId: ChainId): UseBalanceResult {
  const [balances, setBalances] = useState<TokenBalance[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(() => {
    if (!address) return

    setLoading(true)
    setError(null)

    fetchAllBalances(chainId, address)
      .then(result => {
        setBalances(result)
        setLoading(false)
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : String(err))
        setLoading(false)
      })
  }, [address, chainId])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { balances, loading, error, refresh }
}
