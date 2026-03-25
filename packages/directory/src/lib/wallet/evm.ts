// Copyright 2026 d7r LLC
// SPDX-License-Identifier: Apache-2.0

/**
 * EVM wallet helpers using EIP-6963 multi-provider discovery.
 *
 * Modern wallets (MetaMask, Coinbase, Rabby, etc.) announce themselves via
 * EIP-6963 events, avoiding the legacy window.ethereum proxy conflicts that
 * cause "Unexpected error" in selectExtension when multiple wallets are present.
 *
 * Falls back to window.ethereum for wallets that haven't adopted EIP-6963.
 */

import type { EIP1193Provider, EIP6963ProviderDetail } from './types'

/**
 * Discover all EIP-6963 providers. Dispatches the request event and
 * collects announcements within a short timeout window.
 */
export function discoverEIP6963Providers(): Promise<EIP6963ProviderDetail[]> {
  return new Promise((resolve) => {
    const providers: EIP6963ProviderDetail[] = []

    function onAnnounce(event: Event) {
      const detail = (event as CustomEvent<EIP6963ProviderDetail>).detail
      if (detail?.info && detail?.provider) {
        providers.push(detail)
      }
    }

    window.addEventListener('eip6963:announceProvider', onAnnounce)

    // Ask wallets to announce themselves
    window.dispatchEvent(new Event('eip6963:requestProvider'))

    // Give wallets a brief window to respond, then resolve
    setTimeout(() => {
      window.removeEventListener('eip6963:announceProvider', onAnnounce)
      resolve(providers)
    }, 100)
  })
}

/**
 * Find a specific EIP-6963 provider by RDNS pattern (e.g., 'io.metamask').
 */
export async function findProviderByRdns(
  pattern: string,
): Promise<EIP6963ProviderDetail | undefined> {
  const providers = await discoverEIP6963Providers()
  return providers.find((p) => p.info.rdns.includes(pattern))
}

/**
 * Get the best available MetaMask provider.
 * Prefers EIP-6963 discovery, falls back to window.ethereum.
 */
async function getMetaMaskProvider(): Promise<EIP1193Provider> {
  // Try EIP-6963 first (avoids proxy conflicts)
  const metamask = await findProviderByRdns('io.metamask')
  if (metamask) {
    return metamask.provider
  }

  // Fallback to legacy window.ethereum
  if (window.ethereum?.isMetaMask) {
    return window.ethereum
  }

  // Last resort: any injected provider
  if (window.ethereum) {
    return window.ethereum
  }

  throw new Error('No EVM wallet detected. Please install MetaMask.')
}

/**
 * Check if an EVM wallet (MetaMask) is available in the browser.
 */
export function isEvmWalletAvailable(): boolean {
  return typeof window !== 'undefined' && !!window.ethereum
}

/**
 * Check specifically for MetaMask.
 */
export function isMetaMaskAvailable(): boolean {
  return isEvmWalletAvailable() && !!window.ethereum?.isMetaMask
}

/**
 * Connect to MetaMask using EIP-6963 discovery (with legacy fallback).
 * Returns the address lowercased for consistency.
 *
 * @throws Error if no wallet is available or user rejects the connection.
 */
export async function connectEvmWallet(): Promise<string> {
  const provider = await getMetaMaskProvider()

  const accounts = (await provider.request({
    method: 'eth_requestAccounts',
  })) as string[]

  if (!accounts[0]) {
    throw new Error('No account returned from wallet.')
  }

  return accounts[0].toLowerCase()
}

/**
 * Sign a message with MetaMask using EIP-6963 discovery (with legacy fallback).
 * Returns the hex-encoded signature (0x-prefixed).
 *
 * @param address - The signer address (must match connected account)
 * @param message - The message to sign (will be displayed to the user)
 * @throws Error if signing fails or user rejects.
 */
export async function signEvmMessage(
  address: string,
  message: string,
): Promise<string> {
  const provider = await getMetaMaskProvider()

  // Convert message to hex for personal_sign (EIP-191 spec)
  const hexMessage = `0x${Array.from(new TextEncoder().encode(message))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')}`

  const signature = (await provider.request({
    method: 'personal_sign',
    params: [hexMessage, address],
  })) as string

  return signature
}
