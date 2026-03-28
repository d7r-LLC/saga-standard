# Phase 4: Client Chat UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a working mobile UI for managing conversations and viewing message history (static display, no streaming).

**Architecture:** Feature module at `packages/saga-app/src/features/chat/` following existing directory feature patterns. Wallet signature auth via challenge-response flow to get session tokens. CRUD operations against the existing server API. Static message display only; streaming is Phase 5.

**Tech Stack:** React Native CLI, React Navigation (NativeStack), Jest + @testing-library/react-native, viem (wallet signing), existing shared components (Card, Badge, Button, Header, SafeArea, etc.)

---

## File Structure

### Create

| File                                                                          | Responsibility                                                            |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `packages/saga-app/src/features/chat/types.ts`                                | Conversation, Message, CreateConversationParams, provider/model config    |
| `packages/saga-app/src/features/chat/api/session.ts`                          | Challenge-response auth: requestChallenge, verifyChallenge                |
| `packages/saga-app/src/features/chat/api/chat.ts`                             | Authenticated CRUD: list, create, get, delete conversations; send message |
| `packages/saga-app/src/features/chat/hooks/useSession.ts`                     | Session token management with caching and auto-refresh                    |
| `packages/saga-app/src/features/chat/hooks/useConversations.ts`               | List, create, delete conversations for active agent                       |
| `packages/saga-app/src/features/chat/components/MessageBubble.tsx`            | User (right, primary) and assistant (left, surface) message display       |
| `packages/saga-app/src/features/chat/components/ChatInput.tsx`                | Multi-line TextInput with send button                                     |
| `packages/saga-app/src/features/chat/components/ConversationCard.tsx`         | Card for conversation list items                                          |
| `packages/saga-app/src/features/chat/screens/ConversationList.tsx`            | FlatList of conversations, empty state, pull-to-refresh                   |
| `packages/saga-app/src/features/chat/screens/NewChat.tsx`                     | Provider/model picker with system prompt                                  |
| `packages/saga-app/src/features/chat/screens/ChatScreen.tsx`                  | Static message display, send message, refresh                             |
| `packages/saga-app/__tests__/features/chat/api/chat.test.ts`                  | API client tests                                                          |
| `packages/saga-app/__tests__/features/chat/hooks/useSession.test.tsx`         | Session hook tests                                                        |
| `packages/saga-app/__tests__/features/chat/hooks/useConversations.test.tsx`   | Conversations hook tests                                                  |
| `packages/saga-app/__tests__/features/chat/components/MessageBubble.test.tsx` | MessageBubble tests                                                       |
| `packages/saga-app/__tests__/features/chat/components/ChatInput.test.tsx`     | ChatInput tests                                                           |

### Modify

| File                                                        | Change                                                                     |
| ----------------------------------------------------------- | -------------------------------------------------------------------------- |
| `packages/saga-app/src/navigation/types.ts`                 | Update `MessagesStackParamList` with ConversationList, ChatScreen, NewChat |
| `packages/saga-app/src/navigation/stacks/MessagesStack.tsx` | Replace placeholder with real screen registrations                         |

---

### Task 1: Chat Feature Types

**Files:**

- Create: `packages/saga-app/src/features/chat/types.ts`

- [ ] **Step 1: Create type definitions**

```typescript
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

export interface Conversation {
  id: string
  agentHandle: string
  title: string | null
  provider: string
  model: string
  systemPrompt?: string | null
  createdAt: string
  updatedAt: string
}

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  tokensPrompt?: number | null
  tokensCompletion?: number | null
  costUsd?: number | null
  latencyMs?: number | null
  createdAt: string
}

export interface CreateConversationParams {
  agentHandle: string
  provider: string
  model: string
  systemPrompt?: string
}

export interface ConversationWithMessages {
  conversation: Conversation
  messages: Message[]
}

export interface ListConversationsResult {
  conversations: Conversation[]
  total: number
  page: number
  limit: number
}

export interface SessionToken {
  token: string
  expiresAt: string
  walletAddress: string
}

export interface ProviderModel {
  id: string
  name: string
  description: string
}

export interface ProviderConfig {
  id: string
  name: string
  color: string
  models: ProviderModel[]
}

export const PROVIDERS: ProviderConfig[] = [
  {
    id: 'anthropic',
    name: 'Anthropic',
    color: '#d97706',
    models: [
      {
        id: 'claude-sonnet-4-5-20250514',
        name: 'Claude Sonnet 4.5',
        description: 'Fast, intelligent',
      },
      {
        id: 'claude-haiku-3-5-20241022',
        name: 'Claude Haiku 3.5',
        description: 'Fastest, lightest',
      },
    ],
  },
  {
    id: 'openai',
    name: 'OpenAI',
    color: '#10b981',
    models: [
      { id: 'gpt-4o', name: 'GPT-4o', description: 'Versatile, multimodal' },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini', description: 'Fast, affordable' },
    ],
  },
  {
    id: 'google',
    name: 'Google',
    color: '#3b82f6',
    models: [{ id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', description: 'Fast, versatile' }],
  },
]
```

- [ ] **Step 2: Verify TypeScript compilation**

Run: `cd packages/saga-app && npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors related to `features/chat/types.ts`

- [ ] **Step 3: Commit**

```bash
git add packages/saga-app/src/features/chat/types.ts
git commit -m "feat(saga-app): add chat feature type definitions

Built with Epic Flowstate"
```

---

### Task 2: Session API + Hook

**Files:**

- Create: `packages/saga-app/src/features/chat/api/session.ts`
- Create: `packages/saga-app/src/features/chat/hooks/useSession.ts`
- Test: `packages/saga-app/__tests__/features/chat/hooks/useSession.test.tsx`

The server uses KV-backed session tokens created via challenge-response wallet signature auth (see `packages/server/src/routes/auth.ts`). The mobile app needs to:

1. POST `/v1/auth/challenge` with `{walletAddress, chain}` to get a challenge string
2. Sign the challenge with the wallet's private key (EIP-191 via viem)
3. POST `/v1/auth/verify` with `{walletAddress, chain, signature, challenge}` to get a session token
4. Cache the token (1-hour TTL) and refresh before expiry

The wallet client is obtained via the existing `useWalletSigner` hook from `features/wallet/hooks/useWalletSigner.ts`, which loads the mnemonic from Keychain and creates a viem `WalletClient`. The active wallet info comes from `useStorage()`.

- [ ] **Step 1: Write the session API client**

```typescript
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import type { SessionToken } from '../types'

export const HUB_URL = __DEV__
  ? 'http://localhost:8787'
  : 'https://saga-hub.d7r-LLC.workers.dev'

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message?: string
  ) {
    super(message ?? `Server error: ${status}`)
    this.name = 'ApiError'
  }
}

export async function requestChallenge(
  walletAddress: string,
  chain: string
): Promise<{ challenge: string; expiresAt: string }> {
  const res = await fetch(`${HUB_URL}/v1/auth/challenge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ walletAddress, chain }),
  })
  if (!res.ok) throw new ApiError(res.status, 'Failed to request auth challenge')
  return res.json() as Promise<{ challenge: string; expiresAt: string }>
}

export async function verifyChallenge(
  walletAddress: string,
  chain: string,
  signature: string,
  challenge: string
): Promise<SessionToken> {
  const res = await fetch(`${HUB_URL}/v1/auth/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ walletAddress, chain, signature, challenge }),
  })
  if (!res.ok) throw new ApiError(res.status, 'Failed to verify wallet signature')
  return res.json() as Promise<SessionToken>
}
```

- [ ] **Step 2: Write the failing test for useSession**

```typescript
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { act, renderHook, waitFor } from '@testing-library/react-native'
import { useSession } from '../../../../src/features/chat/hooks/useSession'

const mockRequestChallenge = jest.fn()
const mockVerifyChallenge = jest.fn()
const mockGetWalletClient = jest.fn()
const mockSignMessage = jest.fn()

jest.mock('../../../../src/features/chat/api/session', () => ({
  requestChallenge: (...args: unknown[]) => mockRequestChallenge(...args),
  verifyChallenge: (...args: unknown[]) => mockVerifyChallenge(...args),
}))

jest.mock('../../../../src/core/providers/StorageProvider', () => ({
  useStorage: () => ({
    wallets: [{ id: 'w1', address: '0xabc', chain: 'base-sepolia', type: 'self-custody' }],
    activeWalletId: 'w1',
  }),
}))

jest.mock('../../../../src/features/wallet/hooks/useWalletSigner', () => ({
  useWalletSigner: () => ({
    getWalletClient: mockGetWalletClient,
    signing: false,
    error: null,
  }),
}))

describe('useSession', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockGetWalletClient.mockResolvedValue({ signMessage: mockSignMessage })
    mockSignMessage.mockResolvedValue('0xsig123')
    mockRequestChallenge.mockResolvedValue({
      challenge: 'Sign this to prove you own 0xabc: nonce=nonce_123 ts=2026-03-28T00:00:00Z',
      expiresAt: '2026-03-28T00:05:00Z',
    })
    mockVerifyChallenge.mockResolvedValue({
      token: 'saga_sess_tok_abc123',
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
      walletAddress: '0xabc',
    })
  })

  it('returns null token initially', () => {
    const { result } = renderHook(() => useSession())
    expect(result.current.token).toBeNull()
    expect(result.current.isAuthenticated).toBe(false)
  })

  it('completes challenge-response flow via getToken', async () => {
    const { result } = renderHook(() => useSession())

    let token: string | undefined
    await act(async () => {
      token = await result.current.getToken()
    })

    expect(token).toBe('saga_sess_tok_abc123')
    expect(mockRequestChallenge).toHaveBeenCalledWith('0xabc', 'base-sepolia')
    expect(mockSignMessage).toHaveBeenCalledWith({
      message: 'Sign this to prove you own 0xabc: nonce=nonce_123 ts=2026-03-28T00:00:00Z',
    })
    expect(mockVerifyChallenge).toHaveBeenCalledWith(
      '0xabc',
      'base-sepolia',
      '0xsig123',
      'Sign this to prove you own 0xabc: nonce=nonce_123 ts=2026-03-28T00:00:00Z'
    )
  })

  it('returns cached token on subsequent calls', async () => {
    const { result } = renderHook(() => useSession())

    await act(async () => {
      await result.current.getToken()
    })
    mockRequestChallenge.mockClear()

    let token: string | undefined
    await act(async () => {
      token = await result.current.getToken()
    })

    expect(token).toBe('saga_sess_tok_abc123')
    expect(mockRequestChallenge).not.toHaveBeenCalled()
  })

  it('refreshes expired token', async () => {
    mockVerifyChallenge
      .mockResolvedValueOnce({
        token: 'saga_sess_tok_expired',
        expiresAt: new Date(Date.now() - 1000).toISOString(),
        walletAddress: '0xabc',
      })
      .mockResolvedValueOnce({
        token: 'saga_sess_tok_fresh',
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
        walletAddress: '0xabc',
      })

    const { result } = renderHook(() => useSession())

    await act(async () => {
      await result.current.getToken()
    })

    let token: string | undefined
    await act(async () => {
      token = await result.current.getToken()
    })

    expect(token).toBe('saga_sess_tok_fresh')
    expect(mockRequestChallenge).toHaveBeenCalledTimes(2)
  })

  it('sets error on auth failure', async () => {
    mockRequestChallenge.mockRejectedValue(new Error('Network error'))

    const { result } = renderHook(() => useSession())

    await act(async () => {
      try {
        await result.current.getToken()
      } catch {
        // expected
      }
    })

    expect(result.current.error).toBe('Network error')
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @epicdm/saga-app test -- --testPathPattern='__tests__/features/chat/hooks/useSession' --no-coverage 2>&1 | tail -20`
Expected: FAIL - `Cannot find module '../../../../src/features/chat/hooks/useSession'`

- [ ] **Step 4: Implement useSession hook**

```typescript
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { useCallback, useRef, useState } from 'react'
import { useStorage } from '../../../core/providers/StorageProvider'
import { useWalletSigner } from '../../wallet/hooks/useWalletSigner'
import { requestChallenge, verifyChallenge } from '../api/session'

export interface UseSessionResult {
  token: string | null
  isAuthenticated: boolean
  authenticating: boolean
  error: string | null
  getToken: () => Promise<string>
  clearSession: () => void
}

export function useSession(): UseSessionResult {
  const { wallets, activeWalletId } = useStorage()
  const { getWalletClient } = useWalletSigner(activeWalletId)
  const [token, setToken] = useState<string | null>(null)
  const [authenticating, setAuthenticating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const sessionRef = useRef<{ token: string; expiresAt: string } | null>(null)

  const getToken = useCallback(async (): Promise<string> => {
    // Return cached token if still valid (with 60s buffer)
    if (sessionRef.current) {
      const expiresAt = new Date(sessionRef.current.expiresAt)
      if (expiresAt.getTime() - Date.now() > 60_000) {
        return sessionRef.current.token
      }
    }

    setAuthenticating(true)
    setError(null)

    try {
      const wallet = wallets.find(w => w.id === activeWalletId)
      if (!wallet) throw new Error('No active wallet')

      // 1. Request challenge from server
      const { challenge } = await requestChallenge(wallet.address, wallet.chain)

      // 2. Sign challenge with wallet private key
      const client = await getWalletClient()
      const signature = await client.signMessage({ message: challenge })

      // 3. Verify signature and get session token
      const session = await verifyChallenge(wallet.address, wallet.chain, signature, challenge)

      sessionRef.current = { token: session.token, expiresAt: session.expiresAt }
      setToken(session.token)
      return session.token
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Authentication failed'
      setError(msg)
      throw err
    } finally {
      setAuthenticating(false)
    }
  }, [wallets, activeWalletId, getWalletClient])

  const clearSession = useCallback(() => {
    sessionRef.current = null
    setToken(null)
    setError(null)
  }, [])

  return {
    token,
    isAuthenticated: token !== null,
    authenticating,
    error,
    getToken,
    clearSession,
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @epicdm/saga-app test -- --testPathPattern='__tests__/features/chat/hooks/useSession' --no-coverage 2>&1 | tail -20`
Expected: PASS (4 tests)

- [ ] **Step 6: Commit**

```bash
git add packages/saga-app/src/features/chat/api/session.ts \
       packages/saga-app/src/features/chat/hooks/useSession.ts \
       packages/saga-app/__tests__/features/chat/hooks/useSession.test.tsx
git commit -m "feat(saga-app): add session management with wallet signature auth

Challenge-response flow using server auth endpoints. Token cached
with auto-refresh on expiry. Uses existing useWalletSigner for
EIP-191 message signing.

Built with Epic Flowstate"
```

---

### Task 3: Chat API Client

**Files:**

- Create: `packages/saga-app/src/features/chat/api/chat.ts`
- Test: `packages/saga-app/__tests__/features/chat/api/chat.test.ts`

All CRUD operations against the server's `/v1/chat/` endpoints. Each function takes a `token` string as the first parameter for the Authorization header. Uses the same `ApiError` class and `HUB_URL` from `api/session.ts`.

**Server API contract reference** (from `packages/server/src/routes/chat.ts`):

- `POST /v1/chat/conversations` - Create conversation (201, returns `{ conversation }`)
- `GET /v1/chat/conversations?agentHandle=X` - List conversations (200, returns `{ conversations, total, page, limit }`)
- `GET /v1/chat/conversations/:id` - Get conversation with messages (200, returns `{ conversation, messages }`)
- `DELETE /v1/chat/conversations/:id` - Delete conversation (204)
- `POST /v1/chat/conversations/:id/messages` - Send message (200, SSE stream)

- [ ] **Step 1: Write the failing test**

```typescript
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import {
  createConversation,
  listConversations,
  getConversation,
  deleteConversation,
  sendMessage,
} from '../../../../src/features/chat/api/chat'

const mockFetch = jest.fn()
global.fetch = mockFetch

describe('chat API client', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('createConversation', () => {
    it('sends POST with auth and returns conversation', async () => {
      const conversation = {
        id: 'conv_abc',
        agentHandle: 'alice.saga',
        provider: 'anthropic',
        model: 'claude-sonnet-4-5-20250514',
        title: null,
        createdAt: '2026-03-28T00:00:00Z',
        updatedAt: '2026-03-28T00:00:00Z',
      }
      mockFetch.mockResolvedValue({
        ok: true,
        status: 201,
        json: () => Promise.resolve({ conversation }),
      })

      const result = await createConversation('tok_123', {
        agentHandle: 'alice.saga',
        provider: 'anthropic',
        model: 'claude-sonnet-4-5-20250514',
      })

      expect(result).toEqual(conversation)
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/v1/chat/conversations'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer tok_123',
            'Content-Type': 'application/json',
          }),
        })
      )
    })

    it('throws ApiError on failure', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 400 })
      await expect(
        createConversation('tok_123', {
          agentHandle: 'alice.saga',
          provider: 'anthropic',
          model: 'bad-model',
        })
      ).rejects.toThrow('Server error: 400')
    })
  })

  describe('listConversations', () => {
    it('fetches conversations with auth and agent handle', async () => {
      const data = {
        conversations: [{ id: 'conv_1', agentHandle: 'alice.saga', title: 'Test' }],
        total: 1,
        page: 1,
        limit: 20,
      }
      mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve(data) })

      const result = await listConversations('tok_123', 'alice.saga')

      expect(result).toEqual(data)
      const url = mockFetch.mock.calls[0][0] as string
      expect(url).toContain('agentHandle=alice.saga')
      expect(mockFetch.mock.calls[0][1].headers.Authorization).toBe('Bearer tok_123')
    })
  })

  describe('getConversation', () => {
    it('fetches conversation with messages', async () => {
      const data = {
        conversation: { id: 'conv_1' },
        messages: [{ id: 'msg_1', role: 'user', content: 'Hello' }],
      }
      mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve(data) })

      const result = await getConversation('tok_123', 'conv_1')

      expect(result.messages).toHaveLength(1)
      const url = mockFetch.mock.calls[0][0] as string
      expect(url).toContain('/v1/chat/conversations/conv_1')
    })
  })

  describe('deleteConversation', () => {
    it('sends DELETE with auth', async () => {
      mockFetch.mockResolvedValue({ ok: true, status: 204 })

      await deleteConversation('tok_123', 'conv_1')

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/v1/chat/conversations/conv_1'),
        expect.objectContaining({ method: 'DELETE' })
      )
    })

    it('throws on 404', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 404 })
      await expect(deleteConversation('tok_123', 'conv_bad')).rejects.toThrow('Server error: 404')
    })
  })

  describe('sendMessage', () => {
    it('sends POST with content and consumes response', async () => {
      mockFetch.mockResolvedValue({ ok: true, text: () => Promise.resolve('') })

      await sendMessage('tok_123', 'conv_1', 'Hello world')

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/v1/chat/conversations/conv_1/messages'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ content: 'Hello world' }),
        })
      )
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @epicdm/saga-app test -- --testPathPattern='__tests__/features/chat/api/chat' --no-coverage 2>&1 | tail -20`
Expected: FAIL - `Cannot find module '../../../../src/features/chat/api/chat'`

- [ ] **Step 3: Implement the API client**

```typescript
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import type {
  Conversation,
  ConversationWithMessages,
  CreateConversationParams,
  ListConversationsResult,
} from '../types'
import { ApiError, HUB_URL } from './session'

function authHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  }
}

async function fetchAuth<T>(token: string, url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { ...authHeaders(token), ...init?.headers },
  })
  if (!res.ok) throw new ApiError(res.status)
  return res.json() as Promise<T>
}

export async function createConversation(
  token: string,
  params: CreateConversationParams
): Promise<Conversation> {
  const data = await fetchAuth<{ conversation: Conversation }>(
    token,
    `${HUB_URL}/v1/chat/conversations`,
    { method: 'POST', body: JSON.stringify(params) }
  )
  return data.conversation
}

export async function listConversations(
  token: string,
  agentHandle: string,
  page = 1,
  limit = 20
): Promise<ListConversationsResult> {
  const params = new URLSearchParams({
    agentHandle,
    page: String(page),
    limit: String(limit),
  })
  return fetchAuth<ListConversationsResult>(token, `${HUB_URL}/v1/chat/conversations?${params}`)
}

export async function getConversation(
  token: string,
  id: string
): Promise<ConversationWithMessages> {
  return fetchAuth<ConversationWithMessages>(token, `${HUB_URL}/v1/chat/conversations/${id}`)
}

export async function deleteConversation(token: string, id: string): Promise<void> {
  const res = await fetch(`${HUB_URL}/v1/chat/conversations/${id}`, {
    method: 'DELETE',
    headers: authHeaders(token),
  })
  if (!res.ok) throw new ApiError(res.status)
}

export async function sendMessage(
  token: string,
  conversationId: string,
  content: string
): Promise<void> {
  const res = await fetch(`${HUB_URL}/v1/chat/conversations/${conversationId}/messages`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({ content }),
  })
  if (!res.ok) throw new ApiError(res.status)
  // Consume the SSE response body to close the connection.
  // Phase 5 will replace this with proper EventSource streaming.
  await res.text()
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @epicdm/saga-app test -- --testPathPattern='__tests__/features/chat/api/chat' --no-coverage 2>&1 | tail -20`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/saga-app/src/features/chat/api/chat.ts \
       packages/saga-app/__tests__/features/chat/api/chat.test.ts
git commit -m "feat(saga-app): add authenticated chat API client

CRUD operations for conversations plus fire-and-forget message
sending. All functions take a session token for Bearer auth.

Built with Epic Flowstate"
```

---

### Task 4: useConversations Hook

**Files:**

- Create: `packages/saga-app/src/features/chat/hooks/useConversations.ts`
- Test: `packages/saga-app/__tests__/features/chat/hooks/useConversations.test.tsx`

Hook manages conversation list state for the active agent. Handles token acquisition via `useSession.getToken()` before each API call. Follows the same patterns as `useDirectorySearch` (see `packages/saga-app/src/features/directory/hooks/useDirectorySearch.ts`).

- [ ] **Step 1: Write the failing test**

```typescript
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { act, renderHook, waitFor } from '@testing-library/react-native'
import { useConversations } from '../../../../src/features/chat/hooks/useConversations'

const mockGetToken = jest.fn()
const mockListConversations = jest.fn()
const mockCreateConversation = jest.fn()
const mockDeleteConversation = jest.fn()

jest.mock('../../../../src/features/chat/hooks/useSession', () => ({
  useSession: () => ({
    getToken: mockGetToken,
    token: 'tok_cached',
    isAuthenticated: true,
    authenticating: false,
    error: null,
  }),
}))

jest.mock('../../../../src/features/chat/api/chat', () => ({
  listConversations: (...args: unknown[]) => mockListConversations(...args),
  createConversation: (...args: unknown[]) => mockCreateConversation(...args),
  deleteConversation: (...args: unknown[]) => mockDeleteConversation(...args),
}))

const emptyResult = { conversations: [], total: 0, page: 1, limit: 20 }

describe('useConversations', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockGetToken.mockResolvedValue('tok_123')
    mockListConversations.mockResolvedValue(emptyResult)
  })

  it('fetches conversations on mount', async () => {
    const { result } = renderHook(() => useConversations('alice.saga'))

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(mockGetToken).toHaveBeenCalled()
    expect(mockListConversations).toHaveBeenCalledWith('tok_123', 'alice.saga')
  })

  it('returns conversations from API', async () => {
    const convos = [
      {
        id: 'conv_1',
        agentHandle: 'alice.saga',
        title: 'Test',
        provider: 'anthropic',
        model: 'claude-sonnet-4-5-20250514',
      },
    ]
    mockListConversations.mockResolvedValue({
      conversations: convos,
      total: 1,
      page: 1,
      limit: 20,
    })

    const { result } = renderHook(() => useConversations('alice.saga'))

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.conversations).toEqual(convos)
  })

  it('creates a conversation and refreshes list', async () => {
    const newConvo = {
      id: 'conv_new',
      agentHandle: 'alice.saga',
      title: null,
      provider: 'anthropic',
      model: 'claude-sonnet-4-5-20250514',
    }
    mockCreateConversation.mockResolvedValue(newConvo)

    const { result } = renderHook(() => useConversations('alice.saga'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    mockListConversations.mockClear()

    let created: unknown
    await act(async () => {
      created = await result.current.create({
        agentHandle: 'alice.saga',
        provider: 'anthropic',
        model: 'claude-sonnet-4-5-20250514',
      })
    })

    expect(created).toEqual(newConvo)
    expect(mockCreateConversation).toHaveBeenCalledWith('tok_123', {
      agentHandle: 'alice.saga',
      provider: 'anthropic',
      model: 'claude-sonnet-4-5-20250514',
    })
    // Should refresh after create
    expect(mockListConversations).toHaveBeenCalled()
  })

  it('deletes a conversation and refreshes list', async () => {
    mockDeleteConversation.mockResolvedValue(undefined)

    const { result } = renderHook(() => useConversations('alice.saga'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    mockListConversations.mockClear()

    await act(async () => {
      await result.current.remove('conv_1')
    })

    expect(mockDeleteConversation).toHaveBeenCalledWith('tok_123', 'conv_1')
    expect(mockListConversations).toHaveBeenCalled()
  })

  it('refreshes conversation list', async () => {
    const { result } = renderHook(() => useConversations('alice.saga'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    mockListConversations.mockClear()

    await act(async () => {
      await result.current.refresh()
    })

    expect(mockListConversations).toHaveBeenCalledWith('tok_123', 'alice.saga')
  })

  it('sets error on fetch failure', async () => {
    mockListConversations.mockRejectedValue(new Error('Network error'))

    const { result } = renderHook(() => useConversations('alice.saga'))

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBe('Network error')
  })

  it('skips fetch when agentHandle is empty', async () => {
    const { result } = renderHook(() => useConversations(''))

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(mockListConversations).not.toHaveBeenCalled()
    expect(result.current.conversations).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @epicdm/saga-app test -- --testPathPattern='__tests__/features/chat/hooks/useConversations' --no-coverage 2>&1 | tail -20`
Expected: FAIL - `Cannot find module '../../../../src/features/chat/hooks/useConversations'`

- [ ] **Step 3: Implement the hook**

```typescript
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Conversation, CreateConversationParams } from '../types'
import { useSession } from './useSession'
import {
  createConversation as apiCreate,
  deleteConversation as apiDelete,
  listConversations as apiList,
} from '../api/chat'

export interface UseConversationsResult {
  conversations: Conversation[]
  loading: boolean
  error: string | null
  create: (params: CreateConversationParams) => Promise<Conversation>
  remove: (id: string) => Promise<void>
  refresh: () => Promise<void>
}

export function useConversations(agentHandle: string): UseConversationsResult {
  const { getToken } = useSession()
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const requestIdRef = useRef(0)

  const fetchList = useCallback(async () => {
    if (!agentHandle) {
      setConversations([])
      setLoading(false)
      return
    }

    const requestId = ++requestIdRef.current
    setLoading(true)
    setError(null)

    try {
      const token = await getToken()
      const result = await apiList(token, agentHandle)
      if (requestIdRef.current !== requestId) return
      setConversations(result.conversations)
    } catch (err) {
      if (requestIdRef.current !== requestId) return
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      if (requestIdRef.current === requestId) setLoading(false)
    }
  }, [agentHandle, getToken])

  useEffect(() => {
    fetchList()
  }, [fetchList])

  const create = useCallback(
    async (params: CreateConversationParams): Promise<Conversation> => {
      const token = await getToken()
      const conversation = await apiCreate(token, params)
      await fetchList()
      return conversation
    },
    [getToken, fetchList]
  )

  const remove = useCallback(
    async (id: string): Promise<void> => {
      const token = await getToken()
      await apiDelete(token, id)
      await fetchList()
    },
    [getToken, fetchList]
  )

  return {
    conversations,
    loading,
    error,
    create,
    remove,
    refresh: fetchList,
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @epicdm/saga-app test -- --testPathPattern='__tests__/features/chat/hooks/useConversations' --no-coverage 2>&1 | tail -20`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/saga-app/src/features/chat/hooks/useConversations.ts \
       packages/saga-app/__tests__/features/chat/hooks/useConversations.test.tsx
git commit -m "feat(saga-app): add useConversations hook

List, create, delete conversations for the active agent. Auto-fetches
on mount and refreshes after mutations. Handles stale request
cancellation.

Built with Epic Flowstate"
```

---

### Task 5: Navigation Update

**Files:**

- Modify: `packages/saga-app/src/navigation/types.ts`
- Modify: `packages/saga-app/src/navigation/stacks/MessagesStack.tsx`

Replace the "Coming in Phase 6" placeholder with real screen registrations. The screens themselves are created in subsequent tasks; here we register empty stubs so the navigation compiles.

- [ ] **Step 1: Update MessagesStackParamList**

In `packages/saga-app/src/navigation/types.ts`, replace the `MessagesStackParamList` type:

```typescript
// Before:
export type MessagesStackParamList = {
  MessagesList: undefined
}

// After:
export type MessagesStackParamList = {
  ConversationList: undefined
  ChatScreen: { conversationId: string }
  NewChat: undefined
}
```

- [ ] **Step 2: Update MessagesStack to register screens**

Replace the entire content of `packages/saga-app/src/navigation/stacks/MessagesStack.tsx`:

```typescript
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import React from 'react'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { ConversationList } from '../../features/chat/screens/ConversationList'
import { ChatScreen } from '../../features/chat/screens/ChatScreen'
import { NewChat } from '../../features/chat/screens/NewChat'
import type { MessagesStackParamList } from '../types'

const Stack = createNativeStackNavigator<MessagesStackParamList>()

export function MessagesStack(): React.JSX.Element {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="ConversationList" component={ConversationList} />
      <Stack.Screen name="ChatScreen" component={ChatScreen} />
      <Stack.Screen name="NewChat" component={NewChat} />
    </Stack.Navigator>
  )
}
```

- [ ] **Step 3: Create placeholder screens so navigation compiles**

Create minimal placeholder files at these paths. These will be replaced in Tasks 8-10 with full implementations:

`packages/saga-app/src/features/chat/screens/ConversationList.tsx`:

```typescript
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import React from 'react'
import { Text, View } from 'react-native'

export function ConversationList(): React.JSX.Element {
  return <View><Text>ConversationList placeholder</Text></View>
}
```

`packages/saga-app/src/features/chat/screens/ChatScreen.tsx`:

```typescript
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import React from 'react'
import { Text, View } from 'react-native'

export function ChatScreen(): React.JSX.Element {
  return <View><Text>ChatScreen placeholder</Text></View>
}
```

`packages/saga-app/src/features/chat/screens/NewChat.tsx`:

```typescript
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import React from 'react'
import { Text, View } from 'react-native'

export function NewChat(): React.JSX.Element {
  return <View><Text>NewChat placeholder</Text></View>
}
```

- [ ] **Step 4: Verify TypeScript compilation**

Run: `cd packages/saga-app && npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add packages/saga-app/src/navigation/types.ts \
       packages/saga-app/src/navigation/stacks/MessagesStack.tsx \
       packages/saga-app/src/features/chat/screens/ConversationList.tsx \
       packages/saga-app/src/features/chat/screens/ChatScreen.tsx \
       packages/saga-app/src/features/chat/screens/NewChat.tsx
git commit -m "feat(saga-app): update navigation for chat feature

Replace Messages tab placeholder with ConversationList, ChatScreen,
and NewChat screen registrations.

Built with Epic Flowstate"
```

---

### Task 6: MessageBubble Component

**Files:**

- Create: `packages/saga-app/src/features/chat/components/MessageBubble.tsx`
- Test: `packages/saga-app/__tests__/features/chat/components/MessageBubble.test.tsx`

User messages render right-aligned with primary color background. Assistant messages render left-aligned with surface color background. Uses the existing theme system (`colors`, `typography`, `spacing`, `borderRadius` from `packages/saga-app/src/core/theme/`).

- [ ] **Step 1: Write the failing test**

```typescript
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import React from 'react'
import { render } from '@testing-library/react-native'
import { MessageBubble } from '../../../../src/features/chat/components/MessageBubble'

describe('MessageBubble', () => {
  it('renders user message content', () => {
    const { getByText } = render(
      <MessageBubble role="user" content="Hello, how are you?" />,
    )
    expect(getByText('Hello, how are you?')).toBeTruthy()
  })

  it('renders assistant message content', () => {
    const { getByText } = render(
      <MessageBubble role="assistant" content="I'm doing well!" />,
    )
    expect(getByText("I'm doing well!")).toBeTruthy()
  })

  it('applies different alignment for user vs assistant', () => {
    const { getByTestId: getUserTestId } = render(
      <MessageBubble role="user" content="User msg" testID="user-bubble" />,
    )
    const { getByTestId: getAssistantTestId } = render(
      <MessageBubble role="assistant" content="Assistant msg" testID="assistant-bubble" />,
    )

    const userBubble = getUserTestId('user-bubble')
    const assistantBubble = getAssistantTestId('assistant-bubble')

    // User messages align to the end (right)
    expect(userBubble.props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ alignItems: 'flex-end' })]),
    )
    // Assistant messages align to the start (left)
    expect(assistantBubble.props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ alignItems: 'flex-start' })]),
    )
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @epicdm/saga-app test -- --testPathPattern='__tests__/features/chat/components/MessageBubble' --no-coverage 2>&1 | tail -20`
Expected: FAIL - `Cannot find module`

- [ ] **Step 3: Implement MessageBubble**

```typescript
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import React from 'react'
import { StyleSheet, Text, View, ViewStyle } from 'react-native'
import { borderRadius, colors, spacing, typography } from '../../../core/theme'

interface MessageBubbleProps {
  role: 'user' | 'assistant'
  content: string
  testID?: string
}

export function MessageBubble({ role, content, testID }: MessageBubbleProps): React.JSX.Element {
  const isUser = role === 'user'

  return (
    <View
      testID={testID}
      style={[styles.row, isUser ? styles.rowUser : styles.rowAssistant]}
    >
      <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAssistant]}>
        <Text style={[styles.text, isUser ? styles.textUser : styles.textAssistant]}>
          {content}
        </Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
  },
  rowUser: {
    alignItems: 'flex-end',
  } as ViewStyle,
  rowAssistant: {
    alignItems: 'flex-start',
  } as ViewStyle,
  bubble: {
    maxWidth: '80%',
    padding: spacing.md,
  },
  bubbleUser: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.lg,
    borderBottomRightRadius: borderRadius.sm,
  },
  bubbleAssistant: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: borderRadius.lg,
    borderBottomLeftRadius: borderRadius.sm,
  },
  text: {
    ...typography.body,
  },
  textUser: {
    color: colors.textInverse,
  },
  textAssistant: {
    color: colors.textPrimary,
  },
})
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @epicdm/saga-app test -- --testPathPattern='__tests__/features/chat/components/MessageBubble' --no-coverage 2>&1 | tail -20`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/saga-app/src/features/chat/components/MessageBubble.tsx \
       packages/saga-app/__tests__/features/chat/components/MessageBubble.test.tsx
git commit -m "feat(saga-app): add MessageBubble component

User messages right-aligned with primary color, assistant messages
left-aligned with surface color. Asymmetric border radius for
chat bubble shape.

Built with Epic Flowstate"
```

---

### Task 7: ChatInput Component

**Files:**

- Create: `packages/saga-app/src/features/chat/components/ChatInput.tsx`
- Test: `packages/saga-app/__tests__/features/chat/components/ChatInput.test.tsx`

Multi-line TextInput with send button. Send button disabled when input is empty or `disabled` prop is true. Uses existing theme tokens and follows the same component patterns as shared components in `packages/saga-app/src/components/`.

- [ ] **Step 1: Write the failing test**

```typescript
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import React from 'react'
import { fireEvent, render } from '@testing-library/react-native'
import { ChatInput } from '../../../../src/features/chat/components/ChatInput'

describe('ChatInput', () => {
  it('renders text input and send button', () => {
    const { getByPlaceholderText, getByLabelText } = render(
      <ChatInput onSend={jest.fn()} />,
    )
    expect(getByPlaceholderText('Type a message...')).toBeTruthy()
    expect(getByLabelText('Send message')).toBeTruthy()
  })

  it('calls onSend with text and clears input', () => {
    const onSend = jest.fn()
    const { getByPlaceholderText, getByLabelText } = render(
      <ChatInput onSend={onSend} />,
    )

    fireEvent.changeText(getByPlaceholderText('Type a message...'), 'Hello')
    fireEvent.press(getByLabelText('Send message'))

    expect(onSend).toHaveBeenCalledWith('Hello')
  })

  it('does not call onSend when input is empty', () => {
    const onSend = jest.fn()
    const { getByLabelText } = render(<ChatInput onSend={onSend} />)

    fireEvent.press(getByLabelText('Send message'))
    expect(onSend).not.toHaveBeenCalled()
  })

  it('disables send button when disabled prop is true', () => {
    const onSend = jest.fn()
    const { getByPlaceholderText, getByLabelText } = render(
      <ChatInput onSend={onSend} disabled />,
    )

    fireEvent.changeText(getByPlaceholderText('Type a message...'), 'Hello')
    fireEvent.press(getByLabelText('Send message'))

    expect(onSend).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @epicdm/saga-app test -- --testPathPattern='__tests__/features/chat/components/ChatInput' --no-coverage 2>&1 | tail -20`
Expected: FAIL - `Cannot find module`

- [ ] **Step 3: Implement ChatInput**

```typescript
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import React, { useCallback, useState } from 'react'
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { borderRadius, colors, spacing, typography } from '../../../core/theme'

interface ChatInputProps {
  onSend: (text: string) => void
  disabled?: boolean
  placeholder?: string
}

export function ChatInput({
  onSend,
  disabled = false,
  placeholder = 'Type a message...',
}: ChatInputProps): React.JSX.Element {
  const [text, setText] = useState('')

  const handleSend = useCallback(() => {
    const trimmed = text.trim()
    if (!trimmed || disabled) return
    onSend(trimmed)
    setText('')
  }, [text, disabled, onSend])

  const canSend = text.trim().length > 0 && !disabled

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.input}
        value={text}
        onChangeText={setText}
        placeholder={placeholder}
        placeholderTextColor={colors.textTertiary}
        multiline
        maxLength={4000}
        editable={!disabled}
        accessibilityLabel="Message input"
      />
      <Pressable
        onPress={handleSend}
        disabled={!canSend}
        style={[styles.sendButton, !canSend && styles.sendButtonDisabled]}
        accessibilityRole="button"
        accessibilityLabel="Send message"
        accessibilityState={{ disabled: !canSend }}
      >
        <Text style={[styles.sendIcon, !canSend && styles.sendIconDisabled]}>
          {'\u2191'}
        </Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
  input: {
    flex: 1,
    ...typography.body,
    color: colors.textPrimary,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sendButton: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: spacing.sm,
  },
  sendButtonDisabled: {
    backgroundColor: colors.surfaceElevated,
  },
  sendIcon: {
    ...typography.h3,
    color: colors.textInverse,
    fontWeight: '700',
  },
  sendIconDisabled: {
    color: colors.textTertiary,
  },
})
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @epicdm/saga-app test -- --testPathPattern='__tests__/features/chat/components/ChatInput' --no-coverage 2>&1 | tail -20`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/saga-app/src/features/chat/components/ChatInput.tsx \
       packages/saga-app/__tests__/features/chat/components/ChatInput.test.tsx
git commit -m "feat(saga-app): add ChatInput component

Multi-line TextInput with circular send button. Disabled state when
empty or when disabled prop is set. Auto-clears after send.

Built with Epic Flowstate"
```

---

### Task 8: ConversationList Screen

**Files:**

- Create: `packages/saga-app/src/features/chat/components/ConversationCard.tsx`
- Modify: `packages/saga-app/src/features/chat/screens/ConversationList.tsx` (replace placeholder)

FlatList of conversations for the active agent. Uses `useConversations` hook. Shows empty state when no conversations exist. "New Chat" button navigates to NewChat screen. Swipe-to-delete handled via long-press confirmation for simplicity in Phase 4.

The active agent handle is obtained from `useStorage()` by finding the active identity:

```typescript
const { identities, activeIdentityId } = useStorage()
const activeIdentity = identities.find(i => i.id === activeIdentityId)
const agentHandle = activeIdentity?.handle ?? ''
```

- [ ] **Step 1: Create ConversationCard component**

```typescript
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import React from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { Badge } from '../../../components/Badge'
import { borderRadius, colors, spacing, typography } from '../../../core/theme'
import type { Conversation } from '../types'

interface ConversationCardProps {
  conversation: Conversation
  onPress: () => void
  onLongPress?: () => void
}

function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function providerBadgeVariant(provider: string): 'agent' | 'org' | 'directory' {
  switch (provider) {
    case 'anthropic': return 'agent'
    case 'openai': return 'org'
    default: return 'directory'
  }
}

export function ConversationCard({
  conversation,
  onPress,
  onLongPress,
}: ConversationCardProps): React.JSX.Element {
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
    >
      <View style={styles.topRow}>
        <Badge
          label={conversation.provider.toUpperCase()}
          variant={providerBadgeVariant(conversation.provider)}
        />
        <Text style={styles.time}>{formatRelativeTime(conversation.updatedAt)}</Text>
      </View>
      <Text style={styles.title} numberOfLines={1}>
        {conversation.title ?? 'New Conversation'}
      </Text>
      <Text style={styles.model}>{conversation.model}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardPressed: {
    backgroundColor: colors.surfacePressed,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  title: {
    ...typography.h3,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  model: {
    ...typography.caption,
    color: colors.textTertiary,
  },
  time: {
    ...typography.caption,
    color: colors.textSecondary,
  },
})
```

- [ ] **Step 2: Implement ConversationList screen**

Replace the placeholder in `packages/saga-app/src/features/chat/screens/ConversationList.tsx`:

```typescript
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import React, { useCallback } from 'react'
import { Alert, FlatList, StyleSheet, Text, View } from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { SafeArea } from '../../../components/SafeArea'
import { Header } from '../../../components/Header'
import { Button } from '../../../components/Button'
import { LoadingSpinner } from '../../../components/LoadingSpinner'
import { ConversationCard } from '../components/ConversationCard'
import { useConversations } from '../hooks/useConversations'
import { useStorage } from '../../../core/providers/StorageProvider'
import { colors, spacing, typography } from '../../../core/theme'
import type { MessagesStackParamList } from '../../../navigation/types'
import type { Conversation } from '../types'

type Props = NativeStackScreenProps<MessagesStackParamList, 'ConversationList'>

export function ConversationList({ navigation }: Props): React.JSX.Element {
  const { identities, activeIdentityId } = useStorage()
  const activeIdentity = identities.find(i => i.id === activeIdentityId)
  const agentHandle = activeIdentity?.handle ?? ''

  const { conversations, loading, error, remove, refresh } = useConversations(agentHandle)

  const handleDelete = useCallback(
    (conversation: Conversation) => {
      Alert.alert(
        'Delete Conversation',
        `Delete "${conversation.title ?? 'Untitled'}"? This cannot be undone.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: () => remove(conversation.id),
          },
        ],
      )
    },
    [remove],
  )

  const renderItem = useCallback(
    ({ item }: { item: Conversation }) => (
      <ConversationCard
        conversation={item}
        onPress={() => navigation.navigate('ChatScreen', { conversationId: item.id })}
        onLongPress={() => handleDelete(item)}
      />
    ),
    [navigation, handleDelete],
  )

  if (!agentHandle) {
    return (
      <SafeArea>
        <Header title="Messages" />
        <View style={styles.center}>
          <Text style={styles.emptyText}>
            Set up an identity in the Profile tab to start chatting.
          </Text>
        </View>
      </SafeArea>
    )
  }

  return (
    <SafeArea>
      <Header
        title="Messages"
        rightAction={{ label: 'New', onPress: () => navigation.navigate('NewChat') }}
      />
      {error ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>{error}</Text>
          <Button title="Retry" variant="secondary" onPress={refresh} style={styles.retryButton} />
        </View>
      ) : loading && conversations.length === 0 ? (
        <LoadingSpinner message="Loading conversations..." />
      ) : conversations.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>No conversations yet.</Text>
          <Button
            title="Start a Conversation"
            onPress={() => navigation.navigate('NewChat')}
            style={styles.startButton}
          />
        </View>
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          refreshing={loading && conversations.length > 0}
          onRefresh={refresh}
          contentContainerStyle={styles.list}
        />
      )}
    </SafeArea>
  )
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  emptyText: {
    ...typography.body,
    color: colors.textTertiary,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  errorText: {
    ...typography.body,
    color: colors.error,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  list: {
    paddingTop: spacing.sm,
  },
  startButton: {
    minWidth: 200,
  },
  retryButton: {
    minWidth: 120,
  },
})
```

- [ ] **Step 3: Verify TypeScript compilation**

Run: `cd packages/saga-app && npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add packages/saga-app/src/features/chat/components/ConversationCard.tsx \
       packages/saga-app/src/features/chat/screens/ConversationList.tsx
git commit -m "feat(saga-app): add ConversationList screen and ConversationCard

FlatList of conversations with provider badge, relative timestamps,
pull-to-refresh, long-press delete confirmation, and empty states
for no identity and no conversations.

Built with Epic Flowstate"
```

---

### Task 9: NewChat Screen

**Files:**

- Modify: `packages/saga-app/src/features/chat/screens/NewChat.tsx` (replace placeholder)

Provider and model selection screen. Tapping a provider shows its available models. Selecting a model and pressing "Start Conversation" creates the conversation via the `useConversations.create()` hook and navigates to ChatScreen. Optional system prompt TextInput.

Provider/model data comes from the `PROVIDERS` constant in `types.ts`.

- [ ] **Step 1: Implement NewChat screen**

Replace the placeholder in `packages/saga-app/src/features/chat/screens/NewChat.tsx`:

```typescript
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import React, { useCallback, useState } from 'react'
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { SafeArea } from '../../../components/SafeArea'
import { Header } from '../../../components/Header'
import { Button } from '../../../components/Button'
import { Card } from '../../../components/Card'
import { useConversations } from '../hooks/useConversations'
import { useStorage } from '../../../core/providers/StorageProvider'
import { borderRadius, colors, spacing, typography } from '../../../core/theme'
import type { MessagesStackParamList } from '../../../navigation/types'
import { PROVIDERS } from '../types'
import type { ProviderConfig, ProviderModel } from '../types'

type Props = NativeStackScreenProps<MessagesStackParamList, 'NewChat'>

export function NewChat({ navigation }: Props): React.JSX.Element {
  const { identities, activeIdentityId } = useStorage()
  const activeIdentity = identities.find(i => i.id === activeIdentityId)
  const agentHandle = activeIdentity?.handle ?? ''

  const { create } = useConversations(agentHandle)

  const [selectedProvider, setSelectedProvider] = useState<ProviderConfig | null>(null)
  const [selectedModel, setSelectedModel] = useState<ProviderModel | null>(null)
  const [systemPrompt, setSystemPrompt] = useState('')
  const [creating, setCreating] = useState(false)

  const handleSelectProvider = useCallback((provider: ProviderConfig) => {
    setSelectedProvider(provider)
    setSelectedModel(null)
  }, [])

  const handleStart = useCallback(async () => {
    if (!selectedProvider || !selectedModel || !agentHandle) return
    setCreating(true)
    try {
      const conversation = await create({
        agentHandle,
        provider: selectedProvider.id,
        model: selectedModel.id,
        ...(systemPrompt.trim() ? { systemPrompt: systemPrompt.trim() } : {}),
      })
      navigation.replace('ChatScreen', { conversationId: conversation.id })
    } catch {
      setCreating(false)
    }
  }, [selectedProvider, selectedModel, agentHandle, systemPrompt, create, navigation])

  return (
    <SafeArea>
      <Header
        title="New Conversation"
        leftAction={{ label: 'Back', onPress: () => navigation.goBack() }}
      />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <Text style={styles.sectionTitle}>Provider</Text>
        <View style={styles.providerRow}>
          {PROVIDERS.map(provider => (
            <Pressable
              key={provider.id}
              onPress={() => handleSelectProvider(provider)}
              style={[
                styles.providerChip,
                selectedProvider?.id === provider.id && {
                  borderColor: provider.color,
                  backgroundColor: `${provider.color}15`,
                },
              ]}
            >
              <View style={[styles.providerDot, { backgroundColor: provider.color }]} />
              <Text
                style={[
                  styles.providerName,
                  selectedProvider?.id === provider.id && { color: colors.textPrimary },
                ]}
              >
                {provider.name}
              </Text>
            </Pressable>
          ))}
        </View>

        {selectedProvider && (
          <>
            <Text style={styles.sectionTitle}>Model</Text>
            {selectedProvider.models.map(model => (
              <Card
                key={model.id}
                onPress={() => setSelectedModel(model)}
                style={[
                  styles.modelCard,
                  selectedModel?.id === model.id && {
                    borderColor: selectedProvider.color,
                  },
                ]}
              >
                <Text style={styles.modelName}>{model.name}</Text>
                <Text style={styles.modelDesc}>{model.description}</Text>
              </Card>
            ))}
          </>
        )}

        {selectedModel && (
          <>
            <Text style={styles.sectionTitle}>System Prompt (optional)</Text>
            <TextInput
              style={styles.systemPromptInput}
              value={systemPrompt}
              onChangeText={setSystemPrompt}
              placeholder="Custom instructions for the AI..."
              placeholderTextColor={colors.textTertiary}
              multiline
              maxLength={2000}
            />
          </>
        )}

        {selectedModel && (
          <Button
            title="Start Conversation"
            onPress={handleStart}
            loading={creating}
            disabled={creating}
            style={styles.startButton}
          />
        )}
      </ScrollView>
    </SafeArea>
  )
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  sectionTitle: {
    ...typography.label,
    color: colors.textSecondary,
    marginBottom: spacing.md,
    marginTop: spacing.xl,
  },
  providerRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  providerChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  providerDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: spacing.sm,
  },
  providerName: {
    ...typography.bodySmall,
    color: colors.textTertiary,
    fontWeight: '600',
  },
  modelCard: {
    marginBottom: spacing.sm,
  },
  modelName: {
    ...typography.body,
    color: colors.textPrimary,
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
  modelDesc: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  systemPromptInput: {
    ...typography.body,
    color: colors.textPrimary,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  startButton: {
    marginTop: spacing.xl,
  },
})
```

- [ ] **Step 2: Verify TypeScript compilation**

Run: `cd packages/saga-app && npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add packages/saga-app/src/features/chat/screens/NewChat.tsx
git commit -m "feat(saga-app): add NewChat screen

Provider/model selection with expandable model cards, optional
system prompt, and conversation creation. Navigates to ChatScreen
after creation.

Built with Epic Flowstate"
```

---

### Task 10: ChatScreen (Static Display)

**Files:**

- Modify: `packages/saga-app/src/features/chat/screens/ChatScreen.tsx` (replace placeholder)

Loads conversation messages from `GET /v1/chat/conversations/:id` and displays them in an inverted FlatList. Send button POSTs message to server, adds optimistic user message, and refreshes messages after the server responds (which includes the assistant's reply).

This is Phase 4's static display. Phase 5 will replace the fire-and-forget send with proper SSE streaming via `useChat`.

- [ ] **Step 1: Implement ChatScreen**

Replace the placeholder in `packages/saga-app/src/features/chat/screens/ChatScreen.tsx`:

```typescript
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import React, { useCallback, useEffect, useState } from 'react'
import { FlatList, StyleSheet, Text, View } from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { SafeArea } from '../../../components/SafeArea'
import { Header } from '../../../components/Header'
import { LoadingSpinner } from '../../../components/LoadingSpinner'
import { Badge } from '../../../components/Badge'
import { MessageBubble } from '../components/MessageBubble'
import { ChatInput } from '../components/ChatInput'
import { useSession } from '../hooks/useSession'
import { getConversation, sendMessage } from '../api/chat'
import { colors, spacing, typography } from '../../../core/theme'
import type { MessagesStackParamList } from '../../../navigation/types'
import type { Conversation, Message } from '../types'

type Props = NativeStackScreenProps<MessagesStackParamList, 'ChatScreen'>

export function ChatScreen({ route, navigation }: Props): React.JSX.Element {
  const { conversationId } = route.params
  const { getToken } = useSession()

  const [conversation, setConversation] = useState<Conversation | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadConversation = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const token = await getToken()
      const data = await getConversation(token, conversationId)
      setConversation(data.conversation)
      setMessages(data.messages)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load conversation')
    } finally {
      setLoading(false)
    }
  }, [conversationId, getToken])

  useEffect(() => {
    loadConversation()
  }, [loadConversation])

  const handleSend = useCallback(
    async (content: string) => {
      // Optimistic user message
      const optimisticMsg: Message = {
        id: `temp_${Date.now()}`,
        role: 'user',
        content,
        createdAt: new Date().toISOString(),
      }
      setMessages(prev => [...prev, optimisticMsg])
      setSending(true)

      try {
        const token = await getToken()
        await sendMessage(token, conversationId, content)
        // Refresh to get the server-persisted messages including assistant reply
        const data = await getConversation(token, conversationId)
        setConversation(data.conversation)
        setMessages(data.messages)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to send message')
      } finally {
        setSending(false)
      }
    },
    [conversationId, getToken],
  )

  const renderMessage = useCallback(
    ({ item }: { item: Message }) => (
      <MessageBubble role={item.role} content={item.content} />
    ),
    [],
  )

  if (loading && messages.length === 0) {
    return (
      <SafeArea>
        <Header
          title="Chat"
          leftAction={{ label: 'Back', onPress: () => navigation.goBack() }}
        />
        <LoadingSpinner message="Loading messages..." />
      </SafeArea>
    )
  }

  return (
    <SafeArea>
      <Header
        title={conversation?.title ?? 'Chat'}
        leftAction={{ label: 'Back', onPress: () => navigation.goBack() }}
      />
      {conversation && (
        <View style={styles.modelBadge}>
          <Badge
            label={conversation.provider.toUpperCase()}
            variant={conversation.provider === 'anthropic' ? 'agent' : conversation.provider === 'openai' ? 'org' : 'directory'}
          />
          <Text style={styles.modelName}>{conversation.model}</Text>
        </View>
      )}
      {error && (
        <View style={styles.errorBar}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}
      <FlatList
        data={[...messages].reverse()}
        keyExtractor={item => item.id}
        renderItem={renderMessage}
        inverted
        contentContainerStyle={styles.messageList}
        style={styles.list}
      />
      <ChatInput onSend={handleSend} disabled={sending} />
    </SafeArea>
  )
}

const styles = StyleSheet.create({
  modelBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modelName: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  list: {
    flex: 1,
  },
  messageList: {
    paddingVertical: spacing.sm,
  },
  errorBar: {
    backgroundColor: `${colors.error}20`,
    padding: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  errorText: {
    ...typography.bodySmall,
    color: colors.error,
  },
})
```

**Note on inverted FlatList:** React Native's `inverted` prop flips the rendering so `data[0]` appears at the bottom. For a chat (oldest at top, newest at bottom), we reverse the chronological array before passing it: `[...messages].reverse()` puts the newest message at index 0 (bottom of inverted list) and oldest at the end (top).

- [ ] **Step 2: Verify TypeScript compilation**

Run: `cd packages/saga-app && npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add packages/saga-app/src/features/chat/screens/ChatScreen.tsx
git commit -m "feat(saga-app): add ChatScreen with static message display

Inverted FlatList of messages, optimistic user message on send,
fire-and-forget POST that refreshes after completion to show
assistant reply. Phase 5 will replace with SSE streaming.

Built with Epic Flowstate"
```

---

### Task 11: Integration Verification

**Files:** None (verification only)

Run the full test suite, TypeScript compilation, and verify the commit history is clean.

- [ ] **Step 1: Run all chat feature tests**

Run: `pnpm --filter @epicdm/saga-app test -- --testPathPattern='__tests__/features/chat' --no-coverage 2>&1 | tail -30`
Expected: All tests pass (useSession: 4, chat API: 6, useConversations: 7, MessageBubble: 3, ChatInput: 4 = 24 total)

- [ ] **Step 2: Run full saga-app test suite**

Run: `pnpm --filter @epicdm/saga-app test -- --no-coverage 2>&1 | tail -20`
Expected: All tests pass (existing + new chat tests)

- [ ] **Step 3: TypeScript compilation check**

Run: `cd packages/saga-app && npx tsc --noEmit --pretty 2>&1 | tail -10`
Expected: No errors

- [ ] **Step 4: Review git log**

Run: `git log --oneline -10`
Expected: Clean sequence of commits for Tasks 1-10

- [ ] **Step 5: Verify file structure**

Run: `find packages/saga-app/src/features/chat -type f | sort`
Expected:

```
packages/saga-app/src/features/chat/api/chat.ts
packages/saga-app/src/features/chat/api/session.ts
packages/saga-app/src/features/chat/components/ChatInput.tsx
packages/saga-app/src/features/chat/components/ConversationCard.tsx
packages/saga-app/src/features/chat/components/MessageBubble.tsx
packages/saga-app/src/features/chat/hooks/useConversations.ts
packages/saga-app/src/features/chat/hooks/useSession.ts
packages/saga-app/src/features/chat/screens/ChatScreen.tsx
packages/saga-app/src/features/chat/screens/ConversationList.tsx
packages/saga-app/src/features/chat/screens/NewChat.tsx
packages/saga-app/src/features/chat/types.ts
```
