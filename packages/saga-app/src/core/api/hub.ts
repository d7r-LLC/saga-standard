// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

export const HUB_URL = __DEV__ ? 'http://localhost:8787' : 'https://saga-hub.d7r.workers.dev'

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
