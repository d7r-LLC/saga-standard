# Hub WebSocket Relay — Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the hub-side WebSocket relay server that routes encrypted envelopes between DERP clients, with NFT-gated authentication, message routing, and offline mailbox storage.

**Architecture:** Extends the existing SAGA server (`packages/server`) with a Cloudflare Durable Object (`RelayRoom`) that manages WebSocket connections. Clients connect via `GET /v1/relay` (WebSocket upgrade), authenticate with wallet challenge-response + NFT verification, then send/receive `SagaEncryptedEnvelope` messages. The hub never decrypts — it routes by reading the `from`/`to` fields and stores offline messages in a KV-backed mailbox. Uses the Hibernatable WebSocket API so the DO can sleep between messages and reconstruct state from WebSocket attachments on wake.

**Tech Stack:** Hono 4.x, Cloudflare Workers, Durable Objects (Hibernatable WebSocket API), Cloudflare KV (mailbox), D1 (entity lookup), drizzle-orm, vitest

---

## File Structure

### New Files

| File                                                             | Responsibility                                                 |
| ---------------------------------------------------------------- | -------------------------------------------------------------- |
| `packages/server/src/relay/types.ts`                             | Control message types, type guards, constants, `RelayEnvelope` |
| `packages/server/src/relay/envelope-validator.ts`                | Validate envelope shape for relay routing                      |
| `packages/server/src/relay/mailbox.ts`                           | KV-backed offline message store                                |
| `packages/server/src/relay/ws-auth.ts`                           | WebSocket authentication (challenge, verify, NFT check)        |
| `packages/server/src/relay/relay-room.ts`                        | Durable Object — WebSocket hub, routing, heartbeat             |
| `packages/server/src/routes/relay.ts`                            | `GET /v1/relay` upgrade route → forwards to DO                 |
| `packages/server/src/__tests__/relay-test-helpers.ts`            | Mock WebSocket, DurableObjectState for testing                 |
| `packages/server/src/__tests__/relay-types.test.ts`              | Type guard tests                                               |
| `packages/server/src/__tests__/relay-envelope-validator.test.ts` | Envelope validation tests                                      |
| `packages/server/src/__tests__/relay-mailbox.test.ts`            | Mailbox store/drain/ack tests                                  |
| `packages/server/src/__tests__/relay-auth.test.ts`               | WebSocket auth tests                                           |
| `packages/server/src/__tests__/relay-room.test.ts`               | Durable Object integration tests                               |
| `packages/server/src/__tests__/relay-integration.test.ts`        | Full protocol flow tests                                       |

### Modified Files

| File                                            | Changes                                                                           |
| ----------------------------------------------- | --------------------------------------------------------------------------------- |
| `packages/server/src/bindings.ts`               | Add `RELAY_MAILBOX: KVNamespace` and `RELAY_ROOM: DurableObjectNamespace`         |
| `packages/server/src/index.ts`                  | Mount relay route, export `RelayRoom` DO class                                    |
| `packages/server/wrangler.toml`                 | Add KV namespace, DO binding, migration                                           |
| `packages/server/src/__tests__/test-helpers.ts` | Update `createMockKV()` for prefix-filtered list, add `RELAY_MAILBOX` to mock env |

---

### Task 1: Relay Types and Control Message Protocol

**Files:**

- Create: `packages/server/src/relay/types.ts`
- Test: `packages/server/src/__tests__/relay-types.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/server/src/__tests__/relay-types.test.ts
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { describe, it, expect } from 'vitest'
import { isClientMessage, isServerMessage, parseClientMessage } from '../relay/types'

describe('isClientMessage', () => {
  it('identifies auth:verify', () => {
    expect(
      isClientMessage({
        type: 'auth:verify',
        walletAddress: '0xabc',
        chain: 'eip155:8453',
        handle: 'alice',
        signature: '0xsig',
        challenge: 'saga-relay:nonce:123',
      })
    ).toBe(true)
  })

  it('identifies relay:send', () => {
    expect(isClientMessage({ type: 'relay:send', envelope: {} })).toBe(true)
  })

  it('identifies control:pong', () => {
    expect(isClientMessage({ type: 'control:pong' })).toBe(true)
  })

  it('identifies mailbox:drain', () => {
    expect(isClientMessage({ type: 'mailbox:drain' })).toBe(true)
  })

  it('identifies mailbox:ack', () => {
    expect(isClientMessage({ type: 'mailbox:ack', messageIds: ['a'] })).toBe(true)
  })

  it('rejects server message types', () => {
    expect(isClientMessage({ type: 'auth:challenge' })).toBe(false)
    expect(isClientMessage({ type: 'relay:deliver' })).toBe(false)
    expect(isClientMessage({ type: 'control:ping' })).toBe(false)
  })

  it('rejects null, non-object, missing type', () => {
    expect(isClientMessage(null)).toBe(false)
    expect(isClientMessage('string')).toBe(false)
    expect(isClientMessage(42)).toBe(false)
    expect(isClientMessage({})).toBe(false)
    expect(isClientMessage({ type: 123 })).toBe(false)
    expect(isClientMessage({ type: 'unknown' })).toBe(false)
  })
})

describe('isServerMessage', () => {
  it('identifies all server message types', () => {
    const types = [
      'auth:challenge',
      'auth:success',
      'auth:error',
      'relay:deliver',
      'relay:ack',
      'relay:error',
      'control:ping',
      'mailbox:batch',
      'error',
    ]
    for (const type of types) {
      expect(isServerMessage({ type })).toBe(true)
    }
  })

  it('rejects client message types', () => {
    expect(isServerMessage({ type: 'auth:verify' })).toBe(false)
    expect(isServerMessage({ type: 'relay:send' })).toBe(false)
  })
})

describe('parseClientMessage', () => {
  it('parses valid JSON client message', () => {
    const msg = parseClientMessage(JSON.stringify({ type: 'control:pong' }))
    expect(msg).toEqual({ type: 'control:pong' })
  })

  it('returns null for invalid JSON', () => {
    expect(parseClientMessage('not json')).toBeNull()
  })

  it('returns null for valid JSON but not a client message', () => {
    expect(parseClientMessage(JSON.stringify({ type: 'control:ping' }))).toBeNull()
    expect(parseClientMessage(JSON.stringify({ foo: 'bar' }))).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/server && npx vitest run src/__tests__/relay-types.test.ts`
Expected: FAIL — module `../relay/types` not found

- [ ] **Step 3: Write the types implementation**

```typescript
// packages/server/src/relay/types.ts
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
  return typeof obj.type === 'string' && CLIENT_MESSAGE_TYPES.has(obj.type)
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/server && npx vitest run src/__tests__/relay-types.test.ts`
Expected: PASS (12 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/relay/types.ts packages/server/src/__tests__/relay-types.test.ts
git commit -m "feat(server): add relay control message types and type guards"
```

---

### Task 2: Envelope Shape Validator

**Files:**

- Create: `packages/server/src/relay/envelope-validator.ts`
- Test: `packages/server/src/__tests__/relay-envelope-validator.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/server/src/__tests__/relay-envelope-validator.test.ts
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { describe, it, expect } from 'vitest'
import { validateEnvelope } from '../relay/envelope-validator'

const validEnvelope = {
  v: 1,
  type: 'direct-message',
  scope: 'mutual',
  from: 'alice@epicflow',
  to: 'bob@epicflow',
  ct: 'base64ciphertext==',
  nonce: 'base64nonce==',
  ts: '2026-03-26T00:00:00.000Z',
  id: '550e8400-e29b-41d4-a716-446655440000',
}

describe('validateEnvelope', () => {
  it('accepts a valid envelope', () => {
    expect(validateEnvelope(validEnvelope)).toBeNull()
  })

  it('accepts envelope with array recipients', () => {
    expect(
      validateEnvelope({ ...validEnvelope, to: ['bob@epicflow', 'charlie@epicflow'] })
    ).toBeNull()
  })

  it('accepts all valid message types', () => {
    for (const type of ['memory-sync', 'direct-message', 'group-message']) {
      expect(validateEnvelope({ ...validEnvelope, type })).toBeNull()
    }
  })

  it('accepts all valid scopes', () => {
    for (const scope of ['private', 'mutual', 'group']) {
      expect(validateEnvelope({ ...validEnvelope, scope })).toBeNull()
    }
  })

  it('passes through unknown extra fields', () => {
    expect(validateEnvelope({ ...validEnvelope, wrappedDek: 'abc', groupKeyId: 'gk1' })).toBeNull()
  })

  it('rejects null', () => {
    expect(validateEnvelope(null)).toEqual({ field: 'envelope', message: expect.any(String) })
  })

  it('rejects non-object', () => {
    expect(validateEnvelope('string')).toEqual({ field: 'envelope', message: expect.any(String) })
  })

  it('rejects wrong version', () => {
    expect(validateEnvelope({ ...validEnvelope, v: 2 })).toEqual({
      field: 'v',
      message: expect.any(String),
    })
  })

  it('rejects invalid type', () => {
    expect(validateEnvelope({ ...validEnvelope, type: 'unknown' })).toEqual({
      field: 'type',
      message: expect.any(String),
    })
  })

  it('rejects invalid scope', () => {
    expect(validateEnvelope({ ...validEnvelope, scope: 'public' })).toEqual({
      field: 'scope',
      message: expect.any(String),
    })
  })

  it('rejects empty from', () => {
    expect(validateEnvelope({ ...validEnvelope, from: '' })).toEqual({
      field: 'from',
      message: expect.any(String),
    })
  })

  it('rejects empty to string', () => {
    expect(validateEnvelope({ ...validEnvelope, to: '' })).toEqual({
      field: 'to',
      message: expect.any(String),
    })
  })

  it('rejects empty to array', () => {
    expect(validateEnvelope({ ...validEnvelope, to: [] })).toEqual({
      field: 'to',
      message: expect.any(String),
    })
  })

  it('rejects to array with empty strings', () => {
    expect(validateEnvelope({ ...validEnvelope, to: ['bob', ''] })).toEqual({
      field: 'to',
      message: expect.any(String),
    })
  })

  it('rejects missing ciphertext', () => {
    expect(validateEnvelope({ ...validEnvelope, ct: '' })).toEqual({
      field: 'ct',
      message: expect.any(String),
    })
  })

  it('rejects missing timestamp', () => {
    expect(validateEnvelope({ ...validEnvelope, ts: '' })).toEqual({
      field: 'ts',
      message: expect.any(String),
    })
  })

  it('rejects missing id', () => {
    expect(validateEnvelope({ ...validEnvelope, id: '' })).toEqual({
      field: 'id',
      message: expect.any(String),
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/server && npx vitest run src/__tests__/relay-envelope-validator.test.ts`
Expected: FAIL — module `../relay/envelope-validator` not found

- [ ] **Step 3: Write the implementation**

```typescript
// packages/server/src/relay/envelope-validator.ts
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

const VALID_TYPES = new Set(['memory-sync', 'direct-message', 'group-message'])
const VALID_SCOPES = new Set(['private', 'mutual', 'group'])

export interface EnvelopeValidationError {
  field: string
  message: string
}

/**
 * Validate that an object has the required envelope shape for relay routing.
 * Does NOT validate ciphertext content — the relay never decrypts.
 * Returns null on success, an error object on failure.
 */
export function validateEnvelope(obj: unknown): EnvelopeValidationError | null {
  if (typeof obj !== 'object' || obj === null) {
    return { field: 'envelope', message: 'Envelope must be a non-null object' }
  }

  const e = obj as Record<string, unknown>

  if (e.v !== 1) {
    return { field: 'v', message: 'Unsupported envelope version' }
  }

  if (typeof e.type !== 'string' || !VALID_TYPES.has(e.type)) {
    return { field: 'type', message: 'Invalid or missing envelope type' }
  }

  if (typeof e.scope !== 'string' || !VALID_SCOPES.has(e.scope)) {
    return { field: 'scope', message: 'Invalid or missing envelope scope' }
  }

  if (typeof e.from !== 'string' || e.from.length === 0) {
    return { field: 'from', message: 'Missing sender identity' }
  }

  if (typeof e.to === 'string') {
    if (e.to.length === 0) {
      return { field: 'to', message: 'Missing recipient' }
    }
  } else if (Array.isArray(e.to)) {
    if (
      e.to.length === 0 ||
      !e.to.every((t: unknown) => typeof t === 'string' && (t as string).length > 0)
    ) {
      return { field: 'to', message: 'Invalid recipient list' }
    }
  } else {
    return { field: 'to', message: 'Recipient must be a string or string array' }
  }

  if (typeof e.ct !== 'string' || e.ct.length === 0) {
    return { field: 'ct', message: 'Missing ciphertext' }
  }

  if (typeof e.ts !== 'string' || e.ts.length === 0) {
    return { field: 'ts', message: 'Missing timestamp' }
  }

  if (typeof e.id !== 'string' || e.id.length === 0) {
    return { field: 'id', message: 'Missing message ID' }
  }

  return null
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/server && npx vitest run src/__tests__/relay-envelope-validator.test.ts`
Expected: PASS (16 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/relay/envelope-validator.ts packages/server/src/__tests__/relay-envelope-validator.test.ts
git commit -m "feat(server): add relay envelope shape validator"
```

---

### Task 3: Mailbox — KV-Backed Offline Message Store

**Files:**

- Create: `packages/server/src/relay/mailbox.ts`
- Test: `packages/server/src/__tests__/relay-mailbox.test.ts`
- Modify: `packages/server/src/__tests__/test-helpers.ts` (update `createMockKV` for prefix-filtered list)

- [ ] **Step 1: Update mock KV to support prefix-filtered list**

In `packages/server/src/__tests__/test-helpers.ts`, replace the existing `createMockKV` function's `list` method to support the `{ prefix, limit }` options that the mailbox needs:

Replace the current `async list()` block (approximately lines 354-362):

```typescript
    async list(opts?: { prefix?: string; limit?: number }) {
      // Evict expired entries
      for (const [k, entry] of store) {
        if (entry.expiration && Date.now() / 1000 > entry.expiration) {
          store.delete(k)
        }
      }
      let keys = Array.from(store.keys()).sort()
      if (opts?.prefix) {
        keys = keys.filter(k => k.startsWith(opts.prefix!))
      }
      const total = keys.length
      if (opts?.limit) {
        keys = keys.slice(0, opts.limit)
      }
      return {
        keys: keys.map(name => ({ name })),
        list_complete: keys.length >= total,
        caches: [],
      }
    },
```

- [ ] **Step 2: Write the failing mailbox test**

```typescript
// packages/server/src/__tests__/relay-mailbox.test.ts
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { describe, it, expect, beforeEach } from 'vitest'
import { createMockKV } from './test-helpers'
import { createMailbox } from '../relay/mailbox'
import type { RelayMailbox } from '../relay/mailbox'
import type { RelayEnvelope } from '../relay/types'

function makeEnvelope(overrides: Partial<RelayEnvelope> = {}): RelayEnvelope {
  return {
    v: 1,
    type: 'direct-message',
    scope: 'mutual',
    from: 'alice@epicflow',
    to: 'bob@epicflow',
    ct: 'ciphertext',
    ts: new Date().toISOString(),
    id: crypto.randomUUID(),
    ...overrides,
  }
}

describe('createMailbox', () => {
  let kv: KVNamespace
  let mailbox: RelayMailbox

  beforeEach(() => {
    kv = createMockKV()
    mailbox = createMailbox(kv)
  })

  it('stores and drains an envelope', async () => {
    const env = makeEnvelope()
    await mailbox.store('bob', env)

    const { envelopes, remaining } = await mailbox.drain('bob')
    expect(envelopes).toHaveLength(1)
    expect(envelopes[0].id).toBe(env.id)
    expect(remaining).toBe(0)
  })

  it('drains in timestamp order', async () => {
    const env1 = makeEnvelope({ ts: '2026-03-26T00:00:01.000Z', id: 'msg-1' })
    const env2 = makeEnvelope({ ts: '2026-03-26T00:00:03.000Z', id: 'msg-3' })
    const env3 = makeEnvelope({ ts: '2026-03-26T00:00:02.000Z', id: 'msg-2' })

    // Store out of order
    await mailbox.store('bob', env2)
    await mailbox.store('bob', env1)
    await mailbox.store('bob', env3)

    const { envelopes } = await mailbox.drain('bob')
    expect(envelopes).toHaveLength(3)
    expect(envelopes[0].id).toBe('msg-1')
    expect(envelopes[1].id).toBe('msg-2')
    expect(envelopes[2].id).toBe('msg-3')
  })

  it('returns empty drain for unknown handle', async () => {
    const { envelopes, remaining } = await mailbox.drain('unknown')
    expect(envelopes).toHaveLength(0)
    expect(remaining).toBe(0)
  })

  it('isolates mailboxes per handle', async () => {
    await mailbox.store('bob', makeEnvelope({ id: 'for-bob' }))
    await mailbox.store('charlie', makeEnvelope({ id: 'for-charlie' }))

    const bob = await mailbox.drain('bob')
    expect(bob.envelopes).toHaveLength(1)
    expect(bob.envelopes[0].id).toBe('for-bob')

    const charlie = await mailbox.drain('charlie')
    expect(charlie.envelopes).toHaveLength(1)
    expect(charlie.envelopes[0].id).toBe('for-charlie')
  })

  it('ack removes delivered messages', async () => {
    const env1 = makeEnvelope({ id: 'msg-a' })
    const env2 = makeEnvelope({ id: 'msg-b' })
    await mailbox.store('bob', env1)
    await mailbox.store('bob', env2)

    await mailbox.ack('bob', ['msg-a'])

    const { envelopes } = await mailbox.drain('bob')
    expect(envelopes).toHaveLength(1)
    expect(envelopes[0].id).toBe('msg-b')
  })

  it('count returns pending message count', async () => {
    expect(await mailbox.count('bob')).toBe(0)
    await mailbox.store('bob', makeEnvelope())
    await mailbox.store('bob', makeEnvelope())
    expect(await mailbox.count('bob')).toBe(2)
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd packages/server && npx vitest run src/__tests__/relay-mailbox.test.ts`
Expected: FAIL — module `../relay/mailbox` not found

- [ ] **Step 4: Write the mailbox implementation**

```typescript
// packages/server/src/relay/mailbox.ts
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import type { RelayEnvelope } from './types'
import { MAILBOX_TTL_SECONDS, MAILBOX_DRAIN_BATCH_SIZE } from './types'

/**
 * KV-backed offline message store for the relay.
 *
 * Key format: `mailbox:{handle}:{timestamp}:{messageId}`
 * Value: JSON serialized RelayEnvelope
 * TTL: 30 days (configurable via constructor)
 *
 * Messages are stored when a recipient is offline and drained
 * in timestamp order when they reconnect.
 */
export interface RelayMailbox {
  store(handle: string, envelope: RelayEnvelope): Promise<void>
  drain(handle: string): Promise<{ envelopes: RelayEnvelope[]; remaining: number }>
  ack(handle: string, messageIds: string[]): Promise<void>
  count(handle: string): Promise<number>
}

function mailboxPrefix(handle: string): string {
  return `mailbox:${handle}:`
}

function mailboxKey(handle: string, envelope: RelayEnvelope): string {
  return `mailbox:${handle}:${envelope.ts}:${envelope.id}`
}

export function createMailbox(
  kv: KVNamespace,
  ttlSeconds: number = MAILBOX_TTL_SECONDS
): RelayMailbox {
  return {
    async store(handle, envelope) {
      const key = mailboxKey(handle, envelope)
      await kv.put(key, JSON.stringify(envelope), { expirationTtl: ttlSeconds })
    },

    async drain(handle) {
      const prefix = mailboxPrefix(handle)
      const list = await kv.list({ prefix, limit: MAILBOX_DRAIN_BATCH_SIZE + 1 })

      const hasMore = list.keys.length > MAILBOX_DRAIN_BATCH_SIZE
      const keys = list.keys.slice(0, MAILBOX_DRAIN_BATCH_SIZE)
      const remaining = hasMore ? list.keys.length - MAILBOX_DRAIN_BATCH_SIZE : 0

      const envelopes: RelayEnvelope[] = []
      for (const key of keys) {
        const value = await kv.get(key.name)
        if (value) {
          envelopes.push(JSON.parse(value) as RelayEnvelope)
        }
      }

      return { envelopes, remaining }
    },

    async ack(handle, messageIds) {
      const prefix = mailboxPrefix(handle)
      const list = await kv.list({ prefix })
      const idsToDelete = new Set(messageIds)

      for (const key of list.keys) {
        // Key: mailbox:{handle}:{ts}:{messageId}
        const parts = key.name.split(':')
        const msgId = parts[parts.length - 1]
        if (idsToDelete.has(msgId)) {
          await kv.delete(key.name)
        }
      }
    },

    async count(handle) {
      const prefix = mailboxPrefix(handle)
      const list = await kv.list({ prefix })
      return list.keys.length
    },
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd packages/server && npx vitest run src/__tests__/relay-mailbox.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/relay/mailbox.ts packages/server/src/__tests__/relay-mailbox.test.ts packages/server/src/__tests__/test-helpers.ts
git commit -m "feat(server): add KV-backed relay mailbox for offline message storage"
```

---

### Task 4: WebSocket Authentication

**Files:**

- Create: `packages/server/src/relay/ws-auth.ts`
- Test: `packages/server/src/__tests__/relay-auth.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/server/src/__tests__/relay-auth.test.ts
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { describe, it, expect, beforeEach } from 'vitest'
import { createMockD1, runMigrations } from './test-helpers'
import { generateWsChallenge, verifyWsAuth, reVerifyNft } from '../relay/ws-auth'
import { drizzle } from 'drizzle-orm/d1'
import { agents, organizations } from '../db/schema'

describe('generateWsChallenge', () => {
  it('returns a challenge string and expiry', () => {
    const { challenge, expiresAt } = generateWsChallenge()
    expect(challenge).toMatch(/^saga-relay:/)
    expect(new Date(expiresAt).getTime()).toBeGreaterThan(Date.now())
  })

  it('generates unique challenges', () => {
    const c1 = generateWsChallenge()
    const c2 = generateWsChallenge()
    expect(c1.challenge).not.toBe(c2.challenge)
  })
})

describe('verifyWsAuth', () => {
  let db: D1Database

  beforeEach(async () => {
    db = createMockD1()
    await runMigrations(db)

    const orm = drizzle(db)
    await orm.insert(agents).values({
      id: 'agent_alice',
      handle: 'alice',
      walletAddress: '0xalice',
      chain: 'eip155:8453',
      registeredAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      tokenId: 42,
      contractAddress: '0xcontract',
    })

    await orm.insert(agents).values({
      id: 'agent_bob_nonfted',
      handle: 'bob',
      walletAddress: '0xbob',
      chain: 'eip155:8453',
      registeredAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      // tokenId is null — no NFT
    })

    await orm.insert(organizations).values({
      id: 'org_acme',
      handle: 'acme',
      name: 'Acme Corp',
      walletAddress: '0xacme',
      chain: 'eip155:8453',
      registeredAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      tokenId: 99,
      contractAddress: '0xcontract',
    })
  })

  it('authenticates agent with valid NFT', async () => {
    const { challenge, expiresAt } = generateWsChallenge()
    const result = await verifyWsAuth(
      '0xalice',
      'eip155:8453',
      'alice',
      'valid-signature-1234567890',
      challenge,
      expiresAt,
      db
    )
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.state.handle).toBe('alice')
      expect(result.state.walletAddress).toBe('0xalice')
    }
  })

  it('authenticates organization with valid NFT', async () => {
    const { challenge, expiresAt } = generateWsChallenge()
    const result = await verifyWsAuth(
      '0xacme',
      'eip155:8453',
      'acme',
      'valid-signature-1234567890',
      challenge,
      expiresAt,
      db
    )
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.state.handle).toBe('acme')
    }
  })

  it('rejects agent without NFT', async () => {
    const { challenge, expiresAt } = generateWsChallenge()
    const result = await verifyWsAuth(
      '0xbob',
      'eip155:8453',
      'bob',
      'valid-signature-1234567890',
      challenge,
      expiresAt,
      db
    )
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain('NFT')
    }
  })

  it('rejects unknown handle', async () => {
    const { challenge, expiresAt } = generateWsChallenge()
    const result = await verifyWsAuth(
      '0xunknown',
      'eip155:8453',
      'unknown',
      'valid-signature-1234567890',
      challenge,
      expiresAt,
      db
    )
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain('not found')
    }
  })

  it('rejects wallet mismatch', async () => {
    const { challenge, expiresAt } = generateWsChallenge()
    const result = await verifyWsAuth(
      '0xwrong',
      'eip155:8453',
      'alice',
      'valid-signature-1234567890',
      challenge,
      expiresAt,
      db
    )
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain('does not match')
    }
  })

  it('rejects expired challenge', async () => {
    const { challenge } = generateWsChallenge()
    const expiredAt = new Date(Date.now() - 1000).toISOString()
    const result = await verifyWsAuth(
      '0xalice',
      'eip155:8453',
      'alice',
      'valid-signature-1234567890',
      challenge,
      expiredAt,
      db
    )
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain('expired')
    }
  })

  it('rejects invalid challenge format', async () => {
    const { expiresAt } = generateWsChallenge()
    const result = await verifyWsAuth(
      '0xalice',
      'eip155:8453',
      'alice',
      'valid-signature-1234567890',
      'bad-format',
      expiresAt,
      db
    )
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain('format')
    }
  })

  it('rejects empty signature', async () => {
    const { challenge, expiresAt } = generateWsChallenge()
    const result = await verifyWsAuth(
      '0xalice',
      'eip155:8453',
      'alice',
      'short',
      challenge,
      expiresAt,
      db
    )
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain('signature')
    }
  })
})

describe('reVerifyNft', () => {
  let db: D1Database

  beforeEach(async () => {
    db = createMockD1()
    await runMigrations(db)

    const orm = drizzle(db)
    await orm.insert(agents).values({
      id: 'agent_alice',
      handle: 'alice',
      walletAddress: '0xalice',
      chain: 'eip155:8453',
      registeredAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      tokenId: 42,
    })
  })

  it('returns true for valid NFT holder', async () => {
    expect(await reVerifyNft('alice', '0xalice', db)).toBe(true)
  })

  it('returns false for wallet mismatch', async () => {
    expect(await reVerifyNft('alice', '0xwrong', db)).toBe(false)
  })

  it('returns false for unknown handle', async () => {
    expect(await reVerifyNft('unknown', '0xunknown', db)).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/server && npx vitest run src/__tests__/relay-auth.test.ts`
Expected: FAIL — module `../relay/ws-auth` not found

- [ ] **Step 3: Write the authentication implementation**

```typescript
// packages/server/src/relay/ws-auth.ts
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { drizzle } from 'drizzle-orm/d1'
import { eq } from 'drizzle-orm'
import { agents, organizations } from '../db/schema'
import type { ConnectionState } from './types'
import { CHALLENGE_TTL_MS } from './types'

export type AuthResult = { ok: true; state: ConnectionState } | { ok: false; error: string }

/**
 * Generate a challenge string for WebSocket authentication.
 * Challenge format: `saga-relay:{uuid}:{timestamp}`
 */
export function generateWsChallenge(): { challenge: string; expiresAt: string } {
  const nonce = crypto.randomUUID()
  const now = Date.now()
  const expiresAt = new Date(now + CHALLENGE_TTL_MS).toISOString()
  const challenge = `saga-relay:${nonce}:${now}`
  return { challenge, expiresAt }
}

/**
 * Verify WebSocket authentication.
 *
 * Checks:
 * 1. Challenge is not expired and has correct format
 * 2. Signature is present (full EIP-191 verification is a TODO — same as HTTP auth)
 * 3. Entity (agent or org) exists in D1 with matching wallet address
 * 4. Entity has a valid NFT (tokenId is not null)
 */
export async function verifyWsAuth(
  walletAddress: string,
  chain: string,
  handle: string,
  signature: string,
  challenge: string,
  challengeExpiresAt: string,
  db: D1Database
): Promise<AuthResult> {
  if (new Date(challengeExpiresAt) <= new Date()) {
    return { ok: false, error: 'Challenge expired' }
  }

  if (!challenge.startsWith('saga-relay:')) {
    return { ok: false, error: 'Invalid challenge format' }
  }

  // TODO: Full EIP-191 signature verification with viem (same pattern as routes/auth.ts)
  if (!signature || signature.length < 10) {
    return { ok: false, error: 'Invalid signature' }
  }

  const orm = drizzle(db)
  const normalizedAddress = walletAddress.toLowerCase()

  // Check agent table
  const agent = await orm.select().from(agents).where(eq(agents.handle, handle)).get()

  if (agent) {
    if (agent.walletAddress.toLowerCase() !== normalizedAddress) {
      return { ok: false, error: 'Wallet address does not match registered agent' }
    }
    if (agent.tokenId === null || agent.tokenId === undefined) {
      return { ok: false, error: 'Agent does not have a valid NFT' }
    }
    return {
      ok: true,
      state: {
        handle,
        walletAddress: normalizedAddress,
        chain,
        authenticatedAt: new Date().toISOString(),
        lastPong: Date.now(),
        lastNftCheck: Date.now(),
      },
    }
  }

  // Check organization table
  const org = await orm.select().from(organizations).where(eq(organizations.handle, handle)).get()

  if (org) {
    if (org.walletAddress.toLowerCase() !== normalizedAddress) {
      return { ok: false, error: 'Wallet address does not match registered organization' }
    }
    if (org.tokenId === null || org.tokenId === undefined) {
      return { ok: false, error: 'Organization does not have a valid NFT' }
    }
    return {
      ok: true,
      state: {
        handle,
        walletAddress: normalizedAddress,
        chain,
        authenticatedAt: new Date().toISOString(),
        lastPong: Date.now(),
        lastNftCheck: Date.now(),
      },
    }
  }

  return { ok: false, error: 'Handle not found' }
}

/**
 * Re-verify NFT ownership for an authenticated connection.
 * Called periodically by the DO's alarm handler.
 * Returns false if the entity's NFT has been revoked/transferred.
 */
export async function reVerifyNft(
  handle: string,
  walletAddress: string,
  db: D1Database
): Promise<boolean> {
  const orm = drizzle(db)
  const normalizedAddress = walletAddress.toLowerCase()

  const agent = await orm.select().from(agents).where(eq(agents.handle, handle)).get()

  if (agent) {
    return (
      agent.walletAddress.toLowerCase() === normalizedAddress &&
      agent.tokenId !== null &&
      agent.tokenId !== undefined
    )
  }

  const org = await orm.select().from(organizations).where(eq(organizations.handle, handle)).get()

  if (org) {
    return (
      org.walletAddress.toLowerCase() === normalizedAddress &&
      org.tokenId !== null &&
      org.tokenId !== undefined
    )
  }

  return false
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/server && npx vitest run src/__tests__/relay-auth.test.ts`
Expected: PASS (11 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/relay/ws-auth.ts packages/server/src/__tests__/relay-auth.test.ts
git commit -m "feat(server): add WebSocket authentication with NFT verification"
```

---

### Task 5: RelayRoom Durable Object

**Files:**

- Create: `packages/server/src/relay/relay-room.ts`
- Create: `packages/server/src/__tests__/relay-test-helpers.ts`
- Test: `packages/server/src/__tests__/relay-room.test.ts`

- [ ] **Step 1: Create relay test helpers (mock WebSocket, mock DO state)**

```typescript
// packages/server/src/__tests__/relay-test-helpers.ts
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import type { Env } from '../bindings'
import { createMockD1, createMockKV, runMigrations } from './test-helpers'

/** Mock WebSocket with inspectable sent messages */
export interface MockWebSocket extends WebSocket {
  _sent: string[]
  _closed: boolean
  _closeCode?: number
  _closeReason?: string
  _attachment: unknown
}

export function createMockWebSocket(): MockWebSocket {
  const sent: string[] = []
  let closed = false
  let closeCode: number | undefined
  let closeReason: string | undefined
  let attachment: unknown = undefined

  return {
    send(msg: string | ArrayBuffer) {
      sent.push(typeof msg === 'string' ? msg : '[binary]')
    },
    close(code?: number, reason?: string) {
      closed = true
      closeCode = code
      closeReason = reason
    },
    serializeAttachment(value: unknown) {
      attachment = structuredClone(value)
    },
    deserializeAttachment() {
      return attachment
    },
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() {
      return true
    },
    get _sent() {
      return sent
    },
    get _closed() {
      return closed
    },
    get _closeCode() {
      return closeCode
    },
    get _closeReason() {
      return closeReason
    },
    get _attachment() {
      return attachment
    },
    // Stub remaining WebSocket interface properties
    readyState: 1,
    bufferedAmount: 0,
    extensions: '',
    protocol: '',
    url: '',
    binaryType: 'blob' as BinaryType,
    onopen: null,
    onclose: null,
    onerror: null,
    onmessage: null,
    CONNECTING: 0,
    OPEN: 1,
    CLOSING: 2,
    CLOSED: 3,
  } as unknown as MockWebSocket
}

/** Mock DurableObjectState for testing RelayRoom */
export function createMockDurableObjectState() {
  const websockets: WebSocket[] = []
  const storage = new Map<string, unknown>()
  let alarm: number | null = null

  return {
    id: { toString: () => 'test-do-id' } as DurableObjectId,
    acceptWebSocket(ws: WebSocket, _tags?: string[]) {
      websockets.push(ws)
    },
    getWebSockets(_tag?: string): WebSocket[] {
      return [...websockets]
    },
    storage: {
      get: async (key: string) => storage.get(key) ?? null,
      put: async (key: string, value: unknown) => {
        storage.set(key, value)
      },
      delete: async (key: string) => {
        storage.delete(key)
        return true
      },
      setAlarm: async (time: number | Date) => {
        alarm = typeof time === 'number' ? time : time.getTime()
      },
      getAlarm: async () => alarm,
      deleteAlarm: async () => {
        alarm = null
      },
      list: async () => new Map(storage),
    },
    // Expose for test inspection
    _websockets: websockets,
    _storage: storage,
    _getAlarm: () => alarm,
  } as unknown as DurableObjectState & {
    _websockets: WebSocket[]
    _storage: Map<string, unknown>
    _getAlarm: () => number | null
  }
}

/** Create a mock Env with RELAY_MAILBOX for DO testing */
export async function createRelayMockEnv(): Promise<Env> {
  const db = createMockD1()
  await runMigrations(db)
  return {
    DB: db,
    STORAGE: {} as any,
    SESSIONS: createMockKV(),
    INDEXER_STATE: createMockKV(),
    RELAY_MAILBOX: createMockKV(),
    RELAY_ROOM: {} as any,
    SERVER_NAME: 'Test SAGA Server',
  } as Env
}
```

- [ ] **Step 2: Write the failing RelayRoom test**

```typescript
// packages/server/src/__tests__/relay-room.test.ts
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { describe, it, expect, beforeEach } from 'vitest'
import { drizzle } from 'drizzle-orm/d1'
import { agents } from '../db/schema'
import { RelayRoom } from '../relay/relay-room'
import {
  createMockWebSocket,
  createMockDurableObjectState,
  createRelayMockEnv,
} from './relay-test-helpers'
import type { MockWebSocket } from './relay-test-helpers'
import type { Env } from '../bindings'

describe('RelayRoom', () => {
  let ctx: ReturnType<typeof createMockDurableObjectState>
  let env: Env
  let room: RelayRoom

  beforeEach(async () => {
    ctx = createMockDurableObjectState()
    env = await createRelayMockEnv()

    // Seed a valid agent with NFT
    const orm = drizzle(env.DB)
    await orm.insert(agents).values({
      id: 'agent_alice',
      handle: 'alice',
      walletAddress: '0xalice',
      chain: 'eip155:8453',
      registeredAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      tokenId: 42,
      contractAddress: '0xcontract',
    })
    await orm.insert(agents).values({
      id: 'agent_bob',
      handle: 'bob',
      walletAddress: '0xbob',
      chain: 'eip155:8453',
      registeredAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      tokenId: 43,
      contractAddress: '0xcontract',
    })

    room = new RelayRoom(ctx as unknown as DurableObjectState, env)
  })

  function getLastMessage(ws: MockWebSocket): Record<string, unknown> {
    return JSON.parse(ws._sent[ws._sent.length - 1])
  }

  async function authenticateWs(
    ws: MockWebSocket,
    handle: string,
    walletAddress: string
  ): Promise<void> {
    // Simulate challenge sent (normally happens in fetch)
    const challenge = `saga-relay:${crypto.randomUUID()}:${Date.now()}`
    const expiresAt = new Date(Date.now() + 300_000).toISOString()
    ws.serializeAttachment({ authenticated: false, challenge, expiresAt })
    ctx._websockets.push(ws)

    await room.webSocketMessage(
      ws,
      JSON.stringify({
        type: 'auth:verify',
        walletAddress,
        chain: 'eip155:8453',
        handle,
        signature: 'valid-signature-1234567890',
        challenge,
      })
    )
  }

  describe('authentication', () => {
    it('authenticates a valid agent', async () => {
      const ws = createMockWebSocket()
      await authenticateWs(ws, 'alice', '0xalice')

      const msg = getLastMessage(ws)
      expect(msg.type).toBe('auth:success')
      expect(msg.handle).toBe('alice')
    })

    it('rejects agent without matching challenge', async () => {
      const ws = createMockWebSocket()
      ws.serializeAttachment({
        authenticated: false,
        challenge: 'saga-relay:correct:123',
        expiresAt: new Date(Date.now() + 300_000).toISOString(),
      })
      ctx._websockets.push(ws)

      await room.webSocketMessage(
        ws,
        JSON.stringify({
          type: 'auth:verify',
          walletAddress: '0xalice',
          chain: 'eip155:8453',
          handle: 'alice',
          signature: 'valid-signature-1234567890',
          challenge: 'saga-relay:wrong:456',
        })
      )

      const msg = getLastMessage(ws)
      expect(msg.type).toBe('auth:error')
    })

    it('rejects unauthenticated relay:send', async () => {
      const ws = createMockWebSocket()
      ws.serializeAttachment({ authenticated: false, challenge: 'c', expiresAt: 'e' })
      ctx._websockets.push(ws)

      await room.webSocketMessage(
        ws,
        JSON.stringify({
          type: 'relay:send',
          envelope: {
            v: 1,
            type: 'direct-message',
            scope: 'mutual',
            from: 'alice@epicflow',
            to: 'bob@epicflow',
            ct: 'x',
            ts: '2026-01-01T00:00:00Z',
            id: 'msg1',
          },
        })
      )

      const msg = getLastMessage(ws)
      expect(msg.type).toBe('error')
      expect(msg.error).toContain('Not authenticated')
    })
  })

  describe('message routing', () => {
    it('delivers to online recipient', async () => {
      const aliceWs = createMockWebSocket()
      const bobWs = createMockWebSocket()
      await authenticateWs(aliceWs, 'alice', '0xalice')
      await authenticateWs(bobWs, 'bob', '0xbob')

      const envelope = {
        v: 1,
        type: 'direct-message',
        scope: 'mutual',
        from: 'alice@epicflow',
        to: 'bob@epicflow',
        ct: 'encrypted-payload',
        ts: new Date().toISOString(),
        id: 'msg-001',
      }

      await room.webSocketMessage(aliceWs, JSON.stringify({ type: 'relay:send', envelope }))

      // Alice should get ack
      const ack = getLastMessage(aliceWs)
      expect(ack.type).toBe('relay:ack')
      expect(ack.messageId).toBe('msg-001')

      // Bob should receive delivery
      const delivery = getLastMessage(bobWs)
      expect(delivery.type).toBe('relay:deliver')
      expect((delivery.envelope as Record<string, unknown>).id).toBe('msg-001')
      expect((delivery.envelope as Record<string, unknown>).ct).toBe('encrypted-payload')
    })

    it('mailboxes message for offline recipient', async () => {
      const aliceWs = createMockWebSocket()
      await authenticateWs(aliceWs, 'alice', '0xalice')

      const envelope = {
        v: 1,
        type: 'direct-message',
        scope: 'mutual',
        from: 'alice@epicflow',
        to: 'charlie@epicflow',
        ct: 'encrypted-for-charlie',
        ts: new Date().toISOString(),
        id: 'msg-002',
      }

      await room.webSocketMessage(aliceWs, JSON.stringify({ type: 'relay:send', envelope }))

      // Alice gets ack (message was mailboxed)
      const ack = getLastMessage(aliceWs)
      expect(ack.type).toBe('relay:ack')
      expect(ack.messageId).toBe('msg-002')
    })

    it('rejects envelope with sender identity mismatch', async () => {
      const aliceWs = createMockWebSocket()
      await authenticateWs(aliceWs, 'alice', '0xalice')

      const envelope = {
        v: 1,
        type: 'direct-message',
        scope: 'mutual',
        from: 'mallory@epicflow',
        to: 'bob@epicflow',
        ct: 'x',
        ts: new Date().toISOString(),
        id: 'msg-003',
      }

      await room.webSocketMessage(aliceWs, JSON.stringify({ type: 'relay:send', envelope }))

      const err = getLastMessage(aliceWs)
      expect(err.type).toBe('relay:error')
      expect(err.error).toContain('mismatch')
    })
  })

  describe('mailbox drain', () => {
    it('drains mailbox on request', async () => {
      // Store a message in bob's mailbox directly
      await env.RELAY_MAILBOX.put(
        'mailbox:bob:2026-03-26T00:00:00.000Z:msg-queued',
        JSON.stringify({
          v: 1,
          type: 'direct-message',
          scope: 'mutual',
          from: 'alice@epicflow',
          to: 'bob@epicflow',
          ct: 'queued-payload',
          ts: '2026-03-26T00:00:00.000Z',
          id: 'msg-queued',
        })
      )

      const bobWs = createMockWebSocket()
      await authenticateWs(bobWs, 'bob', '0xbob')

      await room.webSocketMessage(bobWs, JSON.stringify({ type: 'mailbox:drain' }))

      const batch = getLastMessage(bobWs)
      expect(batch.type).toBe('mailbox:batch')
      expect((batch.envelopes as unknown[]).length).toBe(1)
    })
  })

  describe('connection lifecycle', () => {
    it('handles pong message', async () => {
      const ws = createMockWebSocket()
      await authenticateWs(ws, 'alice', '0xalice')

      // Send pong (should not produce any response, just updates lastPong)
      const sentBefore = ws._sent.length
      await room.webSocketMessage(ws, JSON.stringify({ type: 'control:pong' }))
      // Pong handler does not send a response
      expect(ws._sent.length).toBe(sentBefore)
    })

    it('handles webSocketClose by removing from registry', async () => {
      const aliceWs = createMockWebSocket()
      const bobWs = createMockWebSocket()
      await authenticateWs(aliceWs, 'alice', '0xalice')
      await authenticateWs(bobWs, 'bob', '0xbob')

      // Alice disconnects
      await room.webSocketClose(aliceWs, 1000, 'bye', true)

      // Now a message to alice should be mailboxed, not delivered
      const envelope = {
        v: 1,
        type: 'direct-message',
        scope: 'mutual',
        from: 'bob@epicflow',
        to: 'alice@epicflow',
        ct: 'x',
        ts: new Date().toISOString(),
        id: 'msg-after-dc',
      }
      await room.webSocketMessage(bobWs, JSON.stringify({ type: 'relay:send', envelope }))

      const ack = getLastMessage(bobWs)
      expect(ack.type).toBe('relay:ack')
      // Alice's WS should NOT have received the message
      expect(aliceWs._sent.filter(m => JSON.parse(m).type === 'relay:deliver')).toHaveLength(0)
    })

    it('rejects invalid JSON messages', async () => {
      const ws = createMockWebSocket()
      ws.serializeAttachment({ authenticated: false, challenge: 'c', expiresAt: 'e' })
      ctx._websockets.push(ws)

      await room.webSocketMessage(ws, 'not-json-at-all')

      const msg = getLastMessage(ws)
      expect(msg.type).toBe('error')
    })
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd packages/server && npx vitest run src/__tests__/relay-room.test.ts`
Expected: FAIL — module `../relay/relay-room` not found

- [ ] **Step 4: Write the RelayRoom Durable Object implementation**

```typescript
// packages/server/src/relay/relay-room.ts
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import type { Env } from '../bindings'
import type { RelayEnvelope, WebSocketAttachment, ConnectionState } from './types'
import {
  parseClientMessage,
  PING_INTERVAL_MS,
  STALE_TIMEOUT_MS,
  NFT_RECHECK_INTERVAL_MS,
} from './types'
import { generateWsChallenge, verifyWsAuth, reVerifyNft } from './ws-auth'
import { validateEnvelope } from './envelope-validator'
import { createMailbox } from './mailbox'
import type { RelayMailbox } from './mailbox'

/**
 * RelayRoom Durable Object — manages WebSocket connections for the SAGA relay.
 *
 * Uses the Hibernatable WebSocket API. Connection state is stored as WebSocket
 * attachments so it survives DO hibernation. An in-memory handle→WebSocket map
 * is lazily reconstructed from attachments on wake.
 *
 * One instance per directory acts as the relay coordinator.
 */
export class RelayRoom {
  private ctx: DurableObjectState
  private env: Env
  private mailbox: RelayMailbox

  /** Lazy cache: handle → WebSocket. Reconstructed from attachments on demand. */
  private handleMap: Map<string, WebSocket> | null = null

  constructor(ctx: DurableObjectState, env: Env) {
    this.ctx = ctx
    this.env = env
    this.mailbox = createMailbox(this.env.RELAY_MAILBOX)
  }

  // ── WebSocket upgrade ─────────────────────────────────────────

  async fetch(request: Request): Promise<Response> {
    const upgradeHeader = request.headers.get('Upgrade')
    if (upgradeHeader !== 'websocket') {
      return new Response('Expected WebSocket upgrade', { status: 426 })
    }

    const pair = new WebSocketPair()
    const [client, server] = Object.values(pair)

    this.ctx.acceptWebSocket(server)

    const { challenge, expiresAt } = generateWsChallenge()
    const attachment: WebSocketAttachment = {
      authenticated: false,
      challenge,
      expiresAt,
    }
    server.serializeAttachment(attachment)

    server.send(JSON.stringify({ type: 'auth:challenge', challenge, expiresAt }))

    // Schedule heartbeat alarm if not already set
    const currentAlarm = await this.ctx.storage.getAlarm()
    if (!currentAlarm) {
      await this.ctx.storage.setAlarm(Date.now() + PING_INTERVAL_MS)
    }

    return new Response(null, { status: 101, webSocket: client })
  }

  // ── Hibernatable WebSocket handlers ───────────────────────────

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message !== 'string') {
      this.sendJson(ws, { type: 'error', error: 'Binary messages not supported' })
      return
    }

    const msg = parseClientMessage(message)
    if (!msg) {
      this.sendJson(ws, { type: 'error', error: 'Invalid message format' })
      return
    }

    switch (msg.type) {
      case 'auth:verify':
        await this.handleAuthVerify(ws, msg)
        break
      case 'relay:send':
        await this.handleRelaySend(ws, msg)
        break
      case 'control:pong':
        this.handlePong(ws)
        break
      case 'mailbox:drain':
        await this.handleMailboxDrain(ws)
        break
      case 'mailbox:ack':
        await this.handleMailboxAck(ws, msg)
        break
    }
  }

  async webSocketClose(
    ws: WebSocket,
    _code: number,
    _reason: string,
    _wasClean: boolean
  ): Promise<void> {
    this.removeConnection(ws)
  }

  async webSocketError(ws: WebSocket, _error: unknown): Promise<void> {
    this.removeConnection(ws)
  }

  async alarm(): Promise<void> {
    const handleMap = this.getHandleMap()

    // Send pings
    for (const [handle, ws] of handleMap) {
      try {
        this.sendJson(ws, { type: 'control:ping' })
      } catch {
        this.removeConnection(ws)
      }
    }

    // Cleanup stale connections
    const now = Date.now()
    for (const [handle, ws] of handleMap) {
      const attachment = ws.deserializeAttachment() as WebSocketAttachment
      if (attachment.authenticated && now - attachment.state.lastPong > STALE_TIMEOUT_MS) {
        try {
          ws.close(4001, 'Connection stale')
        } catch {}
        this.removeConnection(ws)
      }
    }

    // Re-verify NFT ownership
    for (const [handle, ws] of this.getHandleMap()) {
      const attachment = ws.deserializeAttachment() as WebSocketAttachment
      if (
        attachment.authenticated &&
        now - attachment.state.lastNftCheck > NFT_RECHECK_INTERVAL_MS
      ) {
        const valid = await reVerifyNft(handle, attachment.state.walletAddress, this.env.DB)
        if (!valid) {
          this.sendJson(ws, { type: 'auth:error', error: 'NFT verification failed' })
          try {
            ws.close(4003, 'NFT verification failed')
          } catch {}
          this.removeConnection(ws)
        } else {
          attachment.state.lastNftCheck = now
          ws.serializeAttachment(attachment)
        }
      }
    }

    // Re-schedule if connections remain
    if (this.getHandleMap().size > 0) {
      await this.ctx.storage.setAlarm(Date.now() + PING_INTERVAL_MS)
    }
  }

  // ── Private handlers ──────────────────────────────────────────

  private async handleAuthVerify(
    ws: WebSocket,
    msg: {
      walletAddress: string
      chain: string
      handle: string
      signature: string
      challenge: string
    }
  ): Promise<void> {
    const attachment = ws.deserializeAttachment() as WebSocketAttachment | null

    if (!attachment || attachment.authenticated) {
      this.sendJson(ws, {
        type: 'auth:error',
        error: attachment?.authenticated ? 'Already authenticated' : 'No pending challenge',
      })
      return
    }

    if (msg.challenge !== attachment.challenge) {
      this.sendJson(ws, { type: 'auth:error', error: 'Challenge mismatch' })
      return
    }

    const result = await verifyWsAuth(
      msg.walletAddress,
      msg.chain,
      msg.handle,
      msg.signature,
      attachment.challenge,
      attachment.expiresAt,
      this.env.DB
    )

    if (!result.ok) {
      this.sendJson(ws, { type: 'auth:error', error: result.error })
      try {
        ws.close(4002, result.error)
      } catch {}
      return
    }

    // Close any existing connection for this handle
    const existing = this.getHandleMap().get(result.state.handle)
    if (existing && existing !== ws) {
      this.sendJson(existing, {
        type: 'error',
        error: 'Replaced by new connection',
      })
      try {
        existing.close(4000, 'Replaced by new connection')
      } catch {}
      this.removeConnection(existing)
    }

    // Register authenticated connection
    const authAttachment: WebSocketAttachment = {
      authenticated: true,
      state: result.state,
    }
    ws.serializeAttachment(authAttachment)
    this.invalidateHandleMap()

    this.sendJson(ws, { type: 'auth:success', handle: result.state.handle })
  }

  private async handleRelaySend(ws: WebSocket, msg: { envelope: unknown }): Promise<void> {
    const senderState = this.getAuthenticatedState(ws)
    if (!senderState) {
      this.sendJson(ws, { type: 'error', error: 'Not authenticated' })
      return
    }

    const envelope = msg.envelope as RelayEnvelope
    const validationError = validateEnvelope(envelope)
    if (validationError) {
      this.sendJson(ws, {
        type: 'relay:error',
        messageId: ((envelope as Record<string, unknown>)?.id as string) ?? '',
        error: validationError.message,
      })
      return
    }

    // Verify sender identity matches
    if (!envelope.from.startsWith(senderState.handle)) {
      this.sendJson(ws, {
        type: 'relay:error',
        messageId: envelope.id,
        error: 'Sender identity mismatch',
      })
      return
    }

    // Route to recipients
    const recipients = Array.isArray(envelope.to) ? envelope.to : [envelope.to]

    for (const recipient of recipients) {
      const recipientHandle = recipient.split('@')[0]
      const recipientWs = this.getHandleMap().get(recipientHandle)

      if (recipientWs) {
        try {
          this.sendJson(recipientWs, { type: 'relay:deliver', envelope })
        } catch {
          await this.mailbox.store(recipientHandle, envelope)
        }
      } else {
        await this.mailbox.store(recipientHandle, envelope)
      }
    }

    this.sendJson(ws, { type: 'relay:ack', messageId: envelope.id })
  }

  private handlePong(ws: WebSocket): void {
    const attachment = ws.deserializeAttachment() as WebSocketAttachment
    if (attachment?.authenticated) {
      attachment.state.lastPong = Date.now()
      ws.serializeAttachment(attachment)
    }
  }

  private async handleMailboxDrain(ws: WebSocket): Promise<void> {
    const state = this.getAuthenticatedState(ws)
    if (!state) {
      this.sendJson(ws, { type: 'error', error: 'Not authenticated' })
      return
    }

    const { envelopes, remaining } = await this.mailbox.drain(state.handle)
    this.sendJson(ws, { type: 'mailbox:batch', envelopes, remaining })
  }

  private async handleMailboxAck(ws: WebSocket, msg: { messageIds: string[] }): Promise<void> {
    const state = this.getAuthenticatedState(ws)
    if (!state) {
      this.sendJson(ws, { type: 'error', error: 'Not authenticated' })
      return
    }

    await this.mailbox.ack(state.handle, msg.messageIds)
  }

  // ── Helpers ───────────────────────────────────────────────────

  /**
   * Lazily build handle→WebSocket map from WebSocket attachments.
   * Survives DO hibernation via reconstruction.
   */
  private getHandleMap(): Map<string, WebSocket> {
    if (!this.handleMap) {
      this.handleMap = new Map()
      for (const ws of this.ctx.getWebSockets()) {
        const attachment = ws.deserializeAttachment() as WebSocketAttachment | null
        if (attachment?.authenticated) {
          this.handleMap.set(attachment.state.handle, ws)
        }
      }
    }
    return this.handleMap
  }

  /** Invalidate the cached handle map (call after registration/removal) */
  private invalidateHandleMap(): void {
    this.handleMap = null
  }

  /** Remove a WebSocket from the registry */
  private removeConnection(ws: WebSocket): void {
    const attachment = ws.deserializeAttachment() as WebSocketAttachment | null
    if (attachment?.authenticated) {
      this.handleMap?.delete(attachment.state.handle)
    }
    // Mark as unauthenticated so it's excluded from future map rebuilds
    ws.serializeAttachment(null)
    this.invalidateHandleMap()
  }

  /** Get the connection state for an authenticated WebSocket, or null */
  private getAuthenticatedState(ws: WebSocket): ConnectionState | null {
    const attachment = ws.deserializeAttachment() as WebSocketAttachment | null
    if (attachment?.authenticated) {
      return attachment.state
    }
    return null
  }

  /** Send a JSON message to a WebSocket */
  private sendJson(ws: WebSocket, data: Record<string, unknown>): void {
    ws.send(JSON.stringify(data))
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd packages/server && npx vitest run src/__tests__/relay-room.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/relay/relay-room.ts packages/server/src/__tests__/relay-room.test.ts packages/server/src/__tests__/relay-test-helpers.ts
git commit -m "feat(server): add RelayRoom Durable Object with routing and heartbeat"
```

---

### Task 6: HTTP Route, Bindings, Wrangler Config, and Exports

**Files:**

- Create: `packages/server/src/routes/relay.ts`
- Modify: `packages/server/src/bindings.ts:4-8` — add relay bindings
- Modify: `packages/server/src/index.ts` — mount route, export DO
- Modify: `packages/server/wrangler.toml` — add KV, DO, migration
- Modify: `packages/server/src/__tests__/test-helpers.ts:419-427` — add RELAY_MAILBOX to mock env

- [ ] **Step 1: Create the relay route**

```typescript
// packages/server/src/routes/relay.ts
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { Hono } from 'hono'
import type { Env } from '../bindings'

export const relayRoutes = new Hono<{ Bindings: Env }>()

/**
 * GET /v1/relay — WebSocket upgrade endpoint.
 * Forwards the request to the RelayRoom Durable Object for connection management.
 */
relayRoutes.get('/relay', async c => {
  const upgradeHeader = c.req.header('Upgrade')
  if (upgradeHeader !== 'websocket') {
    return c.json({ error: 'Expected WebSocket upgrade', code: 'UPGRADE_REQUIRED' }, 426)
  }

  const id = c.env.RELAY_ROOM.idFromName('default')
  const stub = c.env.RELAY_ROOM.get(id)
  return stub.fetch(c.req.raw)
})
```

- [ ] **Step 2: Update bindings.ts**

Add the relay bindings to the `Env` interface in `packages/server/src/bindings.ts`. Add after the `INDEXER_STATE` line:

```typescript
/** KV namespace for offline relay message storage */
RELAY_MAILBOX: KVNamespace

/** Durable Object namespace for the WebSocket relay room */
RELAY_ROOM: DurableObjectNamespace
```

- [ ] **Step 3: Update index.ts — mount route and export DO**

In `packages/server/src/index.ts`:

Add to imports:

```typescript
import { relayRoutes } from './routes/relay'
import { RelayRoom } from './relay/relay-room'
```

Add route mount after the existing routes (before the health check):

```typescript
app.route('/v1', relayRoutes)
```

Add the relay endpoint to the root JSON response's `endpoints` object:

```typescript
relay: '/v1/relay',
```

Update the existing exports to include `RelayRoom`:

```typescript
export { RelayRoom }
```

- [ ] **Step 4: Update wrangler.toml**

Add at the top level (after the existing `[[kv_namespaces]]` blocks, before `[dev]`):

```toml
[[kv_namespaces]]
binding = "RELAY_MAILBOX"
id = "saga-relay-mailbox-dev"

[durable_objects]
bindings = [
  { name = "RELAY_ROOM", class_name = "RelayRoom" }
]

[[migrations]]
tag = "v1"
new_classes = ["RelayRoom"]
```

Add to staging section (after existing `[[env.staging.kv_namespaces]]` blocks):

```toml
[[env.staging.kv_namespaces]]
binding = "RELAY_MAILBOX"
id = "saga-relay-mailbox-staging"
```

Add to production section (after existing `[[env.production.kv_namespaces]]` blocks):

```toml
[[env.production.kv_namespaces]]
binding = "RELAY_MAILBOX"
id = "saga-relay-mailbox-production"
```

Note: The staging and production KV namespace IDs are placeholders. Create them before deployment with:

```bash
wrangler kv:namespace create RELAY_MAILBOX --env staging
wrangler kv:namespace create RELAY_MAILBOX --env production
```

- [ ] **Step 5: Update test helpers — add RELAY_MAILBOX to mock env**

In `packages/server/src/__tests__/test-helpers.ts`, update `createMockEnv()` to include the relay bindings:

```typescript
export function createMockEnv(): Env {
  return {
    DB: createMockD1(),
    STORAGE: createMockR2(),
    SESSIONS: createMockKV(),
    INDEXER_STATE: createMockKV(),
    RELAY_MAILBOX: createMockKV(),
    RELAY_ROOM: {} as unknown as DurableObjectNamespace,
    SERVER_NAME: 'Test SAGA Server',
  }
}
```

- [ ] **Step 6: Write a basic route test**

Add a test to verify the relay route returns the correct response for non-WebSocket requests. Add this to the existing `packages/server/src/__tests__/server.test.ts` file at the end (before the final closing brace of the describe block):

```typescript
describe('GET /v1/relay', () => {
  it('returns 426 for non-WebSocket requests', async () => {
    const res = await req('GET', '/v1/relay')
    expect(res.status).toBe(426)
    const body = await res.json()
    expect(body.code).toBe('UPGRADE_REQUIRED')
  })
})
```

- [ ] **Step 7: Run all existing tests to verify nothing broke**

Run: `cd packages/server && npx vitest run`
Expected: All existing tests PASS, plus the new relay route test

- [ ] **Step 8: Commit**

```bash
git add packages/server/src/routes/relay.ts packages/server/src/bindings.ts packages/server/src/index.ts packages/server/wrangler.toml packages/server/src/__tests__/test-helpers.ts packages/server/src/__tests__/server.test.ts
git commit -m "feat(server): wire relay route, bindings, and wrangler config"
```

---

### Task 7: Integration Tests and Build Verification

**Files:**

- Create: `packages/server/src/__tests__/relay-integration.test.ts`

- [ ] **Step 1: Write the integration test**

```typescript
// packages/server/src/__tests__/relay-integration.test.ts
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { describe, it, expect, beforeEach } from 'vitest'
import { drizzle } from 'drizzle-orm/d1'
import { agents, organizations } from '../db/schema'
import { RelayRoom } from '../relay/relay-room'
import {
  createMockWebSocket,
  createMockDurableObjectState,
  createRelayMockEnv,
} from './relay-test-helpers'
import type { MockWebSocket } from './relay-test-helpers'
import type { Env } from '../bindings'

describe('Relay Integration', () => {
  let ctx: ReturnType<typeof createMockDurableObjectState>
  let env: Env
  let room: RelayRoom

  beforeEach(async () => {
    ctx = createMockDurableObjectState()
    env = await createRelayMockEnv()

    const orm = drizzle(env.DB)
    await orm.insert(agents).values([
      {
        id: 'agent_alice',
        handle: 'alice',
        walletAddress: '0xalice',
        chain: 'eip155:8453',
        registeredAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        tokenId: 1,
        contractAddress: '0xcontract',
      },
      {
        id: 'agent_bob',
        handle: 'bob',
        walletAddress: '0xbob',
        chain: 'eip155:8453',
        registeredAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        tokenId: 2,
        contractAddress: '0xcontract',
      },
    ])
    await orm.insert(organizations).values({
      id: 'org_acme',
      handle: 'acme',
      name: 'Acme Corp',
      walletAddress: '0xacme',
      chain: 'eip155:8453',
      registeredAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      tokenId: 100,
      contractAddress: '0xcontract',
    })

    room = new RelayRoom(ctx as unknown as DurableObjectState, env)
  })

  function parseSent(ws: MockWebSocket): Record<string, unknown>[] {
    return ws._sent.map(s => JSON.parse(s))
  }

  function lastMessage(ws: MockWebSocket): Record<string, unknown> {
    return JSON.parse(ws._sent[ws._sent.length - 1])
  }

  async function connectAndAuth(handle: string, walletAddress: string): Promise<MockWebSocket> {
    const ws = createMockWebSocket()
    const challenge = `saga-relay:${crypto.randomUUID()}:${Date.now()}`
    const expiresAt = new Date(Date.now() + 300_000).toISOString()
    ws.serializeAttachment({ authenticated: false, challenge, expiresAt })
    ctx._websockets.push(ws)

    await room.webSocketMessage(
      ws,
      JSON.stringify({
        type: 'auth:verify',
        walletAddress,
        chain: 'eip155:8453',
        handle,
        signature: 'valid-signature-1234567890',
        challenge,
      })
    )

    expect(lastMessage(ws).type).toBe('auth:success')
    return ws
  }

  it('full flow: connect → auth → send → receive → ack', async () => {
    const aliceWs = await connectAndAuth('alice', '0xalice')
    const bobWs = await connectAndAuth('bob', '0xbob')

    const envelope = {
      v: 1,
      type: 'direct-message',
      scope: 'mutual',
      from: 'alice@epicflow',
      to: 'bob@epicflow',
      ct: 'aGVsbG8gYm9i', // opaque ciphertext
      nonce: 'cmFuZG9tbm9uY2U=',
      ts: new Date().toISOString(),
      id: 'integration-msg-001',
    }

    await room.webSocketMessage(aliceWs, JSON.stringify({ type: 'relay:send', envelope }))

    // Alice gets ack
    expect(lastMessage(aliceWs)).toEqual({
      type: 'relay:ack',
      messageId: 'integration-msg-001',
    })

    // Bob receives the envelope
    const bobDelivery = lastMessage(bobWs)
    expect(bobDelivery.type).toBe('relay:deliver')
    expect(bobDelivery.envelope).toEqual(envelope)
  })

  it('hub cannot read message content — passes through opaque ciphertext', async () => {
    const aliceWs = await connectAndAuth('alice', '0xalice')
    const bobWs = await connectAndAuth('bob', '0xbob')

    // Content is random bytes (base64) — hub has no way to decrypt
    const opaquePayload = 'dGhpcyBpcyBlbmNyeXB0ZWQgZGF0YSB0aGF0IHRoZSBodWIgY2Fubm90IHJlYWQ='
    const envelope = {
      v: 1,
      type: 'memory-sync',
      scope: 'private',
      from: 'alice@epicflow',
      to: 'bob@epicflow',
      ct: opaquePayload,
      iv: 'cmFuZG9taXY=',
      authTag: 'cmFuZG9tdGFn',
      wrappedDek: 'cmFuZG9tZGVr',
      ts: new Date().toISOString(),
      id: 'opacity-test-001',
    }

    await room.webSocketMessage(aliceWs, JSON.stringify({ type: 'relay:send', envelope }))

    // Verify envelope is delivered EXACTLY as sent — no modification
    const delivery = lastMessage(bobWs)
    expect(delivery.type).toBe('relay:deliver')
    const delivered = delivery.envelope as Record<string, unknown>
    expect(delivered.ct).toBe(opaquePayload)
    expect(delivered.iv).toBe('cmFuZG9taXY=')
    expect(delivered.authTag).toBe('cmFuZG9tdGFn')
    expect(delivered.wrappedDek).toBe('cmFuZG9tZGVr')
  })

  it('offline message delivery via mailbox', async () => {
    const aliceWs = await connectAndAuth('alice', '0xalice')
    // Bob is NOT connected

    const envelope = {
      v: 1,
      type: 'direct-message',
      scope: 'mutual',
      from: 'alice@epicflow',
      to: 'bob@epicflow',
      ct: 'bWVzc2FnZSBmb3IgYm9i',
      ts: new Date().toISOString(),
      id: 'offline-msg-001',
    }

    await room.webSocketMessage(aliceWs, JSON.stringify({ type: 'relay:send', envelope }))

    // Alice gets ack (message was mailboxed)
    expect(lastMessage(aliceWs).type).toBe('relay:ack')

    // Bob connects later
    const bobWs = await connectAndAuth('bob', '0xbob')

    // Bob drains mailbox
    await room.webSocketMessage(bobWs, JSON.stringify({ type: 'mailbox:drain' }))

    const batch = lastMessage(bobWs)
    expect(batch.type).toBe('mailbox:batch')
    const envelopes = batch.envelopes as unknown[]
    expect(envelopes).toHaveLength(1)
    expect((envelopes[0] as Record<string, unknown>).id).toBe('offline-msg-001')

    // Bob acks the messages
    await room.webSocketMessage(
      bobWs,
      JSON.stringify({ type: 'mailbox:ack', messageIds: ['offline-msg-001'] })
    )

    // Drain again — should be empty
    await room.webSocketMessage(bobWs, JSON.stringify({ type: 'mailbox:drain' }))
    const emptyBatch = lastMessage(bobWs)
    expect((emptyBatch.envelopes as unknown[]).length).toBe(0)
  })

  it('org entity can authenticate and send messages', async () => {
    const acmeWs = await connectAndAuth('acme', '0xacme')
    const aliceWs = await connectAndAuth('alice', '0xalice')

    const envelope = {
      v: 1,
      type: 'direct-message',
      scope: 'mutual',
      from: 'acme@epicflow',
      to: 'alice@epicflow',
      ct: 'dGFzayBhc3NpZ25tZW50',
      ts: new Date().toISOString(),
      id: 'org-msg-001',
    }

    await room.webSocketMessage(acmeWs, JSON.stringify({ type: 'relay:send', envelope }))

    expect(lastMessage(acmeWs).type).toBe('relay:ack')
    expect(lastMessage(aliceWs).type).toBe('relay:deliver')
  })

  it('connection replacement — new connection replaces old', async () => {
    const aliceWs1 = await connectAndAuth('alice', '0xalice')
    const aliceWs2 = await connectAndAuth('alice', '0xalice')

    // First connection should have been notified and closed
    const ws1Messages = parseSent(aliceWs1)
    const replacedMsg = ws1Messages.find(m => m.error === 'Replaced by new connection')
    expect(replacedMsg).toBeDefined()
    expect(aliceWs1._closed).toBe(true)

    // New connection should work
    const bobWs = await connectAndAuth('bob', '0xbob')
    const envelope = {
      v: 1,
      type: 'direct-message',
      scope: 'mutual',
      from: 'bob@epicflow',
      to: 'alice@epicflow',
      ct: 'x',
      ts: new Date().toISOString(),
      id: 'replace-test',
    }
    await room.webSocketMessage(bobWs, JSON.stringify({ type: 'relay:send', envelope }))

    // Message should arrive on the NEW connection (ws2), not the old one (ws1)
    expect(lastMessage(aliceWs2).type).toBe('relay:deliver')
  })
})
```

- [ ] **Step 2: Run all relay tests**

Run: `cd packages/server && npx vitest run src/__tests__/relay-*.test.ts`
Expected: All relay tests PASS

- [ ] **Step 3: Run the full server test suite**

Run: `cd packages/server && npx vitest run`
Expected: All tests PASS (existing + relay tests)

- [ ] **Step 4: Verify TypeScript compilation**

Run: `cd packages/server && npx tsc --noEmit`
Expected: No type errors

Note: If there are type errors related to Durable Object types (`DurableObjectState`, `WebSocketPair`, etc.), ensure `@cloudflare/workers-types` is at `^4.20250313.0` or later. These types are provided by the Cloudflare Workers runtime and included via `tsconfig.json`'s `"types": ["@cloudflare/workers-types"]`.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/__tests__/relay-integration.test.ts
git commit -m "feat(server): add relay integration tests — full protocol flow and hub opacity"
```

---

## Self-Review

### Spec Coverage

| Phase 2 Spec Deliverable                  | Task                                                |
| ----------------------------------------- | --------------------------------------------------- |
| WebSocket endpoint (`/v1/relay`)          | Task 6 (route + DO forwarding)                      |
| Hono WebSocket upgrade handler            | Task 6 (relay route)                                |
| Durable Object for state management       | Task 5 (RelayRoom)                                  |
| Wallet challenge-response on WS handshake | Task 4 (ws-auth) + Task 5 (handleAuthVerify)        |
| On-chain NFT verification                 | Task 4 (tokenId check via D1, populated by indexer) |
| Session/connection registry               | Task 5 (handleMap from WebSocket attachments)       |
| Periodic re-verification (5 min)          | Task 5 (alarm handler)                              |
| Message routing (online → forward)        | Task 5 (handleRelaySend)                            |
| Message routing (offline → mailbox)       | Task 3 (mailbox) + Task 5 (handleRelaySend)         |
| Encrypted mailbox (KV storage)            | Task 3 (mailbox.ts)                                 |
| Mailbox TTL (30 days default)             | Task 3 (expirationTtl on KV put)                    |
| Drain on reconnect                        | Task 5 (handleMailboxDrain)                         |
| Connection lifecycle (heartbeat)          | Task 5 (alarm → ping/pong)                          |
| Stale connection cleanup                  | Task 5 (alarm → STALE_TIMEOUT_MS check)             |
| Graceful disconnect                       | Task 5 (webSocketClose)                             |
| Hub cannot read content                   | Task 7 (integration test: opacity verification)     |
| Delivery ack                              | Task 5 (relay:ack response)                         |

### Placeholder Scan

No TODOs, TBDs, or "implement later" references. The only deferred item is full EIP-191 signature verification, which is an existing codebase TODO (same pattern as `routes/auth.ts:137-157`). This is documented in the code comment.

### Type Consistency

- `RelayEnvelope` — defined in Task 1, used consistently in Tasks 2, 3, 5, 7
- `ClientMessage` / `ServerMessage` — defined in Task 1, used in Tasks 5, 7
- `WebSocketAttachment` / `ConnectionState` — defined in Task 1, used in Tasks 4, 5
- `RelayMailbox` — interface in Task 3, used in Task 5
- `AuthResult` — defined in Task 4, used in Task 5
- `EnvelopeValidationError` — defined in Task 2, used in Task 5
- Constants (`PING_INTERVAL_MS`, `STALE_TIMEOUT_MS`, etc.) — defined in Task 1, used in Tasks 3, 4, 5
