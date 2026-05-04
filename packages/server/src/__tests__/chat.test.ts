// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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

/** Create a mock streamText return value (matches ai v6 LanguageModelUsage shape) */
function createMockStreamResult(chunks: string[], usage = { inputTokens: 10, outputTokens: 20 }) {
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

describe('Chat API', () => {
  let token: string

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

  // Phase 7 (G-Low#5): explicit afterEach so module-level vi.mock(...)
  // state can't leak across tests if a test throws after a mock has been
  // configured but before the next beforeEach resets it.
  //
  // resetAllMocks (not clearAllMocks): clears call history AND restores
  // each vi.fn() to an empty implementation. clearAllMocks would leave
  // any `.mockReturnValueOnce` queue or `.mockImplementation` behavior in
  // place, which is the exact leakage we're trying to prevent. The
  // beforeEach above re-configures `streamText.mockReturnValue(...)` from
  // scratch, so a fresh reset between tests is safe and stronger.
  afterEach(() => {
    vi.resetAllMocks()
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
  })

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
        body: {
          agentHandle: 'bob.saga',
          provider: 'anthropic',
          model: 'claude-sonnet-4-5-20250514',
        },
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
      const msgRes = await req('POST', `/v1/chat/conversations/${conversation.id}/messages`, {
        headers: { ...authHeader(token), 'X-LLM-API-Key': 'test-api-key-fake' },
        body: { content: 'Hello, how are you?' },
      })
      await msgRes.text() // consume SSE stream

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
      // Should have user message + assistant message from stream
      expect(body.messages).toHaveLength(2)
      expect(body.messages[0].role).toBe('user')
      expect(body.messages[0].content).toBe('Hello, how are you?')
      expect(body.messages[1].role).toBe('assistant')
    })

    it('returns 404 for non-existent conversation', async () => {
      const res = await req('GET', '/v1/chat/conversations/conv_doesnotexist', {
        headers: authHeader(token),
      })
      expect(res.status).toBe(404)
    })

    it('returns 404 for conversation owned by another wallet', async () => {
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

      // Directly modify the conversation's walletAddress in the DB to simulate another owner
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

  describe('POST /v1/chat/conversations/:id/messages', () => {
    it('saves a user message and streams SSE response', async () => {
      vi.mocked(streamText).mockReturnValue(
        createMockStreamResult(['Hello', ' world']) as ReturnType<typeof streamText>
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
        body: { content: 'What is the SAGA standard?' },
      })
      expect(res.status).toBe(200)
      expect(res.headers.get('Content-Type')).toBe('text/event-stream')

      const body = await res.text()
      const events = parseSSEEvents(body)

      // Should have text-delta events
      const deltas = events.filter(e => e.type === 'text-delta')
      expect(deltas).toHaveLength(2)
      expect(deltas[0].textDelta).toBe('Hello')
      expect(deltas[1].textDelta).toBe(' world')

      // Should have finish event
      const finish = events.find(e => e.type === 'finish')
      expect(finish).toBeTruthy()

      // Should have [DONE]
      const done = events.find(e => e.type === 'done')
      expect(done).toBeTruthy()

      // User message should be persisted
      const getRes = await req('GET', `/v1/chat/conversations/${conversation.id}`, {
        headers: authHeader(token),
      })
      const getBody = (await getRes.json()) as { messages: Record<string, unknown>[] }
      const userMsg = getBody.messages.find(m => m.role === 'user')
      expect(userMsg).toBeTruthy()
      expect(userMsg!.content).toBe('What is the SAGA standard?')
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

      const res = await req('POST', `/v1/chat/conversations/${conversation.id}/messages`, {
        headers: { ...authHeader(token), 'X-LLM-API-Key': 'test-api-key-fake' },
        body: { content: 'Help me review the staking contract for security vulnerabilities' },
      })
      await res.text() // consume SSE stream

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

      const res1 = await req('POST', `/v1/chat/conversations/${conversation.id}/messages`, {
        headers: { ...authHeader(token), 'X-LLM-API-Key': 'test-api-key-fake' },
        body: { content: 'First message sets the title' },
      })
      await res1.text() // consume SSE stream

      // Reset mock for second call (generator is consumed)
      vi.mocked(streamText).mockReturnValue(
        createMockStreamResult(['OK']) as ReturnType<typeof streamText>
      )

      const res2 = await req('POST', `/v1/chat/conversations/${conversation.id}/messages`, {
        headers: { ...authHeader(token), 'X-LLM-API-Key': 'test-api-key-fake' },
        body: { content: 'Second message should not change title' },
      })
      await res2.text() // consume SSE stream

      const getRes = await req('GET', `/v1/chat/conversations/${conversation.id}`, {
        headers: authHeader(token),
      })
      const body = (await getRes.json()) as { conversation: { title: string } }
      expect(body.conversation.title).toBe('First message sets the title')
    })

    it('saves assistant message to D1 with usage metadata', async () => {
      vi.mocked(streamText).mockReturnValue(
        createMockStreamResult(['The SAGA standard is...'], {
          inputTokens: 15,
          outputTokens: 25,
        }) as ReturnType<typeof streamText>
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
        body: { content: 'What is SAGA?' },
      })
      await res.text() // consume SSE stream

      // Check assistant message in DB
      const getRes = await req('GET', `/v1/chat/conversations/${conversation.id}`, {
        headers: authHeader(token),
      })
      const body = (await getRes.json()) as { messages: Record<string, unknown>[] }
      const assistantMsg = body.messages.find(m => m.role === 'assistant')
      expect(assistantMsg).toBeTruthy()
      expect(assistantMsg!.content).toBe('The SAGA standard is...')
      expect(assistantMsg!.tokensPrompt).toBe(15)
      expect(assistantMsg!.tokensCompletion).toBe(25)
      expect(assistantMsg!.costUsd).toBeGreaterThan(0)
      expect(assistantMsg!.latencyMs).toBeGreaterThanOrEqual(0)
    })

    it('includes cost and model in finish event', async () => {
      vi.mocked(streamText).mockReturnValue(
        createMockStreamResult(['Response'], {
          inputTokens: 10,
          outputTokens: 20,
        }) as ReturnType<typeof streamText>
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
        body: { content: 'Hello' },
      })
      const body = await res.text()
      const events = parseSSEEvents(body)

      const finish = events.find(e => e.type === 'finish') as Record<string, unknown>
      expect(finish).toBeTruthy()
      expect(finish.finishReason).toBe('stop')

      const usage = finish.usage as Record<string, unknown>
      expect(usage.inputTokens).toBe(10)
      expect(usage.outputTokens).toBe(20)
      expect(usage.totalTokens).toBe(30) // inputTokens(10) + outputTokens(20)

      const cost = finish.cost as Record<string, unknown>
      expect(cost.totalCostUSD).toBeGreaterThan(0)
      expect(cost.model).toBe('claude-sonnet-4-5-20250514')
    })

    it('loads conversation history as context for streamText', async () => {
      // Disable AMS so this test exercises the D1 fallback path
      env.AMS_BASE_URL = ''
      env.AMS_AUTH_TOKEN = ''

      const createRes = await req('POST', '/v1/chat/conversations', {
        headers: authHeader(token),
        body: {
          agentHandle: 'alice.saga',
          provider: 'anthropic',
          model: 'claude-sonnet-4-5-20250514',
        },
      })
      const { conversation } = (await createRes.json()) as { conversation: { id: string } }

      // First message
      const res1 = await req('POST', `/v1/chat/conversations/${conversation.id}/messages`, {
        headers: { ...authHeader(token), 'X-LLM-API-Key': 'test-api-key-fake' },
        body: { content: 'First question' },
      })
      await res1.text()

      // Reset mock for second call
      vi.mocked(streamText).mockReturnValue(
        createMockStreamResult(['Second answer']) as ReturnType<typeof streamText>
      )

      // Second message
      const res2 = await req('POST', `/v1/chat/conversations/${conversation.id}/messages`, {
        headers: { ...authHeader(token), 'X-LLM-API-Key': 'test-api-key-fake' },
        body: { content: 'Follow-up question' },
      })
      await res2.text()

      // Verify streamText was called with full history on the second call
      const calls = vi.mocked(streamText).mock.calls
      expect(calls).toHaveLength(2)

      const secondCallArgs = calls[1][0] as { messages: Array<{ role: string; content: string }> }
      // Should include: user "First question", assistant "OK" (from first mock), user "Follow-up question"
      expect(secondCallArgs.messages).toHaveLength(3)
      expect(secondCallArgs.messages[0]).toEqual({
        role: 'user',
        content: 'First question',
      })
      expect(secondCallArgs.messages[1]).toEqual({
        role: 'assistant',
        content: 'OK',
      })
      expect(secondCallArgs.messages[2]).toEqual({
        role: 'user',
        content: 'Follow-up question',
      })
    })

    it('passes system prompt to streamText when conversation has one', async () => {
      const createRes = await req('POST', '/v1/chat/conversations', {
        headers: authHeader(token),
        body: {
          agentHandle: 'alice.saga',
          provider: 'anthropic',
          model: 'claude-sonnet-4-5-20250514',
          systemPrompt: 'You are a helpful coding assistant.',
        },
      })
      const { conversation } = (await createRes.json()) as { conversation: { id: string } }

      const res = await req('POST', `/v1/chat/conversations/${conversation.id}/messages`, {
        headers: { ...authHeader(token), 'X-LLM-API-Key': 'test-api-key-fake' },
        body: { content: 'Write a function' },
      })
      await res.text()

      const calls = vi.mocked(streamText).mock.calls
      expect(calls).toHaveLength(1)
      const args = calls[0][0] as { system?: string }
      expect(args.system).toBe('You are a helpful coding assistant.')
    })

    it('resolves API key from body apiKey field', async () => {
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
        body: { content: 'Hello', apiKey: 'test-body-api-key-fake' },
      })
      expect(res.status).toBe(200)
      expect(res.headers.get('Content-Type')).toBe('text/event-stream')
      await res.text() // consume stream
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
        headers: { ...authHeader(token), 'X-LLM-API-Key': 'test-api-key-fake' },
        body: { content: '' },
      })
      expect(res.status).toBe(400)
    })

    it('returns 404 for non-existent conversation', async () => {
      const res = await req('POST', '/v1/chat/conversations/conv_doesnotexist/messages', {
        headers: { ...authHeader(token), 'X-LLM-API-Key': 'test-api-key-fake' },
        body: { content: 'Hello' },
      })
      expect(res.status).toBe(404)
    })

    it('returns 400 when no API key is available', async () => {
      const createRes = await req('POST', '/v1/chat/conversations', {
        headers: authHeader(token),
        body: {
          agentHandle: 'alice.saga',
          provider: 'anthropic',
          model: 'claude-sonnet-4-5-20250514',
        },
      })
      const { conversation } = (await createRes.json()) as { conversation: { id: string } }

      // POST message without any API key source
      const res = await req('POST', `/v1/chat/conversations/${conversation.id}/messages`, {
        headers: authHeader(token),
        body: { content: 'Hello' },
      })
      expect(res.status).toBe(400)
      const body = (await res.json()) as { error: string; code: string }
      expect(body.code).toBe('API_KEY_REQUIRED')
      expect(body.error).toContain('anthropic')
    })

    it('sends SSE error event when provider stream fails', async () => {
      const usageRej = Promise.reject(new Error('Authentication failed'))
      const finishRej = Promise.reject(new Error('Authentication failed'))
      const textRej = Promise.reject(new Error('Authentication failed'))
      // Prevent unhandled rejection warnings for promises that will never be awaited
      usageRej.catch(() => {})
      finishRej.catch(() => {})
      textRej.catch(() => {})

      vi.mocked(streamText).mockReturnValue({
        // eslint-disable-next-line require-yield -- intentional: simulates a stream that errors before producing data
        textStream: (async function* () {
          throw new Error('Authentication failed: invalid API key')
        })(),
        usage: usageRej,
        finishReason: finishRej,
        text: textRej,
      } as ReturnType<typeof streamText>)

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
        body: { content: 'Hello' },
      })
      // SSE headers are already sent, so status is 200
      expect(res.status).toBe(200)

      const body = await res.text()
      const events = parseSSEEvents(body)
      const errorEvent = events.find(e => e.type === 'error')
      expect(errorEvent).toBeTruthy()
      expect(errorEvent!.error).toContain('Authentication failed')
    })

    it('saves user message even when streaming fails', async () => {
      const usageRej = Promise.reject(new Error('Provider unavailable'))
      const finishRej = Promise.reject(new Error('Provider unavailable'))
      const textRej = Promise.reject(new Error('Provider unavailable'))
      usageRej.catch(() => {})
      finishRej.catch(() => {})
      textRej.catch(() => {})

      vi.mocked(streamText).mockReturnValue({
        // eslint-disable-next-line require-yield -- intentional: simulates a stream that errors before producing data
        textStream: (async function* () {
          throw new Error('Provider unavailable')
        })(),
        usage: usageRej,
        finishReason: finishRej,
        text: textRej,
      } as ReturnType<typeof streamText>)

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
        body: { content: 'This should still be saved' },
      })
      await res.text() // consume SSE stream (which will contain error)

      // Verify user message was persisted despite streaming failure
      const getRes = await req('GET', `/v1/chat/conversations/${conversation.id}`, {
        headers: authHeader(token),
      })
      const body = (await getRes.json()) as { messages: Record<string, unknown>[] }
      const userMsg = body.messages.find(m => m.role === 'user')
      expect(userMsg).toBeTruthy()
      expect(userMsg!.content).toBe('This should still be saved')
    })

    it('returns 400 for unsupported provider', async () => {
      // Create conversation with unsupported provider via direct DB insert
      const db = (await import('drizzle-orm/d1')).drizzle(env.DB)
      const { chatConversations: convTable } = await import('../db/schema')
      const convId = 'conv_unsupported_test'
      const now = new Date().toISOString()
      await db.insert(convTable).values({
        id: convId,
        agentHandle: 'alice.saga',
        walletAddress: WALLET.toLowerCase(),
        provider: 'unsupported-llm',
        model: 'some-model',
        title: null,
        systemPrompt: null,
        amsSessionId: null,
        createdAt: now,
        updatedAt: now,
      })

      const res = await req('POST', `/v1/chat/conversations/${convId}/messages`, {
        headers: { ...authHeader(token), 'X-LLM-API-Key': 'test-api-key-fake' },
        body: { content: 'Hello' },
      })
      expect(res.status).toBe(400)
      const body = (await res.json()) as { error: string; code: string }
      expect(body.code).toBe('PROVIDER_ERROR')
      expect(body.error).toContain('Unsupported provider')
    })

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
  })

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
      const msgRes = await req('POST', `/v1/chat/conversations/${conversation.id}/messages`, {
        headers: { ...authHeader(token), 'X-LLM-API-Key': 'test-api-key-fake' },
        body: { content: 'Hello' },
      })
      await msgRes.text() // consume SSE stream

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

    it('works without AMS configured (D1-only fallback)', async () => {
      // Clear AMS env vars so getAmsClient returns null
      env.AMS_BASE_URL = ''
      env.AMS_AUTH_TOKEN = ''

      const createRes = await req('POST', '/v1/chat/conversations', {
        headers: authHeader(token),
        body: {
          agentHandle: 'alice.saga',
          provider: 'anthropic',
          model: 'claude-sonnet-4-5-20250514',
        },
      })
      expect(createRes.status).toBe(201)
      const { conversation } = (await createRes.json()) as { conversation: { id: string } }

      // Send a message — should use D1 context, not AMS
      const msgRes = await req('POST', `/v1/chat/conversations/${conversation.id}/messages`, {
        headers: { ...authHeader(token), 'X-LLM-API-Key': 'test-key' },
        body: { content: 'Hello' },
      })
      expect(msgRes.status).toBe(200)

      // Delete — should succeed without AMS cleanup
      const delRes = await req('DELETE', `/v1/chat/conversations/${conversation.id}`, {
        headers: authHeader(token),
      })
      expect(delRes.status).toBe(204)

      // AMS client should never have been created
      expect(createAmsClient).not.toHaveBeenCalled()
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
})
