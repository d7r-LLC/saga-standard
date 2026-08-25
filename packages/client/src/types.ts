// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import type { ChainId, ExportType, StorageRef } from '@d7r/saga-sdk'

// ── Auth ─────────────────────────────────────────────────────────────

export interface ChallengeRequest {
  walletAddress: string
  chain: ChainId
}

export interface ChallengeResponse {
  challenge: string
  expiresAt: string
}

export interface VerifyRequest {
  walletAddress: string
  chain: ChainId
  signature: string
  challenge: string
}

export interface VerifyResponse {
  token: string
  expiresAt: string
  walletAddress: string
}

export interface AuthSession {
  token: string
  expiresAt: Date
  walletAddress: string
  serverUrl: string
}

// ── Server Info ──────────────────────────────────────────────────────

export interface ServerInfo {
  name: string
  version: string
  sagaVersion: string
  conformanceLevel: 1 | 2 | 3
  supportedChains: ChainId[]
  capabilities: string[]
  registrationOpen?: boolean
}

// ── Agents ───────────────────────────────────────────────────────────

export interface RegisterAgentRequest {
  handle: string
  walletAddress: string
  chain: ChainId
  publicKey?: string
}

export interface AgentRecord {
  agentId: string
  handle: string
  walletAddress: string
  chain: ChainId
  publicKey?: string
  registeredAt: string
  updatedAt?: string
}

export interface AgentDetailResponse {
  agent: AgentRecord
  latestDocument?: DocumentRecord
}

export interface AgentListResponse {
  agents: AgentRecord[]
  total: number
  page: number
  limit: number
}

// ── Documents ────────────────────────────────────────────────────────

export interface DocumentRecord {
  documentId: string
  exportType: ExportType
  sagaVersion: string
  storageRef?: StorageRef
  sizeBytes: number
  checksum: string
  createdAt: string
  uploadedAt?: string
}

export interface DocumentListResponse {
  documents: DocumentRecord[]
}

// ── Transfers ────────────────────────────────────────────────────────

export type TransferStatus = 'pending_consent' | 'packaging' | 'delivering' | 'imported' | 'failed'

export interface InitiateTransferRequest {
  agentHandle: string
  destinationServerUrl: string
  requestedLayers?: string[]
}

export interface TransferRecord {
  transferId: string
  agentHandle: string
  sourceServerUrl: string
  destinationServerUrl: string
  status: TransferStatus
  requestedLayers?: string[]
  consentMessage?: string
  documentId?: string
  initiatedAt: string
  completedAt?: string | null
}

export interface ImportResult {
  agentId: string
  handle: string
  importedLayers: string[]
  documentId: string
  status: 'imported'
}

// ── Errors ───────────────────────────────────────────────────────────

export interface SagaApiError {
  error: string
  code: string
}

// ── Client Options ───────────────────────────────────────────────────

export interface SagaClientOptions {
  serverUrl: string
  auth?: AuthSession
  /** Custom fetch function (for testing) */
  fetch?: typeof globalThis.fetch
}
