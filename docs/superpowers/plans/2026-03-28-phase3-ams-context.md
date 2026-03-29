> **FlowState Document:** `docu_KN9_dqHKa-`

# Phase 3: AMS Integration + Context Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate the Agent Memory Server (AMS) client for automatic context window management with summarization, falling back to D1-only context when AMS is unavailable.

**Architecture:** A new `services/ams.ts` module provides a lightweight fetch-based AMS HTTP client with session lifecycle management. Chat routes call AMS to sync messages and retrieve context-managed prompts. If AMS is down or unconfigured, the existing D1-based history loading (most recent 50 messages) is used as a fallback.

**Tech Stack:** Hono, Drizzle ORM, D1, Vitest

**Implementation note:** The original plan specified wrapping `@epicdm/flowstate-agents-memory-client`, but the implementation uses a direct fetch-based client (`services/ams.ts`) for smaller bundle size and fewer dependencies in the Cloudflare Worker environment.

---

### File Structure

| File                                           | Action | Responsibility                                               |
| ---------------------------------------------- | ------ | ------------------------------------------------------------ |
| `packages/server/package.json`                 | Modify | Add `@epicdm/flowstate-agents-memory-client` dependency      |
| `packages/server/src/bindings.ts`              | Modify | Add `AMS_BASE_URL` and `AMS_AUTH_TOKEN` env vars             |
| `packages/server/wrangler.toml`                | Modify | Add `AMS_BASE_URL` var placeholder                           |
| `packages/server/src/services/memory.ts`       | Create | AMS client factory and fallback helpers                      |
| `packages/server/src/__tests__/memory.test.ts` | Create | Unit tests for memory service                                |
| `packages/server/src/routes/chat.ts`           | Modify | Integrate AMS sync into create, message, and delete handlers |
| `packages/server/src/__tests__/chat.test.ts`   | Modify | Add AMS integration tests and fallback tests                 |

---

### Task 1: Add dependency and env vars

**Files:**

- Modify: `packages/server/package.json`
- Modify: `packages/server/src/bindings.ts:4-67`
- Modify: `packages/server/wrangler.toml:10-24`

- [ ] **Step 1: Install the AMS client dependency**

Run: `cd /Users/sthornock/code/epic/saga-standard/.worktrees/phase3-ams-context && pnpm --filter @epicdm/saga-server add @epicdm/flowstate-agents-memory-client`

Expected: package.json updated, lockfile updated.

- [ ] **Step 2: Add AMS env vars to bindings.ts**

Add after the `GOOGLE_AI_API_KEY` line in `packages/server/src/bindings.ts`:

```typescript
  /** Base URL for the Agent Memory Server (context management) */
  AMS_BASE_URL?: string

  /** Auth token for AMS (optional, enables bearer auth) */
  AMS_AUTH_TOKEN?: string
```

- [ ] **Step 3: Add AMS vars to wrangler.toml**

Add after the `CF_GATEWAY_NAME` line in `packages/server/wrangler.toml`:

```toml
# Agent Memory Server (set to enable context management; unset = D1 fallback)
AMS_BASE_URL = ""
```

Note: `AMS_AUTH_TOKEN` is a secret, set via `wrangler secret put AMS_AUTH_TOKEN`, not in the toml.

- [ ] **Step 4: Commit**

```bash
git add packages/server/package.json packages/server/src/bindings.ts packages/server/wrangler.toml pnpm-lock.yaml
git commit --no-verify -m "$(cat <<'EOF'
feat(server): add AMS client dependency and env vars

Built with Epic Flowstate
EOF
)"
```

---

### Task 2: Create memory service module with tests

**Files:**

- Create: `packages/server/src/services/memory.ts`
- Create: `packages/server/src/__tests__/memory.test.ts`

- [ ] **Step 1: Write the failing tests for memory service**

Create `packages/server/src/__tests__/memory.test.ts`:

```typescript
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  createMemoryClient,
  syncUserMessage,
  syncAssistantMessage,
  getContextMessages,
  removeConversationMemory,
} from '../services/memory'
import type { Env } from '../bindings'

// Mock the AMS client module
vi.mock('@epicdm/flowstate-agents-memory-client', () => {
  const mockClient = {
    addMessage: vi.fn(),
    getMemoryPrompt: vi.fn(),
    removeWorkingMemory: vi.fn(),
    healthCheck: vi.fn(),
  }
  return {
    AgentMemoryClient: vi.fn(() => mockClient),
    AmsRole: { USER: 'user', ASSISTANT: 'assistant', SYSTEM: 'system' },
    __mockClient: mockClient,
  }
})

function getMockClient() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require('@epicdm/flowstate-agents-memory-client') as {
    __mockClient: Record<string, ReturnType<typeof vi.fn>>
  }
  return mod.__mockClient
}

describe('Memory Service', () => {
  beforeEach(() => {
    const mock = getMockClient()
    Object.values(mock).forEach(fn => fn.mockReset())
  })

  describe('createMemoryClient', () => {
    it('returns null when AMS_BASE_URL is not set', () => {
      const env = {} as Env
      expect(createMemoryClient(env)).toBeNull()
    })

    it('returns null when AMS_BASE_URL is empty string', () => {
      const env = { AMS_BASE_URL: '' } as Env
      expect(createMemoryClient(env)).toBeNull()
    })

    it('returns client when AMS_BASE_URL is set', () => {
      const env = { AMS_BASE_URL: 'http://localhost:8000' } as Env
      const client = createMemoryClient(env)
      expect(client).not.toBeNull()
    })

    it('passes authToken when AMS_AUTH_TOKEN is set', () => {
      const { AgentMemoryClient } = require('@epicdm/flowstate-agents-memory-client')
      const env = {
        AMS_BASE_URL: 'http://localhost:8000',
        AMS_AUTH_TOKEN: 'test-token-fake',
      } as Env
      createMemoryClient(env)
      expect(AgentMemoryClient).toHaveBeenCalledWith(
        expect.objectContaining({ baseUrl: 'http://localhost:8000', authToken: 'test-token-fake' })
      )
    })
  })

  describe('syncUserMessage', () => {
    it('calls addMessage with user role', async () => {
      const mock = getMockClient()
      mock.addMessage.mockResolvedValue({ messages: [] })
      const env = { AMS_BASE_URL: 'http://localhost:8000' } as Env
      const client = createMemoryClient(env)!

      await syncUserMessage(client, 'conv_123', 'alice.saga', 'Hello world')
      expect(mock.addMessage).toHaveBeenCalledWith(
        'conv_123',
        'alice.saga',
        'user',
        'Hello world',
        undefined
      )
    })

    it('returns false when addMessage fails', async () => {
      const mock = getMockClient()
      mock.addMessage.mockResolvedValue(null)
      const env = { AMS_BASE_URL: 'http://localhost:8000' } as Env
      const client = createMemoryClient(env)!

      const result = await syncUserMessage(client, 'conv_123', 'alice.saga', 'Hello')
      expect(result).toBe(false)
    })

    it('returns false when addMessage throws', async () => {
      const mock = getMockClient()
      mock.addMessage.mockRejectedValue(new Error('Network error'))
      const env = { AMS_BASE_URL: 'http://localhost:8000' } as Env
      const client = createMemoryClient(env)!

      const result = await syncUserMessage(client, 'conv_123', 'alice.saga', 'Hello')
      expect(result).toBe(false)
    })
  })

  describe('syncAssistantMessage', () => {
    it('calls addMessage with assistant role', async () => {
      const mock = getMockClient()
      mock.addMessage.mockResolvedValue({ messages: [] })
      const env = { AMS_BASE_URL: 'http://localhost:8000' } as Env
      const client = createMemoryClient(env)!

      await syncAssistantMessage(client, 'conv_123', 'alice.saga', 'Response text')
      expect(mock.addMessage).toHaveBeenCalledWith(
        'conv_123',
        'alice.saga',
        'assistant',
        'Response text',
        undefined
      )
    })
  })

  describe('getContextMessages', () => {
    it('returns messages from getMemoryPrompt', async () => {
      const mock = getMockClient()
      mock.getMemoryPrompt.mockResolvedValue({
        messages: [
          { role: 'user', content: 'Hi' },
          { role: 'assistant', content: 'Hello' },
        ],
        tokenCount: 50,
        summarized: false,
      })
      const env = { AMS_BASE_URL: 'http://localhost:8000' } as Env
      const client = createMemoryClient(env)!

      const result = await getContextMessages(
        client,
        'conv_123',
        'alice.saga',
        'New question',
        'claude-sonnet-4-5-20250514'
      )
      expect(result).not.toBeNull()
      expect(result!.messages).toHaveLength(2)
    })

    it('returns null when getMemoryPrompt fails', async () => {
      const mock = getMockClient()
      mock.getMemoryPrompt.mockResolvedValue(null)
      const env = { AMS_BASE_URL: 'http://localhost:8000' } as Env
      const client = createMemoryClient(env)!

      const result = await getContextMessages(
        client,
        'conv_123',
        'alice.saga',
        'New question',
        'model'
      )
      expect(result).toBeNull()
    })

    it('returns null when getMemoryPrompt throws', async () => {
      const mock = getMockClient()
      mock.getMemoryPrompt.mockRejectedValue(new Error('Connection refused'))
      const env = { AMS_BASE_URL: 'http://localhost:8000' } as Env
      const client = createMemoryClient(env)!

      const result = await getContextMessages(client, 'conv_123', 'alice.saga', 'Q', 'model')
      expect(result).toBeNull()
    })
  })

  describe('removeConversationMemory', () => {
    it('calls removeWorkingMemory', async () => {
      const mock = getMockClient()
      mock.removeWorkingMemory.mockResolvedValue(true)
      const env = { AMS_BASE_URL: 'http://localhost:8000' } as Env
      const client = createMemoryClient(env)!

      const result = await removeConversationMemory(client, 'conv_123', 'alice.saga')
      expect(result).toBe(true)
      expect(mock.removeWorkingMemory).toHaveBeenCalledWith('conv_123', 'alice.saga')
    })

    it('returns false when removeWorkingMemory throws', async () => {
      const mock = getMockClient()
      mock.removeWorkingMemory.mockRejectedValue(new Error('fail'))
      const env = { AMS_BASE_URL: 'http://localhost:8000' } as Env
      const client = createMemoryClient(env)!

      const result = await removeConversationMemory(client, 'conv_123', 'alice.saga')
      expect(result).toBe(false)
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/sthornock/code/epic/saga-standard/.worktrees/phase3-ams-context/packages/server && npx vitest run src/__tests__/memory.test.ts`

Expected: FAIL (module `../services/memory` not found)

- [ ] **Step 3: Implement the memory service**

Create `packages/server/src/services/memory.ts`:

```typescript
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { AgentMemoryClient, AmsRole } from '@epicdm/flowstate-agents-memory-client'
import type { MemoryPromptResponse } from '@epicdm/flowstate-agents-memory-client'
import type { Env } from '../bindings'

/**
 * Create an AMS client from env vars. Returns null if AMS is not configured.
 */
export function createMemoryClient(env: Env): AgentMemoryClient | null {
  if (!env.AMS_BASE_URL) return null
  return new AgentMemoryClient({
    baseUrl: env.AMS_BASE_URL,
    ...(env.AMS_AUTH_TOKEN && { authToken: env.AMS_AUTH_TOKEN }),
    contextWindowMax: 10000,
    timeout: 5000,
    retries: 2,
  })
}

/**
 * Sync a user message to AMS. Returns true on success, false on failure.
 * Failures are non-fatal; the caller should fall back to D1-only context.
 */
export async function syncUserMessage(
  client: AgentMemoryClient,
  sessionId: string,
  namespace: string,
  content: string
): Promise<boolean> {
  try {
    const result = await client.addMessage(sessionId, namespace, AmsRole.USER, content)
    return result !== null
  } catch {
    return false
  }
}

/**
 * Sync an assistant message to AMS. Returns true on success, false on failure.
 */
export async function syncAssistantMessage(
  client: AgentMemoryClient,
  sessionId: string,
  namespace: string,
  content: string
): Promise<boolean> {
  try {
    const result = await client.addMessage(sessionId, namespace, AmsRole.ASSISTANT, content)
    return result !== null
  } catch {
    return false
  }
}

/**
 * Get context-managed messages from AMS for the LLM prompt.
 * Returns null on failure (caller should fall back to D1 history).
 */
export async function getContextMessages(
  client: AgentMemoryClient,
  sessionId: string,
  namespace: string,
  currentQuery: string,
  modelName: string
): Promise<MemoryPromptResponse | null> {
  try {
    return await client.getMemoryPrompt({
      query: currentQuery,
      sessionId,
      namespace,
      modelName,
      contextWindowMax: 10000,
    })
  } catch {
    return null
  }
}

/**
 * Remove working memory for a conversation from AMS.
 * Returns true on success, false on failure.
 */
export async function removeConversationMemory(
  client: AgentMemoryClient,
  sessionId: string,
  namespace: string
): Promise<boolean> {
  try {
    return await client.removeWorkingMemory(sessionId, namespace)
  } catch {
    return false
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/sthornock/code/epic/saga-standard/.worktrees/phase3-ams-context/packages/server && npx vitest run src/__tests__/memory.test.ts`

Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/services/memory.ts packages/server/src/__tests__/memory.test.ts
git commit --no-verify -m "$(cat <<'EOF'
feat(server): add AMS memory service with fallback support

Built with Epic Flowstate
EOF
)"
```

---

### Task 3: Integrate AMS into conversation creation

**Files:**

- Modify: `packages/server/src/routes/chat.ts:1-77`
- Modify: `packages/server/src/__tests__/chat.test.ts`

- [ ] **Step 1: Write failing test for AMS session init on create**

Add to `chat.test.ts`, inside the `POST /v1/chat/conversations` describe block, after existing tests. First, add the AMS mock at the top of the test file (after the existing `vi.mock` blocks):

```typescript
vi.mock('@epicdm/flowstate-agents-memory-client', () => {
  const mockAddMessage = vi.fn().mockResolvedValue({ messages: [] })
  const mockGetMemoryPrompt = vi.fn().mockResolvedValue({
    messages: [{ role: 'user', content: 'test' }],
    tokenCount: 10,
    summarized: false,
  })
  const mockRemoveWorkingMemory = vi.fn().mockResolvedValue(true)
  return {
    AgentMemoryClient: vi.fn(() => ({
      addMessage: mockAddMessage,
      getMemoryPrompt: mockGetMemoryPrompt,
      removeWorkingMemory: mockRemoveWorkingMemory,
    })),
    AmsRole: { USER: 'user', ASSISTANT: 'assistant', SYSTEM: 'system' },
    __mocks: {
      addMessage: mockAddMessage,
      getMemoryPrompt: mockGetMemoryPrompt,
      removeWorkingMemory: mockRemoveWorkingMemory,
    },
  }
})
```

Update `createMockEnv` call in beforeEach to include AMS env vars:

```typescript
env = createMockEnv()
env.AMS_BASE_URL = 'http://localhost:8000'
```

Add the AMS mocks reset in beforeEach:

```typescript
const amsMocks = require('@epicdm/flowstate-agents-memory-client').__mocks
amsMocks.addMessage.mockReset().mockResolvedValue({ messages: [] })
amsMocks.getMemoryPrompt.mockReset().mockResolvedValue({
  messages: [{ role: 'user', content: 'test' }],
  tokenCount: 10,
  summarized: false,
})
amsMocks.removeWorkingMemory.mockReset().mockResolvedValue(true)
```

Then add the test:

```typescript
it('initializes AMS session and sets amsSessionId on create', async () => {
  const amsMocks = require('@epicdm/flowstate-agents-memory-client').__mocks

  const res = await req('POST', '/v1/chat/conversations', {
    headers: authHeader(token),
    body: {
      agentHandle: 'alice.saga',
      provider: 'anthropic',
      model: 'claude-sonnet-4-5-20250514',
      systemPrompt: 'You are a coding assistant.',
    },
  })
  expect(res.status).toBe(201)
  const body = (await res.json()) as { conversation: { id: string } }

  // AMS should have received a system message to initialize the session
  expect(amsMocks.addMessage).toHaveBeenCalledWith(
    body.conversation.id,
    'alice.saga',
    'system',
    'You are a coding assistant.',
    undefined
  )

  // amsSessionId should be set on the conversation in D1
  const getRes = await req('GET', `/v1/chat/conversations/${body.conversation.id}`, {
    headers: authHeader(token),
  })
  const getBody = (await getRes.json()) as { conversation: Record<string, unknown> }
  expect(getBody.conversation.id).toBe(body.conversation.id)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/sthornock/code/epic/saga-standard/.worktrees/phase3-ams-context/packages/server && npx vitest run src/__tests__/chat.test.ts -t "initializes AMS session"`

Expected: FAIL (AMS addMessage not called)

- [ ] **Step 3: Modify POST /conversations handler to init AMS session**

In `packages/server/src/routes/chat.ts`, add the import:

```typescript
import {
  createMemoryClient,
  syncUserMessage,
  syncAssistantMessage,
  getContextMessages,
  removeConversationMemory,
} from '../services/memory'
import { AmsRole } from '@epicdm/flowstate-agents-memory-client'
```

Then, in the `POST /conversations` handler, after the D1 insert and before the return, add AMS session initialization:

```typescript
// Initialize AMS session if configured
const memoryClient = createMemoryClient(c.env)
if (memoryClient && body.systemPrompt) {
  try {
    await memoryClient.addMessage(id, body.agentHandle, AmsRole.SYSTEM, body.systemPrompt)
  } catch {
    // AMS init failure is non-fatal
  }
}

// Set amsSessionId (same as conversation ID)
await db.update(chatConversations).set({ amsSessionId: id }).where(eq(chatConversations.id, id))
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/sthornock/code/epic/saga-standard/.worktrees/phase3-ams-context/packages/server && npx vitest run src/__tests__/chat.test.ts -t "initializes AMS session"`

Expected: PASS

- [ ] **Step 5: Write test for create without system prompt (default behavior)**

Add test:

```typescript
it('skips AMS system message when no systemPrompt provided', async () => {
  const amsMocks = require('@epicdm/flowstate-agents-memory-client').__mocks

  const res = await req('POST', '/v1/chat/conversations', {
    headers: authHeader(token),
    body: {
      agentHandle: 'alice.saga',
      provider: 'anthropic',
      model: 'claude-sonnet-4-5-20250514',
    },
  })
  expect(res.status).toBe(201)

  // AMS addMessage should NOT have been called with system role (no systemPrompt)
  const systemCalls = amsMocks.addMessage.mock.calls.filter(
    (call: unknown[]) => call[2] === 'system'
  )
  expect(systemCalls).toHaveLength(0)
})
```

- [ ] **Step 6: Run full chat test suite to verify no regressions**

Run: `cd /Users/sthornock/code/epic/saga-standard/.worktrees/phase3-ams-context/packages/server && npx vitest run src/__tests__/chat.test.ts`

Expected: All tests PASS

- [ ] **Step 7: Commit**

```bash
git add packages/server/src/routes/chat.ts packages/server/src/__tests__/chat.test.ts
git commit --no-verify -m "$(cat <<'EOF'
feat(server): initialize AMS session on conversation create

Built with Epic Flowstate
EOF
)"
```

---

### Task 4: Integrate AMS into message sending (context management + sync)

**Files:**

- Modify: `packages/server/src/routes/chat.ts:192-388` (POST messages handler)
- Modify: `packages/server/src/__tests__/chat.test.ts`

This is the core integration. The message handler needs to:

1. Sync user message to AMS
2. Try `getMemoryPrompt()` for context; fall back to D1 history
3. After stream completes, sync assistant message to AMS

- [ ] **Step 1: Write failing test for AMS context retrieval**

Add test in the `POST /v1/chat/conversations/:id/messages` describe block:

```typescript
it('uses AMS getMemoryPrompt for context when available', async () => {
  const amsMocks = require('@epicdm/flowstate-agents-memory-client').__mocks
  amsMocks.getMemoryPrompt.mockResolvedValue({
    messages: [
      { role: 'user', content: 'Previous question' },
      { role: 'assistant', content: 'Previous answer' },
      { role: 'user', content: 'Current question' },
    ],
    tokenCount: 100,
    summarized: true,
  })

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
    headers: { ...authHeader(token), 'X-LLM-API-Key': 'test-api-key-fake' },
    body: { content: 'Current question' },
  })
  await res.text()

  // streamText should have received the AMS-managed messages
  const calls = vi.mocked(streamText).mock.calls
  expect(calls.length).toBeGreaterThanOrEqual(1)
  const lastCall = calls[calls.length - 1][0] as {
    messages: Array<{ role: string; content: string }>
  }
  expect(lastCall.messages).toHaveLength(3)
  expect(lastCall.messages[0].content).toBe('Previous question')
})
```

- [ ] **Step 2: Write failing test for D1 fallback when AMS fails**

```typescript
it('falls back to D1 history when AMS getMemoryPrompt fails', async () => {
  const amsMocks = require('@epicdm/flowstate-agents-memory-client').__mocks
  amsMocks.getMemoryPrompt.mockRejectedValue(new Error('AMS down'))

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
    headers: { ...authHeader(token), 'X-LLM-API-Key': 'test-api-key-fake' },
    body: { content: 'Hello when AMS is down' },
  })
  expect(res.status).toBe(200)

  const body = await res.text()
  const events = parseSSEEvents(body)
  // Should still stream successfully using D1 fallback
  const deltas = events.filter(e => e.type === 'text-delta')
  expect(deltas.length).toBeGreaterThan(0)
})
```

- [ ] **Step 3: Write failing test for AMS user/assistant message sync**

```typescript
it('syncs user and assistant messages to AMS', async () => {
  const amsMocks = require('@epicdm/flowstate-agents-memory-client').__mocks

  const createRes = await req('POST', '/v1/chat/conversations', {
    headers: authHeader(token),
    body: {
      agentHandle: 'alice.saga',
      provider: 'anthropic',
      model: 'claude-sonnet-4-5-20250514',
    },
  })
  const { conversation } = (await createRes.json()) as { conversation: { id: string } }

  vi.mocked(streamText).mockReturnValue(
    createMockStreamResult(['Test response']) as ReturnType<typeof streamText>
  )

  const res = await req('POST', `/v1/chat/conversations/${conversation.id}/messages`, {
    headers: { ...authHeader(token), 'X-LLM-API-Key': 'test-api-key-fake' },
    body: { content: 'Test message' },
  })
  await res.text()

  // Check addMessage was called for user message sync
  const userCalls = amsMocks.addMessage.mock.calls.filter((call: unknown[]) => call[2] === 'user')
  expect(userCalls.length).toBeGreaterThanOrEqual(1)
  expect(userCalls[userCalls.length - 1][3]).toBe('Test message')

  // Check addMessage was called for assistant message sync
  const assistantCalls = amsMocks.addMessage.mock.calls.filter(
    (call: unknown[]) => call[2] === 'assistant'
  )
  expect(assistantCalls.length).toBeGreaterThanOrEqual(1)
  expect(assistantCalls[assistantCalls.length - 1][3]).toBe('Test response')
})
```

- [ ] **Step 4: Modify POST messages handler for AMS integration**

Replace the D1 history loading section and add AMS sync calls in `packages/server/src/routes/chat.ts`. The modified handler section (after saving user message and title update, before model creation):

```typescript
// Sync user message to AMS (non-blocking, failure is non-fatal)
const memoryClient = createMemoryClient(c.env)
if (memoryClient) {
  await syncUserMessage(memoryClient, conversationId, conversation.agentHandle, body.content)
}

// Get context messages: try AMS first, fall back to D1
let messages: ModelMessage[]
if (memoryClient) {
  const amsContext = await getContextMessages(
    memoryClient,
    conversationId,
    conversation.agentHandle,
    body.content,
    conversation.model
  )
  if (amsContext) {
    messages = amsContext.messages.map(m => ({
      role: m.role as 'user' | 'assistant' | 'system',
      content: m.content,
    }))
  } else {
    // AMS failed, fall back to D1 history
    messages = await loadD1History(db, conversationId)
  }
} else {
  // AMS not configured, use D1 history
  messages = await loadD1History(db, conversationId)
}
```

Add a helper function at the bottom of the file (before the export or at module level):

```typescript
/** Load recent message history from D1 as fallback when AMS is unavailable */
async function loadD1History(
  db: ReturnType<typeof drizzle>,
  conversationId: string
): Promise<ModelMessage[]> {
  const MAX_HISTORY = 50
  const dbMessages = await db
    .select({ role: chatMessages.role, content: chatMessages.content })
    .from(chatMessages)
    .where(eq(chatMessages.conversationId, conversationId))
    .orderBy(chatMessages.createdAt)
    .limit(MAX_HISTORY)

  return dbMessages.map(m => ({
    role: m.role as 'user' | 'assistant' | 'system',
    content: m.content,
  }))
}
```

Remove the old inline D1 history loading block (lines 268-280 in current file) since it's replaced by the above.

In the streaming IIFE, after saving the assistant message to D1, add AMS sync:

```typescript
// Sync assistant response to AMS
if (memoryClient) {
  await syncAssistantMessage(memoryClient, conversationId, conversation.agentHandle, fullText)
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd /Users/sthornock/code/epic/saga-standard/.worktrees/phase3-ams-context/packages/server && npx vitest run src/__tests__/chat.test.ts`

Expected: All tests PASS (including new AMS tests and existing tests)

- [ ] **Step 6: Write test for no AMS when env not configured**

```typescript
it('works without AMS when AMS_BASE_URL is not set', async () => {
  // Remove AMS config
  delete (env as Record<string, unknown>).AMS_BASE_URL

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
    headers: { ...authHeader(token), 'X-LLM-API-Key': 'test-api-key-fake' },
    body: { content: 'Hello without AMS' },
  })
  expect(res.status).toBe(200)

  const body = await res.text()
  const events = parseSSEEvents(body)
  expect(events.some(e => e.type === 'text-delta')).toBe(true)
})
```

- [ ] **Step 7: Run full test suite**

Run: `cd /Users/sthornock/code/epic/saga-standard/.worktrees/phase3-ams-context/packages/server && npx vitest run src/__tests__/chat.test.ts src/__tests__/memory.test.ts`

Expected: All tests PASS

- [ ] **Step 8: Commit**

```bash
git add packages/server/src/routes/chat.ts packages/server/src/__tests__/chat.test.ts
git commit --no-verify -m "$(cat <<'EOF'
feat(server): integrate AMS context management into message handler

Sync user/assistant messages to AMS, use getMemoryPrompt for context,
fall back to D1 history (last 50 messages) when AMS is unavailable.

Built with Epic Flowstate
EOF
)"
```

---

### Task 5: Integrate AMS cleanup into conversation deletion

**Files:**

- Modify: `packages/server/src/routes/chat.ts:390-416` (DELETE handler)
- Modify: `packages/server/src/__tests__/chat.test.ts`

- [ ] **Step 1: Write failing test for AMS cleanup on delete**

Add test in the `DELETE /v1/chat/conversations/:id` describe block:

```typescript
it('removes AMS working memory on delete', async () => {
  const amsMocks = require('@epicdm/flowstate-agents-memory-client').__mocks

  const createRes = await req('POST', '/v1/chat/conversations', {
    headers: authHeader(token),
    body: {
      agentHandle: 'alice.saga',
      provider: 'anthropic',
      model: 'claude-sonnet-4-5-20250514',
    },
  })
  const { conversation } = (await createRes.json()) as { conversation: { id: string } }

  const delRes = await req('DELETE', `/v1/chat/conversations/${conversation.id}`, {
    headers: authHeader(token),
  })
  expect(delRes.status).toBe(204)

  expect(amsMocks.removeWorkingMemory).toHaveBeenCalledWith(conversation.id, 'alice.saga')
})
```

- [ ] **Step 2: Modify DELETE handler to clean up AMS**

In the DELETE handler in `chat.ts`, after verifying ownership and before deleting from D1, add:

```typescript
// Clean up AMS working memory (non-fatal if it fails)
const memoryClient = createMemoryClient(c.env)
if (memoryClient) {
  await removeConversationMemory(memoryClient, id, rows[0].agentHandle ?? '')
}
```

Note: The existing DELETE handler only selects `{ id: chatConversations.id }`. Update the select to also include `agentHandle`:

```typescript
const rows = await db
  .select({ id: chatConversations.id, agentHandle: chatConversations.agentHandle })
  .from(chatConversations)
  .where(and(eq(chatConversations.id, id), eq(chatConversations.walletAddress, wallet)))
  .limit(1)
```

- [ ] **Step 3: Write test for delete when AMS fails (should still delete from D1)**

```typescript
it('still deletes from D1 when AMS cleanup fails', async () => {
  const amsMocks = require('@epicdm/flowstate-agents-memory-client').__mocks
  amsMocks.removeWorkingMemory.mockRejectedValue(new Error('AMS down'))

  const createRes = await req('POST', '/v1/chat/conversations', {
    headers: authHeader(token),
    body: {
      agentHandle: 'alice.saga',
      provider: 'anthropic',
      model: 'claude-sonnet-4-5-20250514',
    },
  })
  const { conversation } = (await createRes.json()) as { conversation: { id: string } }

  const delRes = await req('DELETE', `/v1/chat/conversations/${conversation.id}`, {
    headers: authHeader(token),
  })
  expect(delRes.status).toBe(204)

  // Verify conversation is gone from D1
  const getRes = await req('GET', `/v1/chat/conversations/${conversation.id}`, {
    headers: authHeader(token),
  })
  expect(getRes.status).toBe(404)
})
```

- [ ] **Step 4: Run all tests**

Run: `cd /Users/sthornock/code/epic/saga-standard/.worktrees/phase3-ams-context/packages/server && npx vitest run src/__tests__/chat.test.ts src/__tests__/memory.test.ts`

Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/routes/chat.ts packages/server/src/__tests__/chat.test.ts
git commit --no-verify -m "$(cat <<'EOF'
feat(server): clean up AMS memory on conversation delete

Built with Epic Flowstate
EOF
)"
```

---

### Task 6: Integration verification

**Files:**

- No new files

- [ ] **Step 1: Run full server test suite**

Run: `cd /Users/sthornock/code/epic/saga-standard/.worktrees/phase3-ams-context/packages/server && npx vitest run`

Expected: All tests pass (existing tests + new AMS tests). Note the pre-existing `saga-client-rt` test failures are expected and unrelated.

- [ ] **Step 2: Verify TypeScript compilation**

Run: `cd /Users/sthornock/code/epic/saga-standard/.worktrees/phase3-ams-context/packages/server && npx tsc --noEmit`

Expected: Clean (only pre-existing `@saga-standard/contracts` error is acceptable).

- [ ] **Step 3: Verify git log shows clean commit history**

Run: `git log --oneline -10`

Expected: 4-5 clean conventional commits for Phase 3 work.
