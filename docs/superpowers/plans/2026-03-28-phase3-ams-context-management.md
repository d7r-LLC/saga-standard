> **FlowState Document:** `docu_-XnzVHNbro`

# Phase 3: AMS Integration + Context Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add context window management to chat conversations via the Agent Memory Service (AMS), with graceful fallback to D1 when AMS is unavailable.

**Architecture:** A new `services/ams.ts` module provides an HTTP client for the AMS API (session management, message sync, context retrieval). The chat routes call AMS at three points: conversation create (init session), message send (sync messages + get managed context), and conversation delete (remove session). When AMS is unreachable, the existing D1 message loading acts as the fallback.

**Tech Stack:** Hono (CF Workers), Drizzle ORM + D1, fetch (AMS HTTP client), Vitest

---

## File Structure

| Action | Path                                            | Responsibility                                                                                |
| ------ | ----------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Create | `packages/server/src/services/ams.ts`           | AMS HTTP client: health check, session init, message sync, context retrieval, session removal |
| Create | `packages/server/src/__tests__/ams.test.ts`     | Unit tests for AMS service functions                                                          |
| Modify | `packages/server/src/bindings.ts`               | Add `AMS_BASE_URL` and `AMS_AUTH_TOKEN` to Env                                                |
| Modify | `packages/server/wrangler.toml`                 | Add AMS env var placeholders                                                                  |
| Modify | `packages/server/src/routes/chat.ts`            | Integrate AMS at create, message, and delete; D1 fallback on AMS failure                      |
| Modify | `packages/server/src/__tests__/chat.test.ts`    | AMS integration tests and fallback tests                                                      |
| Modify | `packages/server/src/__tests__/test-helpers.ts` | Add AMS env vars to `createMockEnv()`                                                         |

---

### Task 1: AMS Service Client

**Files:**

- Create: `packages/server/src/services/ams.ts`
- Create: `packages/server/src/__tests__/ams.test.ts`

- [ ] **Step 1: Write failing tests for AMS client**

Create `packages/server/src/__tests__/ams.test.ts`:

```typescript
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createAmsClient, type AmsClient } from '../services/ams'

let client: AmsClient

beforeEach(() => {
  client = createAmsClient('http://localhost:7090', 'test-auth-token')
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('AmsClient', () => {
  describe('healthCheck', () => {
    it('returns true when service is healthy', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('OK', { status: 200 }))
      expect(await client.healthCheck()).toBe(true)
    })

    it('returns false when service is unreachable', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('ECONNREFUSED'))
      expect(await client.healthCheck()).toBe(false)
    })

    it('returns false on non-200 response', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response('Service Unavailable', { status: 503 })
      )
      expect(await client.healthCheck()).toBe(false)
    })
  })

  describe('initSession', () => {
    it('creates a session and returns sessionId', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify({ sessionId: 'conv_abc', created: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )

      const result = await client.initSession('conv_abc', 'alice.saga')
      expect(result.sessionId).toBe('conv_abc')
      expect(result.created).toBe(true)

      const call = vi.mocked(fetch).mock.calls[0]
      expect(call[0]).toBe('http://localhost:7090/api/working-memory/sessions')
      expect(call[1]?.method).toBe('POST')
      const body = JSON.parse(call[1]?.body as string)
      expect(body.sessionId).toBe('conv_abc')
      expect(body.namespace).toBe('alice.saga')
    })

    it('passes system prompt when provided', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify({ sessionId: 'conv_abc', created: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )

      await client.initSession('conv_abc', 'alice.saga', 'Be helpful.')

      const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1]?.body as string)
      expect(body.systemPrompt).toBe('Be helpful.')
    })

    it('throws on non-200 response', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response('Bad Request', { status: 400 })
      )
      await expect(client.initSession('conv_abc', 'ns')).rejects.toThrow(
        'AMS initSession failed: 400'
      )
    })
  })

  describe('addMessage', () => {
    it('sends message to AMS session', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), { status: 200 })
      )

      await client.addMessage('conv_abc', 'user', 'Hello')

      const call = vi.mocked(fetch).mock.calls[0]
      expect(call[0]).toBe('http://localhost:7090/api/working-memory/sessions/conv_abc/messages')
      const body = JSON.parse(call[1]?.body as string)
      expect(body.role).toBe('user')
      expect(body.content).toBe('Hello')
    })

    it('throws on failure', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response('Not Found', { status: 404 })
      )
      await expect(client.addMessage('conv_abc', 'user', 'Hi')).rejects.toThrow(
        'AMS addMessage failed: 404'
      )
    })
  })

  describe('getContextMessages', () => {
    it('returns context-managed messages array', async () => {
      const messages = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' },
      ]
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify({ messages }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )

      const result = await client.getContextMessages('conv_abc')
      expect(result).toEqual(messages)

      const call = vi.mocked(fetch).mock.calls[0]
      expect(call[0]).toContain('/api/working-memory/sessions/conv_abc/context')
    })

    it('passes maxTokens as query param', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify({ messages: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )

      await client.getContextMessages('conv_abc', 8000)

      const call = vi.mocked(fetch).mock.calls[0]
      expect(call[0]).toContain('maxTokens=8000')
    })

    it('throws on failure', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('Error', { status: 500 }))
      await expect(client.getContextMessages('conv_abc')).rejects.toThrow(
        'AMS getContextMessages failed: 500'
      )
    })
  })

  describe('removeSession', () => {
    it('deletes session from AMS', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), { status: 200 })
      )

      await client.removeSession('conv_abc')

      const call = vi.mocked(fetch).mock.calls[0]
      expect(call[0]).toBe('http://localhost:7090/api/working-memory/sessions/conv_abc')
      expect(call[1]?.method).toBe('DELETE')
    })

    it('does not throw on 404 (already removed)', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response('Not Found', { status: 404 })
      )
      await expect(client.removeSession('conv_abc')).resolves.not.toThrow()
    })

    it('throws on server error', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('Error', { status: 500 }))
      await expect(client.removeSession('conv_abc')).rejects.toThrow(
        'AMS removeSession failed: 500'
      )
    })
  })

  describe('auth header', () => {
    it('includes Authorization header on all requests', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('OK', { status: 200 }))

      await client.healthCheck()

      const headers = vi.mocked(fetch).mock.calls[0][1]?.headers as Record<string, string>
      expect(headers['Authorization']).toBe('Bearer test-auth-token')
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/server/src/__tests__/ams.test.ts`
Expected: FAIL — `../services/ams` module not found

- [ ] **Step 3: Implement AMS service client**

Create `packages/server/src/services/ams.ts`:

```typescript
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

export interface AmsClient {
  healthCheck(): Promise<boolean>
  initSession(
    sessionId: string,
    namespace: string,
    systemPrompt?: string
  ): Promise<{ sessionId: string; created: boolean }>
  addMessage(sessionId: string, role: string, content: string): Promise<void>
  getContextMessages(
    sessionId: string,
    maxTokens?: number
  ): Promise<Array<{ role: string; content: string }>>
  removeSession(sessionId: string): Promise<void>
}

/**
 * Create an AMS (Agent Memory Service) HTTP client.
 * Provides session-based working memory management for chat conversations.
 */
export function createAmsClient(baseUrl: string, authToken: string): AmsClient {
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${authToken}`,
  }

  return {
    async healthCheck(): Promise<boolean> {
      try {
        const res = await fetch(`${baseUrl}/health`, { headers })
        return res.ok
      } catch {
        return false
      }
    },

    async initSession(
      sessionId: string,
      namespace: string,
      systemPrompt?: string
    ): Promise<{ sessionId: string; created: boolean }> {
      const res = await fetch(`${baseUrl}/api/working-memory/sessions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ sessionId, namespace, ...(systemPrompt ? { systemPrompt } : {}) }),
      })
      if (!res.ok) throw new Error(`AMS initSession failed: ${res.status}`)
      return res.json() as Promise<{ sessionId: string; created: boolean }>
    },

    async addMessage(sessionId: string, role: string, content: string): Promise<void> {
      const res = await fetch(`${baseUrl}/api/working-memory/sessions/${sessionId}/messages`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ role, content }),
      })
      if (!res.ok) throw new Error(`AMS addMessage failed: ${res.status}`)
    },

    async getContextMessages(
      sessionId: string,
      maxTokens?: number
    ): Promise<Array<{ role: string; content: string }>> {
      const params = maxTokens ? `?maxTokens=${maxTokens}` : ''
      const res = await fetch(
        `${baseUrl}/api/working-memory/sessions/${sessionId}/context${params}`,
        {
          headers,
        }
      )
      if (!res.ok) throw new Error(`AMS getContextMessages failed: ${res.status}`)
      const data = (await res.json()) as { messages: Array<{ role: string; content: string }> }
      return data.messages
    },

    async removeSession(sessionId: string): Promise<void> {
      const res = await fetch(`${baseUrl}/api/working-memory/sessions/${sessionId}`, {
        method: 'DELETE',
        headers,
      })
      // 404 is acceptable (session already removed)
      if (!res.ok && res.status !== 404) {
        throw new Error(`AMS removeSession failed: ${res.status}`)
      }
    },
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/server/src/__tests__/ams.test.ts`
Expected: All 12 tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/services/ams.ts packages/server/src/__tests__/ams.test.ts
git commit -m "$(cat <<'EOF'
feat(server): add AMS client for working memory management

Built with Epic Flowstate
EOF
)"
```

---

### Task 2: Environment Bindings

**Files:**

- Modify: `packages/server/src/bindings.ts:60-67`
- Modify: `packages/server/wrangler.toml:23-24`
- Modify: `packages/server/src/__tests__/test-helpers.ts:482-493`

- [ ] **Step 1: Add AMS env vars to Env interface**

In `packages/server/src/bindings.ts`, add these two fields after the Google AI API key line (line 66):

```typescript
  /** Base URL for the Agent Memory Service (working memory, context management) */
  AMS_BASE_URL?: string

  /** Auth token for the AMS API */
  AMS_AUTH_TOKEN?: string
```

The full addition goes between the closing of `GOOGLE_AI_API_KEY` and the closing `}` of the Env interface.

- [ ] **Step 2: Add AMS env vars to wrangler.toml**

In `packages/server/wrangler.toml`, add after the `CF_GATEWAY_NAME` line (line 24):

```toml
# Agent Memory Service (AMS) for chat context management
AMS_BASE_URL = ""
AMS_AUTH_TOKEN = ""
```

- [ ] **Step 3: Add AMS env vars to test mock**

In `packages/server/src/__tests__/test-helpers.ts`, update `createMockEnv()` (around line 482) to include AMS vars. Add these two lines to the returned object:

```typescript
    AMS_BASE_URL: '',
    AMS_AUTH_TOKEN: '',
```

- [ ] **Step 4: Verify existing tests still pass**

Run: `npx vitest run packages/server`
Expected: All existing tests PASS (the new env vars are optional, empty strings disable AMS)

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/bindings.ts packages/server/wrangler.toml packages/server/src/__tests__/test-helpers.ts
git commit -m "$(cat <<'EOF'
feat(server): add AMS_BASE_URL and AMS_AUTH_TOKEN env bindings

Built with Epic Flowstate
EOF
)"
```

---

### Task 3: Integrate AMS on Conversation Create

**Files:**

- Modify: `packages/server/src/routes/chat.ts:1-77`

- [ ] **Step 1: Write failing test for AMS session init on create**

In `packages/server/src/__tests__/chat.test.ts`, add a new test in the `POST /v1/chat/conversations` describe block. Add this import near the top (after the existing vi.mock calls):

```typescript
vi.mock('../services/ams', () => ({
  createAmsClient: vi.fn(() => ({
    healthCheck: vi.fn().mockResolvedValue(true),
    initSession: vi.fn().mockResolvedValue({ sessionId: 'conv_mock', created: true }),
    addMessage: vi.fn().mockResolvedValue(undefined),
    getContextMessages: vi.fn().mockResolvedValue([]),
    removeSession: vi.fn().mockResolvedValue(undefined),
  })),
}))

import { createAmsClient } from '../services/ams'
```

Update the `createMockEnv()` call in `beforeEach` to set AMS vars:

```typescript
beforeEach(async () => {
  env = createMockEnv()
  env.AMS_BASE_URL = 'http://localhost:7090'
  env.AMS_AUTH_TOKEN = 'test-ams-token'
  await runMigrations(env.DB)
  token = await getSessionToken()
  vi.mocked(streamText).mockReset()
  vi.mocked(createAmsClient).mockClear()
  vi.mocked(streamText).mockReturnValue(
    createMockStreamResult(['OK']) as ReturnType<typeof streamText>
  )
})
```

Add this test:

```typescript
it('initializes AMS session when AMS is configured', async () => {
  const mockInitSession = vi.fn().mockResolvedValue({ sessionId: 'conv_mock', created: true })
  vi.mocked(createAmsClient).mockReturnValue({
    healthCheck: vi.fn().mockResolvedValue(true),
    initSession: mockInitSession,
    addMessage: vi.fn().mockResolvedValue(undefined),
    getContextMessages: vi.fn().mockResolvedValue([]),
    removeSession: vi.fn().mockResolvedValue(undefined),
  })

  const res = await req('POST', '/v1/chat/conversations', {
    headers: authHeader(token),
    body: {
      agentHandle: 'alice.saga',
      provider: 'anthropic',
      model: 'claude-sonnet-4-5-20250514',
      systemPrompt: 'You are helpful.',
    },
  })
  expect(res.status).toBe(201)
  const body = (await res.json()) as { conversation: Record<string, unknown> }

  expect(mockInitSession).toHaveBeenCalledWith(
    body.conversation.id,
    'alice.saga',
    'You are helpful.'
  )
})

it('still creates conversation when AMS init fails', async () => {
  vi.mocked(createAmsClient).mockReturnValue({
    healthCheck: vi.fn().mockResolvedValue(true),
    initSession: vi.fn().mockRejectedValue(new Error('AMS down')),
    addMessage: vi.fn().mockResolvedValue(undefined),
    getContextMessages: vi.fn().mockResolvedValue([]),
    removeSession: vi.fn().mockResolvedValue(undefined),
  })

  const res = await req('POST', '/v1/chat/conversations', {
    headers: authHeader(token),
    body: {
      agentHandle: 'alice.saga',
      provider: 'anthropic',
      model: 'claude-sonnet-4-5-20250514',
    },
  })
  expect(res.status).toBe(201)
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/server/src/__tests__/chat.test.ts`
Expected: FAIL — AMS mock is called but the route doesn't use it yet

- [ ] **Step 3: Import AMS client in chat routes and integrate on create**

In `packages/server/src/routes/chat.ts`, add the import at the top:

```typescript
import { createAmsClient } from '../services/ams'
```

Add a helper function after the imports:

```typescript
/** Create AMS client if configured, or null */
function getAmsClient(env: Env) {
  if (!env.AMS_BASE_URL || !env.AMS_AUTH_TOKEN) return null
  return createAmsClient(env.AMS_BASE_URL, env.AMS_AUTH_TOKEN)
}
```

In the `POST /conversations` handler, after the D1 insert (line 60) and before the return, add:

```typescript
// Initialize AMS session (best-effort, don't block conversation creation)
const ams = getAmsClient(c.env)
let amsSessionId: string | null = null
if (ams) {
  try {
    const session = await ams.initSession(id, body.agentHandle, body.systemPrompt)
    amsSessionId = session.sessionId
    await db.update(chatConversations).set({ amsSessionId }).where(eq(chatConversations.id, id))
  } catch {
    // AMS unavailable; conversation works without it
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/server/src/__tests__/chat.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/routes/chat.ts packages/server/src/__tests__/chat.test.ts
git commit -m "$(cat <<'EOF'
feat(server): init AMS session on conversation create

Built with Epic Flowstate
EOF
)"
```

---

### Task 4: Integrate AMS on Message Send

**Files:**

- Modify: `packages/server/src/routes/chat.ts:192-388`
- Modify: `packages/server/src/__tests__/chat.test.ts`

This is the most involved task. The message endpoint needs to:

1. Sync the user message to AMS after saving to D1
2. Get context-managed messages from AMS instead of loading from D1
3. Fall back to D1 loading when AMS is unavailable or returns error
4. Sync the assistant message to AMS after stream completes

- [ ] **Step 1: Write failing test for AMS context retrieval**

Add these tests to the `POST /v1/chat/conversations/:id/messages` describe block:

```typescript
it('uses AMS context messages when available', async () => {
  const amsMessages = [
    { role: 'system', content: 'Summary of earlier conversation...' },
    { role: 'user', content: 'Latest question' },
  ]
  const mockAms = {
    healthCheck: vi.fn().mockResolvedValue(true),
    initSession: vi.fn().mockResolvedValue({ sessionId: 'conv_mock', created: true }),
    addMessage: vi.fn().mockResolvedValue(undefined),
    getContextMessages: vi.fn().mockResolvedValue(amsMessages),
    removeSession: vi.fn().mockResolvedValue(undefined),
  }
  vi.mocked(createAmsClient).mockReturnValue(mockAms)

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
    createMockStreamResult(['Response']) as ReturnType<typeof streamText>
  )

  const res = await req('POST', `/v1/chat/conversations/${conversation.id}/messages`, {
    headers: { ...authHeader(token), 'X-LLM-API-Key': 'test-api-key-fake' },
    body: { content: 'Latest question' },
  })
  await res.text()

  // AMS addMessage should have been called for the user message
  expect(mockAms.addMessage).toHaveBeenCalledWith(expect.any(String), 'user', 'Latest question')

  // streamText should receive the AMS-managed context, not raw D1 messages
  const calls = vi.mocked(streamText).mock.calls
  const passedMessages = (calls[0][0] as { messages: Array<{ role: string }> }).messages
  expect(passedMessages).toEqual(amsMessages)
})

it('falls back to D1 messages when AMS fails', async () => {
  const mockAms = {
    healthCheck: vi.fn().mockResolvedValue(true),
    initSession: vi.fn().mockResolvedValue({ sessionId: 'conv_mock', created: true }),
    addMessage: vi.fn().mockRejectedValue(new Error('AMS down')),
    getContextMessages: vi.fn().mockRejectedValue(new Error('AMS down')),
    removeSession: vi.fn().mockResolvedValue(undefined),
  }
  vi.mocked(createAmsClient).mockReturnValue(mockAms)

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
    createMockStreamResult(['Fallback response']) as ReturnType<typeof streamText>
  )

  const res = await req('POST', `/v1/chat/conversations/${conversation.id}/messages`, {
    headers: { ...authHeader(token), 'X-LLM-API-Key': 'test-api-key-fake' },
    body: { content: 'Hello from fallback' },
  })
  expect(res.status).toBe(200)
  await res.text()

  // Should still call streamText with D1 messages as fallback
  const calls = vi.mocked(streamText).mock.calls
  expect(calls).toHaveLength(1)
  const passedMessages = (calls[0][0] as { messages: Array<{ role: string; content: string }> })
    .messages
  expect(passedMessages.some(m => m.content === 'Hello from fallback')).toBe(true)
})

it('syncs assistant message to AMS after stream completes', async () => {
  const mockAms = {
    healthCheck: vi.fn().mockResolvedValue(true),
    initSession: vi.fn().mockResolvedValue({ sessionId: 'conv_mock', created: true }),
    addMessage: vi.fn().mockResolvedValue(undefined),
    getContextMessages: vi.fn().mockResolvedValue([{ role: 'user', content: 'Hello' }]),
    removeSession: vi.fn().mockResolvedValue(undefined),
  }
  vi.mocked(createAmsClient).mockReturnValue(mockAms)

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
    createMockStreamResult(['The answer is 42']) as ReturnType<typeof streamText>
  )

  const res = await req('POST', `/v1/chat/conversations/${conversation.id}/messages`, {
    headers: { ...authHeader(token), 'X-LLM-API-Key': 'test-api-key-fake' },
    body: { content: 'Hello' },
  })
  await res.text()

  // addMessage called twice: once for user, once for assistant
  const addCalls = mockAms.addMessage.mock.calls
  expect(addCalls.length).toBeGreaterThanOrEqual(2)
  const assistantCall = addCalls.find((c: string[]) => c[1] === 'assistant')
  expect(assistantCall).toBeTruthy()
  expect(assistantCall![2]).toBe('The answer is 42')
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/server/src/__tests__/chat.test.ts`
Expected: FAIL — the route doesn't use AMS for context yet

- [ ] **Step 3: Modify the message endpoint to integrate AMS**

Replace the message loading and context section in `POST /conversations/:id/messages` (the section from "Load recent conversation history" through the `messages` array construction, roughly lines 268-280) with this logic:

```typescript
// Build context messages: try AMS first, fall back to D1
const ams = getAmsClient(c.env)
const amsSessionId = conversation.amsSessionId
let messages: ModelMessage[]
let amsAvailable = false

if (ams && amsSessionId) {
  try {
    // Sync user message to AMS
    await ams.addMessage(amsSessionId, 'user', body.content)

    // Get context-managed messages from AMS
    const contextMessages = await ams.getContextMessages(amsSessionId)
    messages = contextMessages.map(m => ({
      role: m.role as 'user' | 'assistant' | 'system',
      content: m.content,
    }))
    amsAvailable = true
  } catch {
    // AMS failed; fall back to D1
    messages = await loadD1Messages(db, conversationId)
  }
} else {
  messages = await loadD1Messages(db, conversationId)
}
```

Extract the existing D1 message loading into a helper function (place it before the route definitions):

```typescript
const MAX_HISTORY = 50

async function loadD1Messages(
  db: ReturnType<typeof drizzle>,
  conversationId: string
): Promise<ModelMessage[]> {
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

Remove the old inline `MAX_HISTORY`, D1 message loading, and `messages` construction (lines 268-280 of the current code).

In the stream completion section (after saving the assistant message to D1, around line 347), add the AMS sync for the assistant message:

```typescript
// Sync assistant message to AMS (best-effort)
if (ams && amsSessionId && amsAvailable) {
  try {
    await ams.addMessage(amsSessionId, 'assistant', fullText)
  } catch {
    // AMS sync failure doesn't affect the response
  }
}
```

This goes right after the `db.insert(chatMessages).values(...)` call for the assistant message and before the "Send finish event" comment.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/server/src/__tests__/chat.test.ts`
Expected: All tests PASS (including new AMS tests and existing D1 fallback tests)

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/routes/chat.ts packages/server/src/__tests__/chat.test.ts
git commit -m "$(cat <<'EOF'
feat(server): use AMS context for chat messages with D1 fallback

Built with Epic Flowstate
EOF
)"
```

---

### Task 5: Integrate AMS on Conversation Delete

**Files:**

- Modify: `packages/server/src/routes/chat.ts:393-416`
- Modify: `packages/server/src/__tests__/chat.test.ts`

- [ ] **Step 1: Write failing test for AMS cleanup on delete**

Add this test to the `DELETE /v1/chat/conversations/:id` describe block:

```typescript
it('removes AMS session on delete', async () => {
  const mockRemoveSession = vi.fn().mockResolvedValue(undefined)
  vi.mocked(createAmsClient).mockReturnValue({
    healthCheck: vi.fn().mockResolvedValue(true),
    initSession: vi.fn().mockResolvedValue({ sessionId: 'conv_mock', created: true }),
    addMessage: vi.fn().mockResolvedValue(undefined),
    getContextMessages: vi.fn().mockResolvedValue([]),
    removeSession: mockRemoveSession,
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

  const delRes = await req('DELETE', `/v1/chat/conversations/${conversation.id}`, {
    headers: authHeader(token),
  })
  expect(delRes.status).toBe(204)
  expect(mockRemoveSession).toHaveBeenCalled()
})

it('still deletes conversation when AMS remove fails', async () => {
  vi.mocked(createAmsClient).mockReturnValue({
    healthCheck: vi.fn().mockResolvedValue(true),
    initSession: vi.fn().mockResolvedValue({ sessionId: 'conv_mock', created: true }),
    addMessage: vi.fn().mockResolvedValue(undefined),
    getContextMessages: vi.fn().mockResolvedValue([]),
    removeSession: vi.fn().mockRejectedValue(new Error('AMS down')),
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

  const delRes = await req('DELETE', `/v1/chat/conversations/${conversation.id}`, {
    headers: authHeader(token),
  })
  expect(delRes.status).toBe(204)

  // Verify D1 deletion happened regardless
  const getRes = await req('GET', `/v1/chat/conversations/${conversation.id}`, {
    headers: authHeader(token),
  })
  expect(getRes.status).toBe(404)
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/server/src/__tests__/chat.test.ts`
Expected: FAIL — delete route doesn't call AMS yet

- [ ] **Step 3: Add AMS cleanup to delete handler**

In the `DELETE /conversations/:id` handler, after the ownership check and before the D1 deletes, add:

```typescript
// Remove AMS session (best-effort)
const ams = getAmsClient(c.env)
const conversation = rows[0]
if (ams && conversation.amsSessionId) {
  try {
    await ams.removeSession(conversation.amsSessionId)
  } catch {
    // AMS cleanup failure doesn't block deletion
  }
}
```

Update the ownership query to also select `amsSessionId`:

Change:

```typescript
const rows = await db.select({ id: chatConversations.id }).from(chatConversations)
```

To:

```typescript
const rows = await db
  .select({ id: chatConversations.id, amsSessionId: chatConversations.amsSessionId })
  .from(chatConversations)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/server/src/__tests__/chat.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/routes/chat.ts packages/server/src/__tests__/chat.test.ts
git commit -m "$(cat <<'EOF'
feat(server): remove AMS session on conversation delete

Built with Epic Flowstate
EOF
)"
```

---

### Task 6: AMS-Disabled Path Verification

**Files:**

- Modify: `packages/server/src/__tests__/chat.test.ts`

This task verifies that everything still works when AMS is not configured (empty env vars). The existing test suite already tests this path since `createMockEnv()` returns empty AMS vars by default. But we should add an explicit test documenting the behavior.

- [ ] **Step 1: Write explicit AMS-disabled test**

Add a new describe block at the end of the Chat API describe:

```typescript
describe('AMS disabled (no env vars)', () => {
  it('creates conversation without AMS when env vars empty', async () => {
    env.AMS_BASE_URL = ''
    env.AMS_AUTH_TOKEN = ''

    const res = await req('POST', '/v1/chat/conversations', {
      headers: authHeader(token),
      body: {
        agentHandle: 'alice.saga',
        provider: 'anthropic',
        model: 'claude-sonnet-4-5-20250514',
      },
    })
    expect(res.status).toBe(201)

    // createAmsClient should not have been called when env vars are empty
    // (getAmsClient returns null)
  })

  it('streams messages using D1 context when AMS not configured', async () => {
    env.AMS_BASE_URL = ''
    env.AMS_AUTH_TOKEN = ''

    vi.mocked(streamText).mockReturnValue(
      createMockStreamResult(['Works without AMS']) as ReturnType<typeof streamText>
    )

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
      body: { content: 'Testing D1 only path' },
    })
    expect(res.status).toBe(200)

    const body = await res.text()
    const events = parseSSEEvents(body)
    const deltas = events.filter(e => e.type === 'text-delta')
    expect(deltas).toHaveLength(1)
    expect(deltas[0].textDelta).toBe('Works without AMS')
  })
})
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `npx vitest run packages/server/src/__tests__/chat.test.ts`
Expected: All tests PASS

- [ ] **Step 3: Run full server test suite**

Run: `npx vitest run packages/server`
Expected: All server tests PASS (including LLM tests, chat tests, AMS tests)

- [ ] **Step 4: Commit**

```bash
git add packages/server/src/__tests__/chat.test.ts
git commit -m "$(cat <<'EOF'
test(server): add AMS-disabled verification tests

Built with Epic Flowstate
EOF
)"
```

---

### Task 7: TypeScript Compilation Check

**Files:** None (verification only)

- [ ] **Step 1: Run TypeScript compilation**

Run: `npx tsc --noEmit -p packages/server/tsconfig.json` (or equivalent check used in CI)
Expected: No type errors

If there are type errors, fix them. Common issues:

- Missing `amsSessionId` in the select used by the ownership check (we added it in Task 5)
- The `drizzle` return type needs to be imported if used in the `loadD1Messages` helper

- [ ] **Step 2: Run full server test suite one more time**

Run: `npx vitest run packages/server`
Expected: All tests PASS (ams.test.ts + chat.test.ts + llm.test.ts)

- [ ] **Step 3: Final commit if any fixes were needed**

Only if Step 1 required fixes:

```bash
git add -A
git commit -m "$(cat <<'EOF'
fix(server): resolve Phase 3 type compilation issues

Built with Epic Flowstate
EOF
)"
```
