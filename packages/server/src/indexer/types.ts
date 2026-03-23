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
  hubUrl: string
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

/** KV key for the indexer block cursor */
export const INDEXER_CURSOR_KEY = 'indexer:lastBlock'
