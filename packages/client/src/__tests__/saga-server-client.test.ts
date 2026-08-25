// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SagaServerClient } from '../saga-server-client'
import { SagaAuthError } from '../auth'
import type { AgentRecord, AuthSession, DocumentRecord, ServerInfo, TransferRecord } from '../types'

// ── Helpers ───────────────────────────────────────────────────────────

const SERVER_URL = 'https://saga.example.com'
const WALLET = '0xaabbccddee1234567890aabbccddee1234567890'
const TOKEN = 'saga-sess-test-token-xyz'

function mockSession(): AuthSession {
  return {
    token: TOKEN,
    expiresAt: new Date(Date.now() + 3_600_000),
    walletAddress: WALLET,
    serverUrl: SERVER_URL,
  }
}

function mockResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    arrayBuffer: async () => new ArrayBuffer(0),
    headers: new Headers(),
  } as unknown as Response
}

function mockBinaryResponse(data: Uint8Array, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => ({}),
    arrayBuffer: async () => data.buffer,
    headers: new Headers(),
  } as unknown as Response
}

// ── Server Info ───────────────────────────────────────────────────────

describe('SagaServerClient', () => {
  let client: SagaServerClient
  let mockFetch: ReturnType<typeof vi.fn>

  beforeEach(() => {
    mockFetch = vi.fn()
    client = new SagaServerClient({
      serverUrl: SERVER_URL,
      auth: mockSession(),
      fetch: mockFetch as unknown as typeof globalThis.fetch,
    })
  })

  describe('getServerInfo', () => {
    it('fetches server metadata', async () => {
      const info: ServerInfo = {
        name: 'Test SAGA Server',
        version: '0.1.0',
        sagaVersion: '1.0',
        conformanceLevel: 1,
        supportedChains: ['eip155:8453'],
        capabilities: ['agents', 'documents'],
      }
      mockFetch.mockResolvedValueOnce(mockResponse(info))

      const result = await client.getServerInfo()

      expect(result).toEqual(info)
      expect(mockFetch).toHaveBeenCalledWith(
        `${SERVER_URL}/v1/server`,
        expect.objectContaining({ method: 'GET' })
      )
    })
  })

  // ── Agents ──────────────────────────────────────────────────────────

  describe('agents', () => {
    const agentRecord: AgentRecord = {
      agentId: 'agent_001',
      handle: 'koda.saga',
      walletAddress: WALLET,
      chain: 'eip155:8453',
      registeredAt: '2026-03-21T10:00:00Z',
    }

    it('registers an agent with auth header', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse(agentRecord, 201))

      const result = await client.registerAgent({
        handle: 'koda.saga',
        walletAddress: WALLET,
        chain: 'eip155:8453',
      })

      expect(result).toEqual(agentRecord)
      const [url, opts] = mockFetch.mock.calls[0]
      expect(url).toBe(`${SERVER_URL}/v1/agents`)
      expect(opts.method).toBe('POST')
      expect(opts.headers.Authorization).toBe(`Bearer ${TOKEN}`)
      expect(opts.headers['Content-Type']).toBe('application/json')
    })

    it('gets an agent by handle', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ agent: agentRecord }))

      const result = await client.getAgent('koda.saga')

      expect(result.agent).toEqual(agentRecord)
      expect(mockFetch.mock.calls[0][0]).toBe(`${SERVER_URL}/v1/agents/koda.saga`)
    })

    it('encodes special characters in handle', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ agent: agentRecord }))

      await client.getAgent('agent with spaces')

      expect(mockFetch.mock.calls[0][0]).toBe(`${SERVER_URL}/v1/agents/agent%20with%20spaces`)
    })

    it('lists agents with pagination', async () => {
      const list = {
        agents: [agentRecord],
        total: 1,
        page: 1,
        limit: 20,
      }
      mockFetch.mockResolvedValueOnce(mockResponse(list))

      const result = await client.listAgents({ page: 1, limit: 20, search: 'koda' })

      expect(result).toEqual(list)
      const url = mockFetch.mock.calls[0][0] as string
      expect(url).toContain('page=1')
      expect(url).toContain('limit=20')
      expect(url).toContain('search=koda')
    })

    it('lists agents without query params', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ agents: [], total: 0, page: 1, limit: 20 }))

      await client.listAgents()

      expect(mockFetch.mock.calls[0][0]).toBe(`${SERVER_URL}/v1/agents`)
    })
  })

  // ── Documents ───────────────────────────────────────────────────────

  describe('documents', () => {
    const docRecord: DocumentRecord = {
      documentId: 'saga_abc123',
      exportType: 'profile',
      sagaVersion: '1.0',
      sizeBytes: 4096,
      checksum: 'sha256:deadbeef',
      createdAt: '2026-03-21T10:00:00Z',
    }

    it('uploads a binary container', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse(docRecord, 201))
      const bytes = new Uint8Array([1, 2, 3, 4])

      const result = await client.uploadDocument('koda.saga', bytes)

      expect(result).toEqual(docRecord)
      const [url, opts] = mockFetch.mock.calls[0]
      expect(url).toBe(`${SERVER_URL}/v1/agents/koda.saga/documents`)
      expect(opts.headers['Content-Type']).toBe('application/octet-stream')
      expect(opts.body).toBe(bytes)
    })

    it('uploads a JSON document', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse(docRecord, 201))
      const doc = { sagaVersion: '1.0', documentId: 'saga_abc123' }

      const result = await client.uploadDocumentJson('koda.saga', doc)

      expect(result).toEqual(docRecord)
      const [, opts] = mockFetch.mock.calls[0]
      expect(opts.headers['Content-Type']).toBe('application/json')
      expect(JSON.parse(opts.body)).toEqual(doc)
    })

    it('lists documents with filter', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ documents: [docRecord] }))

      const result = await client.listDocuments('koda.saga', {
        exportType: 'profile',
        limit: 5,
      })

      expect(result.documents).toEqual([docRecord])
      const url = mockFetch.mock.calls[0][0] as string
      expect(url).toContain('exportType=profile')
      expect(url).toContain('limit=5')
    })

    it('gets a document as JSON', async () => {
      const doc = { sagaVersion: '1.0', documentId: 'saga_abc123' }
      mockFetch.mockResolvedValueOnce(mockResponse(doc))

      const result = await client.getDocument('koda.saga', 'saga_abc123')

      expect(result).toEqual(doc)
    })

    it('gets a document as binary container', async () => {
      const bytes = new Uint8Array([80, 75, 3, 4])
      mockFetch.mockResolvedValueOnce(mockBinaryResponse(bytes))

      const result = await client.getDocumentContainer('koda.saga', 'saga_abc123')

      expect(result).toBeInstanceOf(Uint8Array)
      const [, opts] = mockFetch.mock.calls[0]
      expect(opts.headers.Accept).toBe('application/octet-stream')
    })

    it('deletes a document', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse(undefined, 204))

      await client.deleteDocument('koda.saga', 'saga_abc123')

      const [url, opts] = mockFetch.mock.calls[0]
      expect(url).toBe(`${SERVER_URL}/v1/agents/koda.saga/documents/saga_abc123`)
      expect(opts.method).toBe('DELETE')
    })
  })

  // ── Transfers ───────────────────────────────────────────────────────

  describe('transfers', () => {
    const transfer: TransferRecord = {
      transferId: 'xfer_001',
      agentHandle: 'koda.saga',
      sourceServerUrl: SERVER_URL,
      destinationServerUrl: 'https://other.saga.dev',
      status: 'pending_consent',
      consentMessage: 'Sign to approve transfer of koda.saga',
      initiatedAt: '2026-03-21T10:00:00Z',
    }

    it('initiates a transfer', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse(transfer, 201))

      const result = await client.initiateTransfer({
        agentHandle: 'koda.saga',
        destinationServerUrl: 'https://other.saga.dev',
        requestedLayers: ['identity', 'persona', 'memory'],
      })

      expect(result).toEqual(transfer)
      const [url, opts] = mockFetch.mock.calls[0]
      expect(url).toBe(`${SERVER_URL}/v1/transfers/initiate`)
      expect(JSON.parse(opts.body).requestedLayers).toEqual(['identity', 'persona', 'memory'])
    })

    it('sends consent signature', async () => {
      const consented = { ...transfer, status: 'packaging' as const }
      mockFetch.mockResolvedValueOnce(mockResponse(consented))

      const result = await client.consentToTransfer('xfer_001', 'sig-abc')

      expect(result.status).toBe('packaging')
      const [url, opts] = mockFetch.mock.calls[0]
      expect(url).toBe(`${SERVER_URL}/v1/transfers/xfer_001/consent`)
      expect(JSON.parse(opts.body)).toEqual({ signature: 'sig-abc' })
    })

    it('gets transfer status', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse(transfer))

      const result = await client.getTransfer('xfer_001')

      expect(result).toEqual(transfer)
      expect(mockFetch.mock.calls[0][0]).toBe(`${SERVER_URL}/v1/transfers/xfer_001`)
    })

    it('imports a transfer container', async () => {
      const importResult: ImportResult = {
        agentId: 'agent_002',
        handle: 'koda.saga',
        importedLayers: ['identity', 'persona'],
        documentId: 'saga_xyz789',
        status: 'imported',
      }
      mockFetch.mockResolvedValueOnce(mockResponse(importResult, 201))
      const bytes = new Uint8Array([80, 75, 3, 4])

      const result = await client.importTransfer(bytes)

      expect(result).toEqual(importResult)
      const [url, opts] = mockFetch.mock.calls[0]
      expect(url).toBe(`${SERVER_URL}/v1/transfers/import`)
      expect(opts.headers['Content-Type']).toBe('application/octet-stream')
    })
  })

  // ── Resolve ───────────────────────────────────────────────────────

  describe('resolve', () => {
    it('fetches from /v1/resolve/:handle', async () => {
      const resolveData = {
        entityType: 'agent',
        handle: 'koda.saga',
        walletAddress: WALLET,
        chain: 'eip155:8453',
        tokenId: 42,
        tbaAddress: '0xtba42',
        homeHubUrl: 'https://hub.example.com',
        contractAddress: '0xcontract',
        registeredAt: '2026-03-21T10:00:00Z',
      }
      mockFetch.mockResolvedValueOnce(mockResponse(resolveData))

      const result = await client.resolve('koda.saga')

      expect(result).toEqual(resolveData)
      expect(mockFetch.mock.calls[0][0]).toBe(`${SERVER_URL}/v1/resolve/koda.saga`)
    })

    it('throws SagaAuthError for nonexistent handle', async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse({ error: 'Handle not found', code: 'NOT_FOUND' }, 404)
      )

      await expect(client.resolve('nonexistent')).rejects.toThrow(SagaAuthError)
    })
  })

  // ── Organizations ─────────────────────────────────────────────────

  describe('organizations', () => {
    const orgRecord = {
      orgId: 'org_001',
      handle: 'd7r',
      name: 'd7r LLC',
      walletAddress: WALLET,
      chain: 'eip155:8453',
      tokenId: 7,
      registeredAt: '2026-03-21T10:00:00Z',
    }

    it('gets an org by handle', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ organization: orgRecord }))

      const result = await client.getOrg('d7r')

      expect(result.organization).toEqual(orgRecord)
      expect(mockFetch.mock.calls[0][0]).toBe(`${SERVER_URL}/v1/orgs/d7r`)
    })

    it('lists orgs with pagination params', async () => {
      const list = { organizations: [orgRecord], total: 1, page: 1, limit: 20 }
      mockFetch.mockResolvedValueOnce(mockResponse(list))

      const result = await client.listOrgs({ page: 1, limit: 20, search: 'epic' })

      expect(result).toEqual(list)
      const url = mockFetch.mock.calls[0][0] as string
      expect(url).toContain('page=1')
      expect(url).toContain('limit=20')
      expect(url).toContain('search=epic')
    })

    it('lists orgs without params', async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse({ organizations: [], total: 0, page: 1, limit: 20 })
      )

      await client.listOrgs()

      expect(mockFetch.mock.calls[0][0]).toBe(`${SERVER_URL}/v1/orgs`)
    })
  })

  // ── Error Handling ──────────────────────────────────────────────────

  describe('error handling', () => {
    it('throws SagaAuthError on 4xx', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ error: 'Not found', code: 'NOT_FOUND' }, 404))

      await expect(client.getAgent('nonexistent')).rejects.toThrow(SagaAuthError)

      mockFetch.mockResolvedValueOnce(mockResponse({ error: 'Not found', code: 'NOT_FOUND' }, 404))
      try {
        await client.getAgent('nonexistent')
      } catch (err) {
        const apiErr = err as SagaAuthError
        expect(apiErr.code).toBe('NOT_FOUND')
        expect(apiErr.statusCode).toBe(404)
      }
    })

    it('throws SagaAuthError on 5xx', async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse({ error: 'Internal error', code: 'INTERNAL_ERROR' }, 500)
      )

      await expect(client.getServerInfo()).rejects.toThrow(SagaAuthError)
    })

    it('handles non-JSON error bodies', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 502,
        json: async () => {
          throw new Error('not JSON')
        },
      } as unknown as Response)

      await expect(client.getServerInfo()).rejects.toThrow(SagaAuthError)

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 502,
        json: async () => {
          throw new Error('not JSON')
        },
      } as unknown as Response)
      try {
        await client.getServerInfo()
      } catch (err) {
        const apiErr = err as SagaAuthError
        expect(apiErr.code).toBe('REQUEST_FAILED')
      }
    })
  })

  // ── No Auth ─────────────────────────────────────────────────────────

  describe('unauthenticated requests', () => {
    it('omits Authorization header when no session', async () => {
      const unauthClient = new SagaServerClient({
        serverUrl: SERVER_URL,
        fetch: mockFetch as unknown as typeof globalThis.fetch,
      })
      mockFetch.mockResolvedValueOnce(
        mockResponse({
          name: 'Test',
          version: '0.1.0',
          sagaVersion: '1.0',
          conformanceLevel: 1,
          supportedChains: [],
          capabilities: [],
        })
      )

      await unauthClient.getServerInfo()

      const headers = mockFetch.mock.calls[0][1].headers
      expect(headers.Authorization).toBeUndefined()
    })
  })
})
