> **FlowState Document:** `docu_av8wkuQkHb`

# LLM Chat Feature — Design Spec

## Overview

Add an AI chat feature to the SAGA mobile app, allowing agents to have LLM-powered conversations with provider-agnostic model access. The system uses server-side orchestration with D1 as the source of truth, Cloudflare AI Gateway for multi-provider routing, and FlowState packages (agents-core, llm-client, memory-client) for type safety, LLM abstraction, and context management.

## Architecture

### High-Level Flow

```
React Native App                saga-hub Worker                  External Services
─────────────────              ──────────────────               ──────────────────
ConversationList ──GET──────→  chat.ts routes
ChatScreen       ──POST─────→  requireAuth()
                               │
                               ├─→ D1 (save user msg)           D1 Database
                               ├─→ memory-client                CF AMS Clone
                               │   └─ getMemoryPrompt()
                               ├─→ llm-client.stream()  ──────→ CF AI Gateway
                               │                                ├─→ Anthropic
                               │                                ├─→ OpenAI
                               │   (pipe SSE)                   └─→ Google
                 ←──SSE──────  │
                               ├─→ D1 (save assistant msg)
                               └─→ memory-client
                                   └─ addMessage()
```

### Storage Model

**D1 (source of truth)**: All conversations and messages stored in Drizzle ORM tables. Queryable, reliable, owns the canonical data.

**AMS (context management layer)**: Working memory synced from D1. Provides automatic summarization when context windows are exceeded, Memory Prompt API for context-window-managed message arrays, and long-term memory with vector search (future).

### Key Packages

| Package                                  | Role                                                                   | Used Where      |
| ---------------------------------------- | ---------------------------------------------------------------------- | --------------- |
| `@epicdm/flowstate-agents-core`          | Zod schemas, type definitions (Agent, Conversation, Message, Provider) | Server + Client |
| `@epicdm/flowstate-agents-llm-client`    | LLM client with streaming, cost tracking, retry logic                  | Server          |
| `@epicdm/flowstate-agents-memory-client` | AMS HTTP client for context management                                 | Server          |
| `react-native-sse`                       | SSE transport for React Native                                         | Client          |
| `react-native-streamdown`                | Streaming markdown renderer                                            | Client          |

## Server Design

### D1 Schema

Two new tables added to `packages/server/src/db/schema.ts`:

#### `chatConversations`

| Column        | Type | Constraints | Description                                          |
| ------------- | ---- | ----------- | ---------------------------------------------------- |
| id            | TEXT | PK          | `conv_` prefixed random ID                           |
| agentHandle   | TEXT | NOT NULL    | SAGA agent handle (e.g., `alice.saga`)               |
| walletAddress | TEXT | NOT NULL    | Owner wallet address (from session)                  |
| title         | TEXT | nullable    | Auto-set from first user message (first 100 chars)   |
| provider      | TEXT | NOT NULL    | LLM provider: `anthropic`, `openai`, `google`, etc.  |
| model         | TEXT | NOT NULL    | Model identifier: `claude-sonnet-4-5-20250514`, etc. |
| systemPrompt  | TEXT | nullable    | Optional custom system prompt override               |
| amsSessionId  | TEXT | nullable    | AMS session ID for context management                |
| createdAt     | TEXT | NOT NULL    | ISO 8601 timestamp                                   |
| updatedAt     | TEXT | NOT NULL    | ISO 8601 timestamp                                   |

#### `chatMessages`

| Column           | Type    | Constraints | Description                             |
| ---------------- | ------- | ----------- | --------------------------------------- |
| id               | TEXT    | PK          | `msg_` prefixed random ID               |
| conversationId   | TEXT    | NOT NULL    | FK to chatConversations.id              |
| role             | TEXT    | NOT NULL    | `user`, `assistant`, or `system`        |
| content          | TEXT    | NOT NULL    | Message text content                    |
| tokensPrompt     | INTEGER | nullable    | Input tokens used (assistant messages)  |
| tokensCompletion | INTEGER | nullable    | Output tokens used (assistant messages) |
| costUsd          | REAL    | nullable    | Cost in USD (assistant messages)        |
| latencyMs        | INTEGER | nullable    | Response latency (assistant messages)   |
| createdAt        | TEXT    | NOT NULL    | ISO 8601 timestamp                      |

### API Routes

New route file: `packages/server/src/routes/chat.ts`

All routes require `requireAuth()` middleware (existing wallet signature auth).

#### `POST /v1/chat/conversations`

Create a new conversation.

**Request body:**

```json
{
  "agentHandle": "alice.saga",
  "provider": "anthropic",
  "model": "claude-sonnet-4-5-20250514",
  "systemPrompt": "Optional custom prompt"
}
```

**Response (201):**

```json
{
  "conversation": {
    "id": "conv_abc123",
    "agentHandle": "alice.saga",
    "provider": "anthropic",
    "model": "claude-sonnet-4-5-20250514",
    "title": null,
    "createdAt": "2026-03-28T00:00:00Z",
    "updatedAt": "2026-03-28T00:00:00Z"
  }
}
```

**Side effects:**

- Creates AMS session via `memory-client` using the conversation ID as the AMS `sessionId` and the agent handle as the `namespace`
- Stores `amsSessionId` (same as conversation ID) on conversation record
- If no `systemPrompt` provided, generates a default from the agent's on-chain metadata: `"You are {agentHandle}, a SAGA agent. Respond helpfully and concisely."`

#### `GET /v1/chat/conversations`

List conversations for the authenticated wallet, filtered by agent.

**Query params:** `agentHandle` (required), `page`, `limit`

**Response (200):**

```json
{
  "conversations": [
    {
      "id": "conv_abc123",
      "agentHandle": "alice.saga",
      "title": "Smart contract audit help",
      "provider": "anthropic",
      "model": "claude-sonnet-4-5-20250514",
      "createdAt": "...",
      "updatedAt": "..."
    }
  ],
  "total": 1
}
```

#### `GET /v1/chat/conversations/:id`

Get conversation with full message history.

**Response (200):**

```json
{
  "conversation": { "...conversation fields..." },
  "messages": [
    { "id": "msg_1", "role": "user", "content": "...", "createdAt": "..." },
    { "id": "msg_2", "role": "assistant", "content": "...", "tokensPrompt": 150, "tokensCompletion": 200, "costUsd": 0.001, "createdAt": "..." }
  ]
}
```

#### `DELETE /v1/chat/conversations/:id`

Delete conversation, all its messages, and the AMS session.

**Response (204):** No content.

#### `POST /v1/chat/conversations/:id/messages`

Send a user message and receive a streaming assistant response via SSE.

**Request body:**

```json
{
  "content": "Can you review the staking logic?",
  "apiKey": "sk-optional-byok-key"
}
```

**Request header (alternative BYOK):** `X-LLM-API-Key: sk-...`

**Response (200, `Content-Type: text/event-stream`):**

```
data: {"type":"text-delta","textDelta":"I'd be happy"}
data: {"type":"text-delta","textDelta":" to review"}
data: {"type":"finish","finishReason":"end_turn","usage":{"inputTokens":150,"outputTokens":200,"totalTokens":350},"cost":{"totalCostUSD":0.001,"model":"claude-sonnet-4-5-20250514"}}
data: [DONE]
```

**Processing steps:**

1. Validate auth and conversation ownership
2. Save user message to D1
3. Auto-set conversation title from first user message (first 100 chars)
4. Sync user message to AMS via `memory-client.addMessage()`
5. Get context-managed prompt via `memory-client.getMemoryPrompt()`
6. Configure `llm-client` with AI Gateway base URL and resolved API key
7. Call `llm-client.stream()` and pipe `StreamChunk` events as SSE
8. On stream completion, save assistant message to D1 with usage metadata
9. Sync assistant message to AMS via `memory-client.addMessage()`

### AI Gateway Integration

The Cloudflare AI Gateway provides a universal endpoint for multiple LLM providers:

```
https://gateway.ai.cloudflare.com/v1/{CF_ACCOUNT_ID}/{CF_GATEWAY_NAME}/{provider}/...
```

The `llm-client` is configured with this as `baseUrl`, using the OpenAI-compatible endpoint pattern that AI Gateway supports. The gateway handles:

- Provider normalization
- Rate limiting
- Request/response logging
- Response caching (optional)
- Cost tracking in CF dashboard

### API Key Resolution

Priority order for resolving the LLM API key:

1. `X-LLM-API-Key` request header (BYOK)
2. `apiKey` field in request body (BYOK)
3. Server environment variable: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_AI_API_KEY`
4. If none available: return 400 error

### Context Window Management

Handled by AMS via the memory-client:

1. `getMemoryPrompt()` returns a context-window-managed message array
2. AMS automatically summarizes older messages when the context budget is exceeded
3. The returned messages include any summary as a system message
4. llm-client sends this managed array to the LLM provider

**Fallback**: If AMS is unavailable, load the last 50 messages directly from D1 and send as-is. This degrades gracefully — no summarization, but the chat still works.

### New Environment Variables

| Variable            | Required | Description                          |
| ------------------- | -------- | ------------------------------------ |
| `CF_ACCOUNT_ID`     | Yes      | Cloudflare account ID for AI Gateway |
| `CF_GATEWAY_NAME`   | Yes      | AI Gateway name (e.g., `saga-hub`)   |
| `AMS_BASE_URL`      | Yes      | CF AMS clone URL                     |
| `AMS_AUTH_TOKEN`    | No       | AMS authentication token             |
| `ANTHROPIC_API_KEY` | No       | Default Anthropic API key            |
| `OPENAI_API_KEY`    | No       | Default OpenAI API key               |
| `GOOGLE_AI_API_KEY` | No       | Default Google AI key                |

## Client Design

### Feature Module Structure

```
packages/saga-app/src/features/chat/
├── screens/
│   ├── ConversationList.tsx    ← Messages tab root screen
│   ├── ChatScreen.tsx          ← Active conversation with streaming
│   └── NewChat.tsx             ← Provider/model selection
├── components/
│   ├── MessageBubble.tsx       ← Single message (user or assistant)
│   ├── StreamingMessage.tsx    ← Active streaming with react-native-streamdown
│   └── ChatInput.tsx           ← Text input with send button
├── hooks/
│   ├── useConversations.ts     ← List/create/delete conversations
│   └── useChat.ts              ← Send messages, manage SSE stream
├── api/
│   └── chat.ts                 ← HTTP + SSE client functions
└── types.ts                    ← Conversation, Message, ChatConfig types
```

### Navigation Changes

The existing `MessagesTab` placeholder becomes the chat entry point:

```
MessagesStack:
  ConversationList  →  ChatScreen
                   →  NewChat  →  ChatScreen
```

Stack param types:

```typescript
type MessagesStackParamList = {
  ConversationList: undefined
  ChatScreen: { conversationId: string }
  NewChat: undefined
}
```

### Screens

#### ConversationList

- Fetches conversations via `GET /v1/chat/conversations?agentHandle={activeAgent}`
- Renders FlatList with conversation cards showing: title, last message preview (from updatedAt), model badge (color-coded by provider), relative timestamp
- "New Conversation" button at top navigates to NewChat
- Swipe-to-delete on conversation cards
- Shows empty state when no conversations exist
- Refreshes on pull-down and when navigating back from ChatScreen

#### ChatScreen

- Loads message history from `GET /v1/chat/conversations/:id`
- Inverted FlatList for messages (newest at bottom, auto-scroll)
- On send: POST to `/v1/chat/conversations/:id/messages`
- Establishes SSE connection via `react-native-sse` EventSource
- Active stream renders via StreamingMessage component
- Completed assistant messages render as static MessageBubble with markdown
- Header shows conversation title and model badge
- Menu (three dots) with options: delete conversation, copy last response

#### NewChat

- Provider selection: Cards for Anthropic, OpenAI, Google (expandable)
- Model selection: List of available models per provider with pricing info
- Optional system prompt TextInput
- "Start Conversation" button creates conversation and navigates to ChatScreen

### Components

#### MessageBubble

- **User messages**: Right-aligned, primary brand color (#6366f1) background, white text, rounded corners (top-left, top-right, bottom-left rounded; bottom-right tight)
- **Assistant messages**: Left-aligned, surface color (#1e1e2e) background, standard text color, rendered as markdown (using react-native-streamdown's static mode or a markdown renderer)
- Shows timestamp on long-press
- Supports code blocks with syntax highlighting (monospace font, dark background)

#### StreamingMessage

- Wraps `react-native-streamdown` for active streaming display
- Receives streaming text chunks and renders incrementally
- Shows blinking cursor at end of active stream
- Transitions to static MessageBubble when stream completes (via `finish` event)
- Handles markdown formatting in real-time (headings, bold, code blocks, lists)

#### ChatInput

- Multi-line TextInput with auto-grow (max 6 lines)
- Send button (arrow icon) — disabled when empty or streaming
- Disabled state during active streaming with visual indicator
- Stop button replaces send button during streaming (cancels the SSE connection)
- Keyboard-aware positioning (KeyboardAvoidingView)

### Hooks

#### useConversations(agentHandle: string)

```typescript
interface UseConversationsReturn {
  conversations: Conversation[]
  isLoading: boolean
  error: string | null
  create: (params: CreateConversationParams) => Promise<Conversation>
  remove: (id: string) => Promise<void>
  refresh: () => Promise<void>
}
```

#### useChat(conversationId: string)

```typescript
interface UseChatReturn {
  messages: Message[]
  isStreaming: boolean
  isLoading: boolean
  error: string | null
  send: (content: string) => void
  stop: () => void
}
```

The `send` function:

1. Adds optimistic user message to local state
2. POSTs to the messages endpoint
3. Creates EventSource via react-native-sse with Bearer token
4. Accumulates streaming text chunks into a growing assistant message
5. On `finish` event: finalizes message with usage data, closes EventSource
6. On error: shows error state, keeps partial message if any

### API Client (`api/chat.ts`)

```typescript
import EventSource from 'react-native-sse'

export const HUB_URL = __DEV__ ? 'http://localhost:8787' : 'https://saga-hub.d7r.workers.dev'

export async function createConversation(
  token: string,
  params: CreateConversationParams
): Promise<Conversation>
export async function listConversations(
  token: string,
  agentHandle: string
): Promise<{ conversations: Conversation[]; total: number }>
export async function getConversation(
  token: string,
  id: string
): Promise<{ conversation: Conversation; messages: Message[] }>
export async function deleteConversation(token: string, id: string): Promise<void>
export function createMessageStream(
  token: string,
  conversationId: string,
  content: string
): EventSource
```

All functions use the existing `ApiError` class pattern. The `createMessageStream` function returns a react-native-sse `EventSource` instance configured with:

- URL: `${HUB_URL}/v1/chat/conversations/${id}/messages`
- Method: POST (via polyfill config)
- Headers: `Authorization: Bearer ${token}`, `Content-Type: application/json`
- Body: `{ content }`

### Auth Token Access

The chat feature needs the wallet auth token. The existing `AuthProvider` manages session state. The token is obtained via:

1. `useAuth()` hook provides current session
2. Token passed to API functions
3. If expired/missing, redirect to auth flow

## Error Handling

| Scenario                      | Server Response                         | Client Behavior                                                                                         |
| ----------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Stream interruption (network) | SSE disconnects                         | Show partial message with "Response interrupted" badge. Retry button.                                   |
| Auth expired (401)            | `401 Unauthorized`                      | Redirect to auth flow. Preserve typed message in input.                                                 |
| Rate limited (429)            | `429 Too Many Requests` + `Retry-After` | Show "Rate limited, try again in X seconds" toast.                                                      |
| AMS unavailable               | Fallback to D1-only context             | Chat works, no summarization. Log warning server-side.                                                  |
| Provider error (500 from LLM) | `502 Bad Gateway` + error details       | Show "Model unavailable, try a different provider" message.                                             |
| Context length exceeded       | LLM returns error                       | Map to user message: "Conversation too long. Start a new one or switch to a model with larger context." |
| Invalid BYOK key              | `401` from provider                     | "Invalid API key for {provider}. Check your key and try again."                                         |
| No API key configured         | `400 Bad Request`                       | "No API key configured for {provider}. Add your key in settings or contact admin."                      |

## Testing Strategy

### Server Tests

- **Route tests**: Mock D1, mock AMS client, mock llm-client. Test CRUD operations, auth enforcement, SSE response format.
- **Integration tests**: Test the full message flow with mocked external services. Verify D1 writes, AMS sync, SSE event ordering.
- **Error path tests**: AMS down fallback, invalid API keys, rate limiting.

### Client Tests

- **Hook tests**: Mock fetch/EventSource. Test useConversations CRUD, useChat streaming state transitions.
- **Component tests**: Snapshot tests for MessageBubble (user vs assistant), ChatInput (normal vs streaming state).
- **API client tests**: Mock fetch responses and EventSource events. Test error handling.

### Smoke Test

- Run saga-hub locally (`pnpm --filter @d7r/saga-server dev`)
- Run SAGA app on iOS simulator
- Create conversation, send message, verify streaming response renders
- Test with mock LLM endpoint if AI Gateway not configured
