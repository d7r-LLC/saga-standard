# Phase 4: Client Chat UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Working mobile UI for managing conversations and viewing message history in the SAGA React Native app.

**Architecture:** A new `features/chat/` module provides types, API client, hooks, and screens. The Messages tab placeholder is replaced with a full conversation flow: list conversations, create new ones, view message history, and delete conversations. No streaming in this phase (that's Phase 5).

**Tech Stack:** React Native, React Navigation (Native Stack), Hono server API (auth required), existing component library (SafeArea, Header, Button, Card, TextInput, Badge)

**Key finding:** The app has no API auth flow yet. All existing API calls (directory) are public. The chat API requires wallet-based auth (challenge-sign-verify). This plan includes creating a hub auth service.

---

### File Structure

```
packages/saga-app/src/
├── core/
│   └── api/
│       └── hub.ts                    # Task 1: Hub auth service + authenticated fetch
├── features/
│   └── chat/
│       ├── types.ts                  # Task 2: Chat domain types
│       ├── api/
│       │   └── chat.ts              # Task 2: Chat API client
│       ├── hooks/
│       │   └── useConversations.ts   # Task 3: Conversations hook
│       ├── screens/
│       │   ├── ConversationList.tsx  # Task 4: Conversation list screen
│       │   ├── NewChat.tsx          # Task 5: New conversation screen
│       │   └── ChatScreen.tsx       # Task 6: Chat/message view screen
│       └── components/
│           ├── MessageBubble.tsx     # Task 6: Message display component
│           └── ChatInput.tsx        # Task 6: Text input with send button
└── navigation/
    ├── types.ts                      # Task 4: Updated MessagesStackParamList
    └── stacks/
        └── MessagesStack.tsx         # Task 4: Updated with real screens
```

---

### Task 1: Hub Auth Service + Authenticated Fetch

**Priority:** Must be first — all chat API calls require auth.

**Create** `packages/saga-app/src/core/api/hub.ts`:

- [ ] Import `HUB_URL` pattern from directory API: `export const HUB_URL = __DEV__ ? 'http://localhost:8787' : 'https://saga-hub.d7r-LLC.workers.dev'`
- [ ] Reuse `ApiError` class (same as directory API pattern)
- [ ] Create `HubAuthManager` class that manages session tokens:
  ```typescript
  class HubAuthManager {
    private token: string | null = null
    private walletAddress: string | null = null

    async authenticate(walletAddress: string, signMessage: (msg: string) => Promise<string>): Promise<void>
    getToken(): string | null
    isAuthenticated(): boolean
    logout(): void
  }
  ```
- [ ] `authenticate()` flow:
  1. POST `/v1/auth/challenge` with `{ walletAddress, chain: 'eip155:8453' }` → get `challenge`
  2. Call `signMessage(challenge)` to get signature
  3. POST `/v1/auth/verify` with `{ walletAddress, chain, signature, challenge }` → get `token`
  4. Store token
- [ ] Create `hubAuthManager` singleton instance
- [ ] Create `authenticatedFetch<T>(method, path, body?)` helper that:
  - Adds `Authorization: Bearer ${token}` header
  - Adds `Content-Type: application/json`
  - Throws `ApiError` on non-2xx
  - Returns typed JSON response
- [ ] Export: `HUB_URL`, `ApiError`, `hubAuthManager`, `authenticatedFetch`

**Tests** `packages/saga-app/__tests__/core/api/hub.test.ts`:
- [ ] `authenticate()` calls challenge then verify endpoints
- [ ] `authenticatedFetch()` adds auth header
- [ ] `authenticatedFetch()` throws ApiError on non-2xx
- [ ] `logout()` clears token
- [ ] `isAuthenticated()` returns correct state

**Dependencies:** None
**Estimated size:** ~120 lines source + ~80 lines tests

---

### Task 2: Chat Types + API Client

**Create** `packages/saga-app/src/features/chat/types.ts`:

- [ ] Define types matching server response shapes:
  ```typescript
  export interface Conversation {
    id: string
    agentHandle: string
    provider: string
    model: string
    title: string | null
    systemPrompt: string | null
    createdAt: string
    updatedAt: string
  }

  export interface Message {
    id: string
    conversationId: string
    role: 'user' | 'assistant' | 'system'
    content: string
    tokensPrompt: number | null
    tokensCompletion: number | null
    costUsd: number | null
    latencyMs: number | null
    createdAt: string
  }

  export interface CreateConversationParams {
    agentHandle: string
    provider: string
    model: string
    systemPrompt?: string
  }

  export interface ChatConfig {
    provider: string
    model: string
    label: string
  }

  export const CHAT_PROVIDERS: ChatConfig[] = [
    { provider: 'anthropic', model: 'claude-sonnet-4-5-20250514', label: 'Claude Sonnet' },
    { provider: 'openai', model: 'gpt-4o', label: 'GPT-4o' },
    { provider: 'google', model: 'gemini-2.0-flash', label: 'Gemini Flash' },
  ]
  ```

**Create** `packages/saga-app/src/features/chat/api/chat.ts`:

- [ ] Import `authenticatedFetch` from `core/api/hub`
- [ ] `createConversation(params: CreateConversationParams)` → POST `/v1/chat/conversations`
- [ ] `listConversations(agentHandle: string)` → GET `/v1/chat/conversations?agentHandle=...`
- [ ] `getConversation(id: string)` → GET `/v1/chat/conversations/:id` → returns `{ conversation, messages }`
- [ ] `deleteConversation(id: string)` → DELETE `/v1/chat/conversations/:id`
- [ ] All functions use `authenticatedFetch` for auth headers

**Tests** `packages/saga-app/__tests__/features/chat/api/chat.test.ts`:
- [ ] Each API function calls correct endpoint with correct method
- [ ] Auth header is included
- [ ] Error responses throw ApiError

**Dependencies:** Task 1
**Estimated size:** ~60 lines types + ~50 lines API + ~60 lines tests

---

### Task 3: useConversations Hook

**Create** `packages/saga-app/src/features/chat/hooks/useConversations.ts`:

- [ ] Follow existing hook pattern (loading/error/data + useCallback + useEffect):
  ```typescript
  export interface UseConversationsResult {
    conversations: Conversation[]
    loading: boolean
    error: string | null
    refresh: () => void
    create: (params: CreateConversationParams) => Promise<Conversation>
    remove: (id: string) => Promise<void>
  }

  export function useConversations(agentHandle: string): UseConversationsResult
  ```
- [ ] `refresh()` calls `listConversations(agentHandle)` and updates state
- [ ] `create()` calls `createConversation()`, adds to local state, returns conversation
- [ ] `remove()` calls `deleteConversation()`, removes from local state
- [ ] Auto-fetch on mount via `useEffect`
- [ ] Error handling: `err instanceof Error ? err.message : String(err)`

**Tests** `packages/saga-app/__tests__/features/chat/hooks/useConversations.test.ts`:
- [ ] Lists conversations on mount
- [ ] `create()` adds to list and returns conversation
- [ ] `remove()` removes from list
- [ ] `refresh()` re-fetches list
- [ ] Error state set on API failure

**Dependencies:** Task 2
**Estimated size:** ~60 lines source + ~80 lines tests

---

### Task 4: Navigation Update + ConversationList Screen

**Update** `packages/saga-app/src/navigation/types.ts`:

- [ ] Expand `MessagesStackParamList`:
  ```typescript
  export type MessagesStackParamList = {
    ConversationList: undefined
    NewChat: undefined
    ChatScreen: { conversationId: string; title?: string }
  }
  ```

**Update** `packages/saga-app/src/navigation/stacks/MessagesStack.tsx`:

- [ ] Remove placeholder `MessagesListScreen`
- [ ] Register three screens: `ConversationList`, `NewChat`, `ChatScreen`
- [ ] Stack.Navigator with `headerShown: false`

**Create** `packages/saga-app/src/features/chat/screens/ConversationList.tsx`:

- [ ] Use `SafeArea` + `Header` (title "Messages", right action "New" → navigate to NewChat)
- [ ] `useConversations(agentHandle)` — get agentHandle from active identity in StorageProvider
- [ ] FlatList rendering conversations with:
  - Title (or "New conversation" if null)
  - Model badge (e.g., "Claude Sonnet")
  - Relative timestamp (e.g., "2h ago")
  - Tap → navigate to ChatScreen with conversationId
- [ ] Swipe-to-delete using `Pressable` with delete action
- [ ] Pull-to-refresh via `onRefresh` + `refreshing` props
- [ ] Empty state: centered text + "Start a conversation" button → NewChat
- [ ] Loading state: `LoadingSpinner`
- [ ] Error state: error message + retry button

**Tests:** Component renders, shows conversations, handles empty state

**Dependencies:** Task 3
**Estimated size:** ~180 lines ConversationList + ~20 lines nav updates + ~40 lines tests

---

### Task 5: NewChat Screen

**Create** `packages/saga-app/src/features/chat/screens/NewChat.tsx`:

- [ ] Use `SafeArea` + `Header` (title "New Conversation", left action "Cancel" → goBack)
- [ ] Provider/model picker — render `CHAT_PROVIDERS` as selectable `Card` items:
  - Each card shows provider label and model name
  - Selected card has primary border highlight (existing Card + active state pattern)
  - Default selection: first provider
- [ ] Optional system prompt `TextInput` (multiline, placeholder "Custom instructions...")
- [ ] "Start Conversation" `Button` at bottom:
  - Calls `create({ agentHandle, provider, model, systemPrompt })`
  - On success: navigate to ChatScreen with new conversationId
  - Loading state on button during creation
  - Error state: inline error text
- [ ] Get `agentHandle` from active identity

**Tests:** Renders provider cards, creates conversation on submit

**Dependencies:** Task 3
**Estimated size:** ~140 lines source + ~30 lines tests

---

### Task 6: ChatScreen + Message Components

**Create** `packages/saga-app/src/features/chat/components/MessageBubble.tsx`:

- [ ] Props: `message: Message`
- [ ] User messages: right-aligned, `colors.primary` background, white text
- [ ] Assistant messages: left-aligned, `colors.surface` background, `textPrimary` text
- [ ] Show timestamp below message in `caption` typography
- [ ] Border radius: rounded corners, flat on sender side
- [ ] Style: `maxWidth: '80%'`, padding `spacing.md`

**Create** `packages/saga-app/src/features/chat/components/ChatInput.tsx`:

- [ ] Props: `onSend: (text: string) => void`, `disabled?: boolean`
- [ ] Multi-line `TextInput` with placeholder "Type a message..."
- [ ] Send button (right side): enabled when text is non-empty, calls `onSend(text)` and clears input
- [ ] Row layout: flex TextInput + fixed-width send button
- [ ] Surface background, border, padding consistent with theme

**Create** `packages/saga-app/src/features/chat/screens/ChatScreen.tsx`:

- [ ] Use `SafeArea` + `Header`:
  - Title from conversation title or "New conversation"
  - Subtitle: model name as badge text
  - Left action: "Back" → goBack
- [ ] Fetch conversation + messages via `getConversation(conversationId)` on mount
- [ ] Inverted FlatList of messages (newest at bottom, auto-scroll):
  - `inverted={true}` + reverse message order
  - `renderItem` → `MessageBubble`
- [ ] `ChatInput` at bottom:
  - On send: POST message to server, add to local messages list
  - Note: In Phase 4, we just save the user message. No streaming response yet.
  - After sending, re-fetch conversation to get any server response
- [ ] Loading state for initial message fetch
- [ ] KeyboardAvoidingView for iOS keyboard handling
- [ ] `contentContainerStyle` with padding

**Tests:** MessageBubble renders user/assistant styles, ChatInput sends text, ChatScreen renders messages

**Dependencies:** Tasks 2, 4
**Estimated size:** ~60 lines MessageBubble + ~50 lines ChatInput + ~160 lines ChatScreen + ~60 lines tests

---

### Task 7: Integration Verification

- [ ] Run full test suite: `cd packages/saga-app && npx jest --passWithNoTests`
- [ ] Verify TypeScript: `npx tsc --noEmit` (or verify no type errors in new files)
- [ ] Verify navigation flow: ConversationList → NewChat → ChatScreen → back
- [ ] Verify all new files are properly exported
- [ ] Check no circular dependencies between chat feature and core modules
- [ ] Verify existing tests still pass

**Dependencies:** Tasks 1-6
