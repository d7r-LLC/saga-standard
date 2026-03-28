// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

export interface AgentSummary {
  handle: string
  walletAddress: string
  chain: string
  entityType: 'agent'
  tokenId: string | null
  registeredAt: string
}

export interface OrgSummary {
  handle: string
  name: string
  walletAddress: string
  chain: string
  entityType: 'org'
  tokenId: string | null
  registeredAt: string
}

export type EntityCardData = AgentSummary | OrgSummary

export interface AgentDetail extends AgentSummary {
  publicKey: string | null
  homeHubUrl: string | null
  tbaAddress: string | null
  contractAddress: string | null
  mintTxHash: string | null
  updatedAt: string
}

export interface OrgDetail extends OrgSummary {
  publicKey: string | null
  tbaAddress: string | null
  contractAddress: string | null
  mintTxHash: string | null
  updatedAt: string
}

export interface DirectorySummary {
  directoryId: string
  url: string
  operatorWallet: string
  conformanceLevel: string
  status: 'active' | 'suspended' | 'flagged' | 'revoked'
  chain: string
  tokenId: number | null
  registeredAt: string
}

export type SearchFilter = 'all' | 'agents' | 'orgs'

export interface SearchResult {
  agents: AgentSummary[]
  orgs: OrgSummary[]
  totalAgents: number
  totalOrgs: number
}

export interface DirectoriesResult {
  directories: DirectorySummary[]
  total: number
}

export type ResolvedEntity = AgentDetail | OrgDetail
