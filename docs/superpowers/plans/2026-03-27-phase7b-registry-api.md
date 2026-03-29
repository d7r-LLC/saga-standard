> **FlowState Document:** `docu_phvTa48YXO`

# Phase 7B: Registry API & Directory Indexing — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add server-side directory indexing, a `directories` table, REST endpoints for listing/querying directories, and `handle@directoryId` resolution to the SAGA hub server.

**Architecture:** Extend the existing Cloudflare Worker (Hono + Drizzle + D1) with a new `directories` table, extend the chain indexer to watch `SAGADirectoryIdentity` contract events, add `directoryId` column to `agents` table, and create new REST routes for directory listing, detail, and enhanced resolution. All new code follows existing patterns — Drizzle schema, event handler dispatch, Hono route modules, and Vitest mock-D1 tests.

**Tech Stack:** Hono, Drizzle ORM (D1), viem (chain indexer), Vitest, Cloudflare Workers (D1/KV)

**Working directory:** The worktree for this plan at `packages/server/` inside the `feat/phase7b-registry-api` branch.

---

## File Structure

| File                                      | Action | Responsibility                                                                                                                                                              |
| ----------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `migrations/0006_directories.sql`         | Create | D1 migration: `directories` table + `directory_id` on agents                                                                                                                |
| `src/db/schema.ts`                        | Modify | Add `directories` Drizzle table, add `directoryId` column to `agents`                                                                                                       |
| `src/indexer/types.ts`                    | Modify | Add `DirectoryRegisteredEvent`, `DirectoryStatusUpdatedEvent`, `DirectoryUrlUpdatedEvent` interfaces                                                                        |
| `src/indexer/event-handlers.ts`           | Modify | Add `handleDirectoryRegistered`, `handleDirectoryStatusUpdated`, `handleDirectoryUrlUpdated`, `handleDirectoryTransfer`                                                     |
| `src/indexer/chain-indexer.ts`            | Modify | Add `DirectoryRegistered`/`DirectoryStatusUpdated`/`DirectoryUrlUpdated` to EVENT_ABIS, add directory contract to getLogs address list, extend `processDecodedLog` dispatch |
| `src/bindings.ts`                         | Modify | Add `DIRECTORY_IDENTITY_CONTRACT?: string` to Env                                                                                                                           |
| `src/routes/directories.ts`               | Create | `GET /v1/directories` (list) + `GET /v1/directories/:directoryId` (detail)                                                                                                  |
| `src/routes/resolve.ts`                   | Modify | Parse `handle@directoryId` format, query directories table                                                                                                                  |
| `src/index.ts`                            | Modify | Mount `directoryRoutes`, add endpoint to root JSON                                                                                                                          |
| `wrangler.toml`                           | Modify | Add `DIRECTORY_IDENTITY_CONTRACT` var                                                                                                                                       |
| `src/__tests__/test-helpers.ts`           | Modify | Add `directories` table to `runMigrations()` DDL, add `directory_id` column to agents                                                                                       |
| `src/__tests__/directories.test.ts`       | Create | Tests for directory routes                                                                                                                                                  |
| `src/__tests__/directory-indexer.test.ts` | Create | Tests for directory event handlers                                                                                                                                          |
| `src/__tests__/resolve-directory.test.ts` | Create | Tests for `handle@directoryId` resolution                                                                                                                                   |

---

## Task 1: D1 Migration & Drizzle Schema

**Files:**

- Create: `packages/server/migrations/0006_directories.sql`
- Modify: `packages/server/src/db/schema.ts`
- Modify: `packages/server/src/__tests__/test-helpers.ts`

- [ ] **Step 1: Write the migration SQL**

Create `packages/server/migrations/0006_directories.sql`:

```sql
-- Phase 7B: Directory identity indexing
CREATE TABLE IF NOT EXISTS directories (
  id TEXT PRIMARY KEY,
  directory_id TEXT UNIQUE NOT NULL,
  url TEXT NOT NULL,
  operator_wallet TEXT NOT NULL,
  conformance_level TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  token_id INTEGER,
  contract_address TEXT,
  chain TEXT NOT NULL,
  mint_tx_hash TEXT,
  tba_address TEXT,
  registered_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_directories_directory_id ON directories(directory_id);
CREATE INDEX IF NOT EXISTS idx_directories_operator ON directories(operator_wallet);
CREATE INDEX IF NOT EXISTS idx_directories_status ON directories(status);

-- Add directoryId to agents for directory-scoped registrations
ALTER TABLE agents ADD COLUMN directory_id TEXT;
```

- [ ] **Step 2: Add Drizzle table definition**

Add to `packages/server/src/db/schema.ts`, after the existing `organizations` table:

```ts
export const directories = sqliteTable('directories', {
  id: text('id').primaryKey(),
  directoryId: text('directory_id').unique().notNull(),
  url: text('url').notNull(),
  operatorWallet: text('operator_wallet').notNull(),
  conformanceLevel: text('conformance_level').notNull(),
  status: text('status').notNull().default('active'),
  tokenId: integer('token_id'),
  contractAddress: text('contract_address'),
  chain: text('chain').notNull(),
  mintTxHash: text('mint_tx_hash'),
  tbaAddress: text('tba_address'),
  registeredAt: text('registered_at').notNull(),
  updatedAt: text('updated_at').notNull(),
})
```

Also add `directoryId` column to the existing `agents` table definition:

```ts
// Inside the agents sqliteTable definition, add after homeHubUrl:
directoryId: text('directory_id'),
```

- [ ] **Step 3: Update test-helpers runMigrations DDL**

In `packages/server/src/__tests__/test-helpers.ts`, update `runMigrations()`:

Add the `directories` table DDL after the `replication_policies` table:

```sql
CREATE TABLE IF NOT EXISTS directories (
  id TEXT PRIMARY KEY,
  directory_id TEXT UNIQUE NOT NULL,
  url TEXT NOT NULL,
  operator_wallet TEXT NOT NULL,
  conformance_level TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  token_id INTEGER,
  contract_address TEXT,
  chain TEXT NOT NULL,
  mint_tx_hash TEXT,
  tba_address TEXT,
  registered_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

Also add `directory_id TEXT` column to the agents CREATE TABLE in the same DDL.

- [ ] **Step 4: Commit**

```bash
git add migrations/0006_directories.sql src/db/schema.ts src/__tests__/test-helpers.ts
git commit -m "feat(server): add directories D1 migration and Drizzle schema"
```

---

## Task 2: Indexer Types & Event Interfaces

**Files:**

- Modify: `packages/server/src/indexer/types.ts`
- Modify: `packages/server/src/bindings.ts`

- [ ] **Step 1: Add directory event interfaces to types.ts**

Add to `packages/server/src/indexer/types.ts`, after the existing event interfaces:

```ts
/** Decoded DirectoryRegistered event from SAGADirectoryIdentity */
export interface DirectoryRegisteredEvent {
  tokenId: bigint
  directoryId: string
  operator: string
  url: string
  conformanceLevel: string
  registeredAt: bigint
}

/** Decoded DirectoryStatusUpdated event */
export interface DirectoryStatusUpdatedEvent {
  tokenId: bigint
  oldStatus: string
  newStatus: string
}

/** Decoded DirectoryUrlUpdated event */
export interface DirectoryUrlUpdatedEvent {
  tokenId: bigint
  oldUrl: string
  newUrl: string
}
```

- [ ] **Step 2: Add DIRECTORY_IDENTITY_CONTRACT to Env**

Add to `packages/server/src/bindings.ts`, after the `HANDLE_REGISTRY_CONTRACT` line:

```ts
/** Deployed SAGADirectoryIdentity contract address */
DIRECTORY_IDENTITY_CONTRACT?: string
```

- [ ] **Step 3: Commit**

```bash
git add src/indexer/types.ts src/bindings.ts
git commit -m "feat(server): add directory event interfaces and Env binding"
```

---

## Task 3: Directory Event Handlers

**Files:**

- Create: `packages/server/src/__tests__/directory-indexer.test.ts`
- Modify: `packages/server/src/indexer/event-handlers.ts`

- [ ] **Step 1: Write failing tests for directory event handlers**

Create `packages/server/src/__tests__/directory-indexer.test.ts`:

```ts
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { beforeEach, describe, expect, it } from 'vitest'
import { drizzle } from 'drizzle-orm/d1'
import { eq } from 'drizzle-orm'
import { createMockD1, runMigrations } from './test-helpers'
import {
  handleDirectoryRegistered,
  handleDirectoryStatusUpdated,
  handleDirectoryUrlUpdated,
  handleDirectoryTransfer,
} from '../indexer/event-handlers'
import type { EventMeta } from '../indexer/types'
import { directories } from '../db/schema'

const DIR_CONTRACT = '0xdir000000000000000000000000000000000001'
const CHAIN = 'eip155:84532'
const OPERATOR = '0xaabbccddee1234567890aabbccddee1234567890'
const OWNER = '0x1111111111111111111111111111111111111111'

let mockDb: D1Database
let db: ReturnType<typeof drizzle>

beforeEach(async () => {
  mockDb = createMockD1()
  await runMigrations(mockDb)
  db = drizzle(mockDb)
})

describe('handleDirectoryRegistered', () => {
  const meta: EventMeta = {
    txHash: '0xtx_dir_001',
    contractAddress: DIR_CONTRACT.toLowerCase(),
    chain: CHAIN,
    blockNumber: 200n,
  }

  it('inserts a new directory', async () => {
    await handleDirectoryRegistered(
      db,
      {
        tokenId: 0n,
        directoryId: 'epic-hub',
        operator: OPERATOR,
        url: 'https://epic-hub.saga-standard.dev',
        conformanceLevel: 'full',
        registeredAt: 1700000000n,
      },
      meta
    )

    const rows = await db.select().from(directories).where(eq(directories.directoryId, 'epic-hub'))
    expect(rows).toHaveLength(1)
    expect(rows[0].url).toBe('https://epic-hub.saga-standard.dev')
    expect(rows[0].operatorWallet).toBe(OPERATOR.toLowerCase())
    expect(rows[0].conformanceLevel).toBe('full')
    expect(rows[0].status).toBe('active')
    expect(rows[0].tokenId).toBe(0)
    expect(rows[0].contractAddress).toBe(DIR_CONTRACT.toLowerCase())
    expect(rows[0].chain).toBe(CHAIN)
  })

  it('upserts if directoryId already exists', async () => {
    // Seed existing row
    await handleDirectoryRegistered(
      db,
      {
        tokenId: 0n,
        directoryId: 'epic-hub',
        operator: OPERATOR,
        url: 'https://old.example.com',
        conformanceLevel: 'basic',
        registeredAt: 1700000000n,
      },
      meta
    )

    // Re-register with new meta (e.g. reorg replay)
    const newMeta = { ...meta, txHash: '0xtx_dir_002' }
    await handleDirectoryRegistered(
      db,
      {
        tokenId: 0n,
        directoryId: 'epic-hub',
        operator: OPERATOR,
        url: 'https://new.example.com',
        conformanceLevel: 'full',
        registeredAt: 1700000000n,
      },
      newMeta
    )

    const rows = await db.select().from(directories).where(eq(directories.directoryId, 'epic-hub'))
    expect(rows).toHaveLength(1)
    expect(rows[0].url).toBe('https://new.example.com')
    expect(rows[0].mintTxHash).toBe('0xtx_dir_002')
  })
})

describe('handleDirectoryStatusUpdated', () => {
  it('updates directory status', async () => {
    // Seed a directory
    const meta: EventMeta = {
      txHash: '0xtx_dir_seed',
      contractAddress: DIR_CONTRACT.toLowerCase(),
      chain: CHAIN,
      blockNumber: 200n,
    }
    await handleDirectoryRegistered(
      db,
      {
        tokenId: 5n,
        directoryId: 'test-dir',
        operator: OPERATOR,
        url: 'https://test.example.com',
        conformanceLevel: 'full',
        registeredAt: 1700000000n,
      },
      meta
    )

    await handleDirectoryStatusUpdated(db, {
      tokenId: 5n,
      oldStatus: 'active',
      newStatus: 'suspended',
    })

    const rows = await db.select().from(directories).where(eq(directories.directoryId, 'test-dir'))
    expect(rows[0].status).toBe('suspended')
  })
})

describe('handleDirectoryUrlUpdated', () => {
  it('updates directory URL', async () => {
    const meta: EventMeta = {
      txHash: '0xtx_dir_seed',
      contractAddress: DIR_CONTRACT.toLowerCase(),
      chain: CHAIN,
      blockNumber: 200n,
    }
    await handleDirectoryRegistered(
      db,
      {
        tokenId: 3n,
        directoryId: 'url-dir',
        operator: OPERATOR,
        url: 'https://old.example.com',
        conformanceLevel: 'basic',
        registeredAt: 1700000000n,
      },
      meta
    )

    await handleDirectoryUrlUpdated(db, {
      tokenId: 3n,
      oldUrl: 'https://old.example.com',
      newUrl: 'https://new.example.com',
    })

    const rows = await db.select().from(directories).where(eq(directories.directoryId, 'url-dir'))
    expect(rows[0].url).toBe('https://new.example.com')
  })
})

describe('handleDirectoryTransfer', () => {
  it('updates operator wallet on transfer', async () => {
    const meta: EventMeta = {
      txHash: '0xtx_dir_seed',
      contractAddress: DIR_CONTRACT.toLowerCase(),
      chain: CHAIN,
      blockNumber: 200n,
    }
    await handleDirectoryRegistered(
      db,
      {
        tokenId: 7n,
        directoryId: 'xfer-dir',
        operator: OPERATOR,
        url: 'https://xfer.example.com',
        conformanceLevel: 'full',
        registeredAt: 1700000000n,
      },
      meta
    )

    const newOwner = '0x2222222222222222222222222222222222222222'
    await handleDirectoryTransfer(db, {
      from: OPERATOR,
      to: newOwner,
      tokenId: 7n,
    })

    const rows = await db.select().from(directories).where(eq(directories.directoryId, 'xfer-dir'))
    expect(rows[0].operatorWallet).toBe(newOwner.toLowerCase())
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/directory-indexer.test.ts`
Expected: FAIL — `handleDirectoryRegistered` etc. not exported from `event-handlers.ts`

- [ ] **Step 3: Implement directory event handlers**

Add to `packages/server/src/indexer/event-handlers.ts`:

Add import at top:

```ts
import { agents, directories, organizations } from '../db/schema'
```

(Replace the existing import that only imports `agents, organizations`.)

Add import of new event types:

```ts
import type {
  AgentRegisteredEvent,
  DirectoryRegisteredEvent,
  DirectoryStatusUpdatedEvent,
  DirectoryUrlUpdatedEvent,
  EventMeta,
  HomeHubUpdatedEvent,
  OrgNameUpdatedEvent,
  OrgRegisteredEvent,
  TransferEvent,
} from './types'
```

Add these handler functions at the bottom of the file:

```ts
/**
 * Handle DirectoryRegistered event.
 * Upsert pattern: if directoryId exists, update on-chain fields.
 */
export async function handleDirectoryRegistered(
  db: DrizzleD1Database<Record<string, unknown>>,
  event: DirectoryRegisteredEvent,
  meta: EventMeta
): Promise<void> {
  const now = new Date().toISOString()
  const id = safeTokenId(event.tokenId)
  const tbaAddress = computeTBA(event.tokenId, meta.contractAddress, meta.chain)

  const existing = await db
    .select({ id: directories.id })
    .from(directories)
    .where(eq(directories.directoryId, event.directoryId))
    .limit(1)

  if (existing.length > 0) {
    await db
      .update(directories)
      .set({
        tokenId: id,
        url: event.url,
        operatorWallet: event.operator.toLowerCase(),
        conformanceLevel: event.conformanceLevel,
        contractAddress: meta.contractAddress,
        mintTxHash: meta.txHash,
        tbaAddress,
        updatedAt: now,
      })
      .where(eq(directories.directoryId, event.directoryId))
  } else {
    await db.insert(directories).values({
      id: generateId('dir'),
      directoryId: event.directoryId,
      url: event.url,
      operatorWallet: event.operator.toLowerCase(),
      conformanceLevel: event.conformanceLevel,
      status: 'active',
      tokenId: id,
      contractAddress: meta.contractAddress,
      chain: meta.chain,
      mintTxHash: meta.txHash,
      tbaAddress,
      registeredAt: timestampToISO(event.registeredAt),
      updatedAt: now,
    })
  }
}

/**
 * Handle DirectoryStatusUpdated event.
 */
export async function handleDirectoryStatusUpdated(
  db: DrizzleD1Database<Record<string, unknown>>,
  event: DirectoryStatusUpdatedEvent
): Promise<void> {
  const id = safeTokenId(event.tokenId)
  await db
    .update(directories)
    .set({
      status: event.newStatus,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(directories.tokenId, id))
}

/**
 * Handle DirectoryUrlUpdated event.
 */
export async function handleDirectoryUrlUpdated(
  db: DrizzleD1Database<Record<string, unknown>>,
  event: DirectoryUrlUpdatedEvent
): Promise<void> {
  const id = safeTokenId(event.tokenId)
  await db
    .update(directories)
    .set({
      url: event.newUrl,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(directories.tokenId, id))
}

/**
 * Handle ERC-721 Transfer event for a directory identity.
 * Updates the operator wallet to the new owner.
 */
export async function handleDirectoryTransfer(
  db: DrizzleD1Database<Record<string, unknown>>,
  event: TransferEvent
): Promise<void> {
  const id = safeTokenId(event.tokenId)
  await db
    .update(directories)
    .set({
      operatorWallet: event.to.toLowerCase(),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(directories.tokenId, id))
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/directory-indexer.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/indexer/event-handlers.ts src/indexer/types.ts src/__tests__/directory-indexer.test.ts
git commit -m "feat(server): add directory event handlers with tests"
```

---

## Task 4: Extend Chain Indexer for Directory Contract

**Files:**

- Modify: `packages/server/src/indexer/chain-indexer.ts`

- [ ] **Step 1: Add directory event ABIs to EVENT_ABIS**

In `packages/server/src/indexer/chain-indexer.ts`, add these entries to the `EVENT_ABIS` array (before the closing `] as const`):

```ts
  {
    type: 'event',
    name: 'DirectoryRegistered',
    inputs: [
      { name: 'tokenId', type: 'uint256', indexed: true },
      { name: 'directoryId', type: 'string', indexed: false },
      { name: 'operator', type: 'address', indexed: true },
      { name: 'url', type: 'string', indexed: false },
      { name: 'conformanceLevel', type: 'string', indexed: false },
      { name: 'registeredAt', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'DirectoryStatusUpdated',
    inputs: [
      { name: 'tokenId', type: 'uint256', indexed: true },
      { name: 'oldStatus', type: 'string', indexed: false },
      { name: 'newStatus', type: 'string', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'DirectoryUrlUpdated',
    inputs: [
      { name: 'tokenId', type: 'uint256', indexed: true },
      { name: 'oldUrl', type: 'string', indexed: false },
      { name: 'newUrl', type: 'string', indexed: false },
    ],
  },
```

- [ ] **Step 2: Add directory contract to getLogs address list**

In `runIndexer()`, update the contract addresses section. After `const orgContract = ...`:

```ts
const directoryContract = env.DIRECTORY_IDENTITY_CONTRACT as `0x${string}` | undefined
```

Update the `client.getLogs` call to include the directory contract when configured:

```ts
const watchAddresses: `0x${string}`[] = [agentContract, orgContract]
if (directoryContract) watchAddresses.push(directoryContract)

const logs = await client.getLogs({
  address: watchAddresses,
  events: EVENT_ABIS,
  fromBlock,
  toBlock,
})
```

- [ ] **Step 3: Extend processDecodedLog dispatch**

Add imports at top:

```ts
import type {
  AgentRegisteredEvent,
  DirectoryRegisteredEvent,
  DirectoryStatusUpdatedEvent,
  DirectoryUrlUpdatedEvent,
  EventMeta,
  HomeHubUpdatedEvent,
  OrgNameUpdatedEvent,
  OrgRegisteredEvent,
  TransferEvent,
} from './types'
import {
  handleAgentRegistered,
  handleAgentTransfer,
  handleDirectoryRegistered,
  handleDirectoryStatusUpdated,
  handleDirectoryTransfer,
  handleDirectoryUrlUpdated,
  handleHomeHubUpdated,
  handleOrgNameUpdated,
  handleOrgRegistered,
  handleOrgTransfer,
} from './event-handlers'
```

Update `processDecodedLog` signature to accept a directory address:

```ts
export async function processDecodedLog(
  db: ReturnType<typeof drizzle>,
  log: DecodedEventLog,
  meta: EventMeta,
  agentAddress: string,
  orgAddress: string,
  directoryAddress?: string
): Promise<void> {
  const isAgent = log.address.toLowerCase() === agentAddress
  const isOrg = log.address.toLowerCase() === orgAddress
  const isDirectory = directoryAddress
    ? log.address.toLowerCase() === directoryAddress
    : false
  if (!isAgent && !isOrg && !isDirectory) return
```

Add new cases to the switch statement, before the closing `}`:

```ts
    case 'DirectoryRegistered': {
      if (!isDirectory) break
      await handleDirectoryRegistered(
        db,
        log.args as unknown as DirectoryRegisteredEvent,
        meta
      )
      break
    }

    case 'DirectoryStatusUpdated': {
      if (!isDirectory) break
      await handleDirectoryStatusUpdated(
        db,
        log.args as unknown as DirectoryStatusUpdatedEvent
      )
      break
    }

    case 'DirectoryUrlUpdated': {
      if (!isDirectory) break
      await handleDirectoryUrlUpdated(
        db,
        log.args as unknown as DirectoryUrlUpdatedEvent
      )
      break
    }
```

Update the Transfer case to handle directory transfers:

```ts
    case 'Transfer': {
      const args = log.args as unknown as TransferEvent
      if (args.from === '0x0000000000000000000000000000000000000000') return
      if (isAgent) {
        await handleAgentTransfer(db, args)
      } else if (isOrg) {
        await handleOrgTransfer(db, args)
      } else if (isDirectory) {
        await handleDirectoryTransfer(db, args)
      }
      break
    }
```

Update the `processDecodedLog` call site in `runIndexer()` to pass the directory address:

```ts
await processDecodedLog(
  db,
  {
    eventName: log.eventName,
    args: log.args as Record<string, unknown>,
    address: log.address,
  },
  meta,
  agentContract.toLowerCase(),
  orgContract.toLowerCase(),
  directoryContract?.toLowerCase()
)
```

- [ ] **Step 4: Run all existing indexer tests to verify no regressions**

Run: `npx vitest run src/__tests__/indexer.test.ts src/__tests__/directory-indexer.test.ts`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add src/indexer/chain-indexer.ts
git commit -m "feat(server): extend chain indexer to watch SAGADirectoryIdentity events"
```

---

## Task 5: Directory REST Routes

**Files:**

- Create: `packages/server/src/routes/directories.ts`
- Create: `packages/server/src/__tests__/directories.test.ts`

- [ ] **Step 1: Write failing tests for directory routes**

Create `packages/server/src/__tests__/directories.test.ts`:

```ts
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { beforeEach, describe, expect, it } from 'vitest'
import { app } from '../index'
import { createMockEnv, runMigrations } from './test-helpers'
import type { Env } from '../bindings'

let env: Env

beforeEach(async () => {
  env = createMockEnv()
  await runMigrations(env.DB)
})

const now = new Date().toISOString()

async function seedDirectory(
  db: D1Database,
  overrides: Partial<{
    id: string
    directoryId: string
    url: string
    operatorWallet: string
    conformanceLevel: string
    status: string
    tokenId: number
    chain: string
  }> = {}
) {
  const defaults = {
    id: 'dir_001',
    directoryId: 'epic-hub',
    url: 'https://epic-hub.saga-standard.dev',
    operatorWallet: '0xoperator001',
    conformanceLevel: 'full',
    status: 'active',
    tokenId: 0,
    chain: 'eip155:84532',
  }
  const d = { ...defaults, ...overrides }
  await db
    .prepare(
      'INSERT INTO directories (id, directory_id, url, operator_wallet, conformance_level, status, token_id, chain, registered_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    )
    .bind(
      d.id,
      d.directoryId,
      d.url,
      d.operatorWallet,
      d.conformanceLevel,
      d.status,
      d.tokenId,
      d.chain,
      now,
      now
    )
    .run()
}

describe('GET /v1/directories', () => {
  it('returns empty list when no directories exist', async () => {
    const res = await app.request('http://localhost/v1/directories', {}, env)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { directories: unknown[]; total: number }
    expect(body.directories).toHaveLength(0)
    expect(body.total).toBe(0)
  })

  it('returns paginated directory list', async () => {
    await seedDirectory(env.DB, { id: 'dir_001', directoryId: 'hub-a' })
    await seedDirectory(env.DB, { id: 'dir_002', directoryId: 'hub-b' })

    const res = await app.request('http://localhost/v1/directories?limit=1&page=1', {}, env)
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      directories: unknown[]
      total: number
      page: number
      limit: number
    }
    expect(body.directories).toHaveLength(1)
    expect(body.total).toBe(2)
    expect(body.page).toBe(1)
    expect(body.limit).toBe(1)
  })

  it('filters by status query param', async () => {
    await seedDirectory(env.DB, { id: 'dir_001', directoryId: 'active-hub', status: 'active' })
    await seedDirectory(env.DB, {
      id: 'dir_002',
      directoryId: 'suspended-hub',
      status: 'suspended',
    })

    const res = await app.request('http://localhost/v1/directories?status=active', {}, env)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { directories: Array<{ directoryId: string }> }
    expect(body.directories).toHaveLength(1)
    expect(body.directories[0].directoryId).toBe('active-hub')
  })
})

describe('GET /v1/directories/:directoryId', () => {
  it('returns directory details', async () => {
    await seedDirectory(env.DB)

    const res = await app.request('http://localhost/v1/directories/epic-hub', {}, env)
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      directoryId: string
      url: string
      operatorWallet: string
      conformanceLevel: string
      status: string
    }
    expect(body.directoryId).toBe('epic-hub')
    expect(body.url).toBe('https://epic-hub.saga-standard.dev')
    expect(body.conformanceLevel).toBe('full')
  })

  it('returns 404 for unknown directory', async () => {
    const res = await app.request('http://localhost/v1/directories/unknown', {}, env)
    expect(res.status).toBe(404)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/directories.test.ts`
Expected: FAIL — route not found (404 on all requests)

- [ ] **Step 3: Implement directory routes**

Create `packages/server/src/routes/directories.ts`:

```ts
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { Hono } from 'hono'
import { drizzle } from 'drizzle-orm/d1'
import { eq, sql } from 'drizzle-orm'
import type { Env } from '../bindings'
import { directories } from '../db/schema'
import { parseIntParam } from '../utils'

export const directoryRoutes = new Hono<{ Bindings: Env }>()

/**
 * GET /v1/directories — List directories with pagination
 * Query params: page, limit, status
 */
directoryRoutes.get('/', async c => {
  const page = Math.max(1, parseIntParam(c.req.query('page'), 1))
  const limit = Math.min(100, Math.max(1, parseIntParam(c.req.query('limit'), 20)))
  const status = c.req.query('status')
  const offset = (page - 1) * limit

  const db = drizzle(c.env.DB)

  const whereClause = status ? eq(directories.status, status) : undefined

  const [rows, countResult] = await Promise.all([
    db.select().from(directories).where(whereClause).limit(limit).offset(offset),
    db
      .select({ count: sql<number>`count(*)` })
      .from(directories)
      .where(whereClause),
  ])

  return c.json({
    directories: rows.map(d => ({
      directoryId: d.directoryId,
      url: d.url,
      operatorWallet: d.operatorWallet,
      conformanceLevel: d.conformanceLevel,
      status: d.status,
      tokenId: d.tokenId ?? null,
      tbaAddress: d.tbaAddress ?? null,
      contractAddress: d.contractAddress ?? null,
      registeredAt: d.registeredAt,
    })),
    total: countResult[0]?.count ?? 0,
    page,
    limit,
  })
})

/**
 * GET /v1/directories/:directoryId — Get directory details
 */
directoryRoutes.get('/:directoryId', async c => {
  const directoryId = c.req.param('directoryId') as string
  const db = drizzle(c.env.DB)

  const results = await db
    .select()
    .from(directories)
    .where(eq(directories.directoryId, directoryId))
    .limit(1)

  if (results.length === 0) {
    return c.json({ error: 'Directory not found', code: 'NOT_FOUND' }, 404)
  }

  const d = results[0]
  return c.json({
    directoryId: d.directoryId,
    url: d.url,
    operatorWallet: d.operatorWallet,
    conformanceLevel: d.conformanceLevel,
    status: d.status,
    tokenId: d.tokenId ?? null,
    tbaAddress: d.tbaAddress ?? null,
    contractAddress: d.contractAddress ?? null,
    chain: d.chain,
    mintTxHash: d.mintTxHash ?? null,
    registeredAt: d.registeredAt,
    updatedAt: d.updatedAt,
  })
})
```

- [ ] **Step 4: Mount routes in index.ts**

In `packages/server/src/index.ts`:

Add import:

```ts
import { directoryRoutes } from './routes/directories'
```

Add mount after the existing `app.route('/v1/keys', keyRoutes)` line:

```ts
app.route('/v1/directories', directoryRoutes)
```

Add to the root JSON endpoints object:

```ts
directories: '/v1/directories',
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/directories.test.ts`
Expected: All PASS

- [ ] **Step 6: Commit**

```bash
git add src/routes/directories.ts src/index.ts src/__tests__/directories.test.ts
git commit -m "feat(server): add directory REST routes with pagination and status filter"
```

---

## Task 6: Enhanced Resolve with `handle@directoryId` Format

**Files:**

- Create: `packages/server/src/__tests__/resolve-directory.test.ts`
- Modify: `packages/server/src/routes/resolve.ts`

- [ ] **Step 1: Write failing tests for enhanced resolve**

Create `packages/server/src/__tests__/resolve-directory.test.ts`:

```ts
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { beforeEach, describe, expect, it } from 'vitest'
import { app } from '../index'
import { createMockEnv, runMigrations } from './test-helpers'
import type { Env } from '../bindings'

let env: Env
const now = new Date().toISOString()

beforeEach(async () => {
  env = createMockEnv()
  await runMigrations(env.DB)
})

async function seedAgent(db: D1Database, handle: string, directoryId?: string) {
  await db
    .prepare(
      'INSERT INTO agents (id, handle, wallet_address, chain, registered_at, updated_at, directory_id) VALUES (?, ?, ?, ?, ?, ?, ?)'
    )
    .bind(`agent_${handle}`, handle, '0xwallet001', 'eip155:84532', now, now, directoryId ?? null)
    .run()
}

async function seedDirectory(db: D1Database, directoryId: string) {
  await db
    .prepare(
      'INSERT INTO directories (id, directory_id, url, operator_wallet, conformance_level, status, chain, registered_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    )
    .bind(
      `dir_${directoryId}`,
      directoryId,
      `https://${directoryId}.example.com`,
      '0xop001',
      'full',
      'active',
      'eip155:84532',
      now,
      now
    )
    .run()
}

describe('GET /v1/resolve/:identity — handle@directoryId format', () => {
  it('resolves plain handle (backward compatible)', async () => {
    await seedAgent(env.DB, 'alice')

    const res = await app.request('http://localhost/v1/resolve/alice', {}, env)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { entityType: string; handle: string }
    expect(body.entityType).toBe('agent')
    expect(body.handle).toBe('alice')
  })

  it('resolves handle@directoryId for agent in directory', async () => {
    await seedDirectory(env.DB, 'epic-hub')
    await seedAgent(env.DB, 'bob', 'epic-hub')

    const res = await app.request('http://localhost/v1/resolve/bob@epic-hub', {}, env)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { entityType: string; handle: string; directoryId: string }
    expect(body.entityType).toBe('agent')
    expect(body.handle).toBe('bob')
    expect(body.directoryId).toBe('epic-hub')
  })

  it('returns 404 when directory does not exist', async () => {
    await seedAgent(env.DB, 'charlie', 'ghost-hub')

    const res = await app.request('http://localhost/v1/resolve/charlie@ghost-hub', {}, env)
    expect(res.status).toBe(404)
    const body = (await res.json()) as { code: string }
    expect(body.code).toBe('NOT_FOUND')
  })

  it('returns 404 when handle not found in specified directory', async () => {
    await seedDirectory(env.DB, 'epic-hub')
    await seedAgent(env.DB, 'dave', 'other-hub')

    const res = await app.request('http://localhost/v1/resolve/dave@epic-hub', {}, env)
    expect(res.status).toBe(404)
  })

  it('resolves directory entity type', async () => {
    await seedDirectory(env.DB, 'my-dir')

    const res = await app.request('http://localhost/v1/resolve/my-dir', {}, env)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { entityType: string; directoryId: string }
    expect(body.entityType).toBe('directory')
    expect(body.directoryId).toBe('my-dir')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/resolve-directory.test.ts`
Expected: FAIL — resolve doesn't handle `@` format or directories

- [ ] **Step 3: Update resolve route**

Replace `packages/server/src/routes/resolve.ts` with:

```ts
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { Hono } from 'hono'
import { drizzle } from 'drizzle-orm/d1'
import { and, eq } from 'drizzle-orm'
import type { Env } from '../bindings'
import { agents, directories, organizations } from '../db/schema'

export const resolveRoutes = new Hono<{ Bindings: Env }>()

/**
 * GET /v1/resolve/:identity — Resolve an identity string.
 *
 * Supports two formats:
 *   - `handle` — resolve in the default (global) namespace
 *   - `handle@directoryId` — resolve within a specific directory
 *
 * Resolution order: agents → organizations → directories.
 * On-chain HandleRegistry enforces cross-entity uniqueness.
 */
resolveRoutes.get('/:identity', async c => {
  const identity = c.req.param('identity') as string
  const db = drizzle(c.env.DB)

  // Parse handle@directoryId format
  const atIndex = identity.indexOf('@')
  const handle = atIndex >= 0 ? identity.substring(0, atIndex) : identity
  const directoryId = atIndex >= 0 ? identity.substring(atIndex + 1) : null

  if (directoryId) {
    // Directory-scoped resolution
    // First verify the directory exists
    const dirResults = await db
      .select()
      .from(directories)
      .where(eq(directories.directoryId, directoryId))
      .limit(1)

    if (dirResults.length === 0) {
      return c.json({ error: 'Directory not found', code: 'NOT_FOUND' }, 404)
    }

    // Look up agent in that directory
    const agentResults = await db
      .select()
      .from(agents)
      .where(and(eq(agents.handle, handle), eq(agents.directoryId, directoryId)))
      .limit(1)

    if (agentResults.length > 0) {
      const agent = agentResults[0]
      return c.json({
        entityType: 'agent',
        handle: agent.handle,
        directoryId,
        walletAddress: agent.walletAddress,
        chain: agent.chain,
        tokenId: agent.tokenId ?? null,
        tbaAddress: agent.tbaAddress ?? null,
        homeHubUrl: agent.homeHubUrl ?? null,
        contractAddress: agent.contractAddress ?? null,
        mintTxHash: agent.mintTxHash ?? null,
        registeredAt: agent.registeredAt,
      })
    }

    // Look up org in that directory (orgs don't have directoryId column yet,
    // but we check the handle in case it's in the global namespace)
    return c.json({ error: 'Handle not found in directory', code: 'NOT_FOUND' }, 404)
  }

  // Global resolution (backward-compatible)

  // Try agents first
  const agentResults = await db.select().from(agents).where(eq(agents.handle, handle)).limit(1)

  if (agentResults.length > 0) {
    const agent = agentResults[0]
    return c.json({
      entityType: 'agent',
      handle: agent.handle,
      walletAddress: agent.walletAddress,
      chain: agent.chain,
      tokenId: agent.tokenId ?? null,
      tbaAddress: agent.tbaAddress ?? null,
      homeHubUrl: agent.homeHubUrl ?? null,
      contractAddress: agent.contractAddress ?? null,
      mintTxHash: agent.mintTxHash ?? null,
      registeredAt: agent.registeredAt,
    })
  }

  // Try organizations
  const orgResults = await db
    .select()
    .from(organizations)
    .where(eq(organizations.handle, handle))
    .limit(1)

  if (orgResults.length > 0) {
    const org = orgResults[0]
    return c.json({
      entityType: 'org',
      handle: org.handle,
      name: org.name,
      walletAddress: org.walletAddress,
      chain: org.chain,
      tokenId: org.tokenId ?? null,
      tbaAddress: org.tbaAddress ?? null,
      contractAddress: org.contractAddress ?? null,
      mintTxHash: org.mintTxHash ?? null,
      registeredAt: org.registeredAt,
    })
  }

  // Try directories
  const dirResults = await db
    .select()
    .from(directories)
    .where(eq(directories.directoryId, handle))
    .limit(1)

  if (dirResults.length > 0) {
    const dir = dirResults[0]
    return c.json({
      entityType: 'directory',
      directoryId: dir.directoryId,
      url: dir.url,
      operatorWallet: dir.operatorWallet,
      conformanceLevel: dir.conformanceLevel,
      status: dir.status,
      tokenId: dir.tokenId ?? null,
      tbaAddress: dir.tbaAddress ?? null,
      contractAddress: dir.contractAddress ?? null,
      registeredAt: dir.registeredAt,
    })
  }

  return c.json({ error: 'Handle not found', code: 'NOT_FOUND' }, 404)
})
```

- [ ] **Step 4: Run all resolve tests**

Run: `npx vitest run src/__tests__/resolve-directory.test.ts`
Expected: All PASS

- [ ] **Step 5: Run existing resolve tests (regression check)**

Run: `npx vitest run src/__tests__/server.test.ts`
Expected: All PASS (existing resolve behavior preserved)

- [ ] **Step 6: Commit**

```bash
git add src/routes/resolve.ts src/__tests__/resolve-directory.test.ts
git commit -m "feat(server): add handle@directoryId resolution and directory entity resolve"
```

---

## Task 7: Wrangler Config & Final Integration

**Files:**

- Modify: `packages/server/wrangler.toml`

- [ ] **Step 1: Add DIRECTORY_IDENTITY_CONTRACT to wrangler.toml**

In `packages/server/wrangler.toml`, add to the `[vars]` section:

```toml
DIRECTORY_IDENTITY_CONTRACT = ""
```

(Empty string — will be set to deployed address after Phase 7A contract is deployed to Base Sepolia.)

- [ ] **Step 2: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass across all test files

- [ ] **Step 3: Commit**

```bash
git add wrangler.toml
git commit -m "feat(server): add DIRECTORY_IDENTITY_CONTRACT wrangler config"
```

---

## Success Criteria Checklist

From the Phase 7B spec:

- [ ] `directories` D1 table created with all required columns
- [ ] Chain indexer watches `SAGADirectoryIdentity` contract events
- [ ] `DirectoryRegistered`, `DirectoryStatusUpdated`, `DirectoryUrlUpdated`, `Transfer` events handled
- [ ] `GET /v1/directories` returns paginated list with status filter
- [ ] `GET /v1/directories/:directoryId` returns directory details
- [ ] `GET /v1/resolve/:identity` parses `handle@directoryId` format
- [ ] Existing `handle` resolve still works (backward compatibility)
- [ ] `agents` table includes `directory_id` column
- [ ] All tests pass
