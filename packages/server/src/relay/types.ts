// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

// ── Relay Envelope ──────────────────────────────────────────────
// The relay's view of a SagaEncryptedEnvelope.
// Matches @epicdm/saga-crypto's SagaEncryptedEnvelope but defined
// independently — the relay never decrypts, it only routes.

export interface RelayEnvelope {
  v: number
  type: string
  scope: string
  from: string
  to: string | string[]
  ct: string
  ts: string
  id: string
  /** Pass through all other fields (nonce, iv, authTag, wrappedDek, groupKeyId) */
  [key: string]: unknown
}

// ── Client → Server messages ────────────────────────────────────

export interface AuthVerifyMessage {
  type: 'auth:verify'
  walletAddress: string
  chain: string
  handle: string
  signature: string
  challenge: string
}

export interface RelaySendMessage {
  type: 'relay:send'
  envelope: RelayEnvelope
}

export interface ControlPongMessage {
  type: 'control:pong'
}

export interface MailboxDrainMessage {
  type: 'mailbox:drain'
}

export interface MailboxAckMessage {
  type: 'mailbox:ack'
  messageIds: string[]
}

export type ClientMessage =
  | AuthVerifyMessage
  | RelaySendMessage
  | ControlPongMessage
  | MailboxDrainMessage
  | MailboxAckMessage

// ── Server → Client messages ────────────────────────────────────

export interface AuthChallengeMessage {
  type: 'auth:challenge'
  challenge: string
  expiresAt: string
}

export interface AuthSuccessMessage {
  type: 'auth:success'
  handle: string
}

export interface AuthErrorMessage {
  type: 'auth:error'
  error: string
}

export interface RelayDeliverMessage {
  type: 'relay:deliver'
  envelope: RelayEnvelope
}

export interface RelayAckMessage {
  type: 'relay:ack'
  messageId: string
}

export interface RelayErrorMessage {
  type: 'relay:error'
  messageId: string
  error: string
}

export interface ControlPingMessage {
  type: 'control:ping'
}

export interface MailboxBatchMessage {
  type: 'mailbox:batch'
  envelopes: RelayEnvelope[]
  remaining: number
}

export interface ErrorMessage {
  type: 'error'
  error: string
}

export type ServerMessage =
  | AuthChallengeMessage
  | AuthSuccessMessage
  | AuthErrorMessage
  | RelayDeliverMessage
  | RelayAckMessage
  | RelayErrorMessage
  | ControlPingMessage
  | MailboxBatchMessage
  | ErrorMessage

// ── WebSocket attachment (survives DO hibernation) ──────────────

export type WebSocketAttachment =
  | { authenticated: false; challenge: string; expiresAt: string }
  | { authenticated: true; state: ConnectionState }

export interface ConnectionState {
  handle: string
  walletAddress: string
  chain: string
  authenticatedAt: string
  lastPong: number
  lastNftCheck: number
}

// ── Constants ───────────────────────────────────────────────────

export const PING_INTERVAL_MS = 30_000
export const STALE_TIMEOUT_MS = 90_000
export const NFT_RECHECK_INTERVAL_MS = 5 * 60_000
export const CHALLENGE_TTL_MS = 5 * 60_000
export const MAILBOX_TTL_SECONDS = 30 * 24 * 3600
export const MAILBOX_DRAIN_BATCH_SIZE = 50

// ── Type guards ─────────────────────────────────────────────────

const CLIENT_MESSAGE_TYPES = new Set([
  'auth:verify',
  'relay:send',
  'control:pong',
  'mailbox:drain',
  'mailbox:ack',
])

const SERVER_MESSAGE_TYPES = new Set([
  'auth:challenge',
  'auth:success',
  'auth:error',
  'relay:deliver',
  'relay:ack',
  'relay:error',
  'control:ping',
  'mailbox:batch',
  'error',
])

export function isClientMessage(msg: unknown): msg is ClientMessage {
  if (typeof msg !== 'object' || msg === null) return false
  const obj = msg as Record<string, unknown>
  if (typeof obj.type !== 'string' || !CLIENT_MESSAGE_TYPES.has(obj.type)) return false

  // Validate required fields per message type to prevent runtime crashes
  // when handlers access expected properties
  switch (obj.type) {
    case 'auth:verify':
      return (
        typeof obj.walletAddress === 'string' &&
        typeof obj.chain === 'string' &&
        typeof obj.handle === 'string' &&
        typeof obj.signature === 'string' &&
        typeof obj.challenge === 'string'
      )
    case 'relay:send':
      return typeof obj.envelope === 'object' && obj.envelope !== null
    case 'mailbox:ack':
      return (
        Array.isArray(obj.messageIds) &&
        obj.messageIds.every((id: unknown) => typeof id === 'string')
      )
    case 'control:pong':
    case 'mailbox:drain':
      return true
    default:
      return false
  }
}

export function isServerMessage(msg: unknown): msg is ServerMessage {
  if (typeof msg !== 'object' || msg === null) return false
  const obj = msg as Record<string, unknown>
  return typeof obj.type === 'string' && SERVER_MESSAGE_TYPES.has(obj.type)
}

export function parseClientMessage(raw: string): ClientMessage | null {
  try {
    const parsed = JSON.parse(raw)
    return isClientMessage(parsed) ? parsed : null
  } catch {
    return null
  }
}
