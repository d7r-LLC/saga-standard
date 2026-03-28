// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

export const HUB_URL = 'http://localhost:8787'

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message?: string
  ) {
    super(message ?? `Server error: ${status}`)
    this.name = 'ApiError'
  }
}

class HubAuthManager {
  private token: string | null = null
  private walletAddress: string | null = null

  async authenticate(
    walletAddress: string,
    signMessage: (msg: string) => Promise<string>
  ): Promise<void> {
    const challengeRes = await fetch(`${HUB_URL}/v1/auth/challenge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ walletAddress, chain: 'eip155:8453' }),
    })
    if (!challengeRes.ok) throw new ApiError(challengeRes.status)
    const { challenge } = (await challengeRes.json()) as { challenge: string; expiresAt: string }

    const signature = await signMessage(challenge)

    const verifyRes = await fetch(`${HUB_URL}/v1/auth/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ walletAddress, chain: 'eip155:8453', signature, challenge }),
    })
    if (!verifyRes.ok) throw new ApiError(verifyRes.status)
    const { token } = (await verifyRes.json()) as { token: string }

    this.token = token
    this.walletAddress = walletAddress
  }

  getToken(): string | null {
    return this.token
  }

  isAuthenticated(): boolean {
    return this.token !== null
  }

  setToken(token: string): void {
    this.token = token
  }

  logout(): void {
    this.token = null
    this.walletAddress = null
  }
}

export const hubAuthManager = new HubAuthManager()

export async function authenticatedFetch<T>(
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const token = hubAuthManager.getToken()
  if (!token) throw new ApiError(401, 'Not authenticated')

  const res = await fetch(`${HUB_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })

  if (!res.ok) throw new ApiError(res.status)

  if (method === 'DELETE' && res.status === 204) return {} as T

  return res.json() as Promise<T>
}
