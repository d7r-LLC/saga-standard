// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { beforeEach, describe, expect, it } from 'vitest'
import app from '../index'
import { createMockEnv, runMigrations } from './test-helpers'
import type { Env } from '../bindings'

// -- Helpers --

const WALLET = '0xaabbccddee1234567890aabbccddee1234567890'
const CHAIN = 'eip155:8453'

let env: Env

async function req(
  method: string,
  path: string,
  opts?: { body?: unknown; headers?: Record<string, string>; raw?: ArrayBuffer }
): Promise<Response> {
  const url = `http://localhost${path}`
  const headers: Record<string, string> = { ...opts?.headers }
  const init: RequestInit = { method, headers }

  if (opts?.raw) {
    headers['Content-Type'] = 'application/octet-stream'
    init.body = opts.raw
  } else if (opts?.body !== undefined) {
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

  const fakeSignature = `0x${'ab'.repeat(65)}`
  const verifyRes = await req('POST', '/v1/auth/verify', {
    body: { walletAddress: WALLET, chain: CHAIN, signature: fakeSignature, challenge },
  })
  const { token } = (await verifyRes.json()) as { token: string }
  return token
}

function authHeader(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` }
}

// -- Tests --

describe('SAGA Reference Server', () => {
  beforeEach(async () => {
    env = createMockEnv()
    await runMigrations(env.DB)
  })

  // -- Health --

  describe('GET /health', () => {
    it('returns ok', async () => {
      const res = await req('GET', '/health')
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ status: 'ok' })
    })
  })

  // -- Server Info --

  describe('GET /v1/server', () => {
    it('returns server metadata', async () => {
      const res = await req('GET', '/v1/server')
      expect(res.status).toBe(200)
      const body = (await res.json()) as Record<string, unknown>
      expect(body.name).toBe('Test SAGA Server')
      expect(body.sagaVersion).toBe('1.0')
      expect(body.conformanceLevel).toBe(1)
      expect(body.capabilities).toContain('agents')
    })
  })

  // -- Auth --

  describe('auth flow', () => {
    it('issues challenge and verifies signature', async () => {
      const challengeRes = await req('POST', '/v1/auth/challenge', {
        body: { walletAddress: WALLET, chain: CHAIN },
      })
      expect(challengeRes.status).toBe(200)
      const challengeBody = (await challengeRes.json()) as {
        challenge: string
        expiresAt: string
      }
      expect(challengeBody.challenge).toContain(WALLET)
      expect(challengeBody.expiresAt).toBeTruthy()

      const fakeSignature = `0x${'ab'.repeat(65)}`
      const verifyRes = await req('POST', '/v1/auth/verify', {
        body: {
          walletAddress: WALLET,
          chain: CHAIN,
          signature: fakeSignature,
          challenge: challengeBody.challenge,
        },
      })
      expect(verifyRes.status).toBe(200)
      const verifyBody = (await verifyRes.json()) as {
        token: string
        expiresAt: string
        walletAddress: string
      }
      expect(verifyBody.token).toMatch(/^saga_sess_/)
      expect(verifyBody.walletAddress).toBe(WALLET.toLowerCase())
    })

    it('rejects missing fields', async () => {
      const res = await req('POST', '/v1/auth/challenge', {
        body: { walletAddress: WALLET },
      })
      expect(res.status).toBe(400)
    })

    it('rejects invalid challenge', async () => {
      const res = await req('POST', '/v1/auth/verify', {
        body: {
          walletAddress: WALLET,
          chain: CHAIN,
          signature: `0x${'ab'.repeat(65)}`,
          challenge: 'nonexistent-challenge',
        },
      })
      expect(res.status).toBe(400)
    })

    it('rejects reused challenge', async () => {
      const token = await getSessionToken()
      expect(token).toBeTruthy()

      const challengeRes = await req('POST', '/v1/auth/challenge', {
        body: { walletAddress: WALLET, chain: CHAIN },
      })
      const { challenge } = (await challengeRes.json()) as { challenge: string }

      const firstVerify = await req('POST', '/v1/auth/verify', {
        body: {
          walletAddress: WALLET,
          chain: CHAIN,
          signature: `0x${'cd'.repeat(65)}`,
          challenge,
        },
      })
      expect(firstVerify.status).toBe(200)

      const secondVerify = await req('POST', '/v1/auth/verify', {
        body: {
          walletAddress: WALLET,
          chain: CHAIN,
          signature: `0x${'ef'.repeat(65)}`,
          challenge,
        },
      })
      expect(secondVerify.status).toBe(400)
    })
  })

  // -- Agents --

  describe('agents', () => {
    it('registers and retrieves an agent', async () => {
      const token = await getSessionToken()

      const regRes = await req('POST', '/v1/agents', {
        headers: authHeader(token),
        body: { handle: 'koda.saga', walletAddress: WALLET, chain: CHAIN },
      })
      expect(regRes.status).toBe(201)
      const agent = (await regRes.json()) as Record<string, unknown>
      expect(agent.handle).toBe('koda.saga')
      expect(agent.agentId).toBeTruthy()

      const getRes = await req('GET', '/v1/agents/koda.saga')
      expect(getRes.status).toBe(200)
      const detail = (await getRes.json()) as { agent: Record<string, unknown> }
      expect(detail.agent.handle).toBe('koda.saga')
    })

    it('rejects duplicate handles', async () => {
      const token = await getSessionToken()

      await req('POST', '/v1/agents', {
        headers: authHeader(token),
        body: { handle: 'koda.saga', walletAddress: WALLET, chain: CHAIN },
      })

      const res = await req('POST', '/v1/agents', {
        headers: authHeader(token),
        body: { handle: 'koda.saga', walletAddress: WALLET, chain: CHAIN },
      })
      expect(res.status).toBe(409)
    })

    it('rejects invalid handle format', async () => {
      const token = await getSessionToken()

      const res = await req('POST', '/v1/agents', {
        headers: authHeader(token),
        body: { handle: 'ab', walletAddress: WALLET, chain: CHAIN },
      })
      expect(res.status).toBe(400)
    })

    it('rejects mismatched wallet address', async () => {
      const token = await getSessionToken()

      const res = await req('POST', '/v1/agents', {
        headers: authHeader(token),
        body: {
          handle: 'koda.saga',
          walletAddress: '0x1111111111111111111111111111111111111111',
          chain: CHAIN,
        },
      })
      expect(res.status).toBe(403)
    })

    it('requires auth for registration', async () => {
      const res = await req('POST', '/v1/agents', {
        body: { handle: 'koda.saga', walletAddress: WALLET, chain: CHAIN },
      })
      expect(res.status).toBe(401)
    })

    it('lists agents with pagination', async () => {
      const token = await getSessionToken()

      await req('POST', '/v1/agents', {
        headers: authHeader(token),
        body: { handle: 'agent.one', walletAddress: WALLET, chain: CHAIN },
      })
      await req('POST', '/v1/agents', {
        headers: authHeader(token),
        body: { handle: 'agent.two', walletAddress: WALLET, chain: CHAIN },
      })

      const res = await req('GET', '/v1/agents?page=1&limit=10')
      expect(res.status).toBe(200)
      const body = (await res.json()) as { agents: unknown[]; total: number }
      expect(body.agents.length).toBe(2)
      expect(body.total).toBe(2)
    })

    it('returns 404 for nonexistent agent', async () => {
      const res = await req('GET', '/v1/agents/nonexistent')
      expect(res.status).toBe(404)
    })
  })

  // -- Documents --

  describe('documents', () => {
    let token: string

    beforeEach(async () => {
      token = await getSessionToken()
      await req('POST', '/v1/agents', {
        headers: authHeader(token),
        body: { handle: 'koda.saga', walletAddress: WALLET, chain: CHAIN },
      })
    })

    it('uploads and retrieves a JSON document', async () => {
      const doc = { sagaVersion: '1.0', exportType: 'profile', layers: {} }

      const uploadRes = await req('POST', '/v1/agents/koda.saga/documents', {
        headers: authHeader(token),
        body: doc,
      })
      expect(uploadRes.status).toBe(201)
      const uploadBody = (await uploadRes.json()) as { documentId: string; checksum: string }
      expect(uploadBody.documentId).toBeTruthy()
      expect(uploadBody.checksum).toMatch(/^sha256:/)

      // Retrieve (auth required)
      const getRes = await req('GET', `/v1/agents/koda.saga/documents/${uploadBody.documentId}`, {
        headers: authHeader(token),
      })
      expect(getRes.status).toBe(200)
      const retrieved = (await getRes.json()) as Record<string, unknown>
      expect(retrieved.sagaVersion).toBe('1.0')
    })

    it('lists documents for an agent', async () => {
      await req('POST', '/v1/agents/koda.saga/documents', {
        headers: authHeader(token),
        body: { sagaVersion: '1.0', exportType: 'profile' },
      })
      await req('POST', '/v1/agents/koda.saga/documents', {
        headers: authHeader(token),
        body: { sagaVersion: '1.0', exportType: 'full' },
      })

      const res = await req('GET', '/v1/agents/koda.saga/documents', {
        headers: authHeader(token),
      })
      expect(res.status).toBe(200)
      const body = (await res.json()) as { documents: unknown[] }
      expect(body.documents.length).toBe(2)
    })

    it('deletes a document', async () => {
      const uploadRes = await req('POST', '/v1/agents/koda.saga/documents', {
        headers: authHeader(token),
        body: { sagaVersion: '1.0' },
      })
      const { documentId } = (await uploadRes.json()) as { documentId: string }

      const deleteRes = await req('DELETE', `/v1/agents/koda.saga/documents/${documentId}`, {
        headers: authHeader(token),
      })
      expect(deleteRes.status).toBe(204)

      // Verify it's gone (auth required)
      const getRes = await req('GET', `/v1/agents/koda.saga/documents/${documentId}`, {
        headers: authHeader(token),
      })
      expect(getRes.status).toBe(404)
    })

    it('requires auth for upload', async () => {
      const res = await req('POST', '/v1/agents/koda.saga/documents', {
        body: { sagaVersion: '1.0' },
      })
      expect(res.status).toBe(401)
    })

    it('requires auth for document list', async () => {
      const res = await req('GET', '/v1/agents/koda.saga/documents')
      expect(res.status).toBe(401)
    })

    it('requires auth for document retrieval', async () => {
      const uploadRes = await req('POST', '/v1/agents/koda.saga/documents', {
        headers: authHeader(token),
        body: { sagaVersion: '1.0' },
      })
      const { documentId } = (await uploadRes.json()) as { documentId: string }

      const getRes = await req('GET', `/v1/agents/koda.saga/documents/${documentId}`)
      expect(getRes.status).toBe(401)
    })

    it('returns 404 for nonexistent agent', async () => {
      const res = await req('GET', '/v1/agents/nonexistent/documents', {
        headers: authHeader(token),
      })
      expect(res.status).toBe(404)
    })

    it('rejects upload with unencrypted vault layer', async () => {
      const doc = {
        sagaVersion: '1.0',
        exportType: 'full',
        layers: {
          identity: {
            handle: 'koda.saga',
            walletAddress: WALLET,
            chain: CHAIN,
            createdAt: '2026-01-01T00:00:00Z',
          },
          vault: {
            encryption: {
              algorithm: 'aes-256-gcm',
              keyDerivation: 'hkdf-sha256',
              keyWrapAlgorithm: 'x25519-xsalsa20-poly1305',
              salt: 'dGVzdA==',
              info: 'saga-vault-v1',
            },
            items: [
              {
                itemId: 'vi_test',
                type: 'login',
                name: 'Test Login',
                createdAt: '2026-01-01T00:00:00Z',
                updatedAt: '2026-01-01T00:00:00Z',
                fields: {
                  __encrypted: false,
                  username: 'plaintext-visible',
                  password: 'plaintext-visible',
                },
                keyWraps: [],
              },
            ],
            version: 1,
            updatedAt: '2026-01-01T00:00:00Z',
          },
        },
      }

      const res = await req('POST', '/v1/agents/koda.saga/documents', {
        headers: authHeader(token),
        body: doc,
      })
      expect(res.status).toBe(400)
      const body = (await res.json()) as { error: string; code: string }
      expect(body.code).toBe('ENCRYPTION_REQUIRED')
    })

    it('accepts upload with properly encrypted vault layer', async () => {
      const doc = {
        sagaVersion: '1.0',
        exportType: 'full',
        privacy: {
          encryptedLayers: ['vault'],
          encryptionScheme: 'x25519-xsalsa20-poly1305',
        },
        layers: {
          identity: {
            handle: 'koda.saga',
            walletAddress: WALLET,
            chain: CHAIN,
            createdAt: '2026-01-01T00:00:00Z',
          },
          vault: {
            encryption: {
              algorithm: 'aes-256-gcm',
              keyDerivation: 'hkdf-sha256',
              keyWrapAlgorithm: 'x25519-xsalsa20-poly1305',
              salt: 'dGVzdA==',
              info: 'saga-vault-v1',
            },
            items: [
              {
                itemId: 'vi_test',
                type: 'login',
                name: 'Test Login',
                createdAt: '2026-01-01T00:00:00Z',
                updatedAt: '2026-01-01T00:00:00Z',
                fields: {
                  __encrypted: true,
                  v: 1,
                  alg: 'aes-256-gcm',
                  ct: 'Y2lwaGVydGV4dA==',
                  iv: 'aXY=',
                  at: 'YXQ=',
                },
                keyWraps: [
                  {
                    recipient: 'self',
                    algorithm: 'x25519-xsalsa20-poly1305',
                    wrappedKey: 'a2V5',
                  },
                ],
              },
            ],
            version: 1,
            updatedAt: '2026-01-01T00:00:00Z',
          },
        },
      }

      const res = await req('POST', '/v1/agents/koda.saga/documents', {
        headers: authHeader(token),
        body: doc,
      })
      expect(res.status).toBe(201)
    })
  })

  // -- Transfers --

  describe('transfers', () => {
    let token: string

    beforeEach(async () => {
      token = await getSessionToken()
      await req('POST', '/v1/agents', {
        headers: authHeader(token),
        body: { handle: 'koda.saga', walletAddress: WALLET, chain: CHAIN },
      })
    })

    it('initiates and consents to a transfer', async () => {
      const initRes = await req('POST', '/v1/transfers/initiate', {
        headers: authHeader(token),
        body: {
          agentHandle: 'koda.saga',
          destinationServerUrl: 'https://other.saga.dev',
          requestedLayers: ['identity', 'persona'],
        },
      })
      expect(initRes.status).toBe(201)
      const initBody = (await initRes.json()) as {
        transferId: string
        status: string
        consentMessage: string
      }
      expect(initBody.status).toBe('pending_consent')
      expect(initBody.consentMessage).toBeTruthy()

      const consentRes = await req('POST', `/v1/transfers/${initBody.transferId}/consent`, {
        headers: authHeader(token),
        body: { signature: `0x${'ff'.repeat(65)}` },
      })
      expect(consentRes.status).toBe(200)
      const consentBody = (await consentRes.json()) as { status: string }
      expect(consentBody.status).toBe('packaging')

      const statusRes = await req('GET', `/v1/transfers/${initBody.transferId}`)
      expect(statusRes.status).toBe(200)
      const statusBody = (await statusRes.json()) as { status: string }
      expect(statusBody.status).toBe('packaging')
    })

    it('rejects transfer for nonexistent agent', async () => {
      const res = await req('POST', '/v1/transfers/initiate', {
        headers: authHeader(token),
        body: {
          agentHandle: 'nonexistent',
          destinationServerUrl: 'https://other.saga.dev',
        },
      })
      expect(res.status).toBe(404)
    })

    it('rejects consent for wrong state', async () => {
      const initRes = await req('POST', '/v1/transfers/initiate', {
        headers: authHeader(token),
        body: {
          agentHandle: 'koda.saga',
          destinationServerUrl: 'https://other.saga.dev',
        },
      })
      const { transferId } = (await initRes.json()) as { transferId: string }

      await req('POST', `/v1/transfers/${transferId}/consent`, {
        headers: authHeader(token),
        body: { signature: `0x${'ff'.repeat(65)}` },
      })

      const res = await req('POST', `/v1/transfers/${transferId}/consent`, {
        headers: authHeader(token),
        body: { signature: `0x${'ee'.repeat(65)}` },
      })
      expect(res.status).toBe(400)
    })

    it('imports a valid SAGA document and creates agent + document', async () => {
      const sagaDoc = {
        sagaVersion: '1.0',
        exportType: 'transfer',
        layers: {
          identity: {
            handle: 'imported-agent',
            walletAddress: WALLET,
            chain: CHAIN,
            createdAt: '2026-01-01T00:00:00Z',
          },
        },
      }

      const res = await req('POST', '/v1/transfers/import', {
        headers: authHeader(token),
        body: sagaDoc,
      })
      expect(res.status).toBe(201)
      const body = (await res.json()) as {
        agentId: string
        handle: string
        documentId: string
        status: string
        importedLayers: string[]
      }
      expect(body.handle).toBe('imported-agent')
      expect(body.status).toBe('imported')
      expect(body.importedLayers).toContain('identity')
      expect(body.agentId).toMatch(/^agent_/)
      expect(body.documentId).toMatch(/^saga_/)
    })

    it('rejects import with missing identity layer', async () => {
      const res = await req('POST', '/v1/transfers/import', {
        headers: authHeader(token),
        body: { sagaVersion: '1.0', exportType: 'transfer', layers: {} },
      })
      expect(res.status).toBe(400)
    })
  })
})
