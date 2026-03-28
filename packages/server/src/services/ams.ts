// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

export interface AmsClient {
  healthCheck(): Promise<boolean>
  initSession(sessionId: string, namespace: string, systemPrompt?: string): Promise<{ sessionId: string; created: boolean }>
  addMessage(sessionId: string, role: string, content: string): Promise<void>
  getContextMessages(sessionId: string, maxTokens?: number): Promise<Array<{ role: string; content: string }>>
  removeSession(sessionId: string): Promise<void>
}

/**
 * Create an AMS (Agent Memory Service) HTTP client.
 * Provides session-based working memory management for chat conversations.
 */
export function createAmsClient(baseUrl: string, authToken?: string): AmsClient {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(authToken && { Authorization: `Bearer ${authToken}` }),
  }

  return {
    async healthCheck(): Promise<boolean> {
      try {
        const res = await fetch(`${baseUrl}/health`, { headers })
        return res.ok
      } catch {
        return false
      }
    },

    async initSession(
      sessionId: string,
      namespace: string,
      systemPrompt?: string
    ): Promise<{ sessionId: string; created: boolean }> {
      const res = await fetch(`${baseUrl}/api/working-memory/sessions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ sessionId, namespace, ...(systemPrompt ? { systemPrompt } : {}) }),
      })
      if (!res.ok) throw new Error(`AMS initSession failed: ${res.status}`)
      return res.json() as Promise<{ sessionId: string; created: boolean }>
    },

    async addMessage(sessionId: string, role: string, content: string): Promise<void> {
      const res = await fetch(`${baseUrl}/api/working-memory/sessions/${sessionId}/messages`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ role, content }),
      })
      if (!res.ok) throw new Error(`AMS addMessage failed: ${res.status}`)
    },

    async getContextMessages(
      sessionId: string,
      maxTokens?: number
    ): Promise<Array<{ role: string; content: string }>> {
      const params = maxTokens ? `?maxTokens=${maxTokens}` : ''
      const res = await fetch(`${baseUrl}/api/working-memory/sessions/${sessionId}/context${params}`, {
        headers,
      })
      if (!res.ok) throw new Error(`AMS getContextMessages failed: ${res.status}`)
      const data = await res.json() as { messages: Array<{ role: string; content: string }> }
      return data.messages
    },

    async removeSession(sessionId: string): Promise<void> {
      const res = await fetch(`${baseUrl}/api/working-memory/sessions/${sessionId}`, {
        method: 'DELETE',
        headers,
      })
      // 404 is acceptable (session already removed)
      if (!res.ok && res.status !== 404) {
        throw new Error(`AMS removeSession failed: ${res.status}`)
      }
    },
  }
}
