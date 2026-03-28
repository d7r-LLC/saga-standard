// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

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

describe('Chat API', () => {
  let token: string

  beforeEach(async () => {
    env = createMockEnv()
    await runMigrations(env.DB)
    token = await getSessionToken()
    vi.mocked(streamText).mockReset()
    // Default mock so any test that reaches streaming doesn't crash
    vi.mocked(streamText).mockReturnValue(
      createMockStreamResult(['OK']) as ReturnType<typeof streamText>
    )
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
      expect(body.messages.length).toBeGreaterThanOrEqual(1)
      expect(body.messages[0].role).toBe('user')
      expect(body.messages[0].content).toBe('Hello, how are you?')
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
          promptTokens: 15,
          completionTokens: 25,
          totalTokens: 40,
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
          promptTokens: 10,
          completionTokens: 20,
          totalTokens: 30,
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
      expect(usage.totalTokens).toBe(30)

      const cost = finish.cost as Record<string, unknown>
      expect(cost.totalCostUSD).toBeGreaterThan(0)
      expect(cost.model).toBe('claude-sonnet-4-5-20250514')
    })

    it('loads conversation history as context for streamText', async () => {
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
      expect(secondCallArgs.messages.length).toBeGreaterThanOrEqual(3)
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
