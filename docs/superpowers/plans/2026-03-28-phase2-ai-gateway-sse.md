> **FlowState Document:** `docu_-LbNFKSpBl`

# Phase 2: AI Gateway + SSE Streaming — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Modify the POST messages endpoint to stream LLM responses via SSE using Vercel AI SDK routed through Cloudflare AI Gateway.

**Architecture:** A new `services/llm.ts` module handles AI Gateway URL construction, API key resolution, provider creation, and cost estimation. The existing `POST /v1/chat/conversations/:id/messages` endpoint is modified to save the user message, load conversation history, call `streamText()` from the Vercel AI SDK, and pipe the response as Server-Sent Events with `text-delta`, `finish`, and `[DONE]` events. The assistant message is persisted to D1 with usage metadata (tokens, cost, latency) after the stream completes.

**Tech Stack:** Vercel AI SDK (`ai`, `@ai-sdk/anthropic`, `@ai-sdk/openai`, `@ai-sdk/google`), Cloudflare AI Gateway, SSE, Hono, Drizzle ORM, D1, Vitest

**Spec:** `docs/superpowers/specs/2026-03-28-llm-chat-feature-design.md` (AI Gateway Integration, API Key Resolution, POST messages sections)
**Phase breakdown:** `docs/superpowers/specs/2026-03-28-llm-chat-phase-breakdown.md` (Phase 2)

---

## Deviation from Spec

The spec prescribes `@epicdm/flowstate-agents-llm-client` for LLM interaction. Research during Phase 1 revealed three blockers:

1. `LLMClient.stream()` takes a single `prompt: string`, not a messages array — prevents multi-turn conversation context
2. `baseUrl` is not forwarded to Anthropic/OpenAI providers (only lmstudio) — prevents AI Gateway integration
3. `LLMProvider` type doesn't include `'google'`

This plan uses the Vercel AI SDK directly, which provides native streaming, `CoreMessage[]` array support, and `baseURL` forwarding for all providers.

---

## File Structure

| Action | Path                                            | Responsibility                                                         |
| ------ | ----------------------------------------------- | ---------------------------------------------------------------------- |
| Modify | `packages/server/package.json`                  | Add Vercel AI SDK dependencies                                         |
| Modify | `packages/server/src/bindings.ts`               | Add AI Gateway + API key env vars                                      |
| Modify | `packages/server/wrangler.toml`                 | Add AI Gateway vars to `[vars]`                                        |
| Modify | `packages/server/src/__tests__/test-helpers.ts` | Update `createMockEnv()` with new vars                                 |
| Create | `packages/server/src/services/llm.ts`           | API key resolution, AI Gateway URL, provider creation, cost estimation |
| Create | `packages/server/src/__tests__/llm.test.ts`     | LLM service unit tests                                                 |
| Modify | `packages/server/src/routes/chat.ts`            | Upgrade POST messages to SSE streaming                                 |
| Modify | `packages/server/src/__tests__/chat.test.ts`    | Add streaming tests, update existing POST messages tests               |

---

### Task 1: Add AI SDK Dependencies and Update Environment Bindings

**Files:**

- Modify: `packages/server/package.json`
- Modify: `packages/server/src/bindings.ts:4-52`
- Modify: `packages/server/wrangler.toml:10-21`
- Modify: `packages/server/src/__tests__/test-helpers.ts:482-493`

- [ ] **Step 1: Add Vercel AI SDK dependencies**

Run from the repo root:

```bash
cd packages/server && pnpm add ai @ai-sdk/anthropic @ai-sdk/openai @ai-sdk/google
```

Expected: Four packages added to `dependencies` in `packages/server/package.json`.

- [ ] **Step 2: Update `bindings.ts` with new env vars**

Add these fields to the `Env` interface in `packages/server/src/bindings.ts`, after the existing `OPERATOR_PRIVATE_KEY` field:

```typescript
  /** Cloudflare account ID (for AI Gateway URL construction) */
  CF_ACCOUNT_ID?: string

  /** AI Gateway name (e.g. "saga-hub"). When set, LLM requests route through AI Gateway. */
  CF_GATEWAY_NAME?: string

  /** Default Anthropic API key (used when no BYOK key is provided) */
  ANTHROPIC_API_KEY?: string

  /** Default OpenAI API key */
  OPENAI_API_KEY?: string

  /** Default Google AI API key */
  GOOGLE_AI_API_KEY?: string
```

- [ ] **Step 3: Update `wrangler.toml` with AI Gateway vars**

Add these lines to the `[vars]` section in `packages/server/wrangler.toml`, after the existing `LOCAL_DIRECTORY_ID` line:

```toml
# AI Gateway (set CF_GATEWAY_NAME to enable; API keys are secrets)
CF_ACCOUNT_ID = "63396a5b2b279efdc0e1618233dcdc17"
CF_GATEWAY_NAME = ""
```

Note: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, and `GOOGLE_AI_API_KEY` are secrets — add them via `wrangler secret put`, not in `wrangler.toml`.

- [ ] **Step 4: Update `createMockEnv()` in test helpers**

In `packages/server/src/__tests__/test-helpers.ts`, the `createMockEnv()` function already returns an `Env` object. The new optional fields (`CF_ACCOUNT_ID`, `CF_GATEWAY_NAME`, API keys) default to `undefined` via TypeScript's optional properties, so no changes to `createMockEnv()` are needed. Verify the function still compiles with the updated `Env` type.

Run: `cd packages/server && npx vitest run --reporter=verbose 2>&1 | tail -5`
Expected: All existing tests still pass.

- [ ] **Step 5: Commit**

```bash
git add packages/server/package.json packages/server/pnpm-lock.yaml packages/server/src/bindings.ts packages/server/wrangler.toml
git commit -m "feat(server): add Vercel AI SDK deps and AI Gateway env vars

Built with Epic Flowstate"
```

---

### Task 2: Create LLM Service — API Key Resolution

**Files:**

- Create: `packages/server/src/__tests__/llm.test.ts`
- Create: `packages/server/src/services/llm.ts`

- [ ] **Step 1: Write failing tests for `resolveApiKey` and `getProviderEnvKey`**

Create `packages/server/src/__tests__/llm.test.ts`:

```typescript
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { describe, it, expect } from 'vitest'
import { resolveApiKey, getProviderEnvKey } from '../services/llm'
import type { Env } from '../bindings'

describe('resolveApiKey', () => {
  it('returns X-LLM-API-Key header when present', () => {
    expect(
      resolveApiKey({
        header: 'sk-header-key',
        bodyApiKey: 'sk-body-key',
        envApiKey: 'sk-env-key',
      })
    ).toBe('sk-header-key')
  })

  it('falls back to body apiKey when header is missing', () => {
    expect(
      resolveApiKey({
        header: undefined,
        bodyApiKey: 'sk-body-key',
        envApiKey: 'sk-env-key',
      })
    ).toBe('sk-body-key')
  })

  it('falls back to env var when header and body are missing', () => {
    expect(
      resolveApiKey({
        header: undefined,
        bodyApiKey: undefined,
        envApiKey: 'sk-env-key',
      })
    ).toBe('sk-env-key')
  })

  it('returns null when no key is available', () => {
    expect(
      resolveApiKey({
        header: undefined,
        bodyApiKey: undefined,
        envApiKey: undefined,
      })
    ).toBeNull()
  })

  it('ignores empty string values', () => {
    expect(
      resolveApiKey({
        header: '',
        bodyApiKey: '',
        envApiKey: 'sk-env-key',
      })
    ).toBe('sk-env-key')
  })
})

describe('getProviderEnvKey', () => {
  it('returns ANTHROPIC_API_KEY for anthropic provider', () => {
    const env = { ANTHROPIC_API_KEY: 'sk-ant-123' } as unknown as Env
    expect(getProviderEnvKey('anthropic', env)).toBe('sk-ant-123')
  })

  it('returns OPENAI_API_KEY for openai provider', () => {
    const env = { OPENAI_API_KEY: 'sk-oai-456' } as unknown as Env
    expect(getProviderEnvKey('openai', env)).toBe('sk-oai-456')
  })

  it('returns GOOGLE_AI_API_KEY for google provider', () => {
    const env = { GOOGLE_AI_API_KEY: 'goog-789' } as unknown as Env
    expect(getProviderEnvKey('google', env)).toBe('goog-789')
  })

  it('returns undefined for unknown provider', () => {
    const env = {} as unknown as Env
    expect(getProviderEnvKey('unknown', env)).toBeUndefined()
  })

  it('returns undefined when env var is not set', () => {
    const env = {} as unknown as Env
    expect(getProviderEnvKey('anthropic', env)).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/server && npx vitest run src/__tests__/llm.test.ts --reporter=verbose 2>&1 | tail -10`
Expected: FAIL — `Cannot find module '../services/llm'`

- [ ] **Step 3: Implement `resolveApiKey` and `getProviderEnvKey`**

Create `packages/server/src/services/llm.ts`:

```typescript
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import type { Env } from '../bindings'

/**
 * Resolve API key from request header, body, or environment.
 * Priority: header → body → env → null
 */
export function resolveApiKey(opts: {
  header: string | undefined
  bodyApiKey: string | undefined
  envApiKey: string | undefined
}): string | null {
  if (opts.header) return opts.header
  if (opts.bodyApiKey) return opts.bodyApiKey
  if (opts.envApiKey) return opts.envApiKey
  return null
}

/**
 * Look up the provider-specific API key from environment variables.
 */
export function getProviderEnvKey(provider: string, env: Env): string | undefined {
  const keyMap: Record<string, keyof Env> = {
    anthropic: 'ANTHROPIC_API_KEY',
    openai: 'OPENAI_API_KEY',
    google: 'GOOGLE_AI_API_KEY',
  }
  const envKey = keyMap[provider]
  return envKey ? (env[envKey] as string | undefined) : undefined
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/server && npx vitest run src/__tests__/llm.test.ts --reporter=verbose 2>&1 | tail -15`
Expected: All 10 tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/services/llm.ts packages/server/src/__tests__/llm.test.ts
git commit -m "feat(server): add LLM service with API key resolution

Built with Epic Flowstate"
```

---

### Task 3: Create LLM Service — Gateway URL, Provider Creation, and Cost Estimation

**Files:**

- Modify: `packages/server/src/__tests__/llm.test.ts`
- Modify: `packages/server/src/services/llm.ts`

- [ ] **Step 1: Write failing tests for `buildGatewayBaseUrl` and `estimateCost`**

Append to `packages/server/src/__tests__/llm.test.ts`:

```typescript
import { buildGatewayBaseUrl, estimateCost } from '../services/llm'

describe('buildGatewayBaseUrl', () => {
  it('returns gateway URL when both CF_ACCOUNT_ID and CF_GATEWAY_NAME are set', () => {
    const env = {
      CF_ACCOUNT_ID: 'acct123',
      CF_GATEWAY_NAME: 'saga-hub',
    } as unknown as Env
    expect(buildGatewayBaseUrl(env, 'anthropic')).toBe(
      'https://gateway.ai.cloudflare.com/v1/acct123/saga-hub/anthropic'
    )
  })

  it('includes provider name in URL path', () => {
    const env = {
      CF_ACCOUNT_ID: 'acct123',
      CF_GATEWAY_NAME: 'saga-hub',
    } as unknown as Env
    expect(buildGatewayBaseUrl(env, 'openai')).toBe(
      'https://gateway.ai.cloudflare.com/v1/acct123/saga-hub/openai'
    )
  })

  it('returns null when CF_GATEWAY_NAME is not set', () => {
    const env = { CF_ACCOUNT_ID: 'acct123' } as unknown as Env
    expect(buildGatewayBaseUrl(env, 'anthropic')).toBeNull()
  })

  it('returns null when CF_ACCOUNT_ID is not set', () => {
    const env = { CF_GATEWAY_NAME: 'saga-hub' } as unknown as Env
    expect(buildGatewayBaseUrl(env, 'anthropic')).toBeNull()
  })
})

describe('estimateCost', () => {
  it('calculates cost for claude-sonnet-4-5', () => {
    // 1000 input tokens * $3.00/1M + 500 output tokens * $15.00/1M
    // = 0.003 + 0.0075 = 0.0105
    const cost = estimateCost('claude-sonnet-4-5-20250514', 1000, 500)
    expect(cost).toBeCloseTo(0.0105)
  })

  it('calculates cost for gpt-4o', () => {
    // 1000 * $2.50/1M + 500 * $10.00/1M = 0.0025 + 0.005 = 0.0075
    const cost = estimateCost('gpt-4o', 1000, 500)
    expect(cost).toBeCloseTo(0.0075)
  })

  it('uses default pricing for unknown model', () => {
    const cost = estimateCost('unknown-model-xyz', 1000, 500)
    // Default: $3.00/1M input, $15.00/1M output (same as sonnet)
    expect(cost).toBeCloseTo(0.0105)
  })

  it('returns 0 for zero tokens', () => {
    expect(estimateCost('claude-sonnet-4-5-20250514', 0, 0)).toBe(0)
  })
})
```

Also update the import at the top of the file to include the new functions:

```typescript
import {
  resolveApiKey,
  getProviderEnvKey,
  buildGatewayBaseUrl,
  estimateCost,
} from '../services/llm'
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/server && npx vitest run src/__tests__/llm.test.ts --reporter=verbose 2>&1 | tail -10`
Expected: FAIL — `buildGatewayBaseUrl` and `estimateCost` are not exported

- [ ] **Step 3: Implement `buildGatewayBaseUrl`, `createModel`, and `estimateCost`**

Add to `packages/server/src/services/llm.ts`:

```typescript
import { createAnthropic } from '@ai-sdk/anthropic'
import { createOpenAI } from '@ai-sdk/openai'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import type { LanguageModelV1 } from 'ai'
```

Add these at the top of the file (update the existing import statement to include the AI SDK imports).

Then add these functions after the existing `getProviderEnvKey` function:

```typescript
/**
 * Build AI Gateway base URL for a provider.
 * Returns null if gateway is not configured (direct provider access).
 */
export function buildGatewayBaseUrl(env: Env, provider: string): string | null {
  if (!env.CF_GATEWAY_NAME || !env.CF_ACCOUNT_ID) return null
  return `https://gateway.ai.cloudflare.com/v1/${env.CF_ACCOUNT_ID}/${env.CF_GATEWAY_NAME}/${provider}`
}

/**
 * Create an AI SDK LanguageModelV1 instance for the given provider/model.
 * Routes through AI Gateway when configured.
 */
export function createModel(
  provider: string,
  modelId: string,
  apiKey: string,
  env: Env
): LanguageModelV1 {
  const baseURL = buildGatewayBaseUrl(env, provider) ?? undefined

  switch (provider) {
    case 'anthropic': {
      const client = createAnthropic({ apiKey, ...(baseURL && { baseURL }) })
      return client(modelId)
    }
    case 'openai': {
      const client = createOpenAI({ apiKey, ...(baseURL && { baseURL }) })
      return client(modelId)
    }
    case 'google': {
      const client = createGoogleGenerativeAI({ apiKey, ...(baseURL && { baseURL }) })
      return client(modelId)
    }
    default:
      throw new Error(`Unsupported provider: ${provider}`)
  }
}

/** Per-million-token pricing for known models */
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'claude-sonnet-4-5-20250514': { input: 3.0, output: 15.0 },
  'claude-sonnet-4-5-20250929': { input: 3.0, output: 15.0 },
  'claude-haiku-4-5-20251001': { input: 0.8, output: 4.0 },
  'claude-opus-4-20250514': { input: 15.0, output: 75.0 },
  'gpt-4o': { input: 2.5, output: 10.0 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
}

const DEFAULT_PRICING = { input: 3.0, output: 15.0 }

/**
 * Estimate cost in USD based on model and token counts.
 */
export function estimateCost(
  model: string,
  promptTokens: number,
  completionTokens: number
): number {
  const pricing = MODEL_PRICING[model] ?? DEFAULT_PRICING
  return (promptTokens * pricing.input + completionTokens * pricing.output) / 1_000_000
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/server && npx vitest run src/__tests__/llm.test.ts --reporter=verbose 2>&1 | tail -20`
Expected: All 18 tests PASS (10 from Task 2 + 8 new)

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/services/llm.ts packages/server/src/__tests__/llm.test.ts
git commit -m "feat(server): add AI Gateway URL builder, provider factory, and cost estimation

Built with Epic Flowstate"
```

---

### Task 4: Streaming Messages Endpoint — Happy Path

**Files:**

- Modify: `packages/server/src/__tests__/chat.test.ts`
- Modify: `packages/server/src/routes/chat.ts`

This task replaces the Phase 1 `POST /conversations/:id/messages` (which returned JSON 201) with an SSE streaming response (200 `text/event-stream`). Existing POST messages tests must be updated.

- [ ] **Step 1: Add AI SDK mocks and streaming test helpers to `chat.test.ts`**

At the top of `packages/server/src/__tests__/chat.test.ts`, add these **before** all other imports:

```typescript
import { vi } from 'vitest'
import { streamText } from 'ai'

vi.mock('ai', () => ({
  streamText: vi.fn(),
}))

vi.mock('@ai-sdk/anthropic', () => ({
  createAnthropic: vi.fn(() => vi.fn(() => ({ modelId: 'mock-model' }))),
}))

vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: vi.fn(() => vi.fn(() => ({ modelId: 'mock-model' }))),
}))

vi.mock('@ai-sdk/google', () => ({
  createGoogleGenerativeAI: vi.fn(() => vi.fn(() => ({ modelId: 'mock-model' }))),
}))
```

Add this helper function inside the test file, before the test suites:

```typescript
/** Create a mock streamText return value */
function createMockStreamResult(
  chunks: string[],
  usage = { promptTokens: 10, completionTokens: 20, totalTokens: 30 }
) {
  return {
    textStream: (async function* () {
      for (const chunk of chunks) {
        yield chunk
      }
    })(),
    usage: Promise.resolve(usage),
    finishReason: Promise.resolve('stop' as const),
    text: Promise.resolve(chunks.join('')),
  }
}

/** Parse SSE response body into event objects */
function parseSSEEvents(body: string): Array<Record<string, unknown>> {
  return body
    .split('\n\n')
    .filter(line => line.startsWith('data: '))
    .map(line => {
      const data = line.slice(6) // strip 'data: '
      if (data === '[DONE]') return { type: 'done' }
      return JSON.parse(data) as Record<string, unknown>
    })
}
```

In the `beforeEach` block (or create one if needed), add a default mock reset:

```typescript
beforeEach(async () => {
  // ... existing beforeEach setup ...
  vi.mocked(streamText).mockReset()
  // Default mock so any test that reaches streaming doesn't crash
  vi.mocked(streamText).mockReturnValue(
    createMockStreamResult(['OK']) as ReturnType<typeof streamText>
  )
})
```

- [ ] **Step 2: Update existing POST messages tests for SSE response format**

Find the existing `POST /conversations/:id/messages` test suite. Update the test that checks for a saved user message. The test previously expected a 201 JSON response; it now needs to provide an API key and consume the SSE stream:

Replace the test that checks the user message is saved (it likely asserts `res.status === 201`) with:

```typescript
it('saves user message and streams SSE response', async () => {
  // Create conversation
  const createRes = await app.request('/v1/chat/conversations', {
    method: 'POST',
    headers: { ...authHeader(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      agentHandle: 'alice.saga',
      provider: 'anthropic',
      model: 'claude-sonnet-4-5-20250514',
    }),
  })
  const { conversation } = (await createRes.json()) as { conversation: { id: string } }

  vi.mocked(streamText).mockReturnValue(
    createMockStreamResult(['Hello', ' there']) as ReturnType<typeof streamText>
  )

  const res = await app.request(`/v1/chat/conversations/${conversation.id}/messages`, {
    method: 'POST',
    headers: {
      ...authHeader(token),
      'Content-Type': 'application/json',
      'X-LLM-API-Key': 'sk-test-key',
    },
    body: JSON.stringify({ content: 'Hi there' }),
  })

  expect(res.status).toBe(200)
  expect(res.headers.get('Content-Type')).toBe('text/event-stream')

  const body = await res.text()
  const events = parseSSEEvents(body)

  // Verify text-delta events
  const textDeltas = events.filter(e => e.type === 'text-delta')
  expect(textDeltas.length).toBe(2)
  expect(textDeltas[0].textDelta).toBe('Hello')
  expect(textDeltas[1].textDelta).toBe(' there')

  // Verify finish event
  const finish = events.find(e => e.type === 'finish')
  expect(finish).toBeDefined()
  expect((finish as Record<string, unknown>).finishReason).toBe('stop')

  // Verify [DONE]
  expect(events.some(e => e.type === 'done')).toBe(true)

  // Verify user message was saved
  const getRes = await app.request(`/v1/chat/conversations/${conversation.id}`, {
    headers: authHeader(token),
  })
  const { messages } = (await getRes.json()) as {
    messages: Array<{ role: string; content: string }>
  }
  const userMsg = messages.find(m => m.role === 'user')
  expect(userMsg).toBeDefined()
  expect(userMsg!.content).toBe('Hi there')
})
```

Update the "auto-sets title" test (if it exists as a separate test) to consume the SSE stream:

```typescript
it('auto-sets title from first user message', async () => {
  const createRes = await app.request('/v1/chat/conversations', {
    method: 'POST',
    headers: { ...authHeader(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      agentHandle: 'alice.saga',
      provider: 'anthropic',
      model: 'claude-sonnet-4-5-20250514',
    }),
  })
  const { conversation } = (await createRes.json()) as { conversation: { id: string } }

  const msgRes = await app.request(`/v1/chat/conversations/${conversation.id}/messages`, {
    method: 'POST',
    headers: {
      ...authHeader(token),
      'Content-Type': 'application/json',
      'X-LLM-API-Key': 'sk-test-key',
    },
    body: JSON.stringify({
      content: 'Help me review my smart contract for security vulnerabilities',
    }),
  })
  await msgRes.text()

  const getRes = await app.request(`/v1/chat/conversations/${conversation.id}`, {
    headers: authHeader(token),
  })
  const { conversation: conv } = (await getRes.json()) as { conversation: { title: string } }
  expect(conv.title).toBe('Help me review my smart contract for security vulnerabilities')
})
```

The validation tests ("requires content", "returns 404 for non-existent conversation") should work as-is since those errors are returned as JSON before streaming starts. No changes needed.

- [ ] **Step 3: Write new streaming tests**

Add these tests to the POST messages describe block in `chat.test.ts`:

```typescript
it('saves assistant message to D1 with usage metadata', async () => {
  const createRes = await app.request('/v1/chat/conversations', {
    method: 'POST',
    headers: { ...authHeader(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      agentHandle: 'test.saga',
      provider: 'anthropic',
      model: 'claude-sonnet-4-5-20250514',
    }),
  })
  const { conversation } = (await createRes.json()) as { conversation: { id: string } }

  vi.mocked(streamText).mockReturnValue(
    createMockStreamResult(['The assistant response'], {
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
    }) as ReturnType<typeof streamText>
  )

  const msgRes = await app.request(`/v1/chat/conversations/${conversation.id}/messages`, {
    method: 'POST',
    headers: {
      ...authHeader(token),
      'Content-Type': 'application/json',
      'X-LLM-API-Key': 'sk-test-key',
    },
    body: JSON.stringify({ content: 'Query' }),
  })
  await msgRes.text()

  const getRes = await app.request(`/v1/chat/conversations/${conversation.id}`, {
    headers: authHeader(token),
  })
  const { messages } = (await getRes.json()) as {
    messages: Array<{
      role: string
      content: string
      tokensPrompt: number | null
      tokensCompletion: number | null
      costUsd: number | null
      latencyMs: number | null
    }>
  }

  expect(messages.length).toBe(2)
  const assistant = messages.find(m => m.role === 'assistant')
  expect(assistant).toBeDefined()
  expect(assistant!.content).toBe('The assistant response')
  expect(assistant!.tokensPrompt).toBe(100)
  expect(assistant!.tokensCompletion).toBe(50)
  expect(assistant!.costUsd).toBeGreaterThan(0)
  expect(assistant!.latencyMs).toBeGreaterThanOrEqual(0)
})

it('includes cost and model in finish event', async () => {
  const createRes = await app.request('/v1/chat/conversations', {
    method: 'POST',
    headers: { ...authHeader(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      agentHandle: 'alice.saga',
      provider: 'anthropic',
      model: 'claude-sonnet-4-5-20250514',
    }),
  })
  const { conversation } = (await createRes.json()) as { conversation: { id: string } }

  vi.mocked(streamText).mockReturnValue(
    createMockStreamResult(['Hi'], {
      promptTokens: 1000,
      completionTokens: 500,
      totalTokens: 1500,
    }) as ReturnType<typeof streamText>
  )

  const msgRes = await app.request(`/v1/chat/conversations/${conversation.id}/messages`, {
    method: 'POST',
    headers: {
      ...authHeader(token),
      'Content-Type': 'application/json',
      'X-LLM-API-Key': 'sk-test-key',
    },
    body: JSON.stringify({ content: 'Hello' }),
  })

  const body = await msgRes.text()
  const events = parseSSEEvents(body)
  const finish = events.find(e => e.type === 'finish') as Record<string, unknown>

  expect(finish).toBeDefined()
  const usage = finish.usage as Record<string, number>
  expect(usage.inputTokens).toBe(1000)
  expect(usage.outputTokens).toBe(500)
  expect(usage.totalTokens).toBe(1500)

  const cost = finish.cost as Record<string, unknown>
  expect(cost.totalCostUSD).toBeGreaterThan(0)
  expect(cost.model).toBe('claude-sonnet-4-5-20250514')
})

it('loads conversation history as context for streamText', async () => {
  const createRes = await app.request('/v1/chat/conversations', {
    method: 'POST',
    headers: { ...authHeader(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      agentHandle: 'alice.saga',
      provider: 'anthropic',
      model: 'claude-sonnet-4-5-20250514',
    }),
  })
  const { conversation } = (await createRes.json()) as { conversation: { id: string } }

  // First message
  vi.mocked(streamText).mockReturnValue(
    createMockStreamResult(['First response']) as ReturnType<typeof streamText>
  )
  const msg1 = await app.request(`/v1/chat/conversations/${conversation.id}/messages`, {
    method: 'POST',
    headers: {
      ...authHeader(token),
      'Content-Type': 'application/json',
      'X-LLM-API-Key': 'sk-test-key',
    },
    body: JSON.stringify({ content: 'Hello' }),
  })
  await msg1.text()

  // Second message
  vi.mocked(streamText).mockReturnValue(
    createMockStreamResult(['Second response']) as ReturnType<typeof streamText>
  )
  const msg2 = await app.request(`/v1/chat/conversations/${conversation.id}/messages`, {
    method: 'POST',
    headers: {
      ...authHeader(token),
      'Content-Type': 'application/json',
      'X-LLM-API-Key': 'sk-test-key',
    },
    body: JSON.stringify({ content: 'Follow up' }),
  })
  await msg2.text()

  // Verify streamText was called with full conversation history
  const lastCall = vi.mocked(streamText).mock.calls[1]![0] as {
    messages: Array<{ role: string; content: string }>
  }
  expect(lastCall.messages).toHaveLength(3) // Hello, First response, Follow up
  expect(lastCall.messages[0]).toEqual({ role: 'user', content: 'Hello' })
  expect(lastCall.messages[1]).toEqual({ role: 'assistant', content: 'First response' })
  expect(lastCall.messages[2]).toEqual({ role: 'user', content: 'Follow up' })
})

it('passes system prompt to streamText when conversation has one', async () => {
  const createRes = await app.request('/v1/chat/conversations', {
    method: 'POST',
    headers: { ...authHeader(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      agentHandle: 'alice.saga',
      provider: 'anthropic',
      model: 'claude-sonnet-4-5-20250514',
      systemPrompt: 'You are a helpful code reviewer.',
    }),
  })
  const { conversation } = (await createRes.json()) as { conversation: { id: string } }

  vi.mocked(streamText).mockReturnValue(
    createMockStreamResult(['Sure!']) as ReturnType<typeof streamText>
  )

  const msgRes = await app.request(`/v1/chat/conversations/${conversation.id}/messages`, {
    method: 'POST',
    headers: {
      ...authHeader(token),
      'Content-Type': 'application/json',
      'X-LLM-API-Key': 'sk-test-key',
    },
    body: JSON.stringify({ content: 'Review my code' }),
  })
  await msgRes.text()

  const call = vi.mocked(streamText).mock.calls[0]![0] as { system?: string }
  expect(call.system).toBe('You are a helpful code reviewer.')
})

it('resolves API key from body apiKey field', async () => {
  const createRes = await app.request('/v1/chat/conversations', {
    method: 'POST',
    headers: { ...authHeader(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      agentHandle: 'alice.saga',
      provider: 'anthropic',
      model: 'claude-sonnet-4-5-20250514',
    }),
  })
  const { conversation } = (await createRes.json()) as { conversation: { id: string } }

  const msgRes = await app.request(`/v1/chat/conversations/${conversation.id}/messages`, {
    method: 'POST',
    headers: {
      ...authHeader(token),
      'Content-Type': 'application/json',
      // No X-LLM-API-Key header
    },
    body: JSON.stringify({ content: 'Hi', apiKey: 'sk-body-key' }),
  })

  expect(msgRes.status).toBe(200)
  expect(msgRes.headers.get('Content-Type')).toBe('text/event-stream')
})
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `cd packages/server && npx vitest run src/__tests__/chat.test.ts --reporter=verbose 2>&1 | tail -20`
Expected: New streaming tests FAIL (endpoint still returns JSON 201 from Phase 1).

- [ ] **Step 5: Modify `chat.ts` POST messages endpoint for SSE streaming**

Replace the entire `chatRoutes.post('/conversations/:id/messages', ...)` handler (lines 191-261 of `packages/server/src/routes/chat.ts`) with the streaming implementation.

First, add new imports at the top of `chat.ts`:

```typescript
import { streamText } from 'ai'
import type { CoreMessage } from 'ai'
import { resolveApiKey, getProviderEnvKey, createModel, estimateCost } from '../services/llm'
```

Then replace the handler:

```typescript
/**
 * POST /v1/chat/conversations/:id/messages — Send user message and stream LLM response via SSE.
 */
chatRoutes.post('/conversations/:id/messages', requireAuth, async c => {
  const session = c.get('session')
  const conversationId = c.req.param('id') as string
  const wallet = session.walletAddress.toLowerCase()

  let body: { content: string; apiKey?: string }
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid JSON body', code: 'INVALID_REQUEST' }, 400)
  }

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

  // Resolve API key: header → body → env → 400
  const apiKey = resolveApiKey({
    header: c.req.header('X-LLM-API-Key'),
    bodyApiKey: body.apiKey,
    envApiKey: getProviderEnvKey(conversation.provider, c.env),
  })

  if (!apiKey) {
    return c.json(
      {
        error: `No API key available for provider "${conversation.provider}". Provide via X-LLM-API-Key header, apiKey body field, or configure server environment.`,
        code: 'API_KEY_REQUIRED',
      },
      400
    )
  }

  const now = new Date().toISOString()
  const msgId = generateId('msg')

  // Save user message to D1
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

  // Load conversation history from D1 for context
  const dbMessages = await db
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.conversationId, conversationId))
    .orderBy(chatMessages.createdAt)

  const messages: CoreMessage[] = dbMessages.map(m => ({
    role: m.role as 'user' | 'assistant' | 'system',
    content: m.content,
  }))

  // Create AI SDK model
  let model
  try {
    model = createModel(conversation.provider, conversation.model, apiKey, c.env)
  } catch (err) {
    return c.json(
      {
        error: err instanceof Error ? err.message : 'Failed to create LLM provider',
        code: 'PROVIDER_ERROR',
      },
      400
    )
  }

  // Stream response via SSE
  const startTime = Date.now()
  const encoder = new TextEncoder()
  const { readable, writable } = new TransformStream()
  const writer = writable.getWriter()

  ;(async () => {
    try {
      const result = streamText({
        model,
        messages,
        ...(conversation.systemPrompt && { system: conversation.systemPrompt }),
      })

      let fullText = ''
      for await (const chunk of result.textStream) {
        fullText += chunk
        await writer.write(
          encoder.encode(`data: ${JSON.stringify({ type: 'text-delta', textDelta: chunk })}\n\n`)
        )
      }

      const usage = await result.usage
      const finishReason = await result.finishReason
      const latencyMs = Date.now() - startTime
      const costUsd = estimateCost(conversation.model, usage.promptTokens, usage.completionTokens)

      // Save assistant message to D1
      await db.insert(chatMessages).values({
        id: generateId('msg'),
        conversationId,
        role: 'assistant',
        content: fullText,
        tokensPrompt: usage.promptTokens,
        tokensCompletion: usage.completionTokens,
        costUsd,
        latencyMs,
        createdAt: new Date().toISOString(),
      })

      // Send finish event
      await writer.write(
        encoder.encode(
          `data: ${JSON.stringify({
            type: 'finish',
            finishReason,
            usage: {
              inputTokens: usage.promptTokens,
              outputTokens: usage.completionTokens,
              totalTokens: usage.totalTokens,
            },
            cost: { totalCostUSD: costUsd, model: conversation.model },
          })}\n\n`
        )
      )

      await writer.write(encoder.encode('data: [DONE]\n\n'))
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Stream failed'
      await writer.write(
        encoder.encode(`data: ${JSON.stringify({ type: 'error', error: errorMessage })}\n\n`)
      )
    } finally {
      await writer.close()
    }
  })()

  return new Response(readable, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
    },
  })
})
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd packages/server && npx vitest run src/__tests__/chat.test.ts --reporter=verbose 2>&1 | tail -30`
Expected: All chat tests PASS including new streaming tests.

- [ ] **Step 7: Commit**

```bash
git add packages/server/src/routes/chat.ts packages/server/src/__tests__/chat.test.ts
git commit -m "feat(server): upgrade POST messages to SSE streaming with AI SDK

Built with Epic Flowstate"
```

---

### Task 5: Streaming Messages Endpoint — Error Handling

**Files:**

- Modify: `packages/server/src/__tests__/chat.test.ts`
- Modify: `packages/server/src/routes/chat.ts` (if needed — error handling is already in Task 4 implementation)

- [ ] **Step 1: Write error handling tests**

Add these tests to the POST messages describe block in `packages/server/src/__tests__/chat.test.ts`:

```typescript
it('returns 400 when no API key is available', async () => {
  const createRes = await app.request('/v1/chat/conversations', {
    method: 'POST',
    headers: { ...authHeader(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      agentHandle: 'alice.saga',
      provider: 'anthropic',
      model: 'claude-sonnet-4-5-20250514',
    }),
  })
  const { conversation } = (await createRes.json()) as { conversation: { id: string } }

  // No X-LLM-API-Key header, no apiKey in body, no env var
  const msgRes = await app.request(`/v1/chat/conversations/${conversation.id}/messages`, {
    method: 'POST',
    headers: {
      ...authHeader(token),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ content: 'Hi' }),
  })

  expect(msgRes.status).toBe(400)
  const body = (await msgRes.json()) as { code: string; error: string }
  expect(body.code).toBe('API_KEY_REQUIRED')
  expect(body.error).toContain('anthropic')
})

it('sends SSE error event when provider stream fails', async () => {
  const createRes = await app.request('/v1/chat/conversations', {
    method: 'POST',
    headers: { ...authHeader(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      agentHandle: 'alice.saga',
      provider: 'anthropic',
      model: 'claude-sonnet-4-5-20250514',
    }),
  })
  const { conversation } = (await createRes.json()) as { conversation: { id: string } }

  // Mock streamText to fail during iteration
  vi.mocked(streamText).mockReturnValue({
    textStream: (async function* () {
      throw new Error('Authentication failed: invalid API key')
    })(),
    usage: Promise.reject(new Error('Authentication failed')),
    finishReason: Promise.reject(new Error('Authentication failed')),
    text: Promise.reject(new Error('Authentication failed')),
  } as ReturnType<typeof streamText>)

  const msgRes = await app.request(`/v1/chat/conversations/${conversation.id}/messages`, {
    method: 'POST',
    headers: {
      ...authHeader(token),
      'Content-Type': 'application/json',
      'X-LLM-API-Key': 'sk-invalid-key',
    },
    body: JSON.stringify({ content: 'Hi' }),
  })

  expect(msgRes.status).toBe(200) // SSE headers already sent
  const body = await msgRes.text()
  const events = parseSSEEvents(body)

  const errorEvent = events.find(e => e.type === 'error')
  expect(errorEvent).toBeDefined()
  expect((errorEvent as Record<string, unknown>).error).toContain('Authentication failed')
})

it('saves user message even when streaming fails', async () => {
  const createRes = await app.request('/v1/chat/conversations', {
    method: 'POST',
    headers: { ...authHeader(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      agentHandle: 'alice.saga',
      provider: 'anthropic',
      model: 'claude-sonnet-4-5-20250514',
    }),
  })
  const { conversation } = (await createRes.json()) as { conversation: { id: string } }

  // Mock streamText to fail
  vi.mocked(streamText).mockReturnValue({
    textStream: (async function* () {
      throw new Error('Provider error')
    })(),
    usage: Promise.reject(new Error('Provider error')),
    finishReason: Promise.reject(new Error('Provider error')),
    text: Promise.reject(new Error('Provider error')),
  } as ReturnType<typeof streamText>)

  const msgRes = await app.request(`/v1/chat/conversations/${conversation.id}/messages`, {
    method: 'POST',
    headers: {
      ...authHeader(token),
      'Content-Type': 'application/json',
      'X-LLM-API-Key': 'sk-test-key',
    },
    body: JSON.stringify({ content: 'My important message' }),
  })
  await msgRes.text()

  // Verify user message was saved despite stream failure
  const getRes = await app.request(`/v1/chat/conversations/${conversation.id}`, {
    headers: authHeader(token),
  })
  const { messages } = (await getRes.json()) as {
    messages: Array<{ role: string; content: string }>
  }
  expect(messages.length).toBe(1)
  expect(messages[0].role).toBe('user')
  expect(messages[0].content).toBe('My important message')
})

it('returns 400 for unsupported provider', async () => {
  const createRes = await app.request('/v1/chat/conversations', {
    method: 'POST',
    headers: { ...authHeader(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      agentHandle: 'alice.saga',
      provider: 'unsupported-llm',
      model: 'some-model',
    }),
  })
  const { conversation } = (await createRes.json()) as { conversation: { id: string } }

  const msgRes = await app.request(`/v1/chat/conversations/${conversation.id}/messages`, {
    method: 'POST',
    headers: {
      ...authHeader(token),
      'Content-Type': 'application/json',
      'X-LLM-API-Key': 'sk-test-key',
    },
    body: JSON.stringify({ content: 'Hi' }),
  })

  expect(msgRes.status).toBe(400)
  const body = (await msgRes.json()) as { code: string; error: string }
  expect(body.code).toBe('PROVIDER_ERROR')
  expect(body.error).toContain('Unsupported provider')
})
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `cd packages/server && npx vitest run src/__tests__/chat.test.ts --reporter=verbose 2>&1 | tail -30`
Expected: All tests PASS (the error handling was already implemented in Task 4's endpoint code).

If any tests fail, fix the implementation in `chat.ts` and re-run.

- [ ] **Step 3: Commit**

```bash
git add packages/server/src/__tests__/chat.test.ts
git commit -m "test(server): add error handling tests for streaming endpoint

Built with Epic Flowstate"
```

---

### Task 6: Integration Verification

**Files:** None (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `cd packages/server && npx vitest run --reporter=verbose 2>&1 | tail -20`
Expected: All test files pass. Note the total test count (should be ~270+ tests across 20+ files).

- [ ] **Step 2: Check TypeScript compilation**

Run: `cd packages/server && npx tsc --noEmit 2>&1 | head -20`
Expected: No new errors. Pre-existing `@saga-standard/contracts` errors are acceptable (worktree build issue).

- [ ] **Step 3: Verify LLM service tests**

Run: `cd packages/server && npx vitest run src/__tests__/llm.test.ts --reporter=verbose`
Expected: All 18 LLM service tests pass.

- [ ] **Step 4: Verify chat tests**

Run: `cd packages/server && npx vitest run src/__tests__/chat.test.ts --reporter=verbose`
Expected: All chat tests pass including new streaming tests (~25+ tests).

- [ ] **Step 5: Commit if any fixes were needed**

If any fixes were applied in this task:

```bash
git add -u
git commit -m "fix(server): integration fixes for Phase 2 streaming

Built with Epic Flowstate"
```
