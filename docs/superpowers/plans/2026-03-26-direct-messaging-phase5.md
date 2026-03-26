# Phase 5: Direct Messaging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable real-time encrypted 1:1 and group messaging between agents and organizations, with automatic public key discovery, per-envelope TTL, and hub-side group fan-out routing.

**Architecture:** Phase 5 adds three capabilities to the SAGA relay: (1) a public key discovery endpoint so clients can auto-fetch encryption keys instead of manual registration, (2) per-envelope TTL so direct messages expire faster than memory-sync envelopes, and (3) a group registry with fan-out routing so the hub can deliver group messages to all members. The client gains auto-key-discovery, HTTP API access for group management, and group key distribution via direct messages.

**Tech Stack:** Cloudflare Workers (D1, KV, Durable Objects), Hono router, Drizzle ORM, Vitest, `@epicdm/saga-crypto` (NaCl box, AES-256-GCM, KeyRing)

**Depends on:** Phase 4 (PR #16) must be merged to `dev` first — this plan uses migration `0004` and builds on the Phase 4 relay types.

---

## File Structure

### Server (`packages/server`)

| File                                      | Action | Responsibility                                                      |
| ----------------------------------------- | ------ | ------------------------------------------------------------------- |
| `migrations/0004_direct_messaging.sql`    | Create | D1 migration: org `public_key` column + `group_members` table       |
| `src/db/schema.ts`                        | Modify | Add `publicKey` to organizations, add `groupMembers` Drizzle schema |
| `src/routes/keys.ts`                      | Create | `GET /v1/keys/:handle` public key discovery endpoint                |
| `src/routes/groups.ts`                    | Create | Group CRUD: create, add/remove members, list members                |
| `src/index.ts`                            | Modify | Mount `/v1/keys` and `/v1/groups` routes                            |
| `src/relay/types.ts`                      | Modify | Add `DM_TTL_SECONDS` constant                                       |
| `src/relay/mailbox.ts`                    | Modify | Support per-envelope TTL override                                   |
| `src/relay/relay-room.ts`                 | Modify | Route `group:{groupId}` envelopes via fan-out                       |
| `src/__tests__/keys.test.ts`              | Create | Key discovery endpoint tests                                        |
| `src/__tests__/groups.test.ts`            | Create | Group management endpoint tests                                     |
| `src/__tests__/relay-room.test.ts`        | Modify | Group fan-out routing tests                                         |
| `src/__tests__/relay-mailbox.test.ts`     | Modify | Per-envelope TTL tests                                              |
| `src/__tests__/relay-integration.test.ts` | Modify | Full flow integration tests                                         |
| `src/__tests__/test-helpers.ts`           | Modify | Add group_members table to mock migrations                          |

### Client (`packages/saga-client-rt`)

| File                                 | Action | Responsibility                                                |
| ------------------------------------ | ------ | ------------------------------------------------------------- |
| `src/types.ts`                       | Modify | Add `fetchKey` config option, group management types          |
| `src/key-resolver.ts`                | Create | HTTP-based public key fetcher with cache                      |
| `src/client.ts`                      | Modify | Auto-key-discovery in sendMessage(), group management methods |
| `src/__tests__/key-resolver.test.ts` | Create | Key resolver unit tests                                       |
| `src/__tests__/client.test.ts`       | Modify | Auto-discovery + group tests                                  |
| `src/__tests__/integration.test.ts`  | Modify | Full messaging integration tests                              |

---

### Task 1: Server — Organization Public Key + Key Discovery Endpoint

**Files:**

- Modify: `packages/server/migrations/0004_direct_messaging.sql` (create)
- Modify: `packages/server/src/db/schema.ts`
- Create: `packages/server/src/routes/keys.ts`
- Modify: `packages/server/src/index.ts`
- Create: `packages/server/src/__tests__/keys.test.ts`
- Modify: `packages/server/src/__tests__/test-helpers.ts`

**Context:** The `agents` table already has a `publicKey` column. Organizations do not. We need a unified `GET /v1/keys/:handle` endpoint that looks up the x25519 public key for any handle (agent or org). This endpoint is unauthenticated (public keys are public).

- [ ] **Step 1: Write the D1 migration**

Create `packages/server/migrations/0004_direct_messaging.sql`:

```sql
-- Phase 5: Direct Messaging
-- Add public_key to organizations and create group_members table

ALTER TABLE organizations ADD COLUMN public_key TEXT;

CREATE TABLE group_members (
  group_id TEXT NOT NULL,
  handle TEXT NOT NULL,
  added_at TEXT NOT NULL,
  PRIMARY KEY (group_id, handle)
);

CREATE INDEX idx_group_members_handle ON group_members (handle);
```

- [ ] **Step 2: Update Drizzle schema**

In `packages/server/src/db/schema.ts`, add `publicKey` to organizations and add the `groupMembers` table:

```typescript
export const organizations = sqliteTable('organizations', {
  // ... existing fields ...
  publicKey: text('public_key'), // ADD THIS LINE after chain
})

export const groupMembers = sqliteTable(
  'group_members',
  {
    groupId: text('group_id').notNull(),
    handle: text('handle').notNull(),
    addedAt: text('added_at').notNull(),
  },
  table => ({
    pk: primaryKey({ columns: [table.groupId, table.handle] }),
  })
)
```

- [ ] **Step 3: Update test helpers to include new migration**

In `packages/server/src/__tests__/test-helpers.ts`, add the `group_members` table creation and the `ALTER TABLE` for organizations to `runMigrations()`:

```typescript
// Inside runMigrations(), add after existing table creations:
await db.prepare(`ALTER TABLE organizations ADD COLUMN public_key TEXT`).run()

await db
  .prepare(
    `
  CREATE TABLE IF NOT EXISTS group_members (
    group_id TEXT NOT NULL,
    handle TEXT NOT NULL,
    added_at TEXT NOT NULL,
    PRIMARY KEY (group_id, handle)
  )
`
  )
  .run()
```

- [ ] **Step 4: Write failing tests for key discovery endpoint**

Create `packages/server/src/__tests__/keys.test.ts`:

```typescript
// packages/server/src/__tests__/keys.test.ts
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { beforeEach, describe, expect, it } from 'vitest'
import { drizzle } from 'drizzle-orm/d1'
import { agents, organizations } from '../db/schema'
import { app } from '../index'
import { createMockD1, createMockKV, runMigrations } from './test-helpers'
import type { Env } from '../bindings'

function createTestEnv(db: D1Database): Env {
  return {
    DB: db,
    STORAGE: {} as R2Bucket,
    SESSIONS: createMockKV(),
    INDEXER_STATE: createMockKV(),
    RELAY_MAILBOX: createMockKV(),
    RELAY_ROOM: {} as DurableObjectNamespace,
  }
}

describe('GET /v1/keys/:handle', () => {
  let db: D1Database
  let env: Env

  beforeEach(async () => {
    db = createMockD1()
    await runMigrations(db)
    env = createTestEnv(db)

    const orm = drizzle(db)
    await orm.insert(agents).values({
      id: 'agent_alice',
      handle: 'alice',
      walletAddress: '0xalice',
      chain: 'eip155:8453',
      publicKey: 'YWxpY2VfeDI1NTE5X3B1YmxpY19rZXk=',
      registeredAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    await orm.insert(organizations).values({
      id: 'org_acme',
      handle: 'acme',
      name: 'Acme Corp',
      walletAddress: '0xacme',
      chain: 'eip155:8453',
      publicKey: 'YWNtZV94MjU1MTlfcHVibGljX2tleQ==',
      registeredAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
  })

  it('returns agent public key', async () => {
    const res = await app.request('/v1/keys/alice', {}, env)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({
      handle: 'alice',
      publicKey: 'YWxpY2VfeDI1NTE5X3B1YmxpY19rZXk=',
      entityType: 'agent',
    })
  })

  it('returns organization public key', async () => {
    const res = await app.request('/v1/keys/acme', {}, env)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({
      handle: 'acme',
      publicKey: 'YWNtZV94MjU1MTlfcHVibGljX2tleQ==',
      entityType: 'organization',
    })
  })

  it('returns 404 for unknown handle', async () => {
    const res = await app.request('/v1/keys/nonexistent', {}, env)
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toBe('Handle not found')
  })

  it('returns 404 when agent has no public key', async () => {
    const orm = drizzle(db)
    await orm.insert(agents).values({
      id: 'agent_bob',
      handle: 'bob',
      walletAddress: '0xbob',
      chain: 'eip155:8453',
      publicKey: null,
      registeredAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })

    const res = await app.request('/v1/keys/bob', {}, env)
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toBe('No public key registered')
  })
})
```

- [ ] **Step 5: Run tests to verify they fail**

Run: `cd packages/server && npx vitest run src/__tests__/keys.test.ts`
Expected: FAIL (route doesn't exist yet)

- [ ] **Step 6: Implement the key discovery route**

Create `packages/server/src/routes/keys.ts`:

```typescript
// packages/server/src/routes/keys.ts
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { Hono } from 'hono'
import { drizzle } from 'drizzle-orm/d1'
import { eq } from 'drizzle-orm'
import type { Env } from '../bindings'
import { agents, organizations } from '../db/schema'

export const keyRoutes = new Hono<{ Bindings: Env }>()

/**
 * GET /v1/keys/:handle — Look up x25519 public key for any handle.
 * Unauthenticated — public keys are public.
 * Checks agents table first, then organizations.
 */
keyRoutes.get('/:handle', async c => {
  const handle = c.req.param('handle') as string
  const db = drizzle(c.env.DB)

  // Check agents first
  const agentRows = await db
    .select({ publicKey: agents.publicKey })
    .from(agents)
    .where(eq(agents.handle, handle))
    .limit(1)

  if (agentRows.length > 0) {
    if (!agentRows[0].publicKey) {
      return c.json({ error: 'No public key registered', code: 'NO_KEY' }, 404)
    }
    return c.json({ handle, publicKey: agentRows[0].publicKey, entityType: 'agent' })
  }

  // Check organizations
  const orgRows = await db
    .select({ publicKey: organizations.publicKey })
    .from(organizations)
    .where(eq(organizations.handle, handle))
    .limit(1)

  if (orgRows.length > 0) {
    if (!orgRows[0].publicKey) {
      return c.json({ error: 'No public key registered', code: 'NO_KEY' }, 404)
    }
    return c.json({ handle, publicKey: orgRows[0].publicKey, entityType: 'organization' })
  }

  return c.json({ error: 'Handle not found', code: 'NOT_FOUND' }, 404)
})
```

- [ ] **Step 7: Mount the route in index.ts**

In `packages/server/src/index.ts`, add:

```typescript
import { keyRoutes } from './routes/keys'
// ... in the mount section:
app.route('/v1/keys', keyRoutes)
```

Also add `/v1/keys/:handle` to the endpoints object in the root route.

- [ ] **Step 8: Run tests to verify they pass**

Run: `cd packages/server && npx vitest run src/__tests__/keys.test.ts`
Expected: 4 tests PASS

- [ ] **Step 9: Run full server test suite**

Run: `cd packages/server && npx vitest run`
Expected: All tests pass

- [ ] **Step 10: Commit**

```bash
git add packages/server/migrations/0004_direct_messaging.sql \
  packages/server/src/db/schema.ts \
  packages/server/src/routes/keys.ts \
  packages/server/src/index.ts \
  packages/server/src/__tests__/keys.test.ts \
  packages/server/src/__tests__/test-helpers.ts
git commit -m "feat(server): add public key discovery endpoint and org publicKey migration"
```

---

### Task 2: Client — Auto Key Discovery

**Files:**

- Create: `packages/saga-client-rt/src/key-resolver.ts`
- Modify: `packages/saga-client-rt/src/types.ts`
- Modify: `packages/saga-client-rt/src/client.ts`
- Create: `packages/saga-client-rt/src/__tests__/key-resolver.test.ts`

**Context:** Currently `sendMessage()` throws if no peer key is registered via `registerPeerKey()`. Phase 5 adds automatic key discovery: on first message to a handle, the client fetches the public key from `GET /v1/keys/:handle` via HTTP and caches it. The `fetchKey` config option allows test injection.

- [ ] **Step 1: Add config types for key resolver**

In `packages/saga-client-rt/src/types.ts`, add to `SagaClientConfig`:

```typescript
/** Optional: custom fetch function for key discovery (defaults to global fetch) */
fetchFn?: typeof fetch
```

And add a new exported type:

```typescript
/** Resolved public key from directory */
export interface ResolvedKey {
  handle: string
  publicKey: Uint8Array
  entityType: 'agent' | 'organization'
}
```

- [ ] **Step 2: Write failing tests for key-resolver**

Create `packages/saga-client-rt/src/__tests__/key-resolver.test.ts`:

```typescript
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createKeyResolver } from '../key-resolver'

function base64Encode(str: string): string {
  return btoa(str)
}

describe('createKeyResolver', () => {
  const mockFetch = vi.fn()

  beforeEach(() => {
    mockFetch.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('fetches public key from hub and returns Uint8Array', async () => {
    const keyBase64 = base64Encode('test-public-key-32-bytes-padding!')
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ handle: 'bob', publicKey: keyBase64, entityType: 'agent' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )

    const resolver = createKeyResolver('wss://hub.example.com/v1/relay', mockFetch)
    const key = await resolver.resolve('bob@epicflow')

    expect(mockFetch).toHaveBeenCalledWith('https://hub.example.com/v1/keys/bob')
    expect(key).toBeInstanceOf(Uint8Array)
  })

  it('caches resolved keys and does not re-fetch', async () => {
    const keyBase64 = base64Encode('test-public-key-32-bytes-padding!')
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ handle: 'bob', publicKey: keyBase64, entityType: 'agent' }), {
        status: 200,
      })
    )

    const resolver = createKeyResolver('wss://hub.example.com/v1/relay', mockFetch)
    await resolver.resolve('bob@epicflow')
    await resolver.resolve('bob@epicflow')

    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('throws on 404 (unknown handle)', async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ error: 'Handle not found' }), { status: 404 })
    )

    const resolver = createKeyResolver('wss://hub.example.com/v1/relay', mockFetch)
    await expect(resolver.resolve('unknown@epicflow')).rejects.toThrow(
      'No public key found for unknown'
    )
  })

  it('allows manual registration that overrides cache', async () => {
    const resolver = createKeyResolver('wss://hub.example.com/v1/relay', mockFetch)
    const manualKey = new Uint8Array(32).fill(42)
    resolver.register('bob@epicflow', manualKey)

    const key = await resolver.resolve('bob@epicflow')
    expect(key).toBe(manualKey)
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('derives HTTP base URL from various WSS URL formats', async () => {
    const keyBase64 = base64Encode('key')
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ handle: 'bob', publicKey: keyBase64, entityType: 'agent' }), {
        status: 200,
      })
    )

    const resolver = createKeyResolver('wss://api.saga.dev/v1/relay', mockFetch)
    await resolver.resolve('bob@dir')

    expect(mockFetch).toHaveBeenCalledWith('https://api.saga.dev/v1/keys/bob')
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd packages/saga-client-rt && npx vitest run src/__tests__/key-resolver.test.ts`
Expected: FAIL (module doesn't exist)

- [ ] **Step 4: Implement key-resolver**

Create `packages/saga-client-rt/src/key-resolver.ts`:

```typescript
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

export interface KeyResolver {
  /** Resolve a handle to its x25519 public key (fetches from hub if not cached) */
  resolve(identity: string): Promise<Uint8Array>
  /** Manually register a key (overrides cache) */
  register(identity: string, publicKey: Uint8Array): void
}

/**
 * Derives the HTTP API base URL from a WSS relay URL.
 * "wss://hub.example.com/v1/relay" → "https://hub.example.com"
 */
function deriveApiBase(hubWssUrl: string): string {
  return hubWssUrl.replace(/^wss:\/\//, 'https://').replace(/\/v1\/relay\/?$/, '')
}

export function createKeyResolver(
  hubUrl: string,
  fetchFn: typeof fetch = globalThis.fetch
): KeyResolver {
  const cache = new Map<string, Uint8Array>()
  const apiBase = deriveApiBase(hubUrl)

  return {
    async resolve(identity: string): Promise<Uint8Array> {
      const cached = cache.get(identity)
      if (cached) return cached

      const handle = identity.split('@')[0]
      const res = await fetchFn(`${apiBase}/v1/keys/${handle}`)

      if (!res.ok) {
        throw new Error(`No public key found for ${handle}`)
      }

      const body = (await res.json()) as { publicKey: string }
      const decoded = Uint8Array.from(atob(body.publicKey), c => c.charCodeAt(0))
      cache.set(identity, decoded)
      return decoded
    },

    register(identity: string, publicKey: Uint8Array): void {
      cache.set(identity, publicKey)
    },
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd packages/saga-client-rt && npx vitest run src/__tests__/key-resolver.test.ts`
Expected: 5 tests PASS

- [ ] **Step 6: Update client.ts to use key resolver**

In `packages/saga-client-rt/src/client.ts`:

1. Replace the `peerKeys` Map with a `KeyResolver`:

```typescript
import { createKeyResolver } from './key-resolver'

// Replace:  const peerKeys = new Map<string, Uint8Array>()
// With:
const keyResolver = createKeyResolver(config.hubUrl, config.fetchFn)
```

2. Update `sendMessage()`:

```typescript
async sendMessage(to: string, message: SagaDirectMessage): Promise<string> {
  const recipientKey = await keyResolver.resolve(to)
  // ... rest unchanged (seal + send)
}
```

3. Update `registerPeerKey()`:

```typescript
registerPeerKey(identity: string, publicKey: Uint8Array): void {
  keyResolver.register(identity, publicKey)
}
```

4. Update the `decrypt()` function to use the key resolver:

```typescript
async function decrypt(envelope: SagaEncryptedEnvelope): Promise<Uint8Array> {
  let senderKey: Uint8Array | undefined
  try {
    senderKey = await keyResolver.resolve(envelope.from)
  } catch {
    // Sender key not available — proceed without it (private scope doesn't need it)
  }
  const result = open(envelope, config.keyRing, senderKey)
  return result instanceof Promise ? result : Promise.resolve(result)
}
```

- [ ] **Step 7: Run full client test suite**

Run: `cd packages/saga-client-rt && npx vitest run`
Expected: All tests pass (existing tests use `registerPeerKey()` which still works)

- [ ] **Step 8: Commit**

```bash
git add packages/saga-client-rt/src/key-resolver.ts \
  packages/saga-client-rt/src/types.ts \
  packages/saga-client-rt/src/client.ts \
  packages/saga-client-rt/src/__tests__/key-resolver.test.ts
git commit -m "feat(saga-client-rt): add auto key discovery with HTTP resolver and cache"
```

---

### Task 3: Server — Per-Envelope TTL in Mailbox

**Files:**

- Modify: `packages/server/src/relay/types.ts`
- Modify: `packages/server/src/relay/mailbox.ts`
- Modify: `packages/server/src/__tests__/relay-mailbox.test.ts`

**Context:** The mailbox currently stores all envelopes with a fixed 30-day TTL. Phase 5 adds per-envelope TTL: if the envelope carries a `ttl` field (seconds), the mailbox uses it instead of the default. Direct messages default to 7 days; memory-sync envelopes keep the existing 30-day default.

- [ ] **Step 1: Add DM TTL constant to relay types**

In `packages/server/src/relay/types.ts`, add:

```typescript
export const DM_TTL_SECONDS = 7 * 24 * 3600 // 7 days for direct messages
```

- [ ] **Step 2: Write failing tests**

In `packages/server/src/__tests__/relay-mailbox.test.ts`, add tests to the existing describe block:

```typescript
it('uses envelope ttl when present', async () => {
  const envelope = makeEnvelope({ ttl: 3600 }) // 1 hour
  await mailbox.store('alice', envelope)

  // Verify the KV put was called with the envelope's TTL
  // The mock KV should have stored with expirationTtl: 3600
  expect(mockKvPuts[mockKvPuts.length - 1].ttl).toBe(3600)
})

it('uses type-based default TTL when envelope has no ttl', async () => {
  const dmEnvelope = makeEnvelope({ type: 'direct-message' })
  await mailbox.store('alice', dmEnvelope)
  expect(mockKvPuts[mockKvPuts.length - 1].ttl).toBe(7 * 24 * 3600)
})

it('uses 30-day TTL for memory-sync envelopes', async () => {
  const syncEnvelope = makeEnvelope({ type: 'memory-sync' })
  await mailbox.store('alice', syncEnvelope)
  expect(mockKvPuts[mockKvPuts.length - 1].ttl).toBe(30 * 24 * 3600)
})
```

Note: The test setup may need a spy on the mock KV's `put` method to capture the `expirationTtl` argument. Adapt the existing test helpers accordingly — the existing mock KV (`createMockKV()`) likely needs to be enhanced to record put options.

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd packages/server && npx vitest run src/__tests__/relay-mailbox.test.ts`
Expected: FAIL (new tests fail)

- [ ] **Step 4: Update mailbox to support per-envelope TTL**

In `packages/server/src/relay/mailbox.ts`, update the `store` method:

```typescript
import { DM_TTL_SECONDS, MAILBOX_TTL_SECONDS } from './types'

// In createMailbox():
async store(handle, envelope) {
  const key = mailboxKey(handle, envelope)
  // Per-envelope TTL: use envelope.ttl if present,
  // otherwise use type-based default
  const envelopeTtl = typeof (envelope as Record<string, unknown>).ttl === 'number'
    ? (envelope as Record<string, unknown>).ttl as number
    : undefined
  const effectiveTtl = envelopeTtl
    ?? (envelope.type === 'direct-message' ? DM_TTL_SECONDS : ttlSeconds)
  await kv.put(key, JSON.stringify(envelope), { expirationTtl: effectiveTtl })
},
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd packages/server && npx vitest run src/__tests__/relay-mailbox.test.ts`
Expected: All tests pass

- [ ] **Step 6: Run full server test suite**

Run: `cd packages/server && npx vitest run`
Expected: All tests pass

- [ ] **Step 7: Commit**

```bash
git add packages/server/src/relay/types.ts \
  packages/server/src/relay/mailbox.ts \
  packages/server/src/__tests__/relay-mailbox.test.ts
git commit -m "feat(server): add per-envelope TTL with type-based defaults for mailbox"
```

---

### Task 4: Server — Group Registry API

**Files:**

- Create: `packages/server/src/routes/groups.ts`
- Modify: `packages/server/src/index.ts`
- Create: `packages/server/src/__tests__/groups.test.ts`

**Context:** Group messaging requires the hub to know which handles belong to each group (for fan-out routing). This task adds CRUD endpoints for group membership. Any authenticated entity can create a group. The group registry is stored in D1 via the `group_members` table created in Task 1's migration.

- [ ] **Step 1: Write failing tests**

Create `packages/server/src/__tests__/groups.test.ts`:

```typescript
// packages/server/src/__tests__/groups.test.ts
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { beforeEach, describe, expect, it } from 'vitest'
import { drizzle } from 'drizzle-orm/d1'
import { agents } from '../db/schema'
import { app } from '../index'
import { createMockD1, createMockKV, runMigrations } from './test-helpers'
import type { Env } from '../bindings'

function createTestEnv(db: D1Database): Env {
  return {
    DB: db,
    STORAGE: {} as R2Bucket,
    SESSIONS: createMockKV(),
    INDEXER_STATE: createMockKV(),
    RELAY_MAILBOX: createMockKV(),
    RELAY_ROOM: {} as DurableObjectNamespace,
  }
}

async function authHeaders(env: Env, wallet = '0xalice'): Promise<Record<string, string>> {
  // Create a session via the auth challenge flow
  const challengeRes = await app.request(
    '/v1/auth/challenge',
    {
      method: 'POST',
      body: JSON.stringify({ walletAddress: wallet, chain: 'eip155:8453' }),
      headers: { 'Content-Type': 'application/json' },
    },
    env
  )
  const { sessionToken } = (await challengeRes.json()) as { sessionToken: string }
  return { Authorization: `Bearer ${sessionToken}`, 'Content-Type': 'application/json' }
}

describe('Group management API', () => {
  let db: D1Database
  let env: Env

  beforeEach(async () => {
    db = createMockD1()
    await runMigrations(db)
    env = createTestEnv(db)

    const orm = drizzle(db)
    await orm.insert(agents).values({
      id: 'agent_alice',
      handle: 'alice',
      walletAddress: '0xalice',
      chain: 'eip155:8453',
      registeredAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
  })

  it('POST /v1/groups creates a group with members', async () => {
    const res = await app.request(
      '/v1/groups',
      {
        method: 'POST',
        body: JSON.stringify({
          groupId: 'team-alpha',
          members: ['alice', 'bob'],
        }),
        headers: { 'Content-Type': 'application/json' },
      },
      env
    )
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.groupId).toBe('team-alpha')
    expect(body.members).toEqual(['alice', 'bob'])
  })

  it('GET /v1/groups/:groupId/members returns member list', async () => {
    // Create group first
    await app.request(
      '/v1/groups',
      {
        method: 'POST',
        body: JSON.stringify({ groupId: 'team-alpha', members: ['alice', 'bob'] }),
        headers: { 'Content-Type': 'application/json' },
      },
      env
    )

    const res = await app.request('/v1/groups/team-alpha/members', {}, env)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.members).toContain('alice')
    expect(body.members).toContain('bob')
  })

  it('PUT /v1/groups/:groupId/members adds new members', async () => {
    await app.request(
      '/v1/groups',
      {
        method: 'POST',
        body: JSON.stringify({ groupId: 'team-alpha', members: ['alice'] }),
        headers: { 'Content-Type': 'application/json' },
      },
      env
    )

    const res = await app.request(
      '/v1/groups/team-alpha/members',
      {
        method: 'PUT',
        body: JSON.stringify({ add: ['bob', 'carol'] }),
        headers: { 'Content-Type': 'application/json' },
      },
      env
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.members).toHaveLength(3)
  })

  it('DELETE /v1/groups/:groupId/members removes members', async () => {
    await app.request(
      '/v1/groups',
      {
        method: 'POST',
        body: JSON.stringify({ groupId: 'team-alpha', members: ['alice', 'bob', 'carol'] }),
        headers: { 'Content-Type': 'application/json' },
      },
      env
    )

    const res = await app.request(
      '/v1/groups/team-alpha/members',
      {
        method: 'DELETE',
        body: JSON.stringify({ remove: ['bob'] }),
        headers: { 'Content-Type': 'application/json' },
      },
      env
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.members).toEqual(['alice', 'carol'])
  })

  it('returns 404 for unknown group', async () => {
    const res = await app.request('/v1/groups/nonexistent/members', {}, env)
    expect(res.status).toBe(404)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/server && npx vitest run src/__tests__/groups.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement group routes**

Create `packages/server/src/routes/groups.ts`:

```typescript
// packages/server/src/routes/groups.ts
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { Hono } from 'hono'
import { drizzle } from 'drizzle-orm/d1'
import { and, eq } from 'drizzle-orm'
import type { Env } from '../bindings'
import { groupMembers } from '../db/schema'

export const groupRoutes = new Hono<{ Bindings: Env }>()

/** POST /v1/groups — Create a group with initial members */
groupRoutes.post('/', async c => {
  const body = await c.req.json<{ groupId: string; members: string[] }>()
  if (!body.groupId || !Array.isArray(body.members) || body.members.length === 0) {
    return c.json({ error: 'groupId and members[] are required', code: 'INVALID_REQUEST' }, 400)
  }

  const db = drizzle(c.env.DB)
  const now = new Date().toISOString()

  for (const handle of body.members) {
    await db
      .insert(groupMembers)
      .values({ groupId: body.groupId, handle, addedAt: now })
      .onConflictDoNothing()
  }

  return c.json({ groupId: body.groupId, members: body.members }, 201)
})

/** GET /v1/groups/:groupId/members — List group members */
groupRoutes.get('/:groupId/members', async c => {
  const groupId = c.req.param('groupId') as string
  const db = drizzle(c.env.DB)

  const rows = await db
    .select({ handle: groupMembers.handle })
    .from(groupMembers)
    .where(eq(groupMembers.groupId, groupId))

  if (rows.length === 0) {
    return c.json({ error: 'Group not found', code: 'NOT_FOUND' }, 404)
  }

  return c.json({ groupId, members: rows.map(r => r.handle) })
})

/** PUT /v1/groups/:groupId/members — Add members to a group */
groupRoutes.put('/:groupId/members', async c => {
  const groupId = c.req.param('groupId') as string
  const body = await c.req.json<{ add: string[] }>()
  if (!Array.isArray(body.add) || body.add.length === 0) {
    return c.json({ error: 'add[] is required', code: 'INVALID_REQUEST' }, 400)
  }

  const db = drizzle(c.env.DB)
  const now = new Date().toISOString()

  for (const handle of body.add) {
    await db.insert(groupMembers).values({ groupId, handle, addedAt: now }).onConflictDoNothing()
  }

  const rows = await db
    .select({ handle: groupMembers.handle })
    .from(groupMembers)
    .where(eq(groupMembers.groupId, groupId))

  return c.json({ groupId, members: rows.map(r => r.handle) })
})

/** DELETE /v1/groups/:groupId/members — Remove members from a group */
groupRoutes.delete('/:groupId/members', async c => {
  const groupId = c.req.param('groupId') as string
  const body = await c.req.json<{ remove: string[] }>()
  if (!Array.isArray(body.remove) || body.remove.length === 0) {
    return c.json({ error: 'remove[] is required', code: 'INVALID_REQUEST' }, 400)
  }

  const db = drizzle(c.env.DB)

  for (const handle of body.remove) {
    await db
      .delete(groupMembers)
      .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.handle, handle)))
  }

  const rows = await db
    .select({ handle: groupMembers.handle })
    .from(groupMembers)
    .where(eq(groupMembers.groupId, groupId))

  return c.json({ groupId, members: rows.map(r => r.handle) })
})
```

- [ ] **Step 4: Mount the route in index.ts**

In `packages/server/src/index.ts`, add:

```typescript
import { groupRoutes } from './routes/groups'
// ... in the mount section:
app.route('/v1/groups', groupRoutes)
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd packages/server && npx vitest run src/__tests__/groups.test.ts`
Expected: 5 tests PASS

- [ ] **Step 6: Run full server test suite**

Run: `cd packages/server && npx vitest run`
Expected: All tests pass

- [ ] **Step 7: Commit**

```bash
git add packages/server/src/routes/groups.ts \
  packages/server/src/index.ts \
  packages/server/src/__tests__/groups.test.ts
git commit -m "feat(server): add group registry CRUD API for group membership management"
```

---

### Task 5: Server — Group Fan-Out Routing in Relay

**Files:**

- Modify: `packages/server/src/relay/relay-room.ts`
- Modify: `packages/server/src/__tests__/relay-room.test.ts`
- Modify: `packages/server/src/__tests__/relay-integration.test.ts`

**Context:** When a `relay:send` envelope has `to: 'group:{groupId}'`, the relay room must look up all members of the group via D1 and deliver the envelope to each online member. Offline members get the envelope stored in their mailbox. The sender is excluded from the delivery (they already have the message).

- [ ] **Step 1: Write failing tests for group fan-out**

In `packages/server/src/__tests__/relay-room.test.ts`, add a new describe block:

```typescript
describe('group fan-out routing', () => {
  it('delivers group message to all online members', async () => {
    // Setup: insert group_members rows for 'team-alpha' with alice, bob
    const orm = drizzle(env.DB)
    await orm.insert(groupMembers).values([
      { groupId: 'team-alpha', handle: 'alice', addedAt: new Date().toISOString() },
      { groupId: 'team-alpha', handle: 'bob', addedAt: new Date().toISOString() },
    ])

    // Connect both alice and bob
    const aliceWs = // ... authenticate alice
    const bobWs = // ... authenticate bob
    bobWs._sent.length = 0

    // Alice sends a group message
    const envelope = {
      v: 1,
      type: 'group-message',
      scope: 'group',
      from: 'alice@epicflow',
      to: 'group:team-alpha',
      ct: 'encrypted-group-data',
      groupKeyId: 'team-alpha',
      ts: new Date().toISOString(),
      id: 'group-msg-001',
    }

    await room.webSocketMessage(aliceWs, JSON.stringify({ type: 'relay:send', envelope }))

    // Alice gets ack
    expect(lastMessage(aliceWs).type).toBe('relay:ack')

    // Bob receives the group message
    const bobMessages = parseSent(bobWs)
    const delivers = bobMessages.filter(m => m.type === 'relay:deliver')
    expect(delivers).toHaveLength(1)
    expect((delivers[0].envelope as Record<string, unknown>).id).toBe('group-msg-001')
  })

  it('mailboxes group message for offline members', async () => {
    // Setup: group with alice and bob, only alice connected
    const orm = drizzle(env.DB)
    await orm.insert(groupMembers).values([
      { groupId: 'team-alpha', handle: 'alice', addedAt: new Date().toISOString() },
      { groupId: 'team-alpha', handle: 'bob', addedAt: new Date().toISOString() },
    ])

    const aliceWs = // ... authenticate alice
    // Bob is NOT connected

    const envelope = {
      v: 1,
      type: 'group-message',
      scope: 'group',
      from: 'alice@epicflow',
      to: 'group:team-alpha',
      ct: 'encrypted-group-data',
      groupKeyId: 'team-alpha',
      ts: new Date().toISOString(),
      id: 'group-msg-002',
    }

    await room.webSocketMessage(aliceWs, JSON.stringify({ type: 'relay:send', envelope }))

    // Bob later connects and drains mailbox
    const bobWs = // ... authenticate bob
    await room.webSocketMessage(bobWs, JSON.stringify({ type: 'mailbox:drain' }))

    const batch = lastMessage(bobWs)
    expect(batch.type).toBe('mailbox:batch')
    const envelopes = batch.envelopes as unknown[]
    expect(envelopes).toHaveLength(1)
  })

  it('does not deliver group message back to sender', async () => {
    const orm = drizzle(env.DB)
    await orm.insert(groupMembers).values([
      { groupId: 'team-alpha', handle: 'alice', addedAt: new Date().toISOString() },
    ])

    const aliceWs = // ... authenticate alice
    aliceWs._sent.length = 0

    const envelope = {
      v: 1,
      type: 'group-message',
      scope: 'group',
      from: 'alice@epicflow',
      to: 'group:team-alpha',
      ct: 'x',
      groupKeyId: 'team-alpha',
      ts: new Date().toISOString(),
      id: 'group-msg-003',
    }

    await room.webSocketMessage(aliceWs, JSON.stringify({ type: 'relay:send', envelope }))

    const messages = parseSent(aliceWs)
    const delivers = messages.filter(m => m.type === 'relay:deliver')
    expect(delivers).toHaveLength(0) // No echo
    expect(messages.find(m => m.type === 'relay:ack')).toBeDefined()
  })
})
```

Note: Use the existing test helpers (`authenticateWs`, `parseSent`, `lastMessage`) and adapt the authentication setup from the existing tests in the file.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/server && npx vitest run src/__tests__/relay-room.test.ts`
Expected: 3 new tests FAIL

- [ ] **Step 3: Implement group fan-out in relay-room.ts**

In `packages/server/src/relay/relay-room.ts`, modify `handleRelaySend()`:

After the memory-sync interception block (before the normal routing), add group routing:

```typescript
// Group fan-out routing
if (typeof envelope.to === 'string' && envelope.to.startsWith('group:')) {
  const groupId = envelope.to.slice('group:'.length)
  const members = await this.getGroupMembers(groupId)

  for (const memberHandle of members) {
    if (memberHandle === senderHandle) continue // Don't echo to sender

    const memberSet = this.getHandleMap().get(memberHandle)
    if (memberSet && memberSet.size > 0) {
      for (const memberWs of memberSet) {
        try {
          this.sendJson(memberWs, { type: 'relay:deliver', envelope })
        } catch {
          // Individual send failure
        }
      }
    } else {
      await this.mailbox.store(memberHandle, envelope)
    }
  }

  this.sendJson(ws, { type: 'relay:ack', messageId: envelope.id })
  return
}
```

Add the `getGroupMembers()` helper:

```typescript
private async getGroupMembers(groupId: string): Promise<string[]> {
  const result = await this.env.DB
    .prepare('SELECT handle FROM group_members WHERE group_id = ?')
    .bind(groupId)
    .all()
  return (result.results ?? []).map((r: Record<string, unknown>) => r.handle as string)
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
git commit -m "feat(server): add group fan-out routing in relay for group:{groupId} envelopes"
```

---

### Task 6: Client — Group Key Distribution

**Files:**

- Modify: `packages/saga-client-rt/src/types.ts`
- Modify: `packages/saga-client-rt/src/client.ts`
- Modify: `packages/saga-client-rt/src/__tests__/client.test.ts`

**Context:** Group messaging requires a shared AES-256 group key. The group creator generates the key, wraps it for each member using their x25519 public key (via `keyRing.wrapGroupKeyFor()`), and sends a `key-distribution` direct message to each member. Members receiving a `key-distribution` message inject the group key into their KeyRing via `keyRing.addGroupKey()`. The existing `sendGroupMessage()` method already works once the group key is loaded.

- [ ] **Step 1: Add group management types**

In `packages/saga-client-rt/src/types.ts`, add `'key-distribution'` to `SagaDirectMessageType`:

```typescript
export type SagaDirectMessageType =
  | 'task-request'
  | 'task-result'
  | 'status-update'
  | 'data-payload'
  | 'coordination'
  | 'notification'
  | 'key-distribution'
```

Add to `SagaClient` interface:

```typescript
/** Distribute a group key to all members via encrypted DMs */
distributeGroupKey(groupId: string, memberIdentities: string[]): Promise<void>
```

- [ ] **Step 2: Write failing tests**

In `packages/saga-client-rt/src/__tests__/client.test.ts`, add:

```typescript
describe('group key distribution', () => {
  it('distributeGroupKey sends key-distribution DM to each member', async () => {
    // Setup: create client with keyRing that has a group key
    // Register peer keys for members
    // Call distributeGroupKey()
    // Verify relay:send messages were sent for each member
    // Verify each envelope contains wrapped group key
  })

  it('handles incoming key-distribution message and injects group key', async () => {
    // Setup: create client, connect
    // Simulate relay:deliver with a key-distribution message containing a wrapped group key
    // Verify keyRing.hasGroupKey() returns true after processing
  })
})
```

Note: Write complete test implementations following the existing test patterns in `client.test.ts`. Use `createSagaKeyRing`, `seal`, `open`, and the mock WebSocket to test the full flow.

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd packages/saga-client-rt && npx vitest run src/__tests__/client.test.ts`
Expected: New tests FAIL

- [ ] **Step 4: Implement group key distribution in client.ts**

In `packages/saga-client-rt/src/client.ts`:

1. Update the `onDirectMessage` callback in the router to handle `key-distribution`:

```typescript
onDirectMessage(from, message) {
  if (message.messageType === 'key-distribution') {
    const payload = message.payload as {
      groupId: string
      wrappedKey: { ct: string; nonce: string }
    }
    try {
      const senderKey = keyResolver.resolve(from)
      // wrappedKey is a MutualEncryptionResult (base64 ct + nonce)
      const wrappedKey = {
        ct: Uint8Array.from(atob(payload.wrappedKey.ct), c => c.charCodeAt(0)),
        nonce: Uint8Array.from(atob(payload.wrappedKey.nonce), c => c.charCodeAt(0)),
      }
      config.keyRing.addGroupKey(payload.groupId, wrappedKey, senderKey)
    } catch {
      // Key distribution failed — ignore silently
    }
    return
  }
  peers.set(from, { handle: from, lastSeen: new Date().toISOString() })
  for (const handler of messageHandlers) handler(from, message)
},
```

2. Add the `distributeGroupKey()` method to the returned object:

```typescript
async distributeGroupKey(groupId: string, memberIdentities: string[]): Promise<void> {
  for (const member of memberIdentities) {
    if (member === config.identity) continue // Skip self

    const recipientKey = await keyResolver.resolve(member)
    const wrappedKey = config.keyRing.wrapGroupKeyFor(groupId, recipientKey)

    await this.sendMessage(member, {
      messageType: 'key-distribution',
      payload: {
        groupId,
        wrappedKey: {
          ct: btoa(String.fromCharCode(...wrappedKey.ct)),
          nonce: btoa(String.fromCharCode(...wrappedKey.nonce)),
        },
      },
    })
  }
},
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd packages/saga-client-rt && npx vitest run src/__tests__/client.test.ts`
Expected: All tests pass

- [ ] **Step 6: Run full client test suite**

Run: `cd packages/saga-client-rt && npx vitest run`
Expected: All tests pass

- [ ] **Step 7: Commit**

```bash
git add packages/saga-client-rt/src/types.ts \
  packages/saga-client-rt/src/client.ts \
  packages/saga-client-rt/src/__tests__/client.test.ts
git commit -m "feat(saga-client-rt): add group key distribution via encrypted direct messages"
```

---

### Task 7: Integration Tests — Full Messaging Flow

**Files:**

- Modify: `packages/server/src/__tests__/relay-integration.test.ts`
- Modify: `packages/saga-client-rt/src/__tests__/integration.test.ts`

**Context:** End-to-end integration tests verifying the complete direct messaging and group messaging flows.

- [ ] **Step 1: Write server integration tests**

In `packages/server/src/__tests__/relay-integration.test.ts`, add:

```typescript
describe('direct messaging', () => {
  it('full DM flow: alice sends to bob, bob receives', async () => {
    const aliceWs = await connectAndAuth('alice', '0xalice')
    const bobWs = await connectAndAuth('bob', '0xbob')
    bobWs._sent.length = 0

    const envelope = {
      v: 1,
      type: 'direct-message',
      scope: 'mutual',
      from: 'alice@epicflow',
      to: 'bob@epicflow',
      ct: 'encrypted-hello',
      nonce: 'test-nonce',
      ts: new Date().toISOString(),
      id: 'dm-001',
    }

    await room.webSocketMessage(aliceWs, JSON.stringify({ type: 'relay:send', envelope }))

    expect(lastMessage(aliceWs).type).toBe('relay:ack')
    const bobDelivers = parseSent(bobWs).filter(m => m.type === 'relay:deliver')
    expect(bobDelivers).toHaveLength(1)
    expect((bobDelivers[0].envelope as Record<string, unknown>).id).toBe('dm-001')
  })
})

describe('group messaging', () => {
  it('full group flow: alice sends to group, bob and carol receive', async () => {
    // Insert group members
    const orm = drizzle(env.DB)
    // (import groupMembers from schema)
    await orm.insert(groupMembers).values([
      { groupId: 'team-alpha', handle: 'alice', addedAt: new Date().toISOString() },
      { groupId: 'team-alpha', handle: 'bob', addedAt: new Date().toISOString() },
    ])

    const aliceWs = await connectAndAuth('alice', '0xalice')
    const bobWs = await connectAndAuth('bob', '0xbob')
    bobWs._sent.length = 0

    const envelope = {
      v: 1,
      type: 'group-message',
      scope: 'group',
      from: 'alice@epicflow',
      to: 'group:team-alpha',
      ct: 'group-encrypted',
      groupKeyId: 'team-alpha',
      ts: new Date().toISOString(),
      id: 'group-int-001',
    }

    await room.webSocketMessage(aliceWs, JSON.stringify({ type: 'relay:send', envelope }))

    expect(lastMessage(aliceWs).type).toBe('relay:ack')
    const bobDelivers = parseSent(bobWs).filter(m => m.type === 'relay:deliver')
    expect(bobDelivers).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Write client integration tests**

In `packages/saga-client-rt/src/__tests__/integration.test.ts`, add:

```typescript
describe('auto key discovery', () => {
  it('sendMessage auto-fetches recipient public key', async () => {
    const aliceKeyRing = await setupKeyRing(ALICE_WALLET_KEY)
    const bobKeyRing = await setupKeyRing(BOB_WALLET_KEY)
    let ws!: MockWebSocket

    // Mock fetch that returns Bob's public key
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          handle: 'bob',
          publicKey: btoa(String.fromCharCode(...bobKeyRing.getPublicKey())),
          entityType: 'agent',
        }),
        { status: 200 }
      )
    )

    const client = createSagaClient({
      hubUrl: 'wss://hub.example.com/v1/relay',
      identity: 'alice@epicflow',
      keyRing: aliceKeyRing,
      signer: createMockSigner(),
      storageBackend: new MemoryBackend(),
      fetchFn: mockFetch,
      createWebSocket: () => {
        ws = new MockWebSocket()
        return ws
      },
    })

    const connectPromise = client.connect()
    await simulateAuthFlow(ws, 'alice')
    ws.simulateMessage({ type: 'mailbox:batch', envelopes: [], remaining: 0 })
    await connectPromise

    // Send message — should auto-fetch Bob's key
    const msgId = await client.sendMessage('bob@epicflow', {
      messageType: 'task-request',
      payload: { task: 'test' },
    })

    expect(msgId).toBeTruthy()
    expect(mockFetch).toHaveBeenCalledWith('https://hub.example.com/v1/keys/bob')

    const sent = ws.allSent<Record<string, unknown>>()
    const relaySend = sent.find(m => m.type === 'relay:send')
    expect(relaySend).toBeDefined()
  })
})
```

- [ ] **Step 3: Run tests to verify they pass**

Run: `cd packages/server && npx vitest run src/__tests__/relay-integration.test.ts`
Run: `cd packages/saga-client-rt && npx vitest run src/__tests__/integration.test.ts`
Expected: All tests pass

- [ ] **Step 4: Run full test suites**

Run: `cd packages/server && npx vitest run`
Run: `cd packages/saga-client-rt && npx vitest run`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/__tests__/relay-integration.test.ts \
  packages/saga-client-rt/src/__tests__/integration.test.ts
git commit -m "test: add integration tests for direct messaging, group fan-out, and auto key discovery"
```
