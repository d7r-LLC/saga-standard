// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createAmsClient,
  type AmsClient,
} from '../services/ams'

let client: AmsClient

beforeEach(() => {
  client = createAmsClient('http://localhost:7090', 'test-auth-token')
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('AmsClient', () => {
  describe('healthCheck', () => {
    it('returns true when service is healthy', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response('OK', { status: 200 })
      )
      expect(await client.healthCheck()).toBe(true)
    })

    it('returns false when service is unreachable', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('ECONNREFUSED'))
      expect(await client.healthCheck()).toBe(false)
    })

    it('returns false on non-200 response', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response('Service Unavailable', { status: 503 })
      )
      expect(await client.healthCheck()).toBe(false)
    })
  })

  describe('initSession', () => {
    it('creates a session and returns sessionId', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify({ sessionId: 'conv_abc', created: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )

      const result = await client.initSession('conv_abc', 'alice.saga')
      expect(result.sessionId).toBe('conv_abc')
      expect(result.created).toBe(true)

      const call = vi.mocked(fetch).mock.calls[0]
      expect(call[0]).toBe('http://localhost:7090/api/working-memory/sessions')
      expect(call[1]?.method).toBe('POST')
      const body = JSON.parse(call[1]?.body as string)
      expect(body.sessionId).toBe('conv_abc')
      expect(body.namespace).toBe('alice.saga')
    })

    it('passes system prompt when provided', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify({ sessionId: 'conv_abc', created: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )

      await client.initSession('conv_abc', 'alice.saga', 'Be helpful.')

      const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1]?.body as string)
      expect(body.systemPrompt).toBe('Be helpful.')
    })

    it('throws on non-200 response', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response('Bad Request', { status: 400 })
      )
      await expect(client.initSession('conv_abc', 'ns')).rejects.toThrow('AMS initSession failed: 400')
    })
  })

  describe('addMessage', () => {
    it('sends message to AMS session', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), { status: 200 })
      )

      await client.addMessage('conv_abc', 'user', 'Hello')

      const call = vi.mocked(fetch).mock.calls[0]
      expect(call[0]).toBe('http://localhost:7090/api/working-memory/sessions/conv_abc/messages')
      const body = JSON.parse(call[1]?.body as string)
      expect(body.role).toBe('user')
      expect(body.content).toBe('Hello')
    })

    it('throws on failure', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response('Not Found', { status: 404 })
      )
      await expect(client.addMessage('conv_abc', 'user', 'Hi')).rejects.toThrow('AMS addMessage failed: 404')
    })
  })

  describe('getContextMessages', () => {
    it('returns context-managed messages array', async () => {
      const messages = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' },
      ]
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify({ messages }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )

      const result = await client.getContextMessages('conv_abc')
      expect(result).toEqual(messages)

      const call = vi.mocked(fetch).mock.calls[0]
      expect(call[0]).toContain('/api/working-memory/sessions/conv_abc/context')
    })

    it('passes maxTokens as query param', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify({ messages: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )

      await client.getContextMessages('conv_abc', 8000)

      const call = vi.mocked(fetch).mock.calls[0]
      expect(call[0]).toContain('maxTokens=8000')
    })

    it('throws on failure', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response('Error', { status: 500 })
      )
      await expect(client.getContextMessages('conv_abc')).rejects.toThrow('AMS getContextMessages failed: 500')
    })
  })

  describe('removeSession', () => {
    it('deletes session from AMS', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), { status: 200 })
      )

      await client.removeSession('conv_abc')

      const call = vi.mocked(fetch).mock.calls[0]
      expect(call[0]).toBe('http://localhost:7090/api/working-memory/sessions/conv_abc')
      expect(call[1]?.method).toBe('DELETE')
    })

    it('does not throw on 404 (already removed)', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response('Not Found', { status: 404 })
      )
      await expect(client.removeSession('conv_abc')).resolves.not.toThrow()
    })

    it('throws on server error', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response('Error', { status: 500 })
      )
      await expect(client.removeSession('conv_abc')).rejects.toThrow('AMS removeSession failed: 500')
    })
  })

  describe('auth header', () => {
    it('includes Authorization header on all requests', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response('OK', { status: 200 })
      )

      await client.healthCheck()

      const headers = vi.mocked(fetch).mock.calls[0][1]?.headers as Record<string, string>
      expect(headers['Authorization']).toBe('Bearer test-auth-token')
    })
  })
})
