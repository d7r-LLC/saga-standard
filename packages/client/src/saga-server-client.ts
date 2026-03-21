// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import type {
  AgentDetailResponse,
  AgentListResponse,
  AgentRecord,
  AuthSession,
  DocumentListResponse,
  DocumentRecord,
  ImportResult,
  InitiateTransferRequest,
  RegisterAgentRequest,
  SagaApiError,
  SagaClientOptions,
  ServerInfo,
  TransferRecord,
} from './types'
import type { WalletSigner } from './auth'
import { SagaAuthError, authenticateWithServer } from './auth'

/**
 * Client for a SAGA-compatible server.
 *
 * Wraps the Appendix D REST API with typed methods.
 * All authenticated requests include the session Bearer token.
 */
export class SagaServerClient {
  private readonly baseUrl: string
  private auth: AuthSession | undefined
  private readonly fetchFn: typeof globalThis.fetch

  constructor(options: SagaClientOptions) {
    this.baseUrl = options.serverUrl.replace(/\/$/, '')
    this.auth = options.auth
    this.fetchFn = options.fetch ?? globalThis.fetch
  }

  /** Current auth session (undefined if not authenticated) */
  get session(): AuthSession | undefined {
    return this.auth
  }

  // ── Auth ────────────────────────────────────────────────────────────

  /**
   * Authenticate with the server using a wallet signer.
   * Stores the session for subsequent requests.
   */
  async authenticate(signer: WalletSigner): Promise<AuthSession> {
    this.auth = await authenticateWithServer({
      serverUrl: this.baseUrl,
      signer,
      fetch: this.fetchFn,
    })
    return this.auth
  }

  // ── Server Info ─────────────────────────────────────────────────────

  async getServerInfo(): Promise<ServerInfo> {
    return this.request<ServerInfo>('GET', '/v1/server')
  }

  // ── Agents ──────────────────────────────────────────────────────────

  async registerAgent(agent: RegisterAgentRequest): Promise<AgentRecord> {
    return this.request<AgentRecord>('POST', '/v1/agents', agent)
  }

  async getAgent(handleOrAddress: string): Promise<AgentDetailResponse> {
    return this.request<AgentDetailResponse>(
      'GET',
      `/v1/agents/${encodeURIComponent(handleOrAddress)}`
    )
  }

  async listAgents(options?: {
    page?: number
    limit?: number
    search?: string
  }): Promise<AgentListResponse> {
    const params = new URLSearchParams()
    if (options?.page !== undefined) params.set('page', String(options.page))
    if (options?.limit !== undefined) params.set('limit', String(options.limit))
    if (options?.search) params.set('search', options.search)
    const qs = params.toString()
    return this.request<AgentListResponse>('GET', `/v1/agents${qs ? `?${qs}` : ''}`)
  }

  // ── Documents ───────────────────────────────────────────────────────

  /**
   * Upload a .saga container (binary).
   */
  async uploadDocument(handle: string, container: Uint8Array): Promise<DocumentRecord> {
    const url = `${this.baseUrl}/v1/agents/${encodeURIComponent(handle)}/documents`
    const res = await this.fetchFn(url, {
      method: 'POST',
      headers: {
        ...this.authHeaders(),
        'Content-Type': 'application/octet-stream',
      },
      body: container,
    })
    return this.handleResponse<DocumentRecord>(res)
  }

  /**
   * Upload a SAGA document as JSON.
   */
  async uploadDocumentJson(handle: string, document: unknown): Promise<DocumentRecord> {
    return this.request<DocumentRecord>(
      'POST',
      `/v1/agents/${encodeURIComponent(handle)}/documents`,
      document
    )
  }

  async listDocuments(
    handle: string,
    options?: { exportType?: string; limit?: number }
  ): Promise<DocumentListResponse> {
    const params = new URLSearchParams()
    if (options?.exportType) params.set('exportType', options.exportType)
    if (options?.limit !== undefined) params.set('limit', String(options.limit))
    const qs = params.toString()
    return this.request<DocumentListResponse>(
      'GET',
      `/v1/agents/${encodeURIComponent(handle)}/documents${qs ? `?${qs}` : ''}`
    )
  }

  /**
   * Get a document as JSON.
   */
  async getDocument(handle: string, documentId: string): Promise<unknown> {
    return this.request(
      'GET',
      `/v1/agents/${encodeURIComponent(handle)}/documents/${encodeURIComponent(documentId)}`
    )
  }

  /**
   * Get a document as raw .saga container bytes.
   */
  async getDocumentContainer(handle: string, documentId: string): Promise<Uint8Array> {
    const url = `${this.baseUrl}/v1/agents/${encodeURIComponent(handle)}/documents/${encodeURIComponent(documentId)}`
    const res = await this.fetchFn(url, {
      method: 'GET',
      headers: {
        ...this.authHeaders(),
        Accept: 'application/octet-stream',
      },
    })
    if (!res.ok) {
      await this.throwApiError(res)
    }
    const buf = await res.arrayBuffer()
    return new Uint8Array(buf)
  }

  async deleteDocument(handle: string, documentId: string): Promise<void> {
    await this.request(
      'DELETE',
      `/v1/agents/${encodeURIComponent(handle)}/documents/${encodeURIComponent(documentId)}`
    )
  }

  // ── Transfers ───────────────────────────────────────────────────────

  async initiateTransfer(options: InitiateTransferRequest): Promise<TransferRecord> {
    return this.request<TransferRecord>('POST', '/v1/transfers/initiate', options)
  }

  async consentToTransfer(transferId: string, signature: string): Promise<TransferRecord> {
    return this.request<TransferRecord>(
      'POST',
      `/v1/transfers/${encodeURIComponent(transferId)}/consent`,
      { signature }
    )
  }

  async getTransfer(transferId: string): Promise<TransferRecord> {
    return this.request<TransferRecord>('GET', `/v1/transfers/${encodeURIComponent(transferId)}`)
  }

  async importTransfer(container: Uint8Array): Promise<ImportResult> {
    const url = `${this.baseUrl}/v1/transfers/import`
    const res = await this.fetchFn(url, {
      method: 'POST',
      headers: {
        ...this.authHeaders(),
        'Content-Type': 'application/octet-stream',
      },
      body: container,
    })
    return this.handleResponse<ImportResult>(res)
  }

  // ── Internal ────────────────────────────────────────────────────────

  private authHeaders(): Record<string, string> {
    if (!this.auth) return {}
    return { Authorization: `Bearer ${this.auth.token}` }
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.baseUrl}${path}`
    const headers: Record<string, string> = {
      ...this.authHeaders(),
    }
    const init: RequestInit = { method, headers }

    if (body !== undefined) {
      headers['Content-Type'] = 'application/json'
      init.body = JSON.stringify(body)
    }

    const res = await this.fetchFn(url, init)
    return this.handleResponse<T>(res)
  }

  private async handleResponse<T>(res: Response): Promise<T> {
    if (!res.ok) {
      await this.throwApiError(res)
    }
    // DELETE with 204 returns no body
    if (res.status === 204) return undefined as T
    return (await res.json()) as T
  }

  private async throwApiError(res: Response): Promise<never> {
    const err = (await res.json().catch(() => ({
      error: `Request failed with status ${res.status}`,
      code: 'REQUEST_FAILED',
    }))) as SagaApiError
    throw new SagaAuthError(err.error, err.code, res.status)
  }
}
