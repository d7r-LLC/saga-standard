// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import type { SagaEncryptedEnvelope, SagaKeyRing, StorageBackend } from '@epicdm/saga-crypto'

// ── Re-exports from saga-crypto ──────────────────────────────────

export type { SagaKeyRing, SagaEncryptedEnvelope, StorageBackend }

// ── Public types ─────────────────────────────────────────────────

/** Cleanup function returned by event subscriptions */
export type Unsubscribe = () => void

/** Wallet signer for relay authentication (challenge-response) */
export interface WalletSigner {
  readonly address: string
  readonly chain: string
  sign(message: string): Promise<string>
}

/** Agent memory type classification */
export type SagaMemoryType = 'episodic' | 'semantic' | 'procedural'

/** Agent memory record */
export interface SagaMemory {
  id: string
  type: SagaMemoryType
  content: unknown
  metadata?: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

/** Query filter for local memory store */
export interface MemoryFilter {
  prefix?: string
  type?: SagaMemoryType
  since?: string
  limit?: number
}

/** Direct message type classification */
export type SagaDirectMessageType =
  | 'task-request'
  | 'task-result'
  | 'status-update'
  | 'data-payload'
  | 'coordination'
  | 'notification'

/** Direct message payload (encrypted in envelope) */
export interface SagaDirectMessage {
  messageType: SagaDirectMessageType
  payload: unknown
  replyTo?: string
  ttl?: number
}

/** Connected peer info */
export interface ConnectedPeer {
  handle: string
  lastSeen: string
}

/** WebSocket abstraction for dependency injection / testing */
export interface WebSocketLike {
  readyState: number
  send(data: string): void
  close(code?: number, reason?: string): void
  onopen: ((ev: Event) => void) | null
  onclose: ((ev: CloseEvent) => void) | null
  onmessage: ((ev: MessageEvent) => void) | null
  onerror: ((ev: Event) => void) | null
}

/** Configuration for createSagaClient */
export interface SagaClientConfig {
  /** WSS URL for the hub relay (e.g. "wss://api.saga-standard.dev/v1/relay") */
  hubUrl: string
  /** Agent identity in handle@directoryId format */
  identity: string
  /** Unlocked KeyRing for encryption/decryption */
  keyRing: SagaKeyRing
  /** Wallet signer for relay authentication */
  signer: WalletSigner
  /** Storage backend for encrypted local store (defaults to MemoryBackend) */
  storageBackend?: StorageBackend
  /** WebSocket factory — override for testing (defaults to native WebSocket) */
  createWebSocket?: (url: string) => WebSocketLike
}

/** The SAGA client interface exposed to agent runtimes */
export interface SagaClient {
  // ── Lifecycle ──
  connect(): Promise<void>
  disconnect(): Promise<void>
  isConnected(): boolean

  // ── Memory ──
  storeMemory(memory: SagaMemory): Promise<void>
  queryMemory(filter: MemoryFilter): Promise<SagaMemory[]>
  deleteMemory(memoryId: string): Promise<void>

  // ── Messaging ──
  sendMessage(to: string, message: SagaDirectMessage): Promise<string>
  onMessage(handler: (from: string, msg: SagaDirectMessage) => void): Unsubscribe

  // ── Group ──
  sendGroupMessage(groupId: string, message: SagaDirectMessage): Promise<string>
  onGroupMessage(
    handler: (groupId: string, from: string, msg: SagaDirectMessage) => void
  ): Unsubscribe

  // ── Peer key management (manual for Phase 3; Phase 5 adds auto-discovery) ──
  registerPeerKey(identity: string, publicKey: Uint8Array): void

  // ── Status ──
  getPeers(): ConnectedPeer[]
  onConnectionChange(handler: (connected: boolean) => void): Unsubscribe
}

// ── Internal types — relay protocol messages ─────────────────────

export interface AuthChallengeMsg {
  type: 'auth:challenge'
  challenge: string
  expiresAt: string
}

export interface AuthSuccessMsg {
  type: 'auth:success'
  handle: string
}

export interface AuthErrorMsg {
  type: 'auth:error'
  error: string
}

export interface RelayDeliverMsg {
  type: 'relay:deliver'
  envelope: SagaEncryptedEnvelope
}

export interface RelayAckMsg {
  type: 'relay:ack'
  messageId: string
}

export interface RelayErrorMsg {
  type: 'relay:error'
  messageId: string
  error: string
}

export interface ControlPingMsg {
  type: 'control:ping'
}

export interface MailboxBatchMsg {
  type: 'mailbox:batch'
  envelopes: SagaEncryptedEnvelope[]
  remaining: number
}

export interface ServerErrorMsg {
  type: 'error'
  error: string
}

export interface SyncResponseMsg {
  type: 'sync-response'
  envelopes: SagaEncryptedEnvelope[]
  checkpoint: string
  hasMore: boolean
}

export type ServerMessage =
  | AuthChallengeMsg
  | AuthSuccessMsg
  | AuthErrorMsg
  | RelayDeliverMsg
  | RelayAckMsg
  | RelayErrorMsg
  | ControlPingMsg
  | MailboxBatchMsg
  | ServerErrorMsg
  | SyncResponseMsg

// ── Relay connection internal types ──────────────────────────────

export interface RelayConnectionCallbacks {
  onEnvelope(envelope: SagaEncryptedEnvelope): void
  onMailboxBatch(envelopes: SagaEncryptedEnvelope[], remaining: number): void
  onConnectionChange(connected: boolean): void
  onRelayAck(messageId: string): void
  onRelayError(messageId: string, error: string): void
  onError(error: string): void
  onSyncResponse(envelopes: SagaEncryptedEnvelope[], checkpoint: string, hasMore: boolean): void
}

export interface RelayConnectionConfig {
  hubUrl: string
  handle: string
  signer: WalletSigner
  callbacks: RelayConnectionCallbacks
  createWebSocket?: (url: string) => WebSocketLike
}

// ── Message router internal types ────────────────────────────────

export interface MessageRouterCallbacks {
  onDirectMessage(from: string, message: SagaDirectMessage): void
  onGroupMessage(groupId: string, from: string, message: SagaDirectMessage): void
  onMemorySync(from: string, memory: SagaMemory): void
}
