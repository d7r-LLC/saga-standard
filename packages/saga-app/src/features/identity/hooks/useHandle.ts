// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { useCallback, useState } from 'react'
import { useChain } from '../../../core/providers/ChainProvider'
import { checkHandleAvailability, resolveHandle } from '../chain'
import type { OnChainResolveResult } from '../chain'
import type { HandleStatus } from '../types'

interface UseHandleResult {
  status: HandleStatus
  checkAvailability: (handle: string) => Promise<void>
  resolve: (handle: string) => Promise<OnChainResolveResult | null>
  reset: () => void
}

const INITIAL_STATUS: HandleStatus = {
  handle: '',
  available: null,
  checking: false,
  error: null,
}

export function useHandle(): UseHandleResult {
  const { chainId, publicClient } = useChain()
  const [status, setStatus] = useState<HandleStatus>(INITIAL_STATUS)

  const checkAvailability = useCallback(
    async (handle: string) => {
      setStatus({ handle, available: null, checking: true, error: null })
      try {
        const available = await checkHandleAvailability(handle, publicClient, chainId)
        setStatus({ handle, available, checking: false, error: null })
      } catch (err: unknown) {
        setStatus({
          handle,
          available: null,
          checking: false,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    },
    [chainId, publicClient]
  )

  const resolve = useCallback(
    async (handle: string): Promise<OnChainResolveResult | null> => {
      try {
        return await resolveHandle(handle, publicClient, chainId)
      } catch {
        return null
      }
    },
    [chainId, publicClient]
  )

  const reset = useCallback(() => {
    setStatus(INITIAL_STATUS)
  }, [])

  return { status, checkAvailability, resolve, reset }
}
