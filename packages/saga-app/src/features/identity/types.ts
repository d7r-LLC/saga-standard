// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

export type EntityType = 'agent' | 'org' | 'directory'

/** Subset of EntityType that can be minted (directory is resolve-only) */
export type MintEntityType = 'agent' | 'org'

export interface IdentityData {
  id: string
  type: EntityType
  handle: string
  tokenId: string
  contractAddress: string
  tbaAddress: string
  hubUrl: string
}

export interface MintAgentParams {
  handle: string
  homeHubUrl: string
}

export interface MintOrgParams {
  handle: string
  name: string
}

export type MintStep = 'type' | 'handle' | 'confirm' | 'minting' | 'done' | 'error'

export interface MintState {
  step: MintStep
  entityType: MintEntityType | null
  handle: string
  orgName: string
  hubUrl: string
  error: string | null
  txHash: string | null
  tokenId: string | null
  tbaAddress: string | null
}

export interface HandleStatus {
  handle: string
  available: boolean | null
  checking: boolean
  error: string | null
}
