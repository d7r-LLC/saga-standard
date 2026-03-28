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
