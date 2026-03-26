// Copyright 2026 d7r LLC
// SPDX-License-Identifier: Apache-2.0

'use client'

import { useCallback, useEffect, useState } from 'react'
import { useWalletLogin } from '@/hooks/useWalletLogin'
import { useEIP6963Discovery } from '@/hooks/useEIP6963Discovery'
import { isWalletConnectAvailable } from '@/lib/wallet/walletconnect'

const stepLabels: Record<string, string> = {
  connecting: 'Connecting wallet...',
  challenging: 'Requesting challenge...',
  signing: 'Sign the message in your wallet...',
  verifying: 'Verifying signature...',
}

export function WalletLoginSection({ callbackUrl }: { callbackUrl: string }) {
  const {
    loginWithMetaMask,
    loginWithPhantom,
    loginWithWalletConnect,
    isLoading,
    error,
    step,
    setError,
  } = useWalletLogin()
  const { hasMetaMask } = useEIP6963Discovery()
  const [hasPhantom, setHasPhantom] = useState(false)
  const [hasWalletConnect, setHasWalletConnect] = useState(false)

  useEffect(() => {
    setHasPhantom(!!window.solana?.isPhantom)
    setHasWalletConnect(isWalletConnectAvailable())
  }, [])

  const handleSuccess = useCallback(() => {
    window.location.href = callbackUrl
  }, [callbackUrl])

  const handleMetaMask = useCallback(async () => {
    try {
      await loginWithMetaMask()
      handleSuccess()
    } catch {
      // Error is set by the hook
    }
  }, [loginWithMetaMask, handleSuccess])

  const handlePhantom = useCallback(async () => {
    try {
      await loginWithPhantom()
      handleSuccess()
    } catch {
      // Error is set by the hook
    }
  }, [loginWithPhantom, handleSuccess])

  const handleWalletConnect = useCallback(async () => {
    try {
      await loginWithWalletConnect()
      handleSuccess()
    } catch {
      // Error is set by the hook
    }
  }, [loginWithWalletConnect, handleSuccess])

  const hasAnyWallet = hasMetaMask || hasPhantom || hasWalletConnect

  const buttonBase =
    'flex w-full items-center justify-center gap-3 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors disabled:opacity-50'
  const buttonIdle =
    'border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600'

  return (
    <div className="space-y-4">
      {/* Status / Error */}
      {isLoading && (
        <div className="rounded-md bg-sky-50 p-3 text-center text-sm text-sky-700 dark:bg-sky-900/30 dark:text-sky-400">
          {stepLabels[step] ?? 'Processing...'}
        </div>
      )}

      {error && !isLoading && (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-400">
          {error}
          <button
            type="button"
            onClick={() => setError(null)}
            className="ml-2 font-medium underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Wallet buttons */}
      {hasAnyWallet ? (
        <div className="space-y-3">
          {hasMetaMask && (
            <button
              type="button"
              onClick={handleMetaMask}
              disabled={isLoading}
              className={`${buttonBase} ${buttonIdle}`}
            >
              <svg className="h-5 w-5" viewBox="0 0 35 33" fill="none">
                <path
                  d="M32.96 1l-13.14 9.72 2.45-5.73L32.96 1z"
                  fill="#E2761B"
                  stroke="#E2761B"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M2.66 1l13.02 9.81L13.35 4.99 2.66 1zM28.23 23.53l-3.5 5.34 7.49 2.06 2.15-7.28-6.14-.12zM.67 23.65l2.13 7.28 7.47-2.06-3.48-5.34-6.12.12z"
                  fill="#E4761B"
                  stroke="#E4761B"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              {isLoading ? 'Connecting...' : 'Continue with MetaMask'}
            </button>
          )}

          {hasPhantom && (
            <button
              type="button"
              onClick={handlePhantom}
              disabled={isLoading}
              className={`${buttonBase} ${buttonIdle}`}
            >
              <svg className="h-5 w-5" viewBox="0 0 128 128" fill="none">
                <rect width="128" height="128" rx="26" fill="#AB9FF2" />
                <path
                  d="M110.58 64.58c0-3.2-2.59-5.79-5.79-5.79h-5.55c-3.2 0-5.79 2.59-5.79 5.79 0 3.2 2.59 5.79 5.79 5.79h5.55c3.2 0 5.79-2.59 5.79-5.79zM90.69 64.58c0-3.2-2.59-5.79-5.79-5.79H79.35c-3.2 0-5.79 2.59-5.79 5.79 0 3.2 2.59 5.79 5.79 5.79h5.55c3.2 0 5.79-2.59 5.79-5.79z"
                  fill="#fff"
                />
              </svg>
              {isLoading ? 'Connecting...' : 'Continue with Phantom'}
            </button>
          )}

          {hasWalletConnect && (
            <button
              type="button"
              onClick={handleWalletConnect}
              disabled={isLoading}
              className={`${buttonBase} ${buttonIdle}`}
            >
              <svg className="h-5 w-5" viewBox="0 0 300 185" fill="none">
                <path
                  d="M61.44 36.23c48.91-47.89 128.21-47.89 177.12 0l5.88 5.76a6.04 6.04 0 010 8.67l-20.13 19.71a3.18 3.18 0 01-4.43 0l-8.09-7.92c-34.12-33.41-89.44-33.41-123.56 0l-8.67 8.49a3.18 3.18 0 01-4.43 0L55 51.23a6.04 6.04 0 010-8.67l6.44-6.33zM270.9 68.67l17.92 17.55a6.04 6.04 0 010 8.67l-80.79 79.12a6.36 6.36 0 01-8.86 0l-57.34-56.16a1.59 1.59 0 00-2.21 0l-57.34 56.16a6.36 6.36 0 01-8.86 0L-7.18 94.89a6.04 6.04 0 010-8.67l17.92-17.55a6.36 6.36 0 018.86 0l57.34 56.16a1.59 1.59 0 002.21 0l57.34-56.16a6.36 6.36 0 018.86 0l57.34 56.16a1.59 1.59 0 002.21 0l57.34-56.16a6.36 6.36 0 018.86 0z"
                  fill="#3B99FC"
                />
              </svg>
              {isLoading ? 'Connecting...' : 'Continue with WalletConnect'}
            </button>
          )}
        </div>
      ) : (
        <div className="rounded-md border border-slate-200 p-4 text-center text-sm text-slate-600 dark:border-slate-700 dark:text-slate-400">
          <p className="font-medium">No wallet detected</p>
          <p className="mt-1">
            Install a browser wallet extension like{' '}
            <a
              href="https://metamask.io"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sky-600 underline hover:text-sky-700 dark:text-sky-400"
            >
              MetaMask
            </a>{' '}
            or{' '}
            <a
              href="https://phantom.app"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sky-600 underline hover:text-sky-700 dark:text-sky-400"
            >
              Phantom
            </a>{' '}
            to connect.
          </p>
        </div>
      )}
    </div>
  )
}
