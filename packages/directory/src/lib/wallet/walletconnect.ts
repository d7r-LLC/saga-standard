// Copyright 2026 d7r LLC
// SPDX-License-Identifier: Apache-2.0

/**
 * WalletConnect helpers for EVM wallet connections.
 * Uses @walletconnect/ethereum-provider with the QR modal.
 * Gracefully degrades when NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID is not set.
 *
 * Each connect/sign call creates a fresh provider to avoid stale session
 * issues with module-level singletons in HMR / React Strict Mode.
 */

import type EthereumProvider from '@walletconnect/ethereum-provider'

/**
 * Check if WalletConnect is available (project ID is configured).
 */
export function isWalletConnectAvailable(): boolean {
  return !!process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID
}

/**
 * Create a fresh WalletConnect EthereumProvider instance.
 * Dynamically imports to keep the bundle small when not used.
 */
async function createProvider(): Promise<EthereumProvider> {
  const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID
  if (!projectId) {
    throw new Error('WalletConnect project ID is not configured')
  }

  const { default: Provider } = await import('@walletconnect/ethereum-provider')

  return Provider.init({
    projectId,
    chains: [8453], // Base mainnet
    showQrModal: true,
    optionalChains: [1, 10, 42161], // Ethereum, Optimism, Arbitrum
    metadata: {
      name: 'SAGA Directory',
      description: 'SAGA Agent Directory',
      url:
        typeof window !== 'undefined'
          ? window.location.origin
          : 'https://directory.saga.epicdm.com',
      icons: ['https://saga.epicdm.com/favicon.ico'],
    },
  })
}

/**
 * Connect via WalletConnect and get the selected account address.
 * Shows the WalletConnect QR modal for the user to scan.
 *
 * Returns both the address and the provider instance so the caller
 * can use the same session for signing.
 *
 * @throws Error if connection fails or user rejects.
 */
export async function connectWalletConnect(): Promise<{
  address: string
  provider: EthereumProvider
}> {
  const provider = await createProvider()

  // Enable opens the QR modal
  const accounts = (await provider.enable()) as string[]
  if (!accounts[0]) {
    throw new Error('No account returned from WalletConnect.')
  }

  return { address: accounts[0].toLowerCase(), provider }
}

/**
 * Sign a message with a WalletConnect provider.
 * Returns the hex-encoded signature (0x-prefixed).
 *
 * Hex-encodes the message for personal_sign (EIP-191 spec) to match
 * the encoding used by injected EVM wallets (MetaMask via evm.ts).
 *
 * @param provider - The WalletConnect provider from connectWalletConnect
 * @param address - The signer address
 * @param message - The message to sign
 * @throws Error if signing fails or user rejects.
 */
export async function signWalletConnectMessage(
  provider: EthereumProvider,
  address: string,
  message: string,
): Promise<string> {
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

/**
 * Disconnect a WalletConnect provider session.
 */
export async function disconnectWalletConnect(
  provider: EthereumProvider,
): Promise<void> {
  await provider.disconnect()
}
