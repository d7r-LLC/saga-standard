// Copyright 2026 d7r LLC
// SPDX-License-Identifier: Apache-2.0

/**
 * Supported chain identifiers for wallet login.
 */
export type WalletChain = 'eip155:8453' | 'solana:mainnet'

/**
 * Result of connecting a wallet.
 */
export interface WalletConnection {
  address: string
  chain: WalletChain
}

/**
 * EIP-6963: Multi Injected Provider Discovery.
 * https://eips.ethereum.org/EIPS/eip-6963
 */
export interface EIP6963ProviderInfo {
  uuid: string
  name: string
  icon: string
  rdns: string
}

export interface EIP1193Provider {
  isMetaMask?: boolean
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>
  on?: (event: string, handler: (...args: unknown[]) => void) => void
  removeListener?: (
    event: string,
    handler: (...args: unknown[]) => void,
  ) => void
}

export interface EIP6963ProviderDetail {
  info: EIP6963ProviderInfo
  provider: EIP1193Provider
}

export interface EIP6963AnnounceProviderEvent extends Event {
  detail: EIP6963ProviderDetail
}

/**
 * Window augmentation for injected wallet providers.
 */
declare global {
  interface WindowEventMap {
    'eip6963:announceProvider': EIP6963AnnounceProviderEvent
  }

  interface Window {
    ethereum?: EIP1193Provider
    solana?: {
      isPhantom?: boolean
      connect: () => Promise<{ publicKey: { toBase58: () => string } }>
      signMessage: (
        message: Uint8Array,
        encoding: string,
      ) => Promise<{ signature: Uint8Array }>
      disconnect: () => Promise<void>
    }
  }
}
