// Copyright 2026 d7r LLC
// SPDX-License-Identifier: Apache-2.0

'use client'

import { useCallback, useState } from 'react'
import type { WalletChain } from '../lib/wallet/types'

export type WalletStep =
  | 'idle'
  | 'connecting'
  | 'challenging'
  | 'signing'
  | 'verifying'

export interface WalletLoginResult {
  walletAddress: string
  chain: string
}

interface ChallengeResponse {
  challenge: string
  expiresAt: string
}

interface VerifyResponse {
  walletAddress: string
  chain: string
}

interface ErrorResponse {
  error: string
  error_description?: string
}

/**
 * Hook that orchestrates the full browser wallet login flow:
 * connect → challenge → sign → verify (session creation).
 *
 * Endpoints target the SAGA directory auth API:
 * - POST /api/auth/challenge  ← proxies to SAGA server /v1/auth/challenge
 * - POST /api/auth/verify     ← proxies to SAGA server /v1/auth/verify
 *
 * On success the server sets a session cookie; the caller handles redirects.
 */
export function useWalletLogin() {
  const [step, setStep] = useState<WalletStep>('idle')
  const [error, setError] = useState<string | null>(null)

  const isLoading = step !== 'idle'

  const executeLogin = useCallback(
    async (
      connectFn: () => Promise<string>,
      signFn: (address: string, message: string) => Promise<string>,
      chain: WalletChain,
    ): Promise<WalletLoginResult> => {
      setError(null)

      try {
        // Step 1: Connect wallet
        setStep('connecting')
        const address = await connectFn()

        // Step 2: Request challenge
        setStep('challenging')
        const challengeRes = await fetch('/api/auth/challenge', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ walletAddress: address, chain }),
        })

        if (!challengeRes.ok) {
          const err = (await challengeRes.json()) as ErrorResponse
          throw new Error(
            err.error_description ?? err.error ?? 'Challenge request failed',
          )
        }

        const { challenge } = (await challengeRes.json()) as ChallengeResponse

        // Step 3: Sign the challenge
        setStep('signing')
        const signature = await signFn(address, challenge)

        // Step 4: Submit to verify endpoint (creates server-side session)
        setStep('verifying')
        const verifyRes = await fetch('/api/auth/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            walletAddress: address,
            chain,
            signature,
            challenge,
          }),
        })

        if (!verifyRes.ok) {
          const err = (await verifyRes.json()) as ErrorResponse
          throw new Error(
            err.error_description ?? err.error ?? 'Verification failed',
          )
        }

        const data = (await verifyRes.json()) as VerifyResponse

        setStep('idle')
        return {
          walletAddress: data.walletAddress,
          chain: data.chain,
        }
      } catch (err) {
        setStep('idle')
        const message =
          err instanceof Error ? err.message : 'Wallet login failed'
        setError(message)
        throw err
      }
    },
    [],
  )

  const loginWithMetaMask =
    useCallback(async (): Promise<WalletLoginResult> => {
      const { connectEvmWallet, signEvmMessage } =
        await import('../lib/wallet/evm')
      return executeLogin(
        connectEvmWallet,
        (address, message) => signEvmMessage(address, message),
        'eip155:8453',
      )
    }, [executeLogin])

  const loginWithPhantom = useCallback(async (): Promise<WalletLoginResult> => {
    const { connectSolanaWallet, signSolanaMessage } =
      await import('../lib/wallet/solana')
    return executeLogin(
      connectSolanaWallet,
      (_address, message) => signSolanaMessage(message),
      'solana:mainnet',
    )
  }, [executeLogin])

  const loginWithWalletConnect =
    useCallback(async (): Promise<WalletLoginResult> => {
      const { connectWalletConnect, signWalletConnectMessage } =
        await import('../lib/wallet/walletconnect')
      // WalletConnect returns the provider from connect so we can reuse the session for signing
      let wcProvider:
        | Awaited<ReturnType<typeof connectWalletConnect>>['provider']
        | null = null
      return executeLogin(
        async () => {
          const result = await connectWalletConnect()
          wcProvider = result.provider
          return result.address
        },
        async (_address, message) => {
          if (!wcProvider) {
            throw new Error('WalletConnect provider not initialized')
          }
          return signWalletConnectMessage(wcProvider, _address, message)
        },
        'eip155:8453',
      )
    }, [executeLogin])

  return {
    loginWithMetaMask,
    loginWithPhantom,
    loginWithWalletConnect,
    isLoading,
    error,
    step,
    setError,
  }
}
