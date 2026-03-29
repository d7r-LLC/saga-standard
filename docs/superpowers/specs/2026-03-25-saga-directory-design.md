> **FlowState Document:** `docu_1ji71AzLfw`

# SAGA Official Directory — Design Spec

**Date:** 2026-03-25
**Status:** Draft
**Package:** `packages/directory` in saga-standard monorepo

## Overview

The SAGA Directory is a public-facing web application for browsing, registering, and managing SAGA agents and organizations. It also provides a UI for the SAGA Transfer Protocol — initiating, consenting to, and tracking agent transfers between SAGA servers.

The directory is a **thin frontend** over the existing SAGA server API. It does not own its own agent/org database — all data lives on the SAGA server (D1 + R2). The directory has its own KV namespace for wallet session caching only.

## Approach

**Deep Fork** of the FlowState Directory (`flowstate-platform/packages/directory`). Copy the full package, then systematically:

- Replace OIDC auth with wallet-based auth (ported from `flowstate-platform/packages/id`)
- Replace local D1 database queries with SAGA server API calls via `@epicdm/saga-client`
- Remove payment, work history, MCP, and FlowState-specific features
- Add Transfer Protocol UI (new)
- Inline shared `@epicdm/chrome` components we use (layout, nav, theming)
- Rebrand for SAGA

## Architecture

```
User Browser
    ↕
SAGA Directory (Next.js 15 on Cloudflare Workers via OpenNextJS)
    ↕                    ↕
KV (wallet sessions)    SAGA Server API (Hono on CF Workers)
                             ↕
                        D1 + R2 (agents, orgs, documents)
```

**Runtime:** Cloudflare Workers (via OpenNextJS adapter)
**Framework:** Next.js 15 with App Router, React 19, Server Components
**Styling:** Tailwind CSS v4, utility-first (ported from FlowState directory)
**Data fetching:** Server components call SAGA API; no client-side data fetching libraries

## Pages & Routes

### Public (no auth)

| Route         | Purpose                                      | Data Source                           |
| ------------- | -------------------------------------------- | ------------------------------------- |
| `/`           | Landing — hero, recent agents, featured orgs | `GET /v1/agents`, `GET /v1/orgs`      |
| `/agents`     | Browse/search agents, paginated grid         | `GET /v1/agents?search=&page=&limit=` |
| `/orgs`       | Browse/search organizations                  | `GET /v1/orgs?search=&page=&limit=`   |
| `/a/[handle]` | Agent public profile                         | `GET /v1/agents/:handle`              |
| `/o/[handle]` | Org public profile                           | `GET /v1/orgs/:handle`                |
| `/connect`    | Wallet connect page                          | —                                     |

### Protected (wallet auth required)

| Route                      | Purpose                                | Data Source                             |
| -------------------------- | -------------------------------------- | --------------------------------------- |
| `/dashboard`               | Redirect to `/dashboard/profile`       | —                                       |
| `/dashboard/profile`       | View/edit agent, manage SAGA documents | `GET /v1/agents/:handle`, document CRUD |
| `/dashboard/register`      | Register new agent                     | `POST /v1/agents`                       |
| `/dashboard/transfers`     | List transfers with status             | `GET /v1/transfers/:id`                 |
| `/dashboard/transfers/new` | Initiate transfer to another server    | `POST /v1/transfers/initiate`           |

## Authentication

### Approach

Port wallet client-side code from `flowstate-platform/packages/id` and wire it to the SAGA server's challenge/verify endpoints.

### What We Port from `@epicdm/flowstate-identity`

**Wallet utilities (copy into `src/lib/wallet/`):**

- `lib/wallet/evm.ts` — EIP-6963 multi-provider discovery, MetaMask connect, signMessage
- `lib/wallet/solana.ts` — Phantom connect, signMessage
- `lib/wallet/walletconnect.ts` — WalletConnect QR modal

**React hooks (copy into `src/hooks/`):**

- `hooks/useWalletLogin.ts` — Login orchestration (adapt to call SAGA endpoints)
- `hooks/useEIP6963Discovery.ts` — Wallet detection

**React components (copy into `src/components/wallet/`):**

- `components/wallet/WalletLoginSection.tsx` — Login UI with wallet buttons + status

### Auth Flow

1. User visits `/connect`, clicks wallet button (MetaMask/Phantom/WalletConnect)
2. Browser wallet provides `walletAddress` + `chain`
3. Directory's API route calls SAGA server: `POST /v1/auth/challenge { walletAddress, chain }`
4. SAGA server returns `{ challenge, expiresAt }` (5-min TTL)
5. User signs the challenge string in their wallet
6. Directory's API route calls SAGA server: `POST /v1/auth/verify { walletAddress, chain, signature, challenge }`
7. SAGA server returns `{ token, expiresAt, walletAddress }` (1h bearer token)
8. Directory stores session in KV: `{ walletAddress, chain, sagaToken, expiresAt }`
9. Sets HttpOnly session cookie, redirects to `/dashboard`

### Session Management

- HttpOnly cookie → KV lookup → SAGA bearer token
- Server components include bearer token in Authorization header for authenticated API calls
- On token expiry (1h), user re-authenticates via wallet
- Next.js middleware checks session cookie on `/dashboard/*`, redirects to `/connect` if missing

## Features

### Browse & Search (Public)

**Agent browse (`/agents`):**

- Paginated grid of agent cards
- Search by handle or wallet address
- Filter by chain (Base, Ethereum, Polygon, Solana)
- Server-rendered with ISR caching

**Org browse (`/orgs`):**

- Same pattern as agents
- Search by handle

**Agent profile (`/a/[handle]`):**

- Identity: handle, wallet address (truncated + copy), chain badge
- NFT identity: token ID, TBA address, contract address, mint tx (if present)
- Latest SAGA document metadata (export type, version, size, checksum)

**Org profile (`/o/[handle]`):**

- Name, handle, wallet address, chain
- NFT identity fields (if present)

### Dashboard (Authenticated)

**Profile (`/dashboard/profile`):**

- Display registered agent details
- Upload SAGA documents (drag & drop or file picker)
  - Supports `.saga` binary containers and JSON documents
  - Shows upload history with metadata (type, size, date, checksum)
- Download/delete documents

**Register (`/dashboard/register`):**

- Form: handle (validated: 3-64 chars, alphanumeric + dots/hyphens/underscores), wallet auto-filled from session
- Client-side handle validation
- Calls `POST /v1/agents { handle, walletAddress, chain }`
- On success, redirects to `/dashboard/profile`

**Transfers (`/dashboard/transfers`):**

- List view of all transfers involving the authenticated agent
- Status badges: `pending_consent` | `packaging` | `delivering` | `imported` | `failed`
- Click through to transfer detail
- **Note:** The SAGA server currently only has `GET /v1/transfers/:id` (single transfer). A `GET /v1/agents/:handle/transfers` list endpoint will need to be added to the server to support this page.

**New Transfer (`/dashboard/transfers/new`):**

- Destination server URL input (with validation — must be a reachable SAGA server)
- Layer selection checkboxes (identity, persona, cognitive, memory, skills, task-history, relationships, environment, vault)
- Calls `POST /v1/transfers/initiate { agentHandle, destinationServerUrl, requestedLayers }`
- Then consent flow: display consent message, user signs with wallet
- Calls `POST /v1/transfers/:id/consent { signature }`

## Components

### Ported from FlowState Directory (adapted)

| Component                 | Changes                                                              |
| ------------------------- | -------------------------------------------------------------------- |
| `AgentCard`               | Remove payment/availability fields, add chain badge + wallet display |
| `CompanyCard` → `OrgCard` | Rename, adapt for SAGA org fields                                    |
| `SearchInput`             | Same pattern, restyle                                                |
| `Pagination`              | Same                                                                 |
| `Layout`                  | SAGA branding, wallet connect button replacing OIDC sign-in          |
| `RegisterForm`            | Simplify: handle + wallet only (no payment)                          |

### New Components (SAGA-specific)

| Component              | Purpose                                               |
| ---------------------- | ----------------------------------------------------- |
| `WalletConnect`        | Wallet connection button + provider selection         |
| `WalletAddress`        | Truncated address display with copy-to-clipboard      |
| `ChainBadge`           | Chain identifier display (Base, ETH, Polygon, Solana) |
| `TransferList`         | Table of transfers with status badges                 |
| `TransferInitiateForm` | Form: destination URL + layer selection               |
| `TransferConsentFlow`  | Display consent message, wallet sign button, status   |
| `DocumentUpload`       | Drag-and-drop + file picker for .saga / JSON files    |
| `DocumentList`         | Table of agent's documents with metadata              |

### Ported from FlowState Identity (wallet auth)

| Source                         | Destination                                    | Changes                       |
| ------------------------------ | ---------------------------------------------- | ----------------------------- |
| `lib/wallet/evm.ts`            | `src/lib/wallet/evm.ts`                        | No changes needed             |
| `lib/wallet/solana.ts`         | `src/lib/wallet/solana.ts`                     | No changes needed             |
| `lib/wallet/walletconnect.ts`  | `src/lib/wallet/walletconnect.ts`              | No changes needed             |
| `hooks/useWalletLogin.ts`      | `src/hooks/useWalletLogin.ts`                  | Rewire to SAGA auth endpoints |
| `hooks/useEIP6963Discovery.ts` | `src/hooks/useEIP6963Discovery.ts`             | No changes needed             |
| `WalletLoginSection.tsx`       | `src/components/wallet/WalletLoginSection.tsx` | Restyle for SAGA brand        |

## Infrastructure & Deployment

**Cloudflare bindings:**

- KV namespace: `saga-directory-sessions` (session storage)
- No D1 database (directory doesn't own data)
- No R2 bucket (documents on SAGA server)

**Wrangler environments:**

- `staging`: `saga-directory-staging.epicdm.workers.dev`
- `production`: `directory.saga-standard.dev` (custom domain, future)

**Environment variables:**

- `SAGA_SERVER_URL` — SAGA server base URL (staging: `https://saga-server-staging.epicdm.workers.dev`)
- `WALLETCONNECT_PROJECT_ID` — WalletConnect Cloud project ID

**Build:**

- OpenNextJS for Cloudflare adapter
- Part of saga-standard monorepo, built with `pnpm build`

## What Gets Removed from Fork

Entire directories/files removed from the FlowState directory copy:

- `src/db/` — Database layer (schema, queries, initialization)
- `src/lib/oidc/` — OIDC auth client
- `src/lib/payment/` — X402 payment service
- `src/lib/auth/` — FlowState session/auth helpers
- `src/app/api/mcp/` — MCP protocol endpoint
- `src/app/api/webhooks/` — Payment webhooks
- `src/app/api/register/` — Payment-based registration flow
- `src/app/api/work-history/` — Work history CRUD
- `src/app/api/cron/` — Registration expiration cron
- `src/app/dashboard/company/` — Company management page
- `src/components/dashboard/work-history/` — Work history components
- `drizzle/` — Database migration files

**Dependencies removed:**

- `@epicdm/auth-client`, `@epicdm/kv-session`, `@epicdm/rate-limit`
- `@modelcontextprotocol/sdk`
- `drizzle-orm`, `drizzle-kit`, `better-sqlite3`

**Dependencies added:**

- `@epicdm/saga-client` (workspace dependency)
- `viem` (wallet interaction)
- `@walletconnect/ethereum-provider` + `@walletconnect/modal`

## Data Flow Examples

### Browse Agents (Server Component)

```
/agents page (server component)
  → import SagaServerClient from '@epicdm/saga-client'
  → client.listAgents({ page, limit, search })
  → GET https://saga-server-staging.epicdm.workers.dev/v1/agents?page=1&limit=20&search=foo
  → Render AgentCard grid with pagination
```

### Register Agent (Authenticated)

```
/dashboard/register (client component form)
  → User fills in handle
  → POST /api/agents (directory API route)
    → Read session from KV (get SAGA bearer token)
    → client.registerAgent({ handle, walletAddress, chain })
      → POST /v1/agents (SAGA server, with Authorization: Bearer token)
    → Return result to client
  → Redirect to /dashboard/profile
```

### Initiate Transfer (Authenticated)

```
/dashboard/transfers/new (client component)
  → User enters destination URL, selects layers
  → POST /api/transfers/initiate (directory API route)
    → client.initiateTransfer({ agentHandle, destinationServerUrl, requestedLayers })
  → Display consent message
  → User signs with wallet
  → POST /api/transfers/:id/consent (directory API route)
    → client.consentToTransfer(transferId, signature)
  → Show transfer status
```

## Error Handling

- SAGA API errors surfaced to user with meaningful messages
- Wallet connection failures handled gracefully (wallet not installed, user rejected, network error)
- Session expiry detected in middleware → redirect to `/connect` with return URL
- Transfer failures shown with status + error details

## Testing Strategy

- Unit tests for wallet utility functions (signature formatting, address validation)
- Integration tests for API route handlers (mocked SAGA server responses)
- E2E tests for critical flows: connect wallet → register → view profile
