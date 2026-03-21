// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

// Auth
export { authenticateWithServer, isSessionValid, refreshSession, SagaAuthError } from './auth'
export type { WalletSigner } from './auth'

// Client
export { SagaServerClient } from './saga-server-client'

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
  DocumentRecord,
  DocumentListResponse,
  InitiateTransferRequest,
  TransferRecord,
  TransferStatus,
  ImportResult,
  SagaApiError,
  SagaClientOptions,
} from './types'
