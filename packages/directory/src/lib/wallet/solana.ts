// Copyright 2026 d7r LLC
// SPDX-License-Identifier: Apache-2.0

/**
 * Raw window.solana helpers for Phantom / injected Solana wallets.
 * Zero external dependencies — uses the Phantom provider API directly.
 */

/**
 * Check if a Solana wallet (Phantom) is available in the browser.
 */
export function isSolanaWalletAvailable(): boolean {
  return typeof window !== 'undefined' && !!window.solana
}

/**
 * Check specifically for Phantom.
 */
export function isPhantomAvailable(): boolean {
  return isSolanaWalletAvailable() && !!window.solana?.isPhantom
}

/**
 * Connect to Phantom wallet and get the public key (base58-encoded address).
 *
 * @throws Error if no wallet is available or user rejects the connection.
 */
export async function connectSolanaWallet(): Promise<string> {
  if (!window.solana) {
    throw new Error('No Solana wallet detected. Please install Phantom.')
  }

  const response = await window.solana.connect()
  return response.publicKey.toBase58()
}

/**
 * Sign a message with the connected Solana wallet.
 * Returns the base58-encoded signature.
 *
 * @param message - The message to sign
 * @throws Error if signing fails or user rejects.
 */
export async function signSolanaMessage(message: string): Promise<string> {
  if (!window.solana) {
    throw new Error('No Solana wallet detected.')
  }

  const encodedMessage = new TextEncoder().encode(message)
  const { signature } = await window.solana.signMessage(encodedMessage, 'utf8')

  // Convert Uint8Array to base58
  // Dynamic import to avoid bundling bs58 on server
  const bs58Module = await import('bs58')
  const bs58 = bs58Module.default
  return bs58.encode(signature)
}
