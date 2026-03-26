// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

// ── Types ──
export type {
  Unsubscribe,
  WalletSigner,
  SagaMemoryType,
  SagaMemory,
  MemoryFilter,
  SagaDirectMessageType,
  SagaDirectMessage,
  ConnectedPeer,
  WebSocketLike,
  SagaClientConfig,
  SagaClient,
  SagaKeyRing,
  SagaEncryptedEnvelope,
  StorageBackend,
} from './types'

// ── Client factory ──
export { createSagaClient } from './client'
