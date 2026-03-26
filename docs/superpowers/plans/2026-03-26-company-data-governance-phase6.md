# Phase 6: Company Data Governance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable companies to control what data guest agents can store and replicate from their DERPs via a policy engine that classifies memories into org-internal, mutual, or agent-portable scopes.

**Architecture:** Phase 6 adds a client-side Policy Engine that intercepts every `storeMemory()` call, classifying memories against a `CompanyReplicationPolicy`. Classification determines the encryption scope (org-internal uses company key, mutual uses NaCl box with both keys, agent-portable uses agent key) and sync behavior (org-internal stays local, others sync to hub). A Retention Engine runs hourly to enforce TTL and portable limits. The server stores policies per-org via a REST endpoint. A Policy Audit Trail logs every classification decision.

**Tech Stack:** Cloudflare Workers (D1, KV), Hono router, Drizzle ORM, Vitest, `@epicdm/saga-crypto` (SagaKeyRing, seal/open, EncryptedStore, MemoryBackend)

**Depends on:** Phase 5 (PR #18) merged to `dev` — this plan uses migration `0005` and builds on the Phase 5 types.

---

## File Structure

### Client (`packages/saga-client-rt`)

| File                                     | Action | Responsibility                                                                                                                                            |
| ---------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/types.ts`                           | Modify | Add `CompanyReplicationPolicy`, `GovernanceConfig`, `PolicyClassification`, `PolicyAuditEntry`, `MemoryScope`, extend `SagaMemory` and `SagaClientConfig` |
| `src/policy-engine.ts`                   | Create | Pure classification pipeline: memoryTypes → domains → contentPatterns → defaultScope                                                                      |
| `src/retention-engine.ts`                | Create | Timer-based retention enforcement: mutual TTL downgrade, portable limit enforcement                                                                       |
| `src/client.ts`                          | Modify | Wire policy engine into `storeMemory()`, dual-store support, retention timer, audit trail                                                                 |
| `src/index.ts`                           | Modify | Export new types and policy engine                                                                                                                        |
| `src/__tests__/policy-engine.test.ts`    | Create | Classification pipeline unit tests                                                                                                                        |
| `src/__tests__/retention-engine.test.ts` | Create | Retention enforcement tests                                                                                                                               |
| `src/__tests__/client.test.ts`           | Modify | Policy-aware storeMemory tests                                                                                                                            |
| `src/__tests__/integration.test.ts`      | Modify | End-to-end governance flow tests                                                                                                                          |

### Server (`packages/server`)

| File                                   | Action | Responsibility                                    |
| -------------------------------------- | ------ | ------------------------------------------------- |
| `migrations/0005_company_policies.sql` | Create | D1 migration: `replication_policies` table        |
| `src/db/schema.ts`                     | Modify | Add `replicationPolicies` Drizzle schema          |
| `src/routes/policies.ts`               | Create | `GET/PUT /v1/orgs/:orgId/policy` endpoints        |
| `src/index.ts`                         | Modify | Mount `/v1/orgs` policy sub-routes                |
| `src/__tests__/policies.test.ts`       | Create | Policy CRUD endpoint tests                        |
| `src/__tests__/test-helpers.ts`        | Modify | Add replication_policies table to mock migrations |

---

### Task 1: Phase 6 Types

**Files:**

- Modify: `packages/saga-client-rt/src/types.ts`
- Modify: `packages/saga-client-rt/src/index.ts`

**Context:** All Phase 6 types live in saga-client-rt/src/types.ts alongside existing SAGA types. The `SagaMemory` interface gains an optional `scope` field. `SagaClientConfig` gains an optional `governance` field. New types define the policy schema, classification results, and audit entries.

- [ ] **Step 1: Add MemoryScope type and extend SagaMemory**

In `packages/saga-client-rt/src/types.ts`, add after the `SagaMemoryType` definition (line 23):

```typescript
/** Memory encryption/replication scope (Phase 6) */
export type MemoryScope = 'org-internal' | 'mutual' | 'agent-portable'
```

Extend the `SagaMemory` interface (around line 26) to add optional `scope`:

```typescript
export interface SagaMemory {
  id: string
  type: SagaMemoryType
  content: unknown
  metadata?: Record<string, unknown>
  createdAt: string
  updatedAt: string
  /** Encryption/replication scope assigned by policy engine (Phase 6) */
  scope?: MemoryScope
}
```

- [ ] **Step 2: Add CompanyReplicationPolicy type**

In `packages/saga-client-rt/src/types.ts`, add after `MemoryScope`:

```typescript
/** Company data governance policy (Phase 6) */
export interface CompanyReplicationPolicy {
  orgId: string
  defaultScope: MemoryScope
  restricted: {
    contentPatterns?: string[]
    memoryTypes?: SagaMemoryType[]
    domains?: string[]
  }
  retention: {
    mutualTtlDays?: number
    portableLimit?: number
  }
}
```

- [ ] **Step 3: Add PolicyClassification and PolicyAuditEntry types**

In `packages/saga-client-rt/src/types.ts`, add after `CompanyReplicationPolicy`:

```typescript
/** Result of classifying a memory through the policy engine */
export interface PolicyClassification {
  scope: MemoryScope
  reason: string
}

/** Audit log entry for a policy classification decision */
export interface PolicyAuditEntry {
  memoryId: string
  memoryType: SagaMemoryType
  originalScope: MemoryScope | 'unclassified'
  appliedScope: MemoryScope
  reason: string
  timestamp: string
}
```

- [ ] **Step 4: Add GovernanceConfig and extend SagaClientConfig**

In `packages/saga-client-rt/src/types.ts`, add after `PolicyAuditEntry`:

```typescript
/** Governance configuration for company DERPs (Phase 6) */
export interface GovernanceConfig {
  orgId: string
  policy: CompanyReplicationPolicy
  /** Company's unlocked KeyRing for org-internal encryption */
  companyKeyRing: SagaKeyRing
  /** Storage backend for org-internal memories (defaults to MemoryBackend) */
  companyStorageBackend?: StorageBackend
}
```

Extend `SagaClientConfig` by adding after the `createWebSocket` field (around line 91):

```typescript
  /** Company data governance config (Phase 6 — only on company DERPs) */
  governance?: GovernanceConfig
```

- [ ] **Step 5: Update exports in index.ts**

In `packages/saga-client-rt/src/index.ts`, ensure the new types are exported. Read the current file first, then add exports for `MemoryScope`, `CompanyReplicationPolicy`, `PolicyClassification`, `PolicyAuditEntry`, and `GovernanceConfig` to the type re-exports.

- [ ] **Step 6: Run type check**

Run: `cd packages/saga-client-rt && npx tsc --noEmit`
Expected: PASS (no errors — types are only definitions, no implementation yet)

- [ ] **Step 7: Commit**

```bash
git add packages/saga-client-rt/src/types.ts packages/saga-client-rt/src/index.ts
git commit -m "feat(saga-client-rt): add Phase 6 company data governance types"
```

---

### Task 2: Policy Engine — Classification Pipeline

**Files:**

- Create: `packages/saga-client-rt/src/policy-engine.ts`
- Create: `packages/saga-client-rt/src/__tests__/policy-engine.test.ts`

**Context:** The policy engine is a pure function that takes a `SagaMemory` and a `CompanyReplicationPolicy` and returns a `PolicyClassification`. The classification pipeline checks restrictions in order: (1) memoryTypes, (2) domains (checked against `memory.metadata.domain`), (3) contentPatterns (regex match against JSON-serialized content). If any restriction matches, scope is `org-internal`. Otherwise, `defaultScope` applies.

- [ ] **Step 1: Write failing tests for the classification pipeline**

Create `packages/saga-client-rt/src/__tests__/policy-engine.test.ts`:

```typescript
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { describe, expect, it } from 'vitest'
import { classifyMemory } from '../policy-engine'
import type { CompanyReplicationPolicy, SagaMemory } from '../types'

function makePolicy(overrides?: Partial<CompanyReplicationPolicy>): CompanyReplicationPolicy {
  return {
    orgId: 'acme-corp',
    defaultScope: 'agent-portable',
    restricted: {},
    retention: {},
    ...overrides,
  }
}

function makeMemory(overrides?: Partial<SagaMemory>): SagaMemory {
  return {
    id: 'mem-1',
    type: 'episodic',
    content: { text: 'learned something' },
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('classifyMemory', () => {
  it('returns defaultScope when no restrictions match', () => {
    const result = classifyMemory(makeMemory(), makePolicy())
    expect(result.scope).toBe('agent-portable')
    expect(result.reason).toContain('default')
  })

  it('returns org-internal when memory type is restricted', () => {
    const policy = makePolicy({
      restricted: { memoryTypes: ['procedural'] },
    })
    const memory = makeMemory({ type: 'procedural' })
    const result = classifyMemory(memory, policy)
    expect(result.scope).toBe('org-internal')
    expect(result.reason).toContain('memoryType')
  })

  it('does not restrict non-matching memory types', () => {
    const policy = makePolicy({
      restricted: { memoryTypes: ['procedural'] },
    })
    const memory = makeMemory({ type: 'episodic' })
    const result = classifyMemory(memory, policy)
    expect(result.scope).toBe('agent-portable')
  })

  it('returns org-internal when domain is restricted', () => {
    const policy = makePolicy({
      restricted: { domains: ['finance', 'legal'] },
    })
    const memory = makeMemory({ metadata: { domain: 'finance' } })
    const result = classifyMemory(memory, policy)
    expect(result.scope).toBe('org-internal')
    expect(result.reason).toContain('domain')
  })

  it('does not restrict when memory has no domain metadata', () => {
    const policy = makePolicy({
      restricted: { domains: ['finance'] },
    })
    const memory = makeMemory() // no metadata.domain
    const result = classifyMemory(memory, policy)
    expect(result.scope).toBe('agent-portable')
  })

  it('returns org-internal when content matches a restricted pattern', () => {
    const policy = makePolicy({
      restricted: { contentPatterns: ['confidential', 'secret\\s+project'] },
    })
    const memory = makeMemory({ content: { text: 'this is confidential data' } })
    const result = classifyMemory(memory, policy)
    expect(result.scope).toBe('org-internal')
    expect(result.reason).toContain('contentPattern')
  })

  it('does not restrict when content does not match patterns', () => {
    const policy = makePolicy({
      restricted: { contentPatterns: ['confidential'] },
    })
    const memory = makeMemory({ content: { text: 'public info' } })
    const result = classifyMemory(memory, policy)
    expect(result.scope).toBe('agent-portable')
  })

  it('checks restrictions in priority order: memoryType > domain > contentPattern', () => {
    const policy = makePolicy({
      restricted: {
        memoryTypes: ['procedural'],
        domains: ['finance'],
        contentPatterns: ['secret'],
      },
    })
    // Matches memoryType — reason should say memoryType, not domain or pattern
    const memory = makeMemory({
      type: 'procedural',
      metadata: { domain: 'finance' },
      content: { text: 'secret' },
    })
    const result = classifyMemory(memory, policy)
    expect(result.scope).toBe('org-internal')
    expect(result.reason).toContain('memoryType')
  })

  it('uses mutual as defaultScope when configured', () => {
    const policy = makePolicy({ defaultScope: 'mutual' })
    const result = classifyMemory(makeMemory(), policy)
    expect(result.scope).toBe('mutual')
  })

  it('handles empty restricted object gracefully', () => {
    const policy = makePolicy({ restricted: {} })
    const result = classifyMemory(makeMemory(), policy)
    expect(result.scope).toBe('agent-portable')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/saga-client-rt && npx vitest run src/__tests__/policy-engine.test.ts`
Expected: FAIL — `classifyMemory` not found

- [ ] **Step 3: Implement the policy engine**

Create `packages/saga-client-rt/src/policy-engine.ts`:

```typescript
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import type { CompanyReplicationPolicy, PolicyClassification, SagaMemory } from './types'

/**
 * Classify a memory against a company replication policy.
 *
 * Pipeline checks restrictions in order:
 * 1. memoryTypes — if memory.type matches a restricted type → org-internal
 * 2. domains — if memory.metadata.domain matches a restricted domain → org-internal
 * 3. contentPatterns — if serialized content matches a restricted regex → org-internal
 * 4. No match → apply policy.defaultScope
 */
export function classifyMemory(
  memory: SagaMemory,
  policy: CompanyReplicationPolicy
): PolicyClassification {
  const { restricted, defaultScope } = policy

  // 1. Check restricted memory types
  if (restricted.memoryTypes && restricted.memoryTypes.includes(memory.type)) {
    return {
      scope: 'org-internal',
      reason: `memoryType '${memory.type}' is restricted`,
    }
  }

  // 2. Check restricted domains
  if (restricted.domains && restricted.domains.length > 0) {
    const domain = (memory.metadata as Record<string, unknown> | undefined)?.domain
    if (typeof domain === 'string' && restricted.domains.includes(domain)) {
      return {
        scope: 'org-internal',
        reason: `domain '${domain}' is restricted`,
      }
    }
  }

  // 3. Check restricted content patterns
  if (restricted.contentPatterns && restricted.contentPatterns.length > 0) {
    const serialized = JSON.stringify(memory.content)
    for (const pattern of restricted.contentPatterns) {
      if (new RegExp(pattern, 'i').test(serialized)) {
        return {
          scope: 'org-internal',
          reason: `contentPattern '${pattern}' matched`,
        }
      }
    }
  }

  // 4. No restriction matched — apply default scope
  return {
    scope: defaultScope,
    reason: `default scope '${defaultScope}'`,
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/saga-client-rt && npx vitest run src/__tests__/policy-engine.test.ts`
Expected: PASS (9 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/saga-client-rt/src/policy-engine.ts packages/saga-client-rt/src/__tests__/policy-engine.test.ts
git commit -m "feat(saga-client-rt): add policy engine classification pipeline"
```

---

### Task 3: Server — Policy Storage Endpoint

**Files:**

- Create: `packages/server/migrations/0005_company_policies.sql`
- Modify: `packages/server/src/db/schema.ts`
- Create: `packages/server/src/routes/policies.ts`
- Modify: `packages/server/src/index.ts`
- Create: `packages/server/src/__tests__/policies.test.ts`
- Modify: `packages/server/src/__tests__/test-helpers.ts`

**Context:** The server stores one `CompanyReplicationPolicy` JSON document per org. The policy is set by an authenticated org admin (`PUT /v1/orgs/:orgId/policy`) and read by any authenticated client (`GET /v1/orgs/:orgId/policy`). The GET endpoint is authenticated because policies contain sensitive business rules. The new D1 table `replication_policies` has `org_id` (PK), `policy_json` (TEXT), and `updated_at`.

- [ ] **Step 1: Write the D1 migration**

Create `packages/server/migrations/0005_company_policies.sql`:

```sql
-- SPDX-License-Identifier: Apache-2.0
-- Copyright 2026 d7r LLC

-- Phase 6: Company Data Governance
-- Replication policy storage per organization

CREATE TABLE IF NOT EXISTS replication_policies (
  org_id TEXT PRIMARY KEY,
  policy_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

- [ ] **Step 2: Add Drizzle schema definition**

In `packages/server/src/db/schema.ts`, add after the existing table definitions:

```typescript
export const replicationPolicies = sqliteTable('replication_policies', {
  orgId: text('org_id').primaryKey(),
  policyJson: text('policy_json').notNull(),
  updatedAt: text('updated_at').notNull(),
})
```

- [ ] **Step 3: Update test-helpers.ts to include new migration**

In `packages/server/src/__tests__/test-helpers.ts`, find the `runMigrations` function and add the new migration SQL. Read the file first. Add to the migrations array:

```sql
CREATE TABLE IF NOT EXISTS replication_policies (
  org_id TEXT PRIMARY KEY,
  policy_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

- [ ] **Step 4: Write failing tests for policy endpoints**

Create `packages/server/src/__tests__/policies.test.ts`:

```typescript
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { beforeEach, describe, expect, it } from 'vitest'
import { app } from '../index'
import { createMockD1, createMockKV, runMigrations } from './test-helpers'
import type { Env } from '../bindings'

const TEST_TOKEN = 'test-session-token'

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

function authHeaders(): Record<string, string> {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${TEST_TOKEN}` }
}

describe('Policy management API', () => {
  let db: D1Database
  let env: Env

  beforeEach(async () => {
    db = createMockD1()
    await runMigrations(db)
    env = createTestEnv(db)
    await (env.SESSIONS as KVNamespace).put(
      TEST_TOKEN,
      JSON.stringify({
        walletAddress: '0xtest',
        chain: 'eip155:8453',
        expiresAt: new Date(Date.now() + 3600_000).toISOString(),
      })
    )
  })

  it('GET /v1/orgs/:orgId/policy returns 404 when no policy exists', async () => {
    const res = await app.request('/v1/orgs/acme-corp/policy', { headers: authHeaders() }, env)
    expect(res.status).toBe(404)
  })

  it('PUT /v1/orgs/:orgId/policy stores a policy', async () => {
    const policy = {
      orgId: 'acme-corp',
      defaultScope: 'mutual',
      restricted: { memoryTypes: ['procedural'] },
      retention: { mutualTtlDays: 90 },
    }
    const res = await app.request(
      '/v1/orgs/acme-corp/policy',
      {
        method: 'PUT',
        body: JSON.stringify(policy),
        headers: authHeaders(),
      },
      env
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.orgId).toBe('acme-corp')
  })

  it('GET /v1/orgs/:orgId/policy returns stored policy', async () => {
    const policy = {
      orgId: 'acme-corp',
      defaultScope: 'agent-portable',
      restricted: { domains: ['finance'] },
      retention: {},
    }
    await app.request(
      '/v1/orgs/acme-corp/policy',
      {
        method: 'PUT',
        body: JSON.stringify(policy),
        headers: authHeaders(),
      },
      env
    )

    const res = await app.request('/v1/orgs/acme-corp/policy', { headers: authHeaders() }, env)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.policy.defaultScope).toBe('agent-portable')
    expect(body.policy.restricted.domains).toEqual(['finance'])
  })

  it('PUT /v1/orgs/:orgId/policy updates existing policy', async () => {
    const policy1 = {
      orgId: 'acme-corp',
      defaultScope: 'mutual',
      restricted: {},
      retention: {},
    }
    await app.request(
      '/v1/orgs/acme-corp/policy',
      {
        method: 'PUT',
        body: JSON.stringify(policy1),
        headers: authHeaders(),
      },
      env
    )

    const policy2 = {
      orgId: 'acme-corp',
      defaultScope: 'org-internal',
      restricted: { contentPatterns: ['confidential'] },
      retention: { portableLimit: 100 },
    }
    await app.request(
      '/v1/orgs/acme-corp/policy',
      {
        method: 'PUT',
        body: JSON.stringify(policy2),
        headers: authHeaders(),
      },
      env
    )

    const res = await app.request('/v1/orgs/acme-corp/policy', { headers: authHeaders() }, env)
    const body = await res.json()
    expect(body.policy.defaultScope).toBe('org-internal')
    expect(body.policy.restricted.contentPatterns).toEqual(['confidential'])
  })

  it('PUT /v1/orgs/:orgId/policy rejects unauthenticated requests', async () => {
    const res = await app.request(
      '/v1/orgs/acme-corp/policy',
      {
        method: 'PUT',
        body: JSON.stringify({
          orgId: 'acme-corp',
          defaultScope: 'mutual',
          restricted: {},
          retention: {},
        }),
        headers: { 'Content-Type': 'application/json' },
      },
      env
    )
    expect(res.status).toBe(401)
  })

  it('PUT /v1/orgs/:orgId/policy validates required fields', async () => {
    const res = await app.request(
      '/v1/orgs/acme-corp/policy',
      {
        method: 'PUT',
        body: JSON.stringify({ orgId: 'acme-corp' }), // missing defaultScope, restricted, retention
        headers: authHeaders(),
      },
      env
    )
    expect(res.status).toBe(400)
  })
})
```

- [ ] **Step 5: Run tests to verify they fail**

Run: `cd packages/server && npx vitest run src/__tests__/policies.test.ts`
Expected: FAIL — routes not implemented

- [ ] **Step 6: Implement the policy routes**

Create `packages/server/src/routes/policies.ts`:

```typescript
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { Hono } from 'hono'
import { drizzle } from 'drizzle-orm/d1'
import { eq } from 'drizzle-orm'
import type { Env } from '../bindings'
import { replicationPolicies } from '../db/schema'
import { requireAuth } from '../middleware/auth'

export const policyRoutes = new Hono<{ Bindings: Env }>()

/** GET /v1/orgs/:orgId/policy — Retrieve the replication policy for an org */
policyRoutes.get('/:orgId/policy', requireAuth, async c => {
  const orgId = c.req.param('orgId') as string
  const db = drizzle(c.env.DB)

  const rows = await db
    .select()
    .from(replicationPolicies)
    .where(eq(replicationPolicies.orgId, orgId))
    .limit(1)

  if (rows.length === 0) {
    return c.json({ error: 'No policy found for this organization', code: 'NOT_FOUND' }, 404)
  }

  return c.json({ policy: JSON.parse(rows[0].policyJson) })
})

/** PUT /v1/orgs/:orgId/policy — Create or update the replication policy */
policyRoutes.put('/:orgId/policy', requireAuth, async c => {
  const orgId = c.req.param('orgId') as string
  const body = await c.req.json<{
    orgId?: string
    defaultScope?: string
    restricted?: unknown
    retention?: unknown
  }>()

  if (!body.defaultScope || !body.restricted || !body.retention) {
    return c.json(
      { error: 'defaultScope, restricted, and retention are required', code: 'INVALID_REQUEST' },
      400
    )
  }

  const policy = { ...body, orgId }
  const now = new Date().toISOString()

  await c.env.DB.prepare(
    `INSERT OR REPLACE INTO replication_policies (org_id, policy_json, updated_at) VALUES (?, ?, ?)`
  )
    .bind(orgId, JSON.stringify(policy), now)
    .run()

  return c.json({ orgId, updatedAt: now })
})
```

- [ ] **Step 7: Mount the policy routes in index.ts**

In `packages/server/src/index.ts`:

Add import:

```typescript
import { policyRoutes } from './routes/policies'
```

Add route mount after the existing `app.route('/v1/orgs', orgRoutes)` line:

```typescript
app.route('/v1/orgs', policyRoutes)
```

Add `policies` to the endpoints list in the root JSON response:

```typescript
policies: '/v1/orgs/:orgId/policy',
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `cd packages/server && npx vitest run src/__tests__/policies.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 9: Run full server test suite to check for regressions**

Run: `cd packages/server && npx vitest run`
Expected: All tests pass (173+ existing + 6 new)

- [ ] **Step 10: Commit**

```bash
git add packages/server/migrations/0005_company_policies.sql packages/server/src/db/schema.ts packages/server/src/routes/policies.ts packages/server/src/index.ts packages/server/src/__tests__/policies.test.ts packages/server/src/__tests__/test-helpers.ts
git commit -m "feat(server): add replication policy storage endpoints for Phase 6"
```

---

### Task 4: Scope-Aware storeMemory

**Files:**

- Modify: `packages/saga-client-rt/src/client.ts`
- Modify: `packages/saga-client-rt/src/__tests__/client.test.ts`

**Context:** When `governance` is present in the client config, `storeMemory()` runs the policy engine before storing. Based on the classified scope:

- **org-internal**: Encrypt with company's KeyRing (`seal` with private scope using company key), store in company's encrypted store. Do NOT sync to hub.
- **mutual**: Encrypt with mutual scope (agent + company), store in agent's encrypted store, sync to hub.
- **agent-portable**: Encrypt with private scope (agent only), store in agent's encrypted store, sync to hub (same as current behavior).

Without `governance`, `storeMemory()` behaves exactly as before (backward-compatible).

The client also adds a `queryMemory()` enhancement: when governance is active, query both the agent's store and the company's store, merging results.

- [ ] **Step 1: Write failing tests for governed storeMemory**

In `packages/saga-client-rt/src/__tests__/client.test.ts`, add a new `describe('governance — storeMemory', ...)` block after the existing `describe('group key distribution', ...)` block:

```typescript
describe('governance — storeMemory', () => {
  beforeEach(async () => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    const crypto = vi.mocked(await import('@epicdm/saga-crypto'))
    ;(crypto as unknown as { _mockStore: { _data: Map<string, unknown> } })._mockStore._data.clear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('stores org-internal memory in company store only and does not sync', async () => {
    const companyStoreData = new Map<string, unknown>()
    const mockCompanyKeyRing = {
      isUnlocked: true,
      getPublicKey: () => new Uint8Array(32).fill(99),
      hasGroupKey: vi.fn().mockReturnValue(false),
    } as unknown as SagaClientConfig['keyRing']

    const { config, getWs } = createTestConfig({
      governance: {
        orgId: 'acme-corp',
        policy: {
          orgId: 'acme-corp',
          defaultScope: 'agent-portable',
          restricted: { memoryTypes: ['procedural'] },
          retention: {},
        },
        companyKeyRing: mockCompanyKeyRing,
      },
    })

    const { client, ws } = await connectClient(config, getWs)

    const memory: SagaMemory = {
      id: 'mem-restricted',
      type: 'procedural',
      content: { steps: ['do this'] },
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    }

    await client.storeMemory(memory)

    // Should NOT have sent a relay:send for this memory (no sync)
    const sent = ws.allSent<Record<string, unknown>>()
    const relaySends = sent.filter(m => m.type === 'relay:send')
    const memorySyncs = relaySends.filter(m => {
      const env = m.envelope as Record<string, unknown> | undefined
      return env?.type === 'memory-sync'
    })
    expect(memorySyncs).toHaveLength(0)
  })

  it('stores agent-portable memory in agent store and syncs to hub', async () => {
    const { config, getWs } = createTestConfig({
      governance: {
        orgId: 'acme-corp',
        policy: {
          orgId: 'acme-corp',
          defaultScope: 'agent-portable',
          restricted: { memoryTypes: ['procedural'] },
          retention: {},
        },
        companyKeyRing: {
          isUnlocked: true,
          getPublicKey: () => new Uint8Array(32).fill(99),
          hasGroupKey: vi.fn().mockReturnValue(false),
        } as unknown as SagaClientConfig['keyRing'],
      },
    })

    const { client, ws } = await connectClient(config, getWs)

    const memory: SagaMemory = {
      id: 'mem-portable',
      type: 'episodic',
      content: { text: 'general learning' },
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    }

    await client.storeMemory(memory)

    // Should have synced (relay:send with memory-sync)
    const sent = ws.allSent<Record<string, unknown>>()
    const relaySends = sent.filter(m => m.type === 'relay:send')
    const memorySyncs = relaySends.filter(m => {
      const env = m.envelope as Record<string, unknown> | undefined
      return env?.type === 'memory-sync'
    })
    expect(memorySyncs.length).toBeGreaterThan(0)
  })

  it('behaves normally without governance config', async () => {
    const { config, getWs } = createTestConfig() // no governance
    const { client, ws } = await connectClient(config, getWs)

    const memory: SagaMemory = {
      id: 'mem-normal',
      type: 'procedural',
      content: { steps: ['do this'] },
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    }

    await client.storeMemory(memory)

    // Should sync as before
    const sent = ws.allSent<Record<string, unknown>>()
    const relaySends = sent.filter(m => m.type === 'relay:send')
    expect(relaySends.length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/saga-client-rt && npx vitest run src/__tests__/client.test.ts`
Expected: FAIL on the new governance tests (governance config not wired up yet)

- [ ] **Step 3: Implement governance-aware storeMemory in client.ts**

Read the current `packages/saga-client-rt/src/client.ts` first, then make these changes:

1. Add imports at the top:

```typescript
import { classifyMemory } from './policy-engine'
```

2. After the `const store = createEncryptedStore(config.keyRing, backend)` line, add company store setup:

```typescript
// Phase 6: Company governance store (org-internal memories)
const companyBackend =
  config.governance?.companyStorageBackend ?? (config.governance ? new MemoryBackend() : undefined)
const companyStore =
  config.governance && companyBackend
    ? createEncryptedStore(config.governance.companyKeyRing, companyBackend)
    : undefined
```

3. Replace the `storeMemory` method body. The current implementation is:

```typescript
async storeMemory(memory: SagaMemory): Promise<void> {
  await store.put(`memory:${memory.id}`, memory)
  const plaintext = new TextEncoder().encode(JSON.stringify(memory))
  const envelope = await seal(
    { type: 'memory-sync', scope: 'private', from: config.identity, to: config.identity, plaintext },
    config.keyRing
  )
  connection.send(envelope as SagaEncryptedEnvelope)
},
```

Replace with:

```typescript
async storeMemory(memory: SagaMemory): Promise<void> {
  // Phase 6: Policy engine classification
  if (config.governance && companyStore) {
    const classification = classifyMemory(memory, config.governance.policy)
    const classified = { ...memory, scope: classification.scope }

    // Log audit entry
    const auditEntry = {
      memoryId: memory.id,
      memoryType: memory.type,
      originalScope: (memory.scope ?? 'unclassified') as string,
      appliedScope: classification.scope,
      reason: classification.reason,
      timestamp: new Date().toISOString(),
    }
    await store.put(`audit:${memory.id}`, auditEntry)

    if (classification.scope === 'org-internal') {
      // Org-internal: company store only, no sync
      await companyStore.put(`memory:${memory.id}`, classified)
      return
    }

    // mutual or agent-portable: agent store + sync
    await store.put(`memory:${memory.id}`, classified)

    const plaintext = new TextEncoder().encode(JSON.stringify(classified))
    const sealScope = classification.scope === 'mutual' ? 'mutual' : 'private'
    const sealPayload: Record<string, unknown> = {
      type: 'memory-sync',
      scope: sealScope,
      from: config.identity,
      to: config.identity,
      plaintext,
    }
    if (sealScope === 'mutual') {
      sealPayload.recipientPublicKey = config.governance.companyKeyRing.getPublicKey()
    }
    const envelope = await seal(sealPayload as Parameters<typeof seal>[0], config.keyRing)
    connection.send(envelope as SagaEncryptedEnvelope)
    return
  }

  // No governance — original behavior
  await store.put(`memory:${memory.id}`, memory)
  const plaintext = new TextEncoder().encode(JSON.stringify(memory))
  const envelope = await seal(
    { type: 'memory-sync', scope: 'private', from: config.identity, to: config.identity, plaintext },
    config.keyRing
  )
  connection.send(envelope as SagaEncryptedEnvelope)
},
```

4. Update `queryMemory` to merge from both stores when governance is active. After the existing `const entries = await store.query(...)` line, add company store query:

```typescript
async queryMemory(filter: MemoryFilter): Promise<SagaMemory[]> {
  const entries = await store.query({ prefix: 'memory:' })
  let results = entries.map(e => e.value as SagaMemory)

  // Phase 6: Merge org-internal memories from company store
  if (companyStore) {
    const companyEntries = await companyStore.query({ prefix: 'memory:' })
    const companyMemories = companyEntries.map(e => e.value as SagaMemory)
    results = [...results, ...companyMemories]
  }

  if (filter.type) {
    results = results.filter(m => m.type === filter.type)
  }
  if (filter.since) {
    const since = filter.since
    results = results.filter(m => m.createdAt >= since)
  }
  if (filter.prefix) {
    const prefix = filter.prefix
    results = results.filter(m => m.id.startsWith(prefix))
  }
  if (filter.limit !== undefined) {
    results = results.slice(0, filter.limit)
  }

  return results
},
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/saga-client-rt && npx vitest run src/__tests__/client.test.ts`
Expected: All tests pass (existing + 3 new governance tests)

- [ ] **Step 5: Commit**

```bash
git add packages/saga-client-rt/src/client.ts packages/saga-client-rt/src/__tests__/client.test.ts
git commit -m "feat(saga-client-rt): wire policy engine into storeMemory with dual-store support"
```

---

### Task 5: Retention Engine

**Files:**

- Create: `packages/saga-client-rt/src/retention-engine.ts`
- Create: `packages/saga-client-rt/src/__tests__/retention-engine.test.ts`

**Context:** The retention engine enforces two rules from `CompanyReplicationPolicy.retention`:

1. `mutualTtlDays`: Mutual memories older than TTL days are reclassified to `org-internal` (moved from agent store to company store, audit logged).
2. `portableLimit`: If the count of `agent-portable` memories exceeds this limit, the oldest are downgraded to `mutual`.

The engine exposes a `runRetention()` function that takes the stores, policy, and a callback for logging audit entries. It returns counts of reclassified memories.

- [ ] **Step 1: Write failing tests for the retention engine**

Create `packages/saga-client-rt/src/__tests__/retention-engine.test.ts`:

```typescript
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runRetention } from '../retention-engine'
import type { CompanyReplicationPolicy, SagaMemory } from '../types'

interface MockStore {
  _data: Map<string, unknown>
  put(key: string, value: unknown): Promise<void>
  get<T = unknown>(key: string): Promise<T | null>
  delete(key: string): Promise<void>
  query(filter: { prefix?: string }): Promise<Array<{ key: string; value: unknown }>>
}

function createMockStore(): MockStore {
  const data = new Map<string, unknown>()
  return {
    _data: data,
    async put(key: string, value: unknown) {
      data.set(key, value)
    },
    async get<T = unknown>(key: string): Promise<T | null> {
      return (data.get(key) as T) ?? null
    },
    async delete(key: string) {
      data.delete(key)
    },
    async query(filter: { prefix?: string }) {
      const entries: Array<{ key: string; value: unknown }> = []
      for (const [key, value] of data) {
        if (!filter.prefix || key.startsWith(filter.prefix)) {
          entries.push({ key, value })
        }
      }
      return entries
    },
  }
}

function makeMemory(overrides: Partial<SagaMemory>): SagaMemory {
  return {
    id: 'mem-1',
    type: 'episodic',
    content: 'test',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('runRetention', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-01T00:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('reclassifies mutual memories older than mutualTtlDays to org-internal', async () => {
    const agentStore = createMockStore()
    const companyStore = createMockStore()
    const auditFn = vi.fn()

    // Mutual memory created 100 days ago
    const oldMemory = makeMemory({
      id: 'mem-old-mutual',
      scope: 'mutual',
      createdAt: '2026-02-01T00:00:00Z',
    })
    agentStore._data.set('memory:mem-old-mutual', oldMemory)

    // Mutual memory created 10 days ago (within TTL)
    const recentMemory = makeMemory({
      id: 'mem-recent-mutual',
      scope: 'mutual',
      createdAt: '2026-05-22T00:00:00Z',
    })
    agentStore._data.set('memory:mem-recent-mutual', recentMemory)

    const policy: CompanyReplicationPolicy = {
      orgId: 'acme',
      defaultScope: 'mutual',
      restricted: {},
      retention: { mutualTtlDays: 90 },
    }

    const result = await runRetention(agentStore, companyStore, policy, auditFn)

    expect(result.mutualDowngraded).toBe(1)
    // Old memory moved to company store
    expect(companyStore._data.has('memory:mem-old-mutual')).toBe(true)
    expect(agentStore._data.has('memory:mem-old-mutual')).toBe(false)
    // Recent memory stays
    expect(agentStore._data.has('memory:mem-recent-mutual')).toBe(true)
    // Audit logged
    expect(auditFn).toHaveBeenCalledTimes(1)
    expect(auditFn).toHaveBeenCalledWith(
      expect.objectContaining({
        memoryId: 'mem-old-mutual',
        appliedScope: 'org-internal',
      })
    )
  })

  it('downgrades oldest portable memories when portableLimit exceeded', async () => {
    const agentStore = createMockStore()
    const companyStore = createMockStore()
    const auditFn = vi.fn()

    // 5 portable memories, limit is 3
    for (let i = 1; i <= 5; i++) {
      agentStore._data.set(
        `memory:mem-p${i}`,
        makeMemory({
          id: `mem-p${i}`,
          scope: 'agent-portable',
          createdAt: `2026-05-0${i}T00:00:00Z`,
        })
      )
    }

    const policy: CompanyReplicationPolicy = {
      orgId: 'acme',
      defaultScope: 'agent-portable',
      restricted: {},
      retention: { portableLimit: 3 },
    }

    const result = await runRetention(agentStore, companyStore, policy, auditFn)

    expect(result.portableDowngraded).toBe(2) // 5 - 3 = 2 downgraded
    // Oldest 2 should be downgraded to mutual (still in agent store)
    const remaining = await agentStore.query({ prefix: 'memory:' })
    const portableRemaining = remaining
      .map(e => e.value as SagaMemory)
      .filter(m => m.scope === 'agent-portable')
    expect(portableRemaining).toHaveLength(3)
    // Downgraded ones should now be mutual
    const mutualMemories = remaining
      .map(e => e.value as SagaMemory)
      .filter(m => m.scope === 'mutual')
    expect(mutualMemories).toHaveLength(2)
    expect(auditFn).toHaveBeenCalledTimes(2)
  })

  it('does nothing when no retention rules are set', async () => {
    const agentStore = createMockStore()
    const companyStore = createMockStore()
    const auditFn = vi.fn()

    agentStore._data.set('memory:mem-1', makeMemory({ id: 'mem-1', scope: 'mutual' }))

    const policy: CompanyReplicationPolicy = {
      orgId: 'acme',
      defaultScope: 'mutual',
      restricted: {},
      retention: {},
    }

    const result = await runRetention(agentStore, companyStore, policy, auditFn)

    expect(result.mutualDowngraded).toBe(0)
    expect(result.portableDowngraded).toBe(0)
    expect(auditFn).not.toHaveBeenCalled()
  })

  it('skips non-memory entries in the store', async () => {
    const agentStore = createMockStore()
    const companyStore = createMockStore()
    const auditFn = vi.fn()

    agentStore._data.set('checkpoint:sync', { checkpoint: '2026-01-01T00:00:00Z' })
    agentStore._data.set('audit:mem-1', { memoryId: 'mem-1' })
    agentStore._data.set(
      'memory:mem-1',
      makeMemory({ id: 'mem-1', scope: 'mutual', createdAt: '2026-01-01T00:00:00Z' })
    )

    const policy: CompanyReplicationPolicy = {
      orgId: 'acme',
      defaultScope: 'mutual',
      restricted: {},
      retention: { mutualTtlDays: 30 },
    }

    const result = await runRetention(agentStore, companyStore, policy, auditFn)
    expect(result.mutualDowngraded).toBe(1)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/saga-client-rt && npx vitest run src/__tests__/retention-engine.test.ts`
Expected: FAIL — `runRetention` not found

- [ ] **Step 3: Implement the retention engine**

Create `packages/saga-client-rt/src/retention-engine.ts`:

```typescript
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import type { CompanyReplicationPolicy, PolicyAuditEntry, SagaMemory } from './types'
import type { EncryptedStore } from '@epicdm/saga-crypto'

export interface RetentionResult {
  mutualDowngraded: number
  portableDowngraded: number
}

/**
 * Run retention enforcement against stored memories.
 *
 * 1. mutualTtlDays: mutual memories older than TTL → reclassify to org-internal
 *    (move from agent store to company store)
 * 2. portableLimit: if portable count exceeds limit, oldest are downgraded to mutual
 */
export async function runRetention(
  agentStore: EncryptedStore,
  companyStore: EncryptedStore,
  policy: CompanyReplicationPolicy,
  logAudit: (entry: PolicyAuditEntry) => void
): Promise<RetentionResult> {
  let mutualDowngraded = 0
  let portableDowngraded = 0

  const entries = await agentStore.query({ prefix: 'memory:' })
  const memories = entries.map(e => e.value as SagaMemory)

  // 1. Mutual TTL enforcement
  if (policy.retention.mutualTtlDays !== undefined) {
    const ttlMs = policy.retention.mutualTtlDays * 24 * 60 * 60 * 1000
    const cutoff = new Date(Date.now() - ttlMs).toISOString()

    const expiredMutual = memories.filter(m => m.scope === 'mutual' && m.createdAt < cutoff)

    for (const memory of expiredMutual) {
      const reclassified = { ...memory, scope: 'org-internal' as const }
      await companyStore.put(`memory:${memory.id}`, reclassified)
      await agentStore.delete(`memory:${memory.id}`)
      logAudit({
        memoryId: memory.id,
        memoryType: memory.type,
        originalScope: 'mutual',
        appliedScope: 'org-internal',
        reason: `mutual TTL exceeded (${policy.retention.mutualTtlDays} days)`,
        timestamp: new Date().toISOString(),
      })
      mutualDowngraded++
    }
  }

  // 2. Portable limit enforcement
  if (policy.retention.portableLimit !== undefined) {
    // Re-query to get current state after mutual downgrade
    const currentEntries = await agentStore.query({ prefix: 'memory:' })
    const currentMemories = currentEntries.map(e => e.value as SagaMemory)

    const portableMemories = currentMemories
      .filter(m => m.scope === 'agent-portable')
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt)) // oldest first

    const excess = portableMemories.length - policy.retention.portableLimit
    if (excess > 0) {
      const toDowngrade = portableMemories.slice(0, excess)
      for (const memory of toDowngrade) {
        const downgraded = { ...memory, scope: 'mutual' as const }
        await agentStore.put(`memory:${memory.id}`, downgraded)
        logAudit({
          memoryId: memory.id,
          memoryType: memory.type,
          originalScope: 'agent-portable',
          appliedScope: 'mutual',
          reason: `portable limit exceeded (${portableMemories.length}/${policy.retention.portableLimit})`,
          timestamp: new Date().toISOString(),
        })
        portableDowngraded++
      }
    }
  }

  return { mutualDowngraded, portableDowngraded }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/saga-client-rt && npx vitest run src/__tests__/retention-engine.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Wire retention timer into client.ts**

In `packages/saga-client-rt/src/client.ts`:

1. Add import:

```typescript
import { runRetention } from './retention-engine'
```

2. After the `const dedupCleanupInterval = setInterval(...)` line, add the retention timer:

```typescript
// Phase 6: Retention enforcement timer (runs hourly when governance is active)
const retentionInterval =
  config.governance && companyStore
    ? setInterval(
        async () => {
          try {
            await runRetention(store, companyStore, config.governance!.policy, entry => {
              store.put(`audit:${entry.memoryId}:retention`, entry).catch(() => {})
            })
          } catch {
            // Retention run failed — will retry next interval
          }
        },
        60 * 60 * 1000
      )
    : undefined
```

3. In the `disconnect()` method, clear the retention timer:

```typescript
async disconnect(): Promise<void> {
  clearInterval(dedupCleanupInterval)
  if (retentionInterval) clearInterval(retentionInterval)
  connection.disconnect()
},
```

- [ ] **Step 6: Run full client test suite**

Run: `cd packages/saga-client-rt && npx vitest run`
Expected: All tests pass

- [ ] **Step 7: Commit**

```bash
git add packages/saga-client-rt/src/retention-engine.ts packages/saga-client-rt/src/__tests__/retention-engine.test.ts packages/saga-client-rt/src/client.ts
git commit -m "feat(saga-client-rt): add retention engine with mutual TTL and portable limit enforcement"
```

---

### Task 6: Policy Audit Trail

**Files:**

- Modify: `packages/saga-client-rt/src/client.ts` (already partially done in Task 4)
- Modify: `packages/saga-client-rt/src/__tests__/client.test.ts`

**Context:** The audit trail was partially wired in Task 4 (storeMemory logs `audit:{memoryId}` entries) and Task 5 (retention logs `audit:{memoryId}:retention` entries). This task adds a `queryAuditLog()` method to the `SagaClient` interface so company admins can retrieve classification decisions.

- [ ] **Step 1: Add queryAuditLog to SagaClient interface**

In `packages/saga-client-rt/src/types.ts`, add to the `SagaClient` interface after the `deleteMemory` method:

```typescript
  /** Query policy audit trail entries (Phase 6 — governance only) */
  queryAuditLog(filter?: { since?: string; limit?: number }): Promise<PolicyAuditEntry[]>
```

- [ ] **Step 2: Write failing tests for queryAuditLog**

In `packages/saga-client-rt/src/__tests__/client.test.ts`, add to the `describe('governance — storeMemory', ...)` block:

```typescript
it('logs audit entries for classified memories', async () => {
  const { config, getWs } = createTestConfig({
    governance: {
      orgId: 'acme-corp',
      policy: {
        orgId: 'acme-corp',
        defaultScope: 'agent-portable',
        restricted: { memoryTypes: ['procedural'] },
        retention: {},
      },
      companyKeyRing: {
        isUnlocked: true,
        getPublicKey: () => new Uint8Array(32).fill(99),
        hasGroupKey: vi.fn().mockReturnValue(false),
      } as unknown as SagaClientConfig['keyRing'],
    },
  })

  const { client } = await connectClient(config, getWs)

  await client.storeMemory({
    id: 'mem-audited',
    type: 'procedural',
    content: { steps: ['step 1'] },
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  })

  const auditLog = await client.queryAuditLog()
  expect(auditLog.length).toBeGreaterThanOrEqual(1)
  const entry = auditLog.find(e => e.memoryId === 'mem-audited')
  expect(entry).toBeDefined()
  expect(entry!.appliedScope).toBe('org-internal')
  expect(entry!.reason).toContain('memoryType')
})

it('queryAuditLog returns empty array without governance', async () => {
  const { config, getWs } = createTestConfig()
  const { client } = await connectClient(config, getWs)

  const auditLog = await client.queryAuditLog()
  expect(auditLog).toEqual([])
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd packages/saga-client-rt && npx vitest run src/__tests__/client.test.ts`
Expected: FAIL — `queryAuditLog` not found on client

- [ ] **Step 4: Implement queryAuditLog in client.ts**

In `packages/saga-client-rt/src/client.ts`, add `queryAuditLog` to the `sagaClient` object (after `deleteMemory`):

```typescript
    async queryAuditLog(filter?: { since?: string; limit?: number }): Promise<PolicyAuditEntry[]> {
      if (!config.governance) return []

      const entries = await store.query({ prefix: 'audit:' })
      let results = entries.map(e => e.value as PolicyAuditEntry)

      if (filter?.since) {
        const since = filter.since
        results = results.filter(e => e.timestamp >= since)
      }
      if (filter?.limit !== undefined) {
        results = results.slice(0, filter.limit)
      }

      return results
    },
```

Add the `PolicyAuditEntry` import to the types import at the top of client.ts:

```typescript
import type {
  ConnectedPeer,
  MemoryFilter,
  PolicyAuditEntry,
  SagaClient,
  SagaClientConfig,
  SagaDirectMessage,
  SagaEncryptedEnvelope,
  SagaMemory,
  Unsubscribe,
} from './types'
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd packages/saga-client-rt && npx vitest run src/__tests__/client.test.ts`
Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add packages/saga-client-rt/src/types.ts packages/saga-client-rt/src/client.ts packages/saga-client-rt/src/__tests__/client.test.ts
git commit -m "feat(saga-client-rt): add queryAuditLog for policy audit trail"
```

---

### Task 7: Integration Tests

**Files:**

- Modify: `packages/saga-client-rt/src/__tests__/integration.test.ts`

**Context:** End-to-end tests verifying the full governance flow: policy classification → scope-aware storage → no-sync for org-internal → retention enforcement → audit trail. These tests exercise the real policy engine and retention engine (not mocked) with the mock crypto module.

- [ ] **Step 1: Add governance integration tests**

In `packages/saga-client-rt/src/__tests__/integration.test.ts`, add a new `describe('governance integration', ...)` block:

```typescript
describe('governance integration', () => {
  beforeEach(async () => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    const crypto = vi.mocked(await import('@epicdm/saga-crypto'))
    ;(crypto as unknown as { _mockStore: { _data: Map<string, unknown> } })._mockStore._data.clear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('full governance flow: classify, store, audit, retain', async () => {
    const { config, getWs } = createTestConfig({
      governance: {
        orgId: 'acme-corp',
        policy: {
          orgId: 'acme-corp',
          defaultScope: 'agent-portable',
          restricted: {
            memoryTypes: ['procedural'],
            contentPatterns: ['secret'],
          },
          retention: { portableLimit: 2 },
        },
        companyKeyRing: {
          isUnlocked: true,
          getPublicKey: () => new Uint8Array(32).fill(99),
          hasGroupKey: vi.fn().mockReturnValue(false),
        } as unknown as SagaClientConfig['keyRing'],
      },
    })

    const { client, ws } = await connectClient(config, getWs)

    // Store a restricted memory (procedural → org-internal)
    await client.storeMemory({
      id: 'mem-restricted',
      type: 'procedural',
      content: { steps: ['internal process'] },
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    })

    // Store a content-pattern-matching memory (secret → org-internal)
    await client.storeMemory({
      id: 'mem-secret',
      type: 'episodic',
      content: { text: 'secret project details' },
      createdAt: '2026-01-02T00:00:00Z',
      updatedAt: '2026-01-02T00:00:00Z',
    })

    // Store 3 portable memories
    for (let i = 1; i <= 3; i++) {
      await client.storeMemory({
        id: `mem-portable-${i}`,
        type: 'episodic',
        content: { text: `learning ${i}` },
        createdAt: `2026-01-0${i}T00:00:00Z`,
        updatedAt: `2026-01-0${i}T00:00:00Z`,
      })
    }

    // Verify: no relay:send for org-internal memories
    const sent = ws.allSent<Record<string, unknown>>()
    const relaySends = sent.filter(m => m.type === 'relay:send')
    const syncEnvelopes = relaySends
      .map(m => m.envelope as Record<string, unknown>)
      .filter(e => e?.type === 'memory-sync')

    // Only 3 portable memories should have synced (not the 2 org-internal ones)
    expect(syncEnvelopes).toHaveLength(3)

    // Verify: audit log has entries for all 5 memories
    const auditLog = await client.queryAuditLog()
    expect(auditLog.length).toBeGreaterThanOrEqual(5)

    const restrictedAudit = auditLog.find(e => e.memoryId === 'mem-restricted')
    expect(restrictedAudit?.appliedScope).toBe('org-internal')

    const secretAudit = auditLog.find(e => e.memoryId === 'mem-secret')
    expect(secretAudit?.appliedScope).toBe('org-internal')

    // queryMemory should return all accessible memories (agent store + company store)
    const allMemories = await client.queryMemory({})
    expect(allMemories.length).toBeGreaterThanOrEqual(5)

    await client.disconnect()
  })
})
```

- [ ] **Step 2: Read the current integration test file to understand imports and helpers needed**

Read `packages/saga-client-rt/src/__tests__/integration.test.ts` to see which helpers (`createTestConfig`, `connectClient`) are available and add them if missing from this file. The helpers may need to be imported or duplicated from `client.test.ts`. If the integration test file uses its own test setup, adapt accordingly.

- [ ] **Step 3: Run the integration tests**

Run: `cd packages/saga-client-rt && npx vitest run src/__tests__/integration.test.ts`
Expected: PASS

- [ ] **Step 4: Run full test suite to verify no regressions**

Run: `cd packages/saga-client-rt && npx vitest run`
Expected: All tests pass

Run: `cd packages/server && npx vitest run`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add packages/saga-client-rt/src/__tests__/integration.test.ts
git commit -m "test: add governance integration tests for Phase 6 full flow"
```
