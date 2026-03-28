# LLM Chat Feature — Phase Breakdown

> **Parent spec:** `docs/superpowers/specs/2026-03-28-llm-chat-feature-design.md`

Each phase produces working, testable software and builds on the previous. Phases are designed to be implemented via separate spec → plan → implementation cycles.

---

## Phase 1: Server Chat CRUD + D1 Schema

**Goal:** Working REST API for conversation and message management with D1 persistence.

**Scope:**

- D1 migration SQL for `chatConversations` and `chatMessages` tables
- Drizzle ORM schema definitions in `packages/server/src/db/schema.ts`
- New route file `packages/server/src/routes/chat.ts` with:
  - `POST /v1/chat/conversations` — create conversation
  - `GET /v1/chat/conversations` — list by agent handle
  - `GET /v1/chat/conversations/:id` — get with messages
  - `DELETE /v1/chat/conversations/:id` — delete with messages
  - `POST /v1/chat/conversations/:id/messages` — save user message (non-streaming response, returns saved message JSON)
- `requireAuth()` middleware on all routes
- Conversation ownership validation (walletAddress from session)
- Auto-set title from first user message
- ID generation with `conv_` and `msg_` prefixes
- Route registration in `index.ts`
- Integration tests for all CRUD operations

**Deliverable:** Fully functional conversation management API. No LLM calls — the messages endpoint just persists the user message and returns it. This lets Phase 2 add streaming on top.

**Dependencies:** None (builds on existing server infrastructure)

---

## Phase 2: AI Gateway Proxy + SSE Streaming

**Goal:** Server can accept a user message and stream back an LLM response via SSE.

**Scope:**

- Add `@epicdm/flowstate-agents-llm-client` dependency to server
- AI Gateway URL construction (`https://gateway.ai.cloudflare.com/v1/{account}/{gateway}/{provider}/...`)
- LLM client configuration with AI Gateway `baseUrl`
- API key resolution: `X-LLM-API-Key` header → request body `apiKey` → server env var → 400
- Modify `POST /v1/chat/conversations/:id/messages` to:
  - Configure llm-client with conversation's provider/model
  - Load conversation messages from D1 for context
  - Call `llm-client.stream()` to get AsyncGenerator
  - Pipe `StreamChunk` events as SSE (`text/event-stream`)
  - Save assistant message to D1 on stream completion with usage metadata (tokens, cost, latency)
- New env vars: `CF_ACCOUNT_ID`, `CF_GATEWAY_NAME`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_AI_API_KEY`
- Wrangler config updates for new env vars
- Tests with mocked llm-client responses

**Deliverable:** Send a message via curl/Postman and receive a streaming SSE response from an LLM provider through AI Gateway.

**Dependencies:** Phase 1

---

## Phase 3: AMS Integration + Context Management

**Goal:** Conversations have smart context management with automatic summarization via the CF AMS clone.

**Scope:**

- Add `@epicdm/flowstate-agents-memory-client` dependency to server
- AMS client initialization with `AMS_BASE_URL` and `AMS_AUTH_TOKEN` env vars
- On conversation create: initialize AMS session (sessionId = conversation ID, namespace = agent handle)
- On message send: sync user message to AMS via `addMessage()`
- Replace D1 message loading with `getMemoryPrompt()` for context-window-managed prompt
- On stream completion: sync assistant message to AMS
- On conversation delete: remove AMS session via `removeWorkingMemory()`
- Fallback: if AMS unavailable, load last 50 messages from D1 directly
- New env vars: `AMS_BASE_URL`, `AMS_AUTH_TOKEN`
- Tests for AMS integration and fallback behavior

**Deliverable:** Chat conversations automatically manage context window. Long conversations get summarized. AMS down = graceful degradation.

**Dependencies:** Phase 2, CF AMS clone running (can be mocked for testing)

---

## Phase 4: Client Chat UI

**Goal:** Working mobile UI for managing conversations and viewing message history.

**Scope:**

- New feature module: `packages/saga-app/src/features/chat/`
- Types: `Conversation`, `Message`, `CreateConversationParams`, `ChatConfig` in `types.ts`
- API client (`api/chat.ts`): `createConversation`, `listConversations`, `getConversation`, `deleteConversation` — all using `ApiError` class pattern and `HUB_URL`
- Navigation: `MessagesStackParamList`, replace Messages tab placeholder with `MessagesStack` (ConversationList → ChatScreen, NewChat → ChatScreen)
- Screens:
  - `ConversationList` — FlatList of conversations, pull-to-refresh, empty state, swipe-to-delete, "New Conversation" button
  - `NewChat` — provider/model picker cards, optional system prompt, "Start Conversation" button
  - `ChatScreen` — inverted FlatList of messages (static rendering only, no streaming yet), header with title and model badge, menu
- Components:
  - `MessageBubble` — user (right, primary color) and assistant (left, surface color) with markdown
  - `ChatInput` — multi-line TextInput with send button
- Hooks:
  - `useConversations(agentHandle)` — list, create, delete, refresh
- Tests: hook tests, component snapshots, API client tests

**Deliverable:** Fully navigable chat UI. Can create conversations, view history, delete conversations. Messages display but no streaming — send button saves message and shows it, but no LLM response yet.

**Dependencies:** Phase 1 (server CRUD API), auth token available from existing AuthProvider

---

## Phase 5: Client Streaming + Polish

**Goal:** Full working chat with streaming LLM responses and error handling.

**Scope:**

- Add `react-native-sse` and `react-native-streamdown` dependencies
- API client: `createMessageStream()` function returning EventSource
- Components:
  - `StreamingMessage` — wraps react-native-streamdown, blinking cursor, transition to static on complete
  - Update `ChatInput` — stop button during streaming, disabled send during streaming
- Hooks:
  - `useChat(conversationId)` — SSE stream management, optimistic user message, streaming text accumulation, finish handling, error handling, stop function
- Error handling:
  - Stream interruption → partial message + retry button
  - Auth expired → redirect to auth, preserve input
  - Rate limited → toast with retry-after
  - Provider error → user-friendly message
- End-to-end smoke test on iOS simulator with local server
- Pod install for any new native dependencies

**Deliverable:** Complete chat feature. User types message, sees streaming response with real-time markdown rendering, can stop generation, handles errors gracefully.

**Dependencies:** Phase 2 (server SSE streaming), Phase 4 (client UI)

---

## Phase Order

```
Phase 1 (Server CRUD)
    ↓
Phase 2 (AI Gateway + SSE)
    ↓
Phase 3 (AMS Context)
    ↓
Phase 4 (Client UI) ← can start after Phase 1
    ↓
Phase 5 (Client Streaming) ← needs Phase 2 + Phase 4
```

Note: Phase 4 only depends on Phase 1's CRUD API. It could technically be started in parallel with Phases 2-3 if desired, since the UI doesn't need streaming to be buildable.
