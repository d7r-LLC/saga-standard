// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

/** Metadata attached to every decoded event */
export interface EventMeta {
  txHash: string
  contractAddress: string
  chain: string
  blockNumber: bigint
}

/** Decoded AgentRegistered event */
export interface AgentRegisteredEvent {
  tokenId: bigint
  handle: string
  owner: string
  homeHubUrl: string
  registeredAt: bigint
}

/** Decoded OrgRegistered event */
export interface OrgRegisteredEvent {
  tokenId: bigint
  handle: string
  name: string
  owner: string
  registeredAt: bigint
}

/** Decoded ERC-721 Transfer event */
export interface TransferEvent {
  from: string
  to: string
  tokenId: bigint
}

/** Decoded HomeHubUpdated event */
export interface HomeHubUpdatedEvent {
  tokenId: bigint
  oldUrl: string
  newUrl: string
}

/** Decoded OrgNameUpdated event */
export interface OrgNameUpdatedEvent {
  tokenId: bigint
  oldName: string
  newName: string
}

/** Decoded DirectoryRegistered event from SAGADirectoryIdentity */
export interface DirectoryRegisteredEvent {
  tokenId: bigint
  directoryId: string
  operator: string
  url: string
  conformanceLevel: string
  registeredAt: bigint
}

/** Decoded DirectoryStatusUpdated event */
export interface DirectoryStatusUpdatedEvent {
  tokenId: bigint
  oldStatus: string
  newStatus: string
}

/** Decoded DirectoryUrlUpdated event */
export interface DirectoryUrlUpdatedEvent {
  tokenId: bigint
  oldUrl: string
  newUrl: string
}

/** KV key for the indexer block cursor */
export const INDEXER_CURSOR_KEY = 'indexer:lastBlock'

/** ERC-6551 TBA implementation address (same across all EVM chains) */
export const TBA_IMPLEMENTATION = '0x55266d75D1a14E4572138116aF39863Ed6596E7F' as const

/** Map CAIP-2 chain identifiers to numeric chain IDs for TBA computation */
export const CHAIN_ID_MAP: Record<string, number> = {
  'eip155:84532': 84532,
  'eip155:8453': 8453,
}
