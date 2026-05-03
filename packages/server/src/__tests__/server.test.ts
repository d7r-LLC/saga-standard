// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { beforeEach, describe, expect, it } from 'vitest'
import { privateKeyToAccount } from 'viem/accounts'
import { app } from '../index'
import { createMockEnv, runMigrations } from './test-helpers'
import type { Env } from '../bindings'

// -- Helpers --

// Hardhat's first account — well-known test key, NOT a real wallet
const TEST_PRIVATE_KEY =
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as const // gitleaks:allow
const testAccount = privateKeyToAccount(TEST_PRIVATE_KEY)
const WALLET = testAccount.address // 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266

// Hardhat's second account — used in the wrong-wallet regression test below
const OTHER_PRIVATE_KEY =
  '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d' as const // gitleaks:allow
const otherAccount = privateKeyToAccount(OTHER_PRIVATE_KEY)

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

async function getSessionToken(wallet = WALLET): Promise<string> {
  const challengeRes = await req('POST', '/v1/auth/challenge', {
    body: { walletAddress: wallet, chain: CHAIN },
  })
  const { challenge } = (await challengeRes.json()) as { challenge: string }

  const signature = await testAccount.signMessage({ message: challenge })
  const verifyRes = await req('POST', '/v1/auth/verify', {
    body: { walletAddress: wallet, chain: CHAIN, signature, challenge },
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

      const signature = await testAccount.signMessage({ message: challengeBody.challenge })
      const verifyRes = await req('POST', '/v1/auth/verify', {
        body: {
          walletAddress: WALLET,
          chain: CHAIN,
          signature,
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

    it('rejects signature from wrong wallet', async () => {
      // Regression test for the SECURITY.md / verifySignature contract.
      // If anyone replaces viem.verifyMessage with `() => true` (or otherwise
      // weakens the check), this test must fail. See packages/server/SECURITY.md.
      const challengeRes = await req('POST', '/v1/auth/challenge', {
        body: { walletAddress: WALLET, chain: CHAIN },
      })
      expect(challengeRes.status).toBe(200)
      const { challenge } = (await challengeRes.json()) as { challenge: string }

      // Sign the challenge with the WRONG wallet (otherAccount), then claim WALLET.
      const wrongSignature = await otherAccount.signMessage({ message: challenge })

      const verifyRes = await req('POST', '/v1/auth/verify', {
        body: {
          walletAddress: WALLET,
          chain: CHAIN,
          signature: wrongSignature,
          challenge,
        },
      })
      expect(verifyRes.status).toBe(401)
      const body = (await verifyRes.json()) as { error: string; code: string }
      expect(body.code).toBe('INVALID_SIGNATURE')
    })

    it('rejects reused challenge', async () => {
      const token = await getSessionToken()
      expect(token).toBeTruthy()

      const challengeRes = await req('POST', '/v1/auth/challenge', {
        body: { walletAddress: WALLET, chain: CHAIN },
      })
      const { challenge } = (await challengeRes.json()) as { challenge: string }

      const sig1 = await testAccount.signMessage({ message: challenge })
      const firstVerify = await req('POST', '/v1/auth/verify', {
        body: {
          walletAddress: WALLET,
          chain: CHAIN,
          signature: sig1,
          challenge,
        },
      })
      expect(firstVerify.status).toBe(200)

      const sig2 = await testAccount.signMessage({ message: challenge })
      const secondVerify = await req('POST', '/v1/auth/verify', {
        body: {
          walletAddress: WALLET,
          chain: CHAIN,
          signature: sig2,
          challenge,
        },
      })
      expect(secondVerify.status).toBe(400)
    })

    // === Phase 2 — server auth & session hardening (2026-05-03) ===

    it('issues 15-minute session TTLs', async () => {
      // Phase 2 (A-High#5): TTL was reduced from 1h to 15min so leaked tokens
      // expire faster. expiresAt - issuedAt must equal 900_000 ms.
      const challengeRes = await req('POST', '/v1/auth/challenge', {
        body: { walletAddress: WALLET, chain: CHAIN },
      })
      const { challenge } = (await challengeRes.json()) as { challenge: string }
      const signature = await testAccount.signMessage({ message: challenge })
      const verifyRes = await req('POST', '/v1/auth/verify', {
        body: { walletAddress: WALLET, chain: CHAIN, signature, challenge },
      })
      const body = (await verifyRes.json()) as {
        issuedAt: string
        expiresAt: string
      }
      const issued = new Date(body.issuedAt).getTime()
      const expires = new Date(body.expiresAt).getTime()
      expect(expires - issued).toBe(900_000) // 15 minutes
    })

    it('DELETE /v1/auth/sessions/:token revokes a single token', async () => {
      // Phase 2 (A-High#5): self-revocation primitive.
      const token = await getSessionToken()

      // Sanity: token works
      const okRes = await req('GET', '/v1/agents/koda.saga', {
        headers: authHeader(token),
      })
      // 404 is fine (agent not yet created); 401 would indicate a broken session
      expect(okRes.status).not.toBe(401)

      // Revoke the token
      const revokeRes = await req('DELETE', `/v1/auth/sessions/${token}`, {
        headers: authHeader(token),
      })
      expect(revokeRes.status).toBe(200)
      const revokeBody = (await revokeRes.json()) as { revoked: boolean }
      expect(revokeBody.revoked).toBe(true)

      // Subsequent authenticated requests with that token should now 401
      const afterRes = await req('POST', '/v1/agents', {
        headers: authHeader(token),
        body: { handle: 'after-revoke.saga', walletAddress: WALLET, chain: CHAIN },
      })
      expect(afterRes.status).toBe(401)
    })

    it('DELETE /v1/auth/sessions/:token rejects revoking another wallet token', async () => {
      // Phase 2 (A-High#5): only the session's own wallet may revoke its tokens.
      // Use the OTHER_PRIVATE_KEY pair to issue a session for a different wallet.
      const otherWallet = otherAccount.address
      const otherChallengeRes = await req('POST', '/v1/auth/challenge', {
        body: { walletAddress: otherWallet, chain: CHAIN },
      })
      const { challenge: otherChal } = (await otherChallengeRes.json()) as {
        challenge: string
      }
      const otherSig = await otherAccount.signMessage({ message: otherChal })
      const otherVerify = await req('POST', '/v1/auth/verify', {
        body: {
          walletAddress: otherWallet,
          chain: CHAIN,
          signature: otherSig,
          challenge: otherChal,
        },
      })
      const { token: otherToken } = (await otherVerify.json()) as { token: string }

      // Wallet A tries to revoke wallet B's token — must 404 (no leak)
      const myToken = await getSessionToken()
      const cross = await req('DELETE', `/v1/auth/sessions/${otherToken}`, {
        headers: authHeader(myToken),
      })
      expect(cross.status).toBe(404)

      // Other wallet's token still works
      const stillOk = await req('GET', '/v1/agents/anything', {
        headers: authHeader(otherToken),
      })
      expect(stillOk.status).not.toBe(401)
    })

    it('DELETE /v1/auth/sessions revokes all sessions for the wallet', async () => {
      // Phase 2 (A-High#5): post-rotation revoke-all primitive.
      // Issue 2 sessions for the same wallet, then revoke-all, then verify
      // both reject on next request.
      const t1 = await getSessionToken()
      const t2 = await getSessionToken()
      expect(t1).not.toBe(t2)

      const revoked = await req('DELETE', '/v1/auth/sessions', {
        headers: authHeader(t1),
      })
      expect(revoked.status).toBe(200)

      // Both tokens should now reject. t1 was the caller's bearer — server
      // also deleted it from KV explicitly so it 401s with SESSION_EXPIRED.
      // t2 is rejected via the per-wallet revocation sentinel check.
      const r1 = await req('POST', '/v1/agents', {
        headers: authHeader(t1),
        body: { handle: 'after-all-revoke-1.saga', walletAddress: WALLET, chain: CHAIN },
      })
      expect(r1.status).toBe(401)

      const r2 = await req('POST', '/v1/agents', {
        headers: authHeader(t2),
        body: { handle: 'after-all-revoke-2.saga', walletAddress: WALLET, chain: CHAIN },
      })
      expect(r2.status).toBe(401)
      const r2body = (await r2.json()) as { code?: string }
      expect(r2body.code).toBe('SESSION_REVOKED')
    })
  })

  // -- /admin/reindex security (Phase 2 — G-High#1) --

  describe('/admin/reindex', () => {
    it('returns 403 when ADMIN_SECRET is unset (fail-closed)', async () => {
      // env returned by createMockEnv() does not set ADMIN_SECRET
      expect(env.ADMIN_SECRET).toBeFalsy()

      const noHeader = await req('POST', '/admin/reindex')
      expect(noHeader.status).toBe(403)

      // Even if a header value is provided, returns 403 because secret is unset
      const withHeader = await req('POST', '/admin/reindex', {
        headers: { 'X-Admin-Secret': 'whatever' },
      })
      expect(withHeader.status).toBe(403)
    })
  })

  // -- Agents --

  describe('agents', () => {
    // Phase 2 (O-Med#3) — publicKey validation rejects malformed input.
    it('rejects malformed publicKey on agent registration', async () => {
      const token = await getSessionToken()

      const tooShort = await req('POST', '/v1/agents', {
        headers: authHeader(token),
        body: {
          handle: 'short-key.saga',
          walletAddress: WALLET,
          chain: CHAIN,
          publicKey: 'AAAA', // 4 chars, not 44
        },
      })
      expect(tooShort.status).toBe(400)
      expect(((await tooShort.json()) as { code: string }).code).toBe('INVALID_PUBLIC_KEY')

      const empty = await req('POST', '/v1/agents', {
        headers: authHeader(token),
        body: {
          handle: 'empty-key.saga',
          walletAddress: WALLET,
          chain: CHAIN,
          publicKey: '',
        },
      })
      expect(empty.status).toBe(400)

      const nonBase64 = await req('POST', '/v1/agents', {
        headers: authHeader(token),
        body: {
          handle: 'bad-b64.saga',
          walletAddress: WALLET,
          chain: CHAIN,
          publicKey: '!'.repeat(44), // valid length, invalid alphabet
        },
      })
      expect(nonBase64.status).toBe(400)
    })

    it('accepts a valid 32-byte base64 publicKey', async () => {
      const token = await getSessionToken()
      // 32 zero bytes → "AAAAAA...=" (44 chars including padding)
      const validKey = btoa(String.fromCharCode.apply(null, new Array(32).fill(0)))
      expect(validKey).toMatch(/^[A-Za-z0-9+/]{43}=$/)

      const res = await req('POST', '/v1/agents', {
        headers: authHeader(token),
        body: {
          handle: 'good-key.saga',
          walletAddress: WALLET,
          chain: CHAIN,
          publicKey: validKey,
        },
      })
      expect(res.status).toBe(201)
    })

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
              keyWrapAlgorithm: 'aes-256-gcm',
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
              keyWrapAlgorithm: 'aes-256-gcm',
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
                    algorithm: 'aes-256-gcm',
                    wrappedKey: 'a2V5',
                    authTag: 'dGFn',
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

    it('rejects import with mismatched wallet address', async () => {
      const sagaDoc = {
        sagaVersion: '1.0',
        exportType: 'transfer',
        layers: {
          identity: {
            handle: 'hijacked-agent',
            walletAddress: '0x1111111111111111111111111111111111111111',
            chain: CHAIN,
            createdAt: '2026-01-01T00:00:00Z',
          },
        },
      }

      const res = await req('POST', '/v1/transfers/import', {
        headers: authHeader(token),
        body: sagaDoc,
      })
      expect(res.status).toBe(403)
    })

    it('rejects import with invalid handle format', async () => {
      const sagaDoc = {
        sagaVersion: '1.0',
        exportType: 'transfer',
        layers: {
          identity: {
            handle: 'ab',
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
      expect(res.status).toBe(400)
      const body = (await res.json()) as { code: string }
      expect(body.code).toBe('INVALID_HANDLE')
    })
  })

  // -- Relay --

  describe('GET /v1/relay', () => {
    it('returns 426 for non-WebSocket requests', async () => {
      const res = await req('GET', '/v1/relay')
      expect(res.status).toBe(426)
      const body = await res.json()
      expect(body.code).toBe('UPGRADE_REQUIRED')
    })
  })
})
