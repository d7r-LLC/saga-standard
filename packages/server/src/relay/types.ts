// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

// ── Relay Envelope ──────────────────────────────────────────────
// The relay's view of a SagaEncryptedEnvelope.
// Matches @d7r/saga-crypto's SagaEncryptedEnvelope but defined
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

export interface SyncRequestMessage {
  type: 'sync-request'
  since: string // ISO 8601 checkpoint timestamp
  collections?: string[] // reserved — currently ignored by hub (cannot filter encrypted blobs)
}

// ── Federation messages (directory ↔ directory) ─────────────────

export interface FederationAuthMessage {
  type: 'federation:auth'
  directoryId: string
  operatorWallet: string
  signature: string
  challenge: string
}

export interface FederationForwardMessage {
  type: 'relay:forward'
  envelope: RelayEnvelope
  sourceDirectoryId: string
}

export type FederationClientMessage =
  | FederationAuthMessage
  | FederationForwardMessage
  | ControlPongMessage // heartbeat response to server

// ── Federation server → client messages ─────────────────────────

export interface FederationChallengeMessage {
  type: 'federation:challenge'
  challenge: string
  expiresAt: string
}

export interface FederationSuccessMessage {
  type: 'federation:success'
  directoryId: string
}

export interface FederationErrorMessage {
  type: 'federation:error'
  error: string
}

export interface FederationForwardAckMessage {
  type: 'relay:forward-ack'
  /** Correlates to envelope.id of the originating relay:forward message */
  messageId: string
}

export interface FederationForwardErrorMessage {
  type: 'relay:forward-error'
  /** Correlates to envelope.id of the originating relay:forward message */
  messageId: string
  error: string
}

export type FederationServerMessage =
  | FederationChallengeMessage
  | FederationSuccessMessage
  | FederationErrorMessage
  | FederationForwardAckMessage
  | FederationForwardErrorMessage
  | ControlPingMessage // heartbeat from server

export type ClientMessage =
  | AuthVerifyMessage
  | RelaySendMessage
  | ControlPongMessage
  | MailboxDrainMessage
  | MailboxAckMessage
  | SyncRequestMessage

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
  /**
   * Optional machine-readable error code. Phase 3 added
   * `MEMORY_SYNC_RATE_LIMIT` for per-handle rate-limit rejections; future
   * phases may add more (e.g. envelope size cap, federation provenance).
   * Clients should match on `code` rather than the human-readable `error`.
   */
  code?: string
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

export interface SyncResponseMessage {
  type: 'sync-response'
  envelopes: RelayEnvelope[]
  checkpoint: string // new checkpoint timestamp (ISO 8601)
  hasMore: boolean // pagination flag
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
  | SyncResponseMessage

// ── WebSocket attachment (survives DO hibernation) ──────────────

export type WebSocketAttachment =
  | { authenticated: false; challenge: string; expiresAt: string }
  | { authenticated: true; state: ConnectionState }
  | {
      authenticated: true
      federation: true
      directoryId: string
      operatorWallet: string
      /**
       * ISO timestamp when this federation link was authenticated. Used by
       * the federation rotation sentinel check (Phase 3, A-Med#12) — if a
       * `fed:rotated:<directoryId>` sentinel exists with a timestamp
       * greater-than-or-equal-to this, the link is forced to re-authenticate.
       * The comparison is inclusive (`>=`) to close a same-millisecond
       * timing edge.
       *
       * Optional for backward compat with existing federation links that
       * authenticated before the field was added; missing `authedAt` is
       * treated as oldest-possible (any sentinel kills the link).
       */
      authedAt?: string
    }

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
export const DM_TTL_SECONDS = 7 * 24 * 3600 // 7 days for direct messages
export const MAILBOX_DRAIN_BATCH_SIZE = 50
export const FEDERATION_LINK_TIMEOUT_MS = 10_000
export const FEDERATION_RECONNECT_MAX_MS = 60_000

// ── Type guards ─────────────────────────────────────────────────

const CLIENT_MESSAGE_TYPES = new Set([
  'auth:verify',
  'relay:send',
  'control:pong',
  'mailbox:drain',
  'mailbox:ack',
  'sync-request',
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
  'sync-response',
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
    case 'sync-request':
      return (
        typeof obj.since === 'string' &&
        (obj.collections === undefined ||
          (Array.isArray(obj.collections) &&
            obj.collections.every((c: unknown) => typeof c === 'string')))
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

const FEDERATION_CLIENT_MESSAGE_TYPES = new Set([
  'federation:auth',
  'relay:forward',
  'control:pong',
])

export function isFederationClientMessage(msg: unknown): msg is FederationClientMessage {
  if (typeof msg !== 'object' || msg === null) return false
  const obj = msg as Record<string, unknown>
  if (typeof obj.type !== 'string' || !FEDERATION_CLIENT_MESSAGE_TYPES.has(obj.type)) return false

  switch (obj.type) {
    case 'federation:auth':
      return (
        typeof obj.directoryId === 'string' &&
        typeof obj.operatorWallet === 'string' &&
        typeof obj.signature === 'string' &&
        typeof obj.challenge === 'string'
      )
    case 'relay:forward':
      return (
        typeof obj.envelope === 'object' &&
        obj.envelope !== null &&
        typeof obj.sourceDirectoryId === 'string'
      )
    case 'control:pong':
      return true
    default:
      return false
  }
}

export function parseFederationMessage(raw: string): FederationClientMessage | null {
  try {
    const parsed = JSON.parse(raw)
    return isFederationClientMessage(parsed) ? parsed : null
  } catch {
    return null
  }
}

// Type guard for regular agent connections (non-federation authenticated)
export function isRegularClientAttachment(
  attachment: WebSocketAttachment | null
): attachment is { authenticated: true; state: ConnectionState } {
  return (
    attachment !== null &&
    attachment.authenticated === true &&
    'state' in attachment &&
    !('federation' in attachment)
  )
}
