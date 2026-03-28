// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { useCallback, useRef, useState } from 'react'
import type { Account, Chain, Transport } from 'viem'
import type { WalletClient } from 'viem'
import { useStorage } from '../../../core/providers/StorageProvider'
import { useWalletSigner } from '../../wallet/hooks/useWalletSigner'
import { hubAuthManager } from '../../../core/api/hub'
import { requestChallenge, verifyChallenge } from '../api/session'

export interface UseSessionResult {
  token: string | null
  isAuthenticated: boolean
  authenticating: boolean
  error: string | null
  getToken: () => Promise<string>
  clearSession: () => void
}

export function useSession(): UseSessionResult {
  const { wallets, activeWalletId } = useStorage()
  const { getWalletClient } = useWalletSigner(activeWalletId)
  const [token, setToken] = useState<string | null>(null)
  const [authenticating, setAuthenticating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const sessionRef = useRef<{ token: string; expiresAt: string } | null>(null)

  const getToken = useCallback(async (): Promise<string> => {
    // Return cached token if still valid (with 60s buffer)
    if (sessionRef.current) {
      const expiresAt = new Date(sessionRef.current.expiresAt)
      if (expiresAt.getTime() - Date.now() > 60_000) {
        return sessionRef.current.token
      }
    }

    setAuthenticating(true)
    setError(null)

    try {
      const wallet = wallets.find(w => w.id === activeWalletId)
      if (!wallet) throw new Error('No active wallet')

      const { challenge } = await requestChallenge(wallet.address, wallet.chain)
      const client = await getWalletClient()
      const signature = await (client as WalletClient<Transport, Chain, Account>).signMessage({
        message: challenge,
      })
      const session = await verifyChallenge(wallet.address, wallet.chain, signature, challenge)

      sessionRef.current = { token: session.token, expiresAt: session.expiresAt }
      hubAuthManager.setToken(session.token)
      setToken(session.token)
      return session.token
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Authentication failed'
      setError(msg)
      throw err
    } finally {
      setAuthenticating(false)
    }
  }, [wallets, activeWalletId, getWalletClient])

  const clearSession = useCallback(() => {
    sessionRef.current = null
    hubAuthManager.logout()
    setToken(null)
    setError(null)
  }, [])

  return { token, isAuthenticated: token !== null, authenticating, error, getToken, clearSession }
}
