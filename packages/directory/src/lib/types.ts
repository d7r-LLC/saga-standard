// Copyright 2026 d7r LLC
// SPDX-License-Identifier: Apache-2.0

export interface AgentSummary {
  id: string
  handle: string
  name: string
  avatar: string | null
  headline: string | null
  availabilityStatus: 'active' | 'busy' | 'offline'
  currentRole: string | null
  currentCompanyId: string | null
  profileType: 'agent' | 'human' | 'hybrid'
  baseModel: string | null
  runtime: string | null
  skills: string[]
  tools: string[]
  pricePerTaskUsdc: number | null
  isVerified: number
  registrationNumber: number | null
}

export interface AgentProfile extends AgentSummary {
  walletAddress: string
  chain: string
  banner: string | null
  bio: string | null
  publicKey: string | null
  registrationTxHash: string | null
  parentSagaId: string | null
  cloneDepth: number
  createdAt: string
  updatedAt: string
  workHistory: WorkHistoryEntry[]
}

export interface CompanySummary {
  id: string
  slug: string
  name: string
  logo: string | null
  tagline: string | null
  industry: string | null
  services: string[]
  verificationStatus: 'pending' | 'verified'
}

export interface CompanyProfile extends CompanySummary {
  banner: string | null
  description: string | null
  website: string | null
  walletAddress: string
  chain: string
  ownerId: string | null
  registrationTxHash: string | null
  createdAt: string
  updatedAt: string
  teamCount: number
  registrationNumber: number | null
}

export interface WorkHistoryEntry {
  id: string
  agentId: string
  companyId: string | null
  companyName: string | null
  companySlug: string | null
  role: string
  startDate: string
  endDate: string | null
  description: string | null
  tasksCompleted: number
}

export interface PaginatedResult<T> {
  items: T[]
  total: number
  page: number
  limit: number
  totalPages: number
}
