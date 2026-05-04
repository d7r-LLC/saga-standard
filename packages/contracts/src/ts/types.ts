// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

/** Entity type matching the on-chain SAGAHandleRegistry.EntityType enum */
export type EntityType = 'NONE' | 'AGENT' | 'ORG' | 'DIRECTORY'

/** Numeric entity type values matching Solidity enum (0=NONE, 1=AGENT, 2=ORG, 3=DIRECTORY) */
export const ENTITY_TYPE_VALUES = {
  NONE: 0,
  AGENT: 1,
  ORG: 2,
  DIRECTORY: 3,
} as const

/** On-chain handle record from SAGAHandleRegistry.resolveHandle() */
export interface HandleRecord {
  entityType: EntityType
  tokenId: bigint
  contractAddress: `0x${string}`
}

/** Agent identity data from SAGAAgentIdentity */
export interface AgentIdentity {
  tokenId: bigint
  handle: string
  homeHubUrl: string
  owner: `0x${string}`
  registeredAt: bigint
}

/** Organization identity data from SAGAOrgIdentity */
export interface OrgIdentity {
  tokenId: bigint
  handle: string
  name: string
  owner: `0x${string}`
  registeredAt: bigint
}

/** Maps numeric entity type from chain to string */
export function entityTypeFromNumber(n: number): EntityType {
  switch (n) {
    case 0:
      return 'NONE'
    case 1:
      return 'AGENT'
    case 2:
      return 'ORG'
    case 3:
      return 'DIRECTORY'
    default:
      return 'NONE'
  }
}

/** Directory identity data from SAGADirectoryIdentity */
export interface DirectoryIdentity {
  tokenId: bigint
  directoryId: string
  url: string
  operatorWallet: `0x${string}`
  /**
   * Self-claimed conformance level. SAGA does NOT verify this string
   * on-chain — the directory operator sets it at registration time.
   * Off-chain consumers must verify true SAGA conformance through an
   * out-of-band audit. Phase 9 (G-7): renamed from `conformanceLevel`
   * to make the self-claim semantics explicit at the API layer. The
   * Solidity function name (`conformanceLevel(uint256)`) is preserved
   * for ABI compatibility with the indexer and SDK clients.
   */
  claimedConformanceLevel: string
  status: string
  registeredAt: bigint
}
