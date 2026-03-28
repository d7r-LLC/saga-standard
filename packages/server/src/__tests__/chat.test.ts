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
})
