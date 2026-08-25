> **FlowState Document:** `docu_uCkl_LCc3L`

# Phase 4: Real-Time Memory Sync — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add push-on-write memory sync and pull-on-activation seed sync through the encrypted relay, enabling real-time memory replication across multiple DERPs for the same agent.

**Architecture:** The server's RelayRoom Durable Object is extended with a D1-backed canonical memory store and multi-connection support per handle. When a `memory-sync` envelope arrives, the hub stores it canonically in D1 and forwards to all other connected DERPs for the same agent. On activation, the client sends a `sync-request` with its last checkpoint; the server responds with all memory envelopes since that checkpoint. The client stores the checkpoint in its encrypted local store.

**Tech Stack:** TypeScript, Cloudflare Workers (D1, Durable Objects, KV), Drizzle ORM, Vitest, `@d7r/saga-crypto`, `@saga-standard/saga-client-rt`

---

## File Structure

### Server (`packages/server`)

| File                                       | Action | Responsibility                                                           |
| ------------------------------------------ | ------ | ------------------------------------------------------------------------ |
| `src/relay/types.ts`                       | Modify | Add `SyncRequestMessage`, `SyncResponseMessage` types                    |
| `src/relay/memory-store.ts`                | Create | D1-backed canonical memory envelope store                                |
| `src/relay/relay-room.ts`                  | Modify | Multi-connection support, memory-sync interception, sync-request handler |
| `src/db/schema.ts`                         | Modify | Add `memoryEnvelopes` Drizzle table definition                           |
| `migrations/0003_memory_sync.sql`          | Create | D1 migration for `memory_envelopes` table                                |
| `src/__tests__/test-helpers.ts`            | Modify | Add `>` operator support to mock D1, add memory_envelopes to migrations  |
| `src/__tests__/relay-types.test.ts`        | Modify | Tests for sync protocol type guards                                      |
| `src/__tests__/relay-memory-store.test.ts` | Create | Tests for canonical memory store                                         |
| `src/__tests__/relay-room.test.ts`         | Modify | Tests for multi-connection, memory interception, sync-request            |

### Client (`packages/saga-client-rt`)

| File                                     | Action | Responsibility                                                        |
| ---------------------------------------- | ------ | --------------------------------------------------------------------- |
| `src/types.ts`                           | Modify | Add `SyncRequestMsg`, `SyncResponseMsg`, update `ServerMessage` union |
| `src/relay-connection.ts`                | Modify | Add `sendSyncRequest()`, handle `sync-response` in message dispatch   |
| `src/client.ts`                          | Modify | Sync-on-activation flow, checkpoint persistence                       |
| `src/__tests__/relay-connection.test.ts` | Modify | Tests for sync-request sending, sync-response callback                |
| `src/__tests__/client.test.ts`           | Modify | Tests for sync-on-activation, checkpoint persistence                  |

---

### Task 1: Server Relay Types — Sync Protocol Messages

**Files:**

- Modify: `packages/server/src/relay/types.ts`
- Modify: `packages/server/src/__tests__/relay-types.test.ts`

- [ ] **Step 1: Write failing tests for sync-request type guard**

```typescript
// In relay-types.test.ts, add to existing describe block:

describe('sync-request', () => {
  it('accepts valid sync-request', () => {
    const msg = { type: 'sync-request', since: '2026-01-01T00:00:00.000Z' }
    expect(isClientMessage(msg)).toBe(true)
  })

  it('accepts sync-request with collections filter', () => {
    const msg = {
      type: 'sync-request',
      since: '2026-01-01T00:00:00.000Z',
      collections: ['episodic', 'semantic'],
    }
    expect(isClientMessage(msg)).toBe(true)
  })

  it('rejects sync-request without since', () => {
    const msg = { type: 'sync-request' }
    expect(isClientMessage(msg)).toBe(false)
  })

  it('rejects sync-request with non-string since', () => {
    const msg = { type: 'sync-request', since: 12345 }
    expect(isClientMessage(msg)).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/server && npx vitest run src/__tests__/relay-types.test.ts`
Expected: FAIL — `sync-request` not recognized by type guard

- [ ] **Step 3: Add sync protocol message types**

Add to `packages/server/src/relay/types.ts`:

```typescript
// In Client → Server messages section:
export interface SyncRequestMessage {
  type: 'sync-request'
  since: string // ISO 8601 checkpoint timestamp
  collections?: string[] // optional filter: which memory types
}

// In Server → Client messages section:
export interface SyncResponseMessage {
  type: 'sync-response'
  envelopes: RelayEnvelope[]
  checkpoint: string // new checkpoint timestamp (ISO 8601)
  hasMore: boolean // pagination flag
}
```

Update `ClientMessage` union to include `SyncRequestMessage`.
Update `ServerMessage` union to include `SyncResponseMessage`.
Add `'sync-request'` to `CLIENT_MESSAGE_TYPES` set.
Add `'sync-response'` to `SERVER_MESSAGE_TYPES` set.

Update `isClientMessage` switch to validate `sync-request`:

```typescript
case 'sync-request':
  return (
    typeof obj.since === 'string' &&
    (obj.collections === undefined ||
      (Array.isArray(obj.collections) &&
        obj.collections.every((c: unknown) => typeof c === 'string')))
  )
```

Update `parseClientMessage` if needed (it uses `isClientMessage` internally, so no change needed).

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/server && npx vitest run src/__tests__/relay-types.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/relay/types.ts packages/server/src/__tests__/relay-types.test.ts
git commit -m "feat(server): add sync-request/sync-response relay message types"
```

---

### Task 2: Server Canonical Memory Store

**Files:**

- Create: `packages/server/src/relay/memory-store.ts`
- Create: `packages/server/src/__tests__/relay-memory-store.test.ts`
- Create: `packages/server/migrations/0003_memory_sync.sql`
- Modify: `packages/server/src/db/schema.ts`
- Modify: `packages/server/src/__tests__/test-helpers.ts`

**Context:** The hub stores every `memory-sync` envelope in D1 as the canonical record. This enables pull-on-activation: when a DERP connects, it can request all memory envelopes since its last checkpoint. The hub never decrypts — it stores the full serialized envelope blob.

- [ ] **Step 1: Add `>` operator support to mock D1**

The existing `matchesWhere` in `test-helpers.ts` only handles `=` and `LIKE`. Add support for `>` comparison:

```typescript
// In matchesWhere function, add after the LIKE handler:

// col > ?
const gtM = t.match(/"?(\w+)"?\s*>\s*\?/)
if (gtM) {
  const col = gtM[1]
  const val = params[pi++]
  if (String(row[col] ?? '') <= String(val)) return false
  continue
}
```

Add `memory_envelopes` table to `runMigrations()`:

```typescript
// After auth_challenges table:
CREATE TABLE IF NOT EXISTS memory_envelopes (
  id TEXT PRIMARY KEY,
  agent_handle TEXT NOT NULL,
  envelope_json TEXT NOT NULL,
  stored_at TEXT NOT NULL,
  envelope_ts TEXT NOT NULL
);
```

- [ ] **Step 2: Create D1 migration file**

Create `packages/server/migrations/0003_memory_sync.sql`:

```sql
-- SAGA Schema v3: Memory Sync Canonical Store
-- Stores encrypted memory-sync envelopes for pull-on-activation

CREATE TABLE IF NOT EXISTS memory_envelopes (
  id TEXT PRIMARY KEY,
  agent_handle TEXT NOT NULL,
  envelope_json TEXT NOT NULL,
  stored_at TEXT NOT NULL,
  envelope_ts TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_memory_envelopes_agent_ts
  ON memory_envelopes(agent_handle, stored_at);
```

- [ ] **Step 3: Add Drizzle schema definition**

Add to `packages/server/src/db/schema.ts`:

```typescript
export const memoryEnvelopes = sqliteTable('memory_envelopes', {
  id: text('id').primaryKey(),
  agentHandle: text('agent_handle').notNull(),
  envelopeJson: text('envelope_json').notNull(),
  storedAt: text('stored_at').notNull(),
  envelopeTs: text('envelope_ts').notNull(),
})
```

- [ ] **Step 4: Write failing tests for memory store**

Create `packages/server/src/__tests__/relay-memory-store.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { createCanonicalMemoryStore } from '../relay/memory-store'
import { createMockD1, runMigrations } from './test-helpers'
import type { RelayEnvelope } from '../relay/types'

function makeEnvelope(overrides: Partial<RelayEnvelope> = {}): RelayEnvelope {
  return {
    v: 1,
    type: 'memory-sync',
    scope: 'private',
    from: 'alice@epicflow',
    to: 'alice@epicflow',
    ct: 'encrypted-data',
    ts: new Date().toISOString(),
    id: `msg_${crypto.randomUUID()}`,
    ...overrides,
  }
}

describe('CanonicalMemoryStore', () => {
  let db: D1Database
  let store: ReturnType<typeof createCanonicalMemoryStore>

  beforeEach(async () => {
    db = createMockD1()
    await runMigrations(db)
    store = createCanonicalMemoryStore(db)
  })

  it('stores and retrieves an envelope', async () => {
    const env = makeEnvelope()
    await store.store('alice', env)
    const result = await store.querySince('alice', '1970-01-01T00:00:00.000Z', 50)
    expect(result.envelopes).toHaveLength(1)
    expect(result.envelopes[0].id).toBe(env.id)
  })

  it('returns envelopes only after checkpoint', async () => {
    const old = makeEnvelope({ ts: '2026-01-01T00:00:00.000Z' })
    const recent = makeEnvelope({ ts: '2026-03-01T00:00:00.000Z' })
    await store.store('alice', old)
    await store.store('alice', recent)

    const result = await store.querySince('alice', '2026-02-01T00:00:00.000Z', 50)
    expect(result.envelopes).toHaveLength(1)
    expect(result.envelopes[0].id).toBe(recent.id)
  })

  it('does not return envelopes for other agents', async () => {
    await store.store('alice', makeEnvelope({ from: 'alice@epicflow' }))
    await store.store('bob', makeEnvelope({ from: 'bob@epicflow' }))

    const result = await store.querySince('alice', '1970-01-01T00:00:00.000Z', 50)
    expect(result.envelopes).toHaveLength(1)
  })

  it('paginates with hasMore flag', async () => {
    for (let i = 0; i < 5; i++) {
      await store.store(
        'alice',
        makeEnvelope({
          ts: `2026-03-0${i + 1}T00:00:00.000Z`,
        })
      )
    }

    const result = await store.querySince('alice', '1970-01-01T00:00:00.000Z', 3)
    expect(result.envelopes).toHaveLength(3)
    expect(result.hasMore).toBe(true)
    expect(result.checkpoint).toBeTruthy()
  })

  it('returns hasMore=false when no more results', async () => {
    await store.store('alice', makeEnvelope())
    const result = await store.querySince('alice', '1970-01-01T00:00:00.000Z', 50)
    expect(result.hasMore).toBe(false)
  })

  it('returns checkpoint as the stored_at of the last envelope', async () => {
    const env = makeEnvelope({ ts: '2026-03-15T12:00:00.000Z' })
    await store.store('alice', env)
    const result = await store.querySince('alice', '1970-01-01T00:00:00.000Z', 50)
    expect(result.checkpoint).toBeTruthy()
    // Checkpoint is the stored_at of the last result
    expect(typeof result.checkpoint).toBe('string')
  })

  it('deduplicates by envelope id', async () => {
    const env = makeEnvelope()
    await store.store('alice', env)
    await store.store('alice', env) // same id
    const result = await store.querySince('alice', '1970-01-01T00:00:00.000Z', 50)
    expect(result.envelopes).toHaveLength(1)
  })
})
```

- [ ] **Step 5: Run tests to verify they fail**

Run: `cd packages/server && npx vitest run src/__tests__/relay-memory-store.test.ts`
Expected: FAIL — module not found

- [ ] **Step 6: Implement the canonical memory store**

Create `packages/server/src/relay/memory-store.ts`:

```typescript
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { drizzle } from 'drizzle-orm/d1'
import { and, asc, gt, eq } from 'drizzle-orm'
import { memoryEnvelopes } from '../db/schema'
import type { RelayEnvelope } from './types'

export interface CanonicalMemoryStore {
  /** Store a memory-sync envelope in the canonical store */
  store(agentHandle: string, envelope: RelayEnvelope): Promise<void>
  /** Query envelopes since a checkpoint, returns batch + pagination info */
  querySince(
    agentHandle: string,
    since: string,
    limit: number
  ): Promise<{ envelopes: RelayEnvelope[]; checkpoint: string; hasMore: boolean }>
}

export function createCanonicalMemoryStore(db: D1Database): CanonicalMemoryStore {
  const orm = drizzle(db)

  return {
    async store(agentHandle, envelope) {
      const now = new Date().toISOString()
      // Use INSERT OR IGNORE for dedup by envelope id
      await db
        .prepare(
          `INSERT OR IGNORE INTO memory_envelopes (id, agent_handle, envelope_json, stored_at, envelope_ts)
           VALUES (?, ?, ?, ?, ?)`
        )
        .bind(envelope.id, agentHandle, JSON.stringify(envelope), now, envelope.ts)
        .run()
    },

    async querySince(agentHandle, since, limit) {
      const rows = await orm
        .select()
        .from(memoryEnvelopes)
        .where(
          and(eq(memoryEnvelopes.agentHandle, agentHandle), gt(memoryEnvelopes.storedAt, since))
        )
        .orderBy(asc(memoryEnvelopes.storedAt))
        .limit(limit + 1)

      const hasMore = rows.length > limit
      const batch = hasMore ? rows.slice(0, limit) : rows
      const envelopes = batch.map(row => JSON.parse(row.envelopeJson) as RelayEnvelope)
      const checkpoint = batch.length > 0 ? batch[batch.length - 1].storedAt : since

      return { envelopes, checkpoint, hasMore }
    },
  }
}
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `cd packages/server && npx vitest run src/__tests__/relay-memory-store.test.ts`
Expected: PASS

- [ ] **Step 8: Run full server test suite**

Run: `cd packages/server && npx vitest run`
Expected: All existing tests still pass

- [ ] **Step 9: Commit**

```bash
git add packages/server/migrations/0003_memory_sync.sql \
  packages/server/src/db/schema.ts \
  packages/server/src/relay/memory-store.ts \
  packages/server/src/__tests__/relay-memory-store.test.ts \
  packages/server/src/__tests__/test-helpers.ts
git commit -m "feat(server): add D1-backed canonical memory store for sync"
```

---

### Task 3: Server Multi-Connection Support

**Files:**

- Modify: `packages/server/src/relay/relay-room.ts`
- Modify: `packages/server/src/__tests__/relay-room.test.ts`
- Modify: `packages/server/src/__tests__/relay-test-helpers.ts`

**Context:** An agent may be active in multiple DERPs simultaneously (home DERP + company DERP). The current `handleMap` stores one WebSocket per handle and replaces old connections on re-auth. We need to support multiple connections per handle so all DERPs receive real-time updates.

- [ ] **Step 1: Write failing tests for multi-connection**

Add to `packages/server/src/__tests__/relay-room.test.ts`:

```typescript
describe('multi-connection support', () => {
  it('allows two connections for the same handle', async () => {
    const ws1 = createMockWebSocket()
    const ws2 = createMockWebSocket()

    // Authenticate both
    await authenticateWebSocket(room, ws1, 'alice')
    await authenticateWebSocket(room, ws2, 'alice')

    // Neither should be closed
    expect(ws1._closed).toBe(false)
    expect(ws2._closed).toBe(false)
  })

  it('delivers relay message to all connections for a handle', async () => {
    const ws1 = createMockWebSocket()
    const ws2 = createMockWebSocket()
    const sender = createMockWebSocket()

    await authenticateWebSocket(room, ws1, 'alice')
    await authenticateWebSocket(room, ws2, 'alice')
    await authenticateWebSocket(room, sender, 'bob')

    // Bob sends to alice
    const envelope = makeRelayEnvelope({ from: 'bob@epicflow', to: 'alice@epicflow' })
    await room.webSocketMessage(
      sender,
      JSON.stringify({
        type: 'relay:send',
        envelope,
      })
    )

    // Both ws1 and ws2 should receive the delivery
    const ws1Messages = ws1._sent.map(m => JSON.parse(m))
    const ws2Messages = ws2._sent.map(m => JSON.parse(m))
    const ws1Delivers = ws1Messages.filter(m => m.type === 'relay:deliver')
    const ws2Delivers = ws2Messages.filter(m => m.type === 'relay:deliver')
    expect(ws1Delivers).toHaveLength(1)
    expect(ws2Delivers).toHaveLength(1)
  })

  it('removes only the disconnected connection, keeps others', async () => {
    const ws1 = createMockWebSocket()
    const ws2 = createMockWebSocket()

    await authenticateWebSocket(room, ws1, 'alice')
    await authenticateWebSocket(room, ws2, 'alice')

    // Disconnect ws1
    await room.webSocketClose(ws1, 1000, 'bye', true)

    // Send to alice — only ws2 should receive
    const sender = createMockWebSocket()
    await authenticateWebSocket(room, sender, 'bob')

    const envelope = makeRelayEnvelope({ from: 'bob@epicflow', to: 'alice@epicflow' })
    await room.webSocketMessage(
      sender,
      JSON.stringify({
        type: 'relay:send',
        envelope,
      })
    )

    const ws2Delivers = ws2._sent.map(m => JSON.parse(m)).filter(m => m.type === 'relay:deliver')
    expect(ws2Delivers).toHaveLength(1)
  })
})
```

Note: `authenticateWebSocket` and `makeRelayEnvelope` are helpers that the test file should either already have or that need to be extracted/created from the existing relay-room.test.ts setup. Check the existing test file and follow its patterns for authentication setup.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/server && npx vitest run src/__tests__/relay-room.test.ts`
Expected: FAIL — second connection replaces first (current behavior)

- [ ] **Step 3: Change handleMap to support multiple connections per handle**

In `packages/server/src/relay/relay-room.ts`:

1. Change the `handleMap` type from `Map<string, WebSocket>` to `Map<string, Set<WebSocket>>`.

2. Update `getHandleMap()`:

```typescript
private getHandleMap(): Map<string, Set<WebSocket>> {
  if (!this.handleMap) {
    this.handleMap = new Map()
    for (const ws of this.ctx.getWebSockets()) {
      const attachment = ws.deserializeAttachment() as WebSocketAttachment | null
      if (attachment?.authenticated) {
        const handle = attachment.state.handle
        if (!this.handleMap.has(handle)) {
          this.handleMap.set(handle, new Set())
        }
        this.handleMap.get(handle)!.add(ws)
      }
    }
  }
  return this.handleMap
}
```

3. Update `handleAuthVerify` — remove the "close existing connection" block (lines 222-234). Instead, just add to the set:

```typescript
// Register authenticated connection
const authAttachment: WebSocketAttachment = {
  authenticated: true,
  state: result.state,
}
ws.serializeAttachment(authAttachment)
this.invalidateHandleMap()
this.sendJson(ws, { type: 'auth:success', handle: result.state.handle })
```

4. Update `handleRelaySend` — send to all connections for a recipient:

```typescript
const recipientSet = this.getHandleMap().get(recipientHandle)
if (recipientSet && recipientSet.size > 0) {
  for (const recipientWs of recipientSet) {
    try {
      this.sendJson(recipientWs, { type: 'relay:deliver', envelope })
    } catch {
      // Individual send failure — mailbox as fallback handled below
    }
  }
} else {
  await this.mailbox.store(recipientHandle, envelope)
}
```

5. Update `removeConnection` — remove from set instead of deleting key:

```typescript
private removeConnection(ws: WebSocket): void {
  const attachment = ws.deserializeAttachment() as WebSocketAttachment | null
  if (attachment?.authenticated) {
    const set = this.handleMap?.get(attachment.state.handle)
    if (set) {
      set.delete(ws)
      if (set.size === 0) {
        this.handleMap?.delete(attachment.state.handle)
      }
    }
  }
  ws.serializeAttachment(null)
  this.invalidateHandleMap()
}
```

6. Update `alarm()` — iterate over all connections in sets:

```typescript
for (const [, wsSet] of handleMap) {
  for (const ws of wsSet) {
    // ping, stale check, NFT re-verify
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/server && npx vitest run src/__tests__/relay-room.test.ts`
Expected: All tests pass (existing + new multi-connection tests)

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/relay/relay-room.ts \
  packages/server/src/__tests__/relay-room.test.ts \
  packages/server/src/__tests__/relay-test-helpers.ts
git commit -m "feat(server): support multiple WebSocket connections per handle"
```

---

### Task 4: Server Memory-Sync Interception and Canonical Storage

**Files:**

- Modify: `packages/server/src/relay/relay-room.ts`
- Modify: `packages/server/src/__tests__/relay-room.test.ts`

**Context:** When a `memory-sync` envelope arrives via `relay:send`, the hub must: (1) store it in the canonical memory store for pull-on-activation, and (2) forward it to all OTHER connected DERPs for the same sender (multi-DERP sync). The sender's own connection should NOT receive the echo back.

- [ ] **Step 1: Write failing tests for memory-sync interception**

Add to `packages/server/src/__tests__/relay-room.test.ts`:

```typescript
describe('memory-sync interception', () => {
  it('stores memory-sync envelope in canonical store', async () => {
    const ws = createMockWebSocket()
    await authenticateWebSocket(room, ws, 'alice')

    const envelope = makeRelayEnvelope({
      type: 'memory-sync',
      from: 'alice@epicflow',
      to: 'alice@epicflow',
    })
    await room.webSocketMessage(
      ws,
      JSON.stringify({
        type: 'relay:send',
        envelope,
      })
    )

    // Verify ack was sent
    const messages = ws._sent.map(m => JSON.parse(m))
    const ack = messages.find(m => m.type === 'relay:ack')
    expect(ack).toBeDefined()
    expect(ack.messageId).toBe(envelope.id)

    // Verify stored in canonical store (via sync-request)
    // This test will be expanded in Task 5
  })

  it('forwards memory-sync to other connections for same handle', async () => {
    const derpA = createMockWebSocket()
    const derpB = createMockWebSocket()
    await authenticateWebSocket(room, derpA, 'alice')
    await authenticateWebSocket(room, derpB, 'alice')

    // Clear auth messages
    derpA._sent.length = 0
    derpB._sent.length = 0

    const envelope = makeRelayEnvelope({
      type: 'memory-sync',
      from: 'alice@epicflow',
      to: 'alice@epicflow',
    })
    await room.webSocketMessage(
      derpA,
      JSON.stringify({
        type: 'relay:send',
        envelope,
      })
    )

    // derpB should receive the forwarded envelope
    const derpBMessages = derpB._sent.map(m => JSON.parse(m))
    const delivers = derpBMessages.filter(m => m.type === 'relay:deliver')
    expect(delivers).toHaveLength(1)
    expect(delivers[0].envelope.id).toBe(envelope.id)

    // derpA should only get the ack, NOT a relay:deliver echo
    const derpAMessages = derpA._sent.map(m => JSON.parse(m))
    const derpADelivers = derpAMessages.filter(m => m.type === 'relay:deliver')
    expect(derpADelivers).toHaveLength(0)
  })

  it('does not intercept non-memory-sync envelopes', async () => {
    const sender = createMockWebSocket()
    const recipient = createMockWebSocket()
    await authenticateWebSocket(room, sender, 'alice')
    await authenticateWebSocket(room, recipient, 'bob')

    const envelope = makeRelayEnvelope({
      type: 'direct-message',
      from: 'alice@epicflow',
      to: 'bob@epicflow',
    })
    await room.webSocketMessage(
      sender,
      JSON.stringify({
        type: 'relay:send',
        envelope,
      })
    )

    // Normal routing — bob receives, alice gets ack
    const bobMessages = recipient._sent.map(m => JSON.parse(m))
    expect(bobMessages.filter(m => m.type === 'relay:deliver')).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/server && npx vitest run src/__tests__/relay-room.test.ts`
Expected: FAIL — memory-sync not forwarded to other connections

- [ ] **Step 3: Implement memory-sync interception in handleRelaySend**

In `relay-room.ts`:

1. Import `createCanonicalMemoryStore` and add to constructor:

```typescript
import { createCanonicalMemoryStore } from './memory-store'
import type { CanonicalMemoryStore } from './memory-store'

// In class fields:
private memoryStore: CanonicalMemoryStore

// In constructor:
this.memoryStore = createCanonicalMemoryStore(this.env.DB)
```

2. In `handleRelaySend`, add memory-sync interception AFTER validation and sender check, BEFORE normal routing:

```typescript
// Memory-sync interception: store canonically and forward to sender's other DERPs
if (envelope.type === 'memory-sync') {
  const senderHandle = envelope.from.split('@')[0]
  await this.memoryStore.store(senderHandle, envelope)

  // Forward to all other connections for the same handle (multi-DERP sync)
  const senderConnections = this.getHandleMap().get(senderHandle)
  if (senderConnections) {
    for (const otherWs of senderConnections) {
      if (otherWs !== ws) {
        try {
          this.sendJson(otherWs, { type: 'relay:deliver', envelope })
        } catch {
          // Individual connection failed
        }
      }
    }
  }

  // Ack the sender
  this.sendJson(ws, { type: 'relay:ack', messageId: envelope.id })
  return // Memory-sync routing is handled above — don't fall through to normal routing
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/server && npx vitest run src/__tests__/relay-room.test.ts`
Expected: All tests pass

- [ ] **Step 5: Run full server test suite**

Run: `cd packages/server && npx vitest run`
Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/relay/relay-room.ts \
  packages/server/src/__tests__/relay-room.test.ts
git commit -m "feat(server): intercept memory-sync envelopes for canonical storage and multi-DERP forwarding"
```

---

### Task 5: Server Sync-Request Handler

**Files:**

- Modify: `packages/server/src/relay/relay-room.ts`
- Modify: `packages/server/src/__tests__/relay-room.test.ts`

**Context:** When a client sends `sync-request` with a checkpoint, the server queries the canonical memory store for all envelopes since that checkpoint and responds with a `sync-response`. The response includes pagination (`hasMore` flag) so the client can request more if needed.

- [ ] **Step 1: Write failing tests for sync-request handler**

Add to `packages/server/src/__tests__/relay-room.test.ts`:

```typescript
describe('sync-request handler', () => {
  it('responds with envelopes since checkpoint', async () => {
    const derpA = createMockWebSocket()
    const derpB = createMockWebSocket()
    await authenticateWebSocket(room, derpA, 'alice')

    // Store some memories via derpA
    const env1 = makeRelayEnvelope({
      type: 'memory-sync',
      from: 'alice@epicflow',
      to: 'alice@epicflow',
    })
    await room.webSocketMessage(
      derpA,
      JSON.stringify({
        type: 'relay:send',
        envelope: env1,
      })
    )

    // derpB connects and sends sync-request
    await authenticateWebSocket(room, derpB, 'alice')
    derpB._sent.length = 0 // clear auth messages

    await room.webSocketMessage(
      derpB,
      JSON.stringify({
        type: 'sync-request',
        since: '1970-01-01T00:00:00.000Z',
      })
    )

    const messages = derpB._sent.map(m => JSON.parse(m))
    const syncResponse = messages.find(m => m.type === 'sync-response')
    expect(syncResponse).toBeDefined()
    expect(syncResponse.envelopes).toHaveLength(1)
    expect(syncResponse.envelopes[0].id).toBe(env1.id)
    expect(syncResponse.hasMore).toBe(false)
    expect(syncResponse.checkpoint).toBeTruthy()
  })

  it('returns empty response for no envelopes since checkpoint', async () => {
    const ws = createMockWebSocket()
    await authenticateWebSocket(room, ws, 'alice')
    ws._sent.length = 0

    await room.webSocketMessage(
      ws,
      JSON.stringify({
        type: 'sync-request',
        since: '2099-01-01T00:00:00.000Z',
      })
    )

    const messages = ws._sent.map(m => JSON.parse(m))
    const syncResponse = messages.find(m => m.type === 'sync-response')
    expect(syncResponse).toBeDefined()
    expect(syncResponse.envelopes).toHaveLength(0)
    expect(syncResponse.hasMore).toBe(false)
  })

  it('rejects sync-request from unauthenticated connection', async () => {
    const ws = createMockWebSocket()
    // Not authenticated — set up a pending challenge attachment
    ws.serializeAttachment({
      authenticated: false,
      challenge: 'test',
      expiresAt: new Date(Date.now() + 60000).toISOString(),
    })

    await room.webSocketMessage(
      ws,
      JSON.stringify({
        type: 'sync-request',
        since: '1970-01-01T00:00:00.000Z',
      })
    )

    const messages = ws._sent.map(m => JSON.parse(m))
    const errorMsg = messages.find(m => m.type === 'error')
    expect(errorMsg).toBeDefined()
    expect(errorMsg.error).toContain('Not authenticated')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/server && npx vitest run src/__tests__/relay-room.test.ts`
Expected: FAIL — `sync-request` not handled

- [ ] **Step 3: Add sync-request handler to RelayRoom**

In `relay-room.ts`, add to the `webSocketMessage` switch:

```typescript
case 'sync-request':
  await this.handleSyncRequest(ws, msg)
  break
```

Add the handler method:

```typescript
private async handleSyncRequest(
  ws: WebSocket,
  msg: { since: string; collections?: string[] }
): Promise<void> {
  const state = this.getAuthenticatedState(ws)
  if (!state) {
    this.sendJson(ws, { type: 'error', error: 'Not authenticated' })
    return
  }

  const SYNC_BATCH_SIZE = 50
  const result = await this.memoryStore.querySince(state.handle, msg.since, SYNC_BATCH_SIZE)

  this.sendJson(ws, {
    type: 'sync-response',
    envelopes: result.envelopes,
    checkpoint: result.checkpoint,
    hasMore: result.hasMore,
  })
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/server && npx vitest run src/__tests__/relay-room.test.ts`
Expected: All tests pass

- [ ] **Step 5: Run full server test suite**

Run: `cd packages/server && npx vitest run`
Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/relay/relay-room.ts \
  packages/server/src/__tests__/relay-room.test.ts
git commit -m "feat(server): handle sync-request with paginated sync-response from canonical store"
```

---

### Task 6: Client Relay Types and Connection — Sync Protocol Support

**Files:**

- Modify: `packages/saga-client-rt/src/types.ts`
- Modify: `packages/saga-client-rt/src/relay-connection.ts`
- Modify: `packages/saga-client-rt/src/__tests__/relay-connection.test.ts`

**Context:** The client needs new message types for `sync-request` and `sync-response`, plus the ability to send sync requests and handle sync responses through the relay connection.

- [ ] **Step 1: Write failing tests for sync-request/response**

Add to `packages/saga-client-rt/src/__tests__/relay-connection.test.ts`:

```typescript
describe('sync protocol', () => {
  it('sends sync-request to server', () => {
    // After connecting and authenticating...
    connection.sendSyncRequest('2026-01-01T00:00:00.000Z')

    const sent = mockWs._sent.map(m => JSON.parse(m))
    const syncReq = sent.find(m => m.type === 'sync-request')
    expect(syncReq).toBeDefined()
    expect(syncReq.since).toBe('2026-01-01T00:00:00.000Z')
  })

  it('sends sync-request with collections filter', () => {
    connection.sendSyncRequest('2026-01-01T00:00:00.000Z', ['episodic'])

    const sent = mockWs._sent.map(m => JSON.parse(m))
    const syncReq = sent.find(m => m.type === 'sync-request')
    expect(syncReq.collections).toEqual(['episodic'])
  })

  it('invokes onSyncResponse callback on sync-response message', () => {
    const syncCallback = vi.fn()
    // Provide onSyncResponse in config.callbacks...

    // Simulate server sending sync-response
    const syncResponse = {
      type: 'sync-response',
      envelopes: [{ id: 'env1', v: 1, type: 'memory-sync', ct: 'data' }],
      checkpoint: '2026-03-26T00:00:00.000Z',
      hasMore: false,
    }
    mockWs.onmessage!({ data: JSON.stringify(syncResponse) } as MessageEvent)

    expect(syncCallback).toHaveBeenCalledWith(
      syncResponse.envelopes,
      syncResponse.checkpoint,
      syncResponse.hasMore
    )
  })

  it('buffers sync-request when not connected', () => {
    // Before connecting
    connection.sendSyncRequest('2026-01-01T00:00:00.000Z')
    // sync-request should NOT throw, but may be no-op (requires connection)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/saga-client-rt && npx vitest run src/__tests__/relay-connection.test.ts`
Expected: FAIL — `sendSyncRequest` not found

- [ ] **Step 3: Add sync protocol types to client**

In `packages/saga-client-rt/src/types.ts`:

```typescript
// Add to Server → Client message types:
export interface SyncResponseMsg {
  type: 'sync-response'
  envelopes: SagaEncryptedEnvelope[]
  checkpoint: string
  hasMore: boolean
}

// Update ServerMessage union:
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

// Add to RelayConnectionCallbacks:
export interface RelayConnectionCallbacks {
  // ... existing callbacks ...
  onSyncResponse(envelopes: SagaEncryptedEnvelope[], checkpoint: string, hasMore: boolean): void
}
```

- [ ] **Step 4: Add sendSyncRequest to RelayConnection**

In `packages/saga-client-rt/src/relay-connection.ts`:

1. Add to `RelayConnection` interface:

```typescript
sendSyncRequest(since: string, collections?: string[]): void
```

2. Add to the returned object:

```typescript
sendSyncRequest(since: string, collections?: string[]): void {
  if (connected) {
    const msg: Record<string, unknown> = { type: 'sync-request', since }
    if (collections) msg.collections = collections
    sendJson(msg)
  }
},
```

3. Add `sync-response` handler in `handleServerMessage`:

```typescript
case 'sync-response':
  config.callbacks.onSyncResponse(
    msg.envelopes as SagaEncryptedEnvelope[],
    msg.checkpoint,
    msg.hasMore
  )
  break
```

4. Update the existing `client.ts` to pass a stub `onSyncResponse` callback (will be implemented in Task 7):

```typescript
onSyncResponse() {
  // Will be implemented in sync-on-activation task
},
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd packages/saga-client-rt && npx vitest run src/__tests__/relay-connection.test.ts`
Expected: All tests pass

- [ ] **Step 6: Run full client test suite**

Run: `cd packages/saga-client-rt && npx vitest run`
Expected: All tests pass

- [ ] **Step 7: Commit**

```bash
git add packages/saga-client-rt/src/types.ts \
  packages/saga-client-rt/src/relay-connection.ts \
  packages/saga-client-rt/src/client.ts \
  packages/saga-client-rt/src/__tests__/relay-connection.test.ts
git commit -m "feat(saga-client-rt): add sync-request/sync-response relay protocol support"
```

---

### Task 7: Client Sync-on-Activation Flow

**Files:**

- Modify: `packages/saga-client-rt/src/client.ts`
- Modify: `packages/saga-client-rt/src/__tests__/client.test.ts`

**Context:** When a DERP activates and the SagaClient connects, it should automatically request all memory envelopes since its last known checkpoint. The checkpoint is persisted in the encrypted local store so it survives DERP restarts. The client handles paginated sync responses by requesting more until `hasMore` is `false`.

- [ ] **Step 1: Write failing tests for checkpoint persistence**

Add to `packages/saga-client-rt/src/__tests__/client.test.ts`:

```typescript
describe('sync-on-activation', () => {
  it('sends sync-request after auth success with epoch checkpoint when no checkpoint stored', async () => {
    await client.connect()

    // Find sync-request in sent messages
    const sent = mockWs._sent.map(m => JSON.parse(m))
    const syncReq = sent.find(m => m.type === 'sync-request')
    expect(syncReq).toBeDefined()
    expect(syncReq.since).toBe('1970-01-01T00:00:00.000Z')
  })

  it('sends sync-request with persisted checkpoint', async () => {
    // Pre-seed the checkpoint in the store
    const backend = config.storageBackend
    // Store a checkpoint (we need to encrypt it the same way the store does)
    // This test verifies the flow: if a checkpoint exists, use it
    await client.connect()

    // Simulate sync-response to set checkpoint
    const syncResponse = {
      type: 'sync-response',
      envelopes: [],
      checkpoint: '2026-03-15T12:00:00.000Z',
      hasMore: false,
    }
    mockWs.onmessage!({ data: JSON.stringify(syncResponse) } as MessageEvent)

    // Disconnect and reconnect
    await client.disconnect()
    // Reconnect — should use the saved checkpoint
    await client.connect()

    const sent = mockWs._sent.map(m => JSON.parse(m))
    const syncRequests = sent.filter(m => m.type === 'sync-request')
    // The second connect should use the saved checkpoint
    const lastSyncReq = syncRequests[syncRequests.length - 1]
    expect(lastSyncReq.since).toBe('2026-03-15T12:00:00.000Z')
  })

  it('decrypts and stores sync-response envelopes in local store', async () => {
    await client.connect()

    // Simulate sync-response with a memory envelope
    // (Need to create a real encrypted envelope using saga-crypto for this test)
    // The onSyncResponse handler should decrypt each envelope and store it
  })

  it('requests more when hasMore is true', async () => {
    await client.connect()
    mockWs._sent.length = 0

    // Simulate first sync-response with hasMore=true
    const syncResponse1 = {
      type: 'sync-response',
      envelopes: [],
      checkpoint: '2026-03-10T00:00:00.000Z',
      hasMore: true,
    }
    mockWs.onmessage!({ data: JSON.stringify(syncResponse1) } as MessageEvent)

    // Should have sent another sync-request with the new checkpoint
    const sent = mockWs._sent.map(m => JSON.parse(m))
    const syncReq = sent.find(m => m.type === 'sync-request')
    expect(syncReq).toBeDefined()
    expect(syncReq.since).toBe('2026-03-10T00:00:00.000Z')
  })

  it('stops requesting when hasMore is false', async () => {
    await client.connect()
    mockWs._sent.length = 0

    const syncResponse = {
      type: 'sync-response',
      envelopes: [],
      checkpoint: '2026-03-15T00:00:00.000Z',
      hasMore: false,
    }
    mockWs.onmessage!({ data: JSON.stringify(syncResponse) } as MessageEvent)

    // Should NOT send another sync-request
    const sent = mockWs._sent.map(m => JSON.parse(m))
    const syncReqs = sent.filter(m => m.type === 'sync-request')
    expect(syncReqs).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/saga-client-rt && npx vitest run src/__tests__/client.test.ts`
Expected: FAIL — sync-request not sent after auth

- [ ] **Step 3: Implement sync-on-activation in client.ts**

In `packages/saga-client-rt/src/client.ts`:

1. Add checkpoint key constant:

```typescript
const SYNC_CHECKPOINT_KEY = 'checkpoint:sync'
```

2. Load checkpoint on create and use it in the sync flow. Add to the `onSyncResponse` callback:

```typescript
async onSyncResponse(envelopes, checkpoint, hasMore) {
  // Decrypt and store each envelope
  for (const envelope of envelopes) {
    try {
      await router.handleEnvelope(envelope)
    } catch {
      // Skip envelopes we can't decrypt
    }
  }

  // Persist the new checkpoint
  await store.put(SYNC_CHECKPOINT_KEY, { checkpoint })

  // If more envelopes remain, request the next batch
  if (hasMore) {
    connection.sendSyncRequest(checkpoint)
  }
},
```

3. Modify the `onConnectionChange` callback (or the auth success flow) to trigger sync after connect. The cleanest approach is to have the relay connection send a sync-request right after auth succeeds. In the `callbacks.onConnectionChange` handler:

```typescript
onConnectionChange(connected) {
  for (const handler of connectionHandlers) handler(connected)
  if (connected) {
    // Trigger sync-on-activation
    loadCheckpointAndSync()
  }
},
```

4. Add helper function:

```typescript
async function loadCheckpointAndSync(): Promise<void> {
  let since = '1970-01-01T00:00:00.000Z'
  try {
    const saved = (await store.get(SYNC_CHECKPOINT_KEY)) as { checkpoint: string } | undefined
    if (saved?.checkpoint) {
      since = saved.checkpoint
    }
  } catch {
    // No checkpoint yet — sync from beginning
  }
  connection.sendSyncRequest(since)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/saga-client-rt && npx vitest run src/__tests__/client.test.ts`
Expected: All tests pass

- [ ] **Step 5: Run full client test suite**

Run: `cd packages/saga-client-rt && npx vitest run`
Expected: All tests pass (42+ tests)

- [ ] **Step 6: Commit**

```bash
git add packages/saga-client-rt/src/client.ts \
  packages/saga-client-rt/src/__tests__/client.test.ts
git commit -m "feat(saga-client-rt): sync-on-activation with checkpoint persistence"
```

---

### Task 8: Integration Tests — Full Sync Protocol

**Files:**

- Modify: `packages/server/src/__tests__/relay-integration.test.ts`
- Modify: `packages/saga-client-rt/src/__tests__/integration.test.ts`

**Context:** Verify the full sync protocol end-to-end within each package. Server tests verify the full protocol flow (connect → store memories → second connect → sync-request → sync-response). Client tests verify the full activation flow with real crypto.

- [ ] **Step 1: Write server integration tests**

Add to `packages/server/src/__tests__/relay-integration.test.ts`:

```typescript
describe('memory sync protocol', () => {
  it('full sync flow: store memory, sync-request retrieves it', async () => {
    const derpA = createMockWebSocket()
    await authenticateWebSocket(room, derpA, 'alice')

    // derpA stores a memory
    const envelope = makeRelayEnvelope({
      type: 'memory-sync',
      from: 'alice@epicflow',
      to: 'alice@epicflow',
    })
    await room.webSocketMessage(
      derpA,
      JSON.stringify({
        type: 'relay:send',
        envelope,
      })
    )

    // derpB connects and syncs
    const derpB = createMockWebSocket()
    await authenticateWebSocket(room, derpB, 'alice')
    derpB._sent.length = 0

    await room.webSocketMessage(
      derpB,
      JSON.stringify({
        type: 'sync-request',
        since: '1970-01-01T00:00:00.000Z',
      })
    )

    const messages = derpB._sent.map(m => JSON.parse(m))
    const syncResp = messages.find(m => m.type === 'sync-response')
    expect(syncResp).toBeDefined()
    expect(syncResp.envelopes).toHaveLength(1)
    expect(syncResp.envelopes[0].id).toBe(envelope.id)
    expect(syncResp.hasMore).toBe(false)
  })

  it('multi-DERP real-time: memory created on derpA delivered live to derpB', async () => {
    const derpA = createMockWebSocket()
    const derpB = createMockWebSocket()
    await authenticateWebSocket(room, derpA, 'alice')
    await authenticateWebSocket(room, derpB, 'alice')
    derpB._sent.length = 0

    const envelope = makeRelayEnvelope({
      type: 'memory-sync',
      from: 'alice@epicflow',
      to: 'alice@epicflow',
    })
    await room.webSocketMessage(
      derpA,
      JSON.stringify({
        type: 'relay:send',
        envelope,
      })
    )

    const derpBMessages = derpB._sent.map(m => JSON.parse(m))
    const delivers = derpBMessages.filter(m => m.type === 'relay:deliver')
    expect(delivers).toHaveLength(1)
    expect(delivers[0].envelope.id).toBe(envelope.id)
  })

  it('checkpoint-based sync: only returns envelopes after checkpoint', async () => {
    const ws = createMockWebSocket()
    await authenticateWebSocket(room, ws, 'alice')

    // Store two memories
    const env1 = makeRelayEnvelope({
      type: 'memory-sync',
      from: 'alice@epicflow',
      to: 'alice@epicflow',
    })
    await room.webSocketMessage(ws, JSON.stringify({ type: 'relay:send', envelope: env1 }))

    // Get the checkpoint from first sync
    ws._sent.length = 0
    await room.webSocketMessage(
      ws,
      JSON.stringify({
        type: 'sync-request',
        since: '1970-01-01T00:00:00.000Z',
      })
    )
    const firstSync = ws._sent.map(m => JSON.parse(m)).find(m => m.type === 'sync-response')
    const checkpoint = firstSync.checkpoint

    // Store another memory
    const env2 = makeRelayEnvelope({
      type: 'memory-sync',
      from: 'alice@epicflow',
      to: 'alice@epicflow',
    })
    await room.webSocketMessage(ws, JSON.stringify({ type: 'relay:send', envelope: env2 }))

    // Sync from checkpoint — should only get env2
    ws._sent.length = 0
    await room.webSocketMessage(
      ws,
      JSON.stringify({
        type: 'sync-request',
        since: checkpoint,
      })
    )
    const secondSync = ws._sent.map(m => JSON.parse(m)).find(m => m.type === 'sync-response')
    expect(secondSync.envelopes).toHaveLength(1)
    expect(secondSync.envelopes[0].id).toBe(env2.id)
  })

  it('hub cannot read memory content — envelopes are opaque blobs', async () => {
    const ws = createMockWebSocket()
    await authenticateWebSocket(room, ws, 'alice')

    const envelope = makeRelayEnvelope({
      type: 'memory-sync',
      from: 'alice@epicflow',
      to: 'alice@epicflow',
      ct: 'totally-opaque-encrypted-content',
    })
    await room.webSocketMessage(ws, JSON.stringify({ type: 'relay:send', envelope }))

    // Sync back
    ws._sent.length = 0
    await room.webSocketMessage(
      ws,
      JSON.stringify({
        type: 'sync-request',
        since: '1970-01-01T00:00:00.000Z',
      })
    )
    const syncResp = ws._sent.map(m => JSON.parse(m)).find(m => m.type === 'sync-response')
    expect(syncResp.envelopes[0].ct).toBe('totally-opaque-encrypted-content')
  })
})
```

- [ ] **Step 2: Write client integration tests**

Add to `packages/saga-client-rt/src/__tests__/integration.test.ts`:

```typescript
describe('sync-on-activation', () => {
  it('sends sync-request after connecting with default checkpoint', async () => {
    await client.connect()
    // Trigger auth success
    simulateAuthSuccess()

    const sent = getAllSentMessages()
    const syncReq = sent.find(m => m.type === 'sync-request')
    expect(syncReq).toBeDefined()
    expect(syncReq.since).toBe('1970-01-01T00:00:00.000Z')
  })

  it('processes sync-response and stores memories locally', async () => {
    await client.connect()
    simulateAuthSuccess()

    // Create a real encrypted memory envelope using saga-crypto
    const memory = {
      id: 'mem_test1',
      type: 'episodic',
      content: { event: 'test memory' },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    const plaintext = new TextEncoder().encode(JSON.stringify(memory))
    const envelope = await seal(
      { type: 'memory-sync', scope: 'private', from: identity, to: identity, plaintext },
      keyRing
    )

    // Simulate sync-response
    simulateSyncResponse([envelope], '2026-03-26T00:00:00.000Z', false)

    // Verify memory was stored locally
    const result = await client.queryMemory({})
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('mem_test1')
  })
})
```

Note: The exact test setup depends on the existing patterns in `integration.test.ts`. Follow the existing test helper patterns (mock WebSocket, real crypto, etc.) already established in Phase 3.

- [ ] **Step 3: Run tests to verify they pass**

Run: `cd packages/server && npx vitest run src/__tests__/relay-integration.test.ts`
Run: `cd packages/saga-client-rt && npx vitest run src/__tests__/integration.test.ts`
Expected: All tests pass

- [ ] **Step 4: Run both full test suites**

Run: `cd packages/server && npx vitest run`
Run: `cd packages/saga-client-rt && npx vitest run`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/__tests__/relay-integration.test.ts \
  packages/saga-client-rt/src/__tests__/integration.test.ts
git commit -m "test: add integration tests for full memory sync protocol"
```

---

## Spec Coverage Check

| Phase 4 Requirement                                                                      | Task                                          |
| ---------------------------------------------------------------------------------------- | --------------------------------------------- |
| Push-on-write memory sync (storeMemory → hub stores canonical → forwards to other DERPs) | Task 4                                        |
| Hub stores in agent's canonical memory store (D1, encrypted blob)                        | Task 2, Task 4                                |
| Hub forwards to any other connected DERPs for this agent                                 | Task 3, Task 4                                |
| Pull-on-activation (seed sync) with checkpoint                                           | Task 5 (server), Task 7 (client)              |
| `sync-request` control message with last known checkpoint                                | Task 1 (server types), Task 6 (client types)  |
| Hub responds with all memory envelopes since checkpoint                                  | Task 5                                        |
| Checkpoint updated after sync                                                            | Task 7                                        |
| Multi-DERP sync for same agent                                                           | Task 3, Task 4                                |
| Memory arrives at home DERP in real-time                                                 | Task 4                                        |
| Conflict-free: unique ID, append-only model                                              | Task 2 (INSERT OR IGNORE dedup)               |
| Pagination for large backlogs (hasMore)                                                  | Task 2, Task 5, Task 7                        |
| 500ms real-time delivery (both connected)                                                | Task 4 (integration test)                     |
| Pull-on-activation seeds full memory state                                               | Task 8 (integration test)                     |
| No data loss: buffered and synced on reconnect                                           | Task 7 (existing buffer + sync-on-activation) |
