// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { useCallback, useEffect, useState } from 'react'
import type { TransactionRecord } from '../types'

interface UseTransactionsResult {
  transactions: TransactionRecord[]
  loading: boolean
  error: string | null
  refresh: () => void
}

/**
 * Hook to fetch transaction history for a wallet address.
 * Currently returns empty. Will integrate with block explorer API in future.
 */
export function useTransactions(
  _address: `0x${string}` | null,
  _chainId: string
): UseTransactionsResult {
  const [transactions, setTransactions] = useState<TransactionRecord[]>([])

  const refresh = useCallback(() => {
    if (!_address) return
    // Transaction history will be fetched from a block explorer API
    // For now, return empty.
    setTransactions([])
  }, [_address])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { transactions, loading: false, error: null, refresh }
}
