// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

// Auth
export { authenticateWithServer, isSessionValid, refreshSession, SagaAuthError } from './auth'
export type { WalletSigner } from './auth'

// Client
export { SagaServerClient } from './saga-server-client'

// Chain operations
export {
  mintAgentIdentity,
  mintOrgIdentity,
  mintDirectoryIdentity,
  resolveHandleOnChain,
  isHandleAvailable,
} from './chain'

// Types
export type {
  AuthSession,
  ChallengeRequest,
  ChallengeResponse,
  VerifyRequest,
  VerifyResponse,
  ServerInfo,
  RegisterAgentRequest,
  AgentRecord,
  AgentDetailResponse,
  AgentListResponse,
  OrgRecord,
  OrgDetailResponse,
  OrgListResponse,
  ResolveResponse,
  SupportedChain,
  MintResult,
  OnChainResolveResult,
  DocumentRecord,
  DocumentListResponse,
  InitiateTransferRequest,
  TransferRecord,
  TransferStatus,
  ImportResult,
  SagaApiError,
  SagaClientOptions,
} from './types'
