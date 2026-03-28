# Phase 1: Server Chat CRUD + D1 Schema — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Working REST API for conversation and message management with D1 persistence and wallet auth.

**Architecture:** Two new D1 tables (`chat_conversations`, `chat_messages`) with Drizzle ORM schema definitions. A new `chat.ts` route file provides CRUD endpoints behind existing `requireAuth()` middleware. Conversations are owned by wallet address and scoped to SAGA agent handles.

**Tech Stack:** Hono, Drizzle ORM, D1 (SQLite), Vitest, existing wallet auth middleware

**Spec:** `docs/superpowers/specs/2026-03-28-llm-chat-feature-design.md` (Server Design section)
**Phase breakdown:** `docs/superpowers/specs/2026-03-28-llm-chat-phase-breakdown.md` (Phase 1)

---

## File Structure

| Action | Path                                            | Responsibility                                                |
| ------ | ----------------------------------------------- | ------------------------------------------------------------- |
| Create | `packages/server/migrations/0007_chat.sql`      | D1 migration for chat tables                                  |
| Modify | `packages/server/src/db/schema.ts`              | Add Drizzle schema for `chatConversations` and `chatMessages` |
| Modify | `packages/server/src/__tests__/test-helpers.ts` | Add chat tables to `runMigrations()`                          |
| Create | `packages/server/src/routes/chat.ts`            | All chat CRUD routes                                          |
| Modify | `packages/server/src/index.ts`                  | Mount chat routes                                             |
| Create | `packages/server/src/__tests__/chat.test.ts`    | Chat route tests                                              |

---

### Task 1: D1 Migration SQL

**Files:**

- Create: `packages/server/migrations/0007_chat.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- Phase 1: Chat conversations and messages
CREATE TABLE IF NOT EXISTS chat_conversations (
  id TEXT PRIMARY KEY,
  agent_handle TEXT NOT NULL,
  wallet_address TEXT NOT NULL,
  title TEXT,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  system_prompt TEXT,
  ams_session_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_chat_conv_wallet ON chat_conversations(wallet_address);
CREATE INDEX IF NOT EXISTS idx_chat_conv_agent ON chat_conversations(agent_handle);

CREATE TABLE IF NOT EXISTS chat_messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  tokens_prompt INTEGER,
  tokens_completion INTEGER,
  cost_usd REAL,
  latency_ms INTEGER,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_chat_msg_conv ON chat_messages(conversation_id);
```

- [ ] **Step 2: Verify migration runs on local D1**

Run: `cd packages/server && npx wrangler d1 execute saga-hub --local --file=migrations/0007_chat.sql`
Expected: Success, no errors

- [ ] **Step 3: Commit**

```bash
git add packages/server/migrations/0007_chat.sql
git commit -m "feat(server): add D1 migration for chat tables"
```

---

### Task 2: Drizzle Schema Definitions

**Files:**

- Modify: `packages/server/src/db/schema.ts`

- [ ] **Step 1: Add chatConversations and chatMessages tables to schema.ts**

First, update the import at line 4 of `packages/server/src/db/schema.ts` to include `real`:

```typescript
import { integer, primaryKey, real, sqliteTable, text } from 'drizzle-orm/sqlite-core'
```

Then add the following at the end of `packages/server/src/db/schema.ts` (after the `replicationPolicies` table):

````typescript
export const chatConversations = sqliteTable('chat_conversations', {
  id: text('id').primaryKey(),
  agentHandle: text('agent_handle').notNull(),
  walletAddress: text('wallet_address').notNull(),
  title: text('title'),
  provider: text('provider').notNull(),
  model: text('model').notNull(),
  systemPrompt: text('system_prompt'),
  amsSessionId: text('ams_session_id'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
})

export const chatMessages = sqliteTable('chat_messages', {
  id: text('id').primaryKey(),
  conversationId: text('conversation_id').notNull(),
  role: text('role').notNull(),
  content: text('content').notNull(),
  tokensPrompt: integer('tokens_prompt'),
  tokensCompletion: integer('tokens_completion'),
  costUsd: real('cost_usd'),
  latencyMs: integer('latency_ms'),
  createdAt: text('created_at').notNull(),
})

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd packages/server && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add packages/server/src/db/schema.ts
git commit -m "feat(server): add Drizzle schema for chat tables"
````

---

### Task 3: Update Test Helpers

**Files:**

- Modify: `packages/server/src/__tests__/test-helpers.ts`

- [ ] **Step 1: Add chat tables to `runMigrations()`**

In `packages/server/src/__tests__/test-helpers.ts`, find the `runMigrations()` function. Add the following SQL at the end of the `db.exec()` template literal, after the `directories` CREATE TABLE statement:

```sql
    CREATE TABLE IF NOT EXISTS chat_conversations (
      id TEXT PRIMARY KEY,
      agent_handle TEXT NOT NULL,
      wallet_address TEXT NOT NULL,
      title TEXT,
      provider TEXT NOT NULL,
      model TEXT NOT NULL,
      system_prompt TEXT,
      ams_session_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS chat_messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      tokens_prompt INTEGER,
      tokens_completion INTEGER,
      cost_usd REAL,
      latency_ms INTEGER,
      created_at TEXT NOT NULL
    );
```

- [ ] **Step 2: Verify existing tests still pass**

Run: `cd packages/server && pnpm test`
Expected: All existing tests pass (no regressions)

- [ ] **Step 3: Commit**

```bash
git add packages/server/src/__tests__/test-helpers.ts
git commit -m "test(server): add chat tables to mock D1 migrations"
```

---

### Task 4: Chat Route Scaffold + Create Conversation

**Files:**

- Create: `packages/server/src/__tests__/chat.test.ts`
- Create: `packages/server/src/routes/chat.ts`

- [ ] **Step 1: Write the test file with create conversation tests**

Create `packages/server/src/__tests__/chat.test.ts`:

```typescript
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { beforeEach, describe, expect, it } from 'vitest'
import { privateKeyToAccount } from 'viem/accounts'
import { app } from '../index'
import { createMockEnv, runMigrations } from './test-helpers'
import type { Env } from '../bindings'

// Hardhat's first account — well-known test key, NOT a real wallet
const TEST_PRIVATE_KEY =
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as const // gitleaks:allow
const testAccount = privateKeyToAccount(TEST_PRIVATE_KEY)
const WALLET = testAccount.address
const CHAIN = 'eip155:8453'

let env: Env

async function req(
  method: string,
  path: string,
  opts?: { body?: unknown; headers?: Record<string, string> }
): Promise<Response> {
  const url = `http://localhost${path}`
  const headers: Record<string, string> = { ...opts?.headers }
  const init: RequestInit = { method, headers }

  if (opts?.body !== undefined) {
    headers['Content-Type'] = 'application/json'
    init.body = JSON.stringify(opts.body)
  }

  return app.request(url, init, env)
}

async function getSessionToken(): Promise<string> {
  const challengeRes = await req('POST', '/v1/auth/challenge', {
    body: { walletAddress: WALLET, chain: CHAIN },
  })
  const { challenge } = (await challengeRes.json()) as { challenge: string }

  const signature = await testAccount.signMessage({ message: challenge })
  const verifyRes = await req('POST', '/v1/auth/verify', {
    body: { walletAddress: WALLET, chain: CHAIN, signature, challenge },
  })
  const { token } = (await verifyRes.json()) as { token: string }
  return token
}

function authHeader(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` }
}

describe('Chat API', () => {
  let token: string

  beforeEach(async () => {
    env = createMockEnv()
    await runMigrations(env.DB)
    token = await getSessionToken()
  })

  describe('POST /v1/chat/conversations', () => {
    it('creates a conversation', async () => {
      const res = await req('POST', '/v1/chat/conversations', {
        headers: authHeader(token),
        body: {
          agentHandle: 'alice.saga',
          provider: 'anthropic',
          model: 'claude-sonnet-4-5-20250514',
        },
      })
      expect(res.status).toBe(201)
      const body = (await res.json()) as { conversation: Record<string, unknown> }
      expect(body.conversation.id).toMatch(/^conv_/)
      expect(body.conversation.agentHandle).toBe('alice.saga')
      expect(body.conversation.provider).toBe('anthropic')
      expect(body.conversation.model).toBe('claude-sonnet-4-5-20250514')
      expect(body.conversation.title).toBeNull()
      expect(body.conversation.createdAt).toBeTruthy()
    })

    it('creates a conversation with custom system prompt', async () => {
      const res = await req('POST', '/v1/chat/conversations', {
        headers: authHeader(token),
        body: {
          agentHandle: 'alice.saga',
          provider: 'openai',
          model: 'gpt-4o',
          systemPrompt: 'You are a helpful coding assistant.',
        },
      })
      expect(res.status).toBe(201)
      const body = (await res.json()) as { conversation: Record<string, unknown> }
      expect(body.conversation.provider).toBe('openai')
      expect(body.conversation.systemPrompt).toBe('You are a helpful coding assistant.')
    })

    it('rejects missing required fields', async () => {
      const res = await req('POST', '/v1/chat/conversations', {
        headers: authHeader(token),
        body: { agentHandle: 'alice.saga' },
      })
      expect(res.status).toBe(400)
    })

    it('rejects unauthenticated requests', async () => {
      const res = await req('POST', '/v1/chat/conversations', {
        body: {
          agentHandle: 'alice.saga',
          provider: 'anthropic',
          model: 'claude-sonnet-4-5-20250514',
        },
      })
      expect(res.status).toBe(401)
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/server && pnpm test -- --reporter=verbose src/__tests__/chat.test.ts`
Expected: FAIL — route not found (404)

- [ ] **Step 3: Create the chat routes file with create conversation endpoint**

Create `packages/server/src/routes/chat.ts`:

```typescript
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { Hono } from 'hono'
import { drizzle } from 'drizzle-orm/d1'
import { eq, and, desc, sql } from 'drizzle-orm'
import type { Env } from '../bindings'
import { chatConversations, chatMessages } from '../db/schema'
import { generateId, requireAuth } from '../middleware/auth'
import type { SessionData } from '../middleware/auth'
import { parseIntParam } from '../utils'

export const chatRoutes = new Hono<{
  Bindings: Env
  Variables: { session: SessionData }
}>()

/**
 * POST /v1/chat/conversations — Create a new conversation
 */
chatRoutes.post('/conversations', requireAuth, async c => {
  const session = c.get('session')
  const body = await c.req.json<{
    agentHandle: string
    provider: string
    model: string
    systemPrompt?: string
  }>()

  if (!body.agentHandle || !body.provider || !body.model) {
    return c.json(
      { error: 'agentHandle, provider, and model are required', code: 'INVALID_REQUEST' },
      400
    )
  }

  const db = drizzle(c.env.DB)
  const id = generateId('conv')
  const now = new Date().toISOString()

  await db.insert(chatConversations).values({
    id,
    agentHandle: body.agentHandle,
    walletAddress: session.walletAddress.toLowerCase(),
    provider: body.provider,
    model: body.model,
    systemPrompt: body.systemPrompt ?? null,
    title: null,
    amsSessionId: null,
    createdAt: now,
    updatedAt: now,
  })

  return c.json(
    {
      conversation: {
        id,
        agentHandle: body.agentHandle,
        provider: body.provider,
        model: body.model,
        systemPrompt: body.systemPrompt ?? null,
        title: null,
        createdAt: now,
        updatedAt: now,
      },
    },
    201
  )
})
```

- [ ] **Step 4: Mount chat routes in index.ts**

In `packages/server/src/index.ts`, add the import after the existing route imports:

```typescript
import { chatRoutes } from './routes/chat'
```

Add the route mount after the existing `app.route()` calls (e.g., after `app.route('/v1', relayRoutes)`):

```typescript
app.route('/v1/chat', chatRoutes)
```

Also add to the endpoints manifest in the root `GET /` handler:

```typescript
chat: '/v1/chat/conversations',
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd packages/server && pnpm test -- --reporter=verbose src/__tests__/chat.test.ts`
Expected: All 4 tests PASS

- [ ] **Step 6: Verify existing tests still pass**

Run: `cd packages/server && pnpm test`
Expected: All tests pass (no regressions)

- [ ] **Step 7: Commit**

```bash
git add packages/server/src/routes/chat.ts packages/server/src/index.ts packages/server/src/__tests__/chat.test.ts
git commit -m "feat(server): add chat route scaffold with create conversation endpoint"
```

---

### Task 5: List Conversations

**Files:**

- Modify: `packages/server/src/__tests__/chat.test.ts`
- Modify: `packages/server/src/routes/chat.ts`

- [ ] **Step 1: Add list conversations tests**

Add the following `describe` block inside the `Chat API` describe in `packages/server/src/__tests__/chat.test.ts`, after the `POST /v1/chat/conversations` block:

```typescript
describe('GET /v1/chat/conversations', () => {
  it('lists conversations for agent handle', async () => {
    // Create two conversations for same agent
    await req('POST', '/v1/chat/conversations', {
      headers: authHeader(token),
      body: {
        agentHandle: 'alice.saga',
        provider: 'anthropic',
        model: 'claude-sonnet-4-5-20250514',
      },
    })
    await req('POST', '/v1/chat/conversations', {
      headers: authHeader(token),
      body: { agentHandle: 'alice.saga', provider: 'openai', model: 'gpt-4o' },
    })
    // Create one for a different agent
    await req('POST', '/v1/chat/conversations', {
      headers: authHeader(token),
      body: { agentHandle: 'bob.saga', provider: 'anthropic', model: 'claude-sonnet-4-5-20250514' },
    })

    const res = await req('GET', '/v1/chat/conversations?agentHandle=alice.saga', {
      headers: authHeader(token),
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { conversations: Record<string, unknown>[]; total: number }
    expect(body.conversations).toHaveLength(2)
    expect(body.total).toBe(2)
  })

  it('returns empty array when no conversations exist', async () => {
    const res = await req('GET', '/v1/chat/conversations?agentHandle=alice.saga', {
      headers: authHeader(token),
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { conversations: Record<string, unknown>[]; total: number }
    expect(body.conversations).toHaveLength(0)
    expect(body.total).toBe(0)
  })

  it('requires agentHandle query param', async () => {
    const res = await req('GET', '/v1/chat/conversations', {
      headers: authHeader(token),
    })
    expect(res.status).toBe(400)
  })

  it('rejects unauthenticated requests', async () => {
    const res = await req('GET', '/v1/chat/conversations?agentHandle=alice.saga')
    expect(res.status).toBe(401)
  })
})
```

- [ ] **Step 2: Run tests to verify new tests fail**

Run: `cd packages/server && pnpm test -- --reporter=verbose src/__tests__/chat.test.ts`
Expected: New list tests FAIL (404)

- [ ] **Step 3: Implement list conversations endpoint**

Add the following route in `packages/server/src/routes/chat.ts`, after the POST `/conversations` handler:

```typescript
/**
 * GET /v1/chat/conversations — List conversations for an agent
 */
chatRoutes.get('/conversations', requireAuth, async c => {
  const session = c.get('session')
  const agentHandle = c.req.query('agentHandle')

  if (!agentHandle) {
    return c.json({ error: 'agentHandle query param is required', code: 'INVALID_REQUEST' }, 400)
  }

  const page = Math.max(1, parseIntParam(c.req.query('page'), 1))
  const limit = Math.min(100, Math.max(1, parseIntParam(c.req.query('limit'), 20)))
  const offset = (page - 1) * limit

  const db = drizzle(c.env.DB)
  const wallet = session.walletAddress.toLowerCase()

  const [rows, countResult] = await Promise.all([
    db
      .select()
      .from(chatConversations)
      .where(
        and(
          eq(chatConversations.walletAddress, wallet),
          eq(chatConversations.agentHandle, agentHandle)
        )
      )
      .orderBy(desc(chatConversations.updatedAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)` })
      .from(chatConversations)
      .where(
        and(
          eq(chatConversations.walletAddress, wallet),
          eq(chatConversations.agentHandle, agentHandle)
        )
      ),
  ])

  return c.json({
    conversations: rows.map(r => ({
      id: r.id,
      agentHandle: r.agentHandle,
      title: r.title,
      provider: r.provider,
      model: r.model,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    })),
    total: countResult[0]?.count ?? 0,
    page,
    limit,
  })
})
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/server && pnpm test -- --reporter=verbose src/__tests__/chat.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/routes/chat.ts packages/server/src/__tests__/chat.test.ts
git commit -m "feat(server): add list conversations endpoint"
```

---

### Task 6: Get Conversation with Messages

**Files:**

- Modify: `packages/server/src/__tests__/chat.test.ts`
- Modify: `packages/server/src/routes/chat.ts`

- [ ] **Step 1: Add get conversation tests**

Add the following `describe` block in `chat.test.ts`:

```typescript
describe('GET /v1/chat/conversations/:id', () => {
  it('returns conversation with messages', async () => {
    // Create conversation
    const createRes = await req('POST', '/v1/chat/conversations', {
      headers: authHeader(token),
      body: {
        agentHandle: 'alice.saga',
        provider: 'anthropic',
        model: 'claude-sonnet-4-5-20250514',
      },
    })
    const { conversation } = (await createRes.json()) as { conversation: { id: string } }

    // Add a message
    await req('POST', `/v1/chat/conversations/${conversation.id}/messages`, {
      headers: authHeader(token),
      body: { content: 'Hello, how are you?' },
    })

    // Get conversation
    const res = await req('GET', `/v1/chat/conversations/${conversation.id}`, {
      headers: authHeader(token),
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      conversation: Record<string, unknown>
      messages: Record<string, unknown>[]
    }
    expect(body.conversation.id).toBe(conversation.id)
    expect(body.conversation.provider).toBe('anthropic')
    expect(body.messages).toHaveLength(1)
    expect(body.messages[0].role).toBe('user')
    expect(body.messages[0].content).toBe('Hello, how are you?')
  })

  it('returns 404 for non-existent conversation', async () => {
    const res = await req('GET', '/v1/chat/conversations/conv_doesnotexist', {
      headers: authHeader(token),
    })
    expect(res.status).toBe(404)
  })

  it('returns 403 for conversation owned by another wallet', async () => {
    // Create conversation with current wallet
    const createRes = await req('POST', '/v1/chat/conversations', {
      headers: authHeader(token),
      body: {
        agentHandle: 'alice.saga',
        provider: 'anthropic',
        model: 'claude-sonnet-4-5-20250514',
      },
    })
    const { conversation } = (await createRes.json()) as { conversation: { id: string } }

    // Try to access with different (manually crafted) session
    // We can't easily create a second wallet session, so we'll directly modify the
    // conversation's walletAddress in the DB to simulate another owner
    const db = (await import('drizzle-orm/d1')).drizzle(env.DB)
    const { chatConversations: convTable } = await import('../db/schema')
    await db
      .update(convTable)
      .set({ walletAddress: '0xdifferentwallet' })
      .where((await import('drizzle-orm')).eq(convTable.id, conversation.id))

    const res = await req('GET', `/v1/chat/conversations/${conversation.id}`, {
      headers: authHeader(token),
    })
    expect(res.status).toBe(404)
  })
})
```

- [ ] **Step 2: Run tests to verify new tests fail**

Run: `cd packages/server && pnpm test -- --reporter=verbose src/__tests__/chat.test.ts`
Expected: New get tests FAIL (404 from missing route)

- [ ] **Step 3: Implement get conversation endpoint**

Add the following route in `packages/server/src/routes/chat.ts`:

```typescript
/**
 * GET /v1/chat/conversations/:id — Get conversation with messages
 */
chatRoutes.get('/conversations/:id', requireAuth, async c => {
  const session = c.get('session')
  const id = c.req.param('id')
  const wallet = session.walletAddress.toLowerCase()

  const db = drizzle(c.env.DB)

  const rows = await db
    .select()
    .from(chatConversations)
    .where(and(eq(chatConversations.id, id), eq(chatConversations.walletAddress, wallet)))
    .limit(1)

  if (rows.length === 0) {
    return c.json({ error: 'Conversation not found', code: 'NOT_FOUND' }, 404)
  }

  const conversation = rows[0]

  const messages = await db
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.conversationId, id))
    .orderBy(chatMessages.createdAt)

  return c.json({
    conversation: {
      id: conversation.id,
      agentHandle: conversation.agentHandle,
      title: conversation.title,
      provider: conversation.provider,
      model: conversation.model,
      systemPrompt: conversation.systemPrompt,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
    },
    messages: messages.map(m => ({
      id: m.id,
      role: m.role,
      content: m.content,
      tokensPrompt: m.tokensPrompt,
      tokensCompletion: m.tokensCompletion,
      costUsd: m.costUsd,
      latencyMs: m.latencyMs,
      createdAt: m.createdAt,
    })),
  })
})
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/server && pnpm test -- --reporter=verbose src/__tests__/chat.test.ts`
Expected: Get tests may still fail because the messages POST endpoint doesn't exist yet. The "returns conversation with messages" test depends on Task 7. The other two tests should pass. If "returns conversation with messages" fails, that's expected — it will pass after Task 7.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/routes/chat.ts packages/server/src/__tests__/chat.test.ts
git commit -m "feat(server): add get conversation with messages endpoint"
```

---

### Task 7: Save User Message

**Files:**

- Modify: `packages/server/src/__tests__/chat.test.ts`
- Modify: `packages/server/src/routes/chat.ts`

- [ ] **Step 1: Add save message tests**

Add the following `describe` block in `chat.test.ts`:

```typescript
describe('POST /v1/chat/conversations/:id/messages', () => {
  it('saves a user message', async () => {
    const createRes = await req('POST', '/v1/chat/conversations', {
      headers: authHeader(token),
      body: {
        agentHandle: 'alice.saga',
        provider: 'anthropic',
        model: 'claude-sonnet-4-5-20250514',
      },
    })
    const { conversation } = (await createRes.json()) as { conversation: { id: string } }

    const res = await req('POST', `/v1/chat/conversations/${conversation.id}/messages`, {
      headers: authHeader(token),
      body: { content: 'What is the SAGA standard?' },
    })
    expect(res.status).toBe(201)
    const body = (await res.json()) as { message: Record<string, unknown> }
    expect(body.message.id).toMatch(/^msg_/)
    expect(body.message.role).toBe('user')
    expect(body.message.content).toBe('What is the SAGA standard?')
    expect(body.message.createdAt).toBeTruthy()
  })

  it('auto-sets conversation title from first message', async () => {
    const createRes = await req('POST', '/v1/chat/conversations', {
      headers: authHeader(token),
      body: {
        agentHandle: 'alice.saga',
        provider: 'anthropic',
        model: 'claude-sonnet-4-5-20250514',
      },
    })
    const { conversation } = (await createRes.json()) as { conversation: { id: string } }

    await req('POST', `/v1/chat/conversations/${conversation.id}/messages`, {
      headers: authHeader(token),
      body: { content: 'Help me review the staking contract for security vulnerabilities' },
    })

    // Fetch conversation to check title
    const getRes = await req('GET', `/v1/chat/conversations/${conversation.id}`, {
      headers: authHeader(token),
    })
    const body = (await getRes.json()) as { conversation: { title: string } }
    expect(body.conversation.title).toBe(
      'Help me review the staking contract for security vulnerabilities'
    )
  })

  it('does not overwrite title on subsequent messages', async () => {
    const createRes = await req('POST', '/v1/chat/conversations', {
      headers: authHeader(token),
      body: {
        agentHandle: 'alice.saga',
        provider: 'anthropic',
        model: 'claude-sonnet-4-5-20250514',
      },
    })
    const { conversation } = (await createRes.json()) as { conversation: { id: string } }

    await req('POST', `/v1/chat/conversations/${conversation.id}/messages`, {
      headers: authHeader(token),
      body: { content: 'First message sets the title' },
    })
    await req('POST', `/v1/chat/conversations/${conversation.id}/messages`, {
      headers: authHeader(token),
      body: { content: 'Second message should not change title' },
    })

    const getRes = await req('GET', `/v1/chat/conversations/${conversation.id}`, {
      headers: authHeader(token),
    })
    const body = (await getRes.json()) as { conversation: { title: string } }
    expect(body.conversation.title).toBe('First message sets the title')
  })

  it('rejects empty content', async () => {
    const createRes = await req('POST', '/v1/chat/conversations', {
      headers: authHeader(token),
      body: {
        agentHandle: 'alice.saga',
        provider: 'anthropic',
        model: 'claude-sonnet-4-5-20250514',
      },
    })
    const { conversation } = (await createRes.json()) as { conversation: { id: string } }

    const res = await req('POST', `/v1/chat/conversations/${conversation.id}/messages`, {
      headers: authHeader(token),
      body: { content: '' },
    })
    expect(res.status).toBe(400)
  })

  it('returns 404 for non-existent conversation', async () => {
    const res = await req('POST', '/v1/chat/conversations/conv_doesnotexist/messages', {
      headers: authHeader(token),
      body: { content: 'Hello' },
    })
    expect(res.status).toBe(404)
  })
})
```

- [ ] **Step 2: Run tests to verify new tests fail**

Run: `cd packages/server && pnpm test -- --reporter=verbose src/__tests__/chat.test.ts`
Expected: New message tests FAIL

- [ ] **Step 3: Implement save message endpoint**

Add the following route in `packages/server/src/routes/chat.ts`:

```typescript
/**
 * POST /v1/chat/conversations/:id/messages — Save a user message
 * Phase 1: non-streaming, just persists the message.
 * Phase 2 will upgrade this to return SSE streaming LLM response.
 */
chatRoutes.post('/conversations/:id/messages', requireAuth, async c => {
  const session = c.get('session')
  const conversationId = c.req.param('id')
  const wallet = session.walletAddress.toLowerCase()

  const body = await c.req.json<{ content: string }>()

  if (!body.content) {
    return c.json({ error: 'content is required', code: 'INVALID_REQUEST' }, 400)
  }

  const db = drizzle(c.env.DB)

  // Verify conversation exists and belongs to this wallet
  const convRows = await db
    .select()
    .from(chatConversations)
    .where(
      and(eq(chatConversations.id, conversationId), eq(chatConversations.walletAddress, wallet))
    )
    .limit(1)

  if (convRows.length === 0) {
    return c.json({ error: 'Conversation not found', code: 'NOT_FOUND' }, 404)
  }

  const conversation = convRows[0]
  const msgId = generateId('msg')
  const now = new Date().toISOString()

  // Save user message
  await db.insert(chatMessages).values({
    id: msgId,
    conversationId,
    role: 'user',
    content: body.content,
    createdAt: now,
  })

  // Auto-set title from first message if not set
  if (!conversation.title) {
    const title = body.content.slice(0, 100)
    await db
      .update(chatConversations)
      .set({ title, updatedAt: now })
      .where(eq(chatConversations.id, conversationId))
  } else {
    await db
      .update(chatConversations)
      .set({ updatedAt: now })
      .where(eq(chatConversations.id, conversationId))
  }

  return c.json(
    {
      message: {
        id: msgId,
        conversationId,
        role: 'user',
        content: body.content,
        createdAt: now,
      },
    },
    201
  )
})
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/server && pnpm test -- --reporter=verbose src/__tests__/chat.test.ts`
Expected: All tests PASS (including the Task 6 "returns conversation with messages" test)

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/routes/chat.ts packages/server/src/__tests__/chat.test.ts
git commit -m "feat(server): add save user message endpoint with auto-title"
```

---

### Task 8: Delete Conversation

**Files:**

- Modify: `packages/server/src/__tests__/chat.test.ts`
- Modify: `packages/server/src/routes/chat.ts`

- [ ] **Step 1: Add delete conversation tests**

Add the following `describe` block in `chat.test.ts`:

```typescript
describe('DELETE /v1/chat/conversations/:id', () => {
  it('deletes conversation and its messages', async () => {
    const createRes = await req('POST', '/v1/chat/conversations', {
      headers: authHeader(token),
      body: {
        agentHandle: 'alice.saga',
        provider: 'anthropic',
        model: 'claude-sonnet-4-5-20250514',
      },
    })
    const { conversation } = (await createRes.json()) as { conversation: { id: string } }

    // Add a message
    await req('POST', `/v1/chat/conversations/${conversation.id}/messages`, {
      headers: authHeader(token),
      body: { content: 'Hello' },
    })

    // Delete
    const delRes = await req('DELETE', `/v1/chat/conversations/${conversation.id}`, {
      headers: authHeader(token),
    })
    expect(delRes.status).toBe(204)

    // Verify gone
    const getRes = await req('GET', `/v1/chat/conversations/${conversation.id}`, {
      headers: authHeader(token),
    })
    expect(getRes.status).toBe(404)
  })

  it('returns 404 for non-existent conversation', async () => {
    const res = await req('DELETE', '/v1/chat/conversations/conv_doesnotexist', {
      headers: authHeader(token),
    })
    expect(res.status).toBe(404)
  })

  it("cannot delete another wallet's conversation", async () => {
    const createRes = await req('POST', '/v1/chat/conversations', {
      headers: authHeader(token),
      body: {
        agentHandle: 'alice.saga',
        provider: 'anthropic',
        model: 'claude-sonnet-4-5-20250514',
      },
    })
    const { conversation } = (await createRes.json()) as { conversation: { id: string } }

    // Change owner
    const db = (await import('drizzle-orm/d1')).drizzle(env.DB)
    const { chatConversations: convTable } = await import('../db/schema')
    await db
      .update(convTable)
      .set({ walletAddress: '0xdifferentwallet' })
      .where((await import('drizzle-orm')).eq(convTable.id, conversation.id))

    const res = await req('DELETE', `/v1/chat/conversations/${conversation.id}`, {
      headers: authHeader(token),
    })
    expect(res.status).toBe(404)
  })
})
```

- [ ] **Step 2: Run tests to verify new tests fail**

Run: `cd packages/server && pnpm test -- --reporter=verbose src/__tests__/chat.test.ts`
Expected: New delete tests FAIL

- [ ] **Step 3: Implement delete conversation endpoint**

Add the following route in `packages/server/src/routes/chat.ts`:

```typescript
/**
 * DELETE /v1/chat/conversations/:id — Delete conversation and messages
 */
chatRoutes.delete('/conversations/:id', requireAuth, async c => {
  const session = c.get('session')
  const id = c.req.param('id')
  const wallet = session.walletAddress.toLowerCase()

  const db = drizzle(c.env.DB)

  // Verify ownership
  const rows = await db
    .select({ id: chatConversations.id })
    .from(chatConversations)
    .where(and(eq(chatConversations.id, id), eq(chatConversations.walletAddress, wallet)))
    .limit(1)

  if (rows.length === 0) {
    return c.json({ error: 'Conversation not found', code: 'NOT_FOUND' }, 404)
  }

  // Delete messages first, then conversation
  await db.delete(chatMessages).where(eq(chatMessages.conversationId, id))
  await db.delete(chatConversations).where(eq(chatConversations.id, id))

  return new Response(null, { status: 204 })
})
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/server && pnpm test -- --reporter=verbose src/__tests__/chat.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/routes/chat.ts packages/server/src/__tests__/chat.test.ts
git commit -m "feat(server): add delete conversation endpoint"
```

---

### Task 9: Full Integration Verification

**Files:**

- No new files

- [ ] **Step 1: Run the complete test suite**

Run: `cd packages/server && pnpm test`
Expected: All tests pass (chat tests + all existing tests)

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd packages/server && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Test with local server (manual smoke test)**

Run: `cd packages/server && npx wrangler d1 execute saga-hub --local --file=migrations/0007_chat.sql && pnpm dev`

In another terminal:

```bash
# Create conversation
curl -s -X POST http://localhost:8787/v1/chat/conversations \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"agentHandle":"test","provider":"anthropic","model":"claude-sonnet-4-5-20250514"}' | jq

# Note: requires a valid session token. Skip this step if no active auth session.
```

Expected: 201 response with conversation object (or 401 if no valid token — that's fine for Phase 1)

- [ ] **Step 4: Commit any final adjustments**

If any fixes were needed, commit them:

```bash
git add -u
git commit -m "fix(server): address chat integration issues"
```
