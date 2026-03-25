// Copyright 2026 d7r LLC
// SPDX-License-Identifier: Apache-2.0

'use client'

import { useEffect, useState } from 'react'
import type { EIP6963ProviderDetail } from '../lib/wallet/types'

/**
 * Shared hook for EIP-6963 multi-provider wallet discovery.
 *
 * Dispatches `eip6963:requestProvider` and collects announcements within
 * a 150ms window, then falls back to legacy `window.ethereum` if no
 * EIP-6963 wallets respond.
 *
 * Used by WalletLoginSection (connect page) to detect available wallets.
 */
export function useEIP6963Discovery() {
  const [evmWallets, setEvmWallets] = useState<EIP6963ProviderDetail[]>([])
  const [hasLegacyMetaMask, setHasLegacyMetaMask] = useState(false)

  useEffect(() => {
    const discovered: EIP6963ProviderDetail[] = []

    function onAnnounce(event: Event) {
      const detail = (event as CustomEvent<EIP6963ProviderDetail>).detail
      if (detail?.info && detail?.provider) {
        discovered.push(detail)
      }
    }

    window.addEventListener('eip6963:announceProvider', onAnnounce)
    window.dispatchEvent(new Event('eip6963:requestProvider'))

    // Give wallets time to announce, then finalize
    const timer = setTimeout(() => {
      window.removeEventListener('eip6963:announceProvider', onAnnounce)
      setEvmWallets([...discovered])

      // Legacy fallback: if no EIP-6963 wallets found, check window.ethereum
      if (discovered.length === 0) {
        setHasLegacyMetaMask(!!window.ethereum?.isMetaMask)
      }
    }, 150)

    return () => {
      clearTimeout(timer)
      window.removeEventListener('eip6963:announceProvider', onAnnounce)
    }
  }, [])

  // Check if MetaMask-like wallet is available (EIP-6963 or legacy)
  const hasMetaMask =
    evmWallets.some((w) => w.info.rdns.includes('io.metamask')) ||
    hasLegacyMetaMask

  return { evmWallets, hasMetaMask, hasLegacyMetaMask }
}
