> **FlowState Document:** `docu_q-5zzDLU1Z`

# Phase 5: Directory + Discovery — Design

**Date:** 2026-03-27
**Package:** `@epicdm/saga-app`
**Depends on:** Phase 4 (Wallet Signing)

## Goal

Add a functional directory browser to the SAGA app so users can search for agents and organizations by handle, view their on-chain identity details, and browse federated directories. Replaces the "Coming in Phase 5" placeholder in the DirectoryStack tab.

## Current State

- **DirectoryStack** has a single placeholder screen (`DirectorySearchScreen`) showing "Coming in Phase 5".
- **DirectoryStackParamList** defines one screen: `DirectorySearch`.
- **Server API** already provides all needed endpoints: `/v1/resolve/:handle`, `/v1/agents`, `/v1/orgs`, `/v1/directories` with search and pagination.
- **No directory feature module** exists yet under `src/features/`.

## Architecture

A new `features/directory/` module follows the same structure as wallet and identity features.

### File Structure

```
features/directory/
├── api/
│   └── directory.ts         # HTTP client functions for server endpoints
├── hooks/
│   ├── useDirectorySearch.ts # Search state, debounce, pagination, tab filtering
│   ├── useEntityDetail.ts    # Fetch single agent/org by handle
│   └── useDirectories.ts     # Fetch federated directories list
├── screens/
│   ├── DirectoryHome.tsx     # Search bar + segmented filter + results list
│   ├── EntityDetail.tsx      # Agent/org detail view
│   └── DirectoryList.tsx     # Federated directories browser
├── components/
│   └── EntityCard.tsx        # Reusable card for agent/org results
└── types.ts                  # Directory-specific type definitions
```

### Navigation Changes

Update `DirectoryStackParamList` to:

```typescript
export type DirectoryStackParamList = {
  DirectoryHome: undefined
  EntityDetail: { handle: string; entityType: 'agent' | 'org' }
  DirectoryList: undefined
}
```

Replace the placeholder `DirectorySearchScreen` with real screens.

## API Client

`features/directory/api/directory.ts` wraps the server endpoints:

```typescript
interface SearchResult {
  agents: AgentSummary[]
  orgs: OrgSummary[]
  totalAgents: number
  totalOrgs: number
}

async function searchDirectory(
  query: string,
  filter: 'all' | 'agents' | 'orgs',
  page: number
): Promise<SearchResult>
async function resolveHandle(handle: string): Promise<ResolvedEntity | null>
async function getAgent(handle: string): Promise<AgentDetail>
async function getOrg(handle: string): Promise<OrgDetail>
async function getDirectories(page: number): Promise<DirectoriesResult>
```

The API client reads the server URL from a config constant. For now, this is hardcoded to the development hub URL (`https://saga-hub.d7r-LLC.workers.dev` or whatever is configured). A settings screen for custom hub URLs is out of scope.

## Screens

### DirectoryHome

The main screen in the DirectoryStack tab. Layout from top to bottom:

1. **Header** with title "Directory"
2. **TextInput** as search bar with magnifying glass icon placeholder text "Search by handle..."
3. **Segmented control** with three options: All, Agents, Orgs
4. **Results list** using FlatList with EntityCard items, pull-to-refresh, and pagination via `onEndReached`
5. **Empty state** when no results: "No identities found." or "Search for agents and orgs by handle."
6. **Header right action** linking to DirectoryList screen (for browsing federated directories)

When search text is empty, the screen shows a browse mode: recent or all entities from the selected tab, paginated.

### EntityDetail

Shows full details for a single agent or org. Content:

- **Badge** showing entity type (AGENT / ORG)
- **Handle** displayed prominently as `@handle`
- **Wallet address** (full, with copy-to-clipboard)
- **Chain** (e.g., Base Sepolia)
- **NFT data** (if minted): Token ID, Contract Address, TBA Address, Mint TX Hash
- **Org-specific**: Organization name
- **Agent-specific**: Home Hub URL
- **Registration date**
- **Back button** to return to DirectoryHome

### DirectoryList

Lists federated SAGA directories. Each row shows:

- **Directory ID**
- **URL** (truncated)
- **Status** badge (active/suspended/flagged/revoked) using StatusIndicator or Badge component
- **Conformance level**
- **Operator wallet** (truncated)

Pagination via FlatList `onEndReached`.

## Hooks

### useDirectorySearch

```typescript
interface UseDirectorySearchResult {
  query: string
  setQuery: (q: string) => void
  filter: 'all' | 'agents' | 'orgs'
  setFilter: (f: 'all' | 'agents' | 'orgs') => void
  results: EntityCardData[]
  loading: boolean
  error: string | null
  hasMore: boolean
  loadMore: () => void
  refresh: () => void
}
```

- Debounces search input by 300ms before firing API calls
- When filter is "all", calls both agents and orgs endpoints; when "agents" or "orgs", calls only that endpoint
- Manages pagination state (current page, hasMore)
- `refresh()` resets to page 1 and re-fetches
- `loadMore()` increments page and appends results

### useEntityDetail

```typescript
interface UseEntityDetailResult {
  entity: AgentDetail | OrgDetail | null
  loading: boolean
  error: string | null
}
```

- Fetches on mount based on `handle` and `entityType` params
- Calls `getAgent(handle)` or `getOrg(handle)` from the API client

### useDirectories

```typescript
interface UseDirectoriesResult {
  directories: DirectorySummary[]
  loading: boolean
  error: string | null
  hasMore: boolean
  loadMore: () => void
  refresh: () => void
}
```

- Fetches `/v1/directories` with pagination
- Same loadMore/refresh pattern as useDirectorySearch

## Types

```typescript
interface AgentSummary {
  handle: string
  walletAddress: string
  chain: string
  entityType: 'agent'
  tokenId: string | null
  registeredAt: string
}

interface OrgSummary {
  handle: string
  name: string
  walletAddress: string
  chain: string
  entityType: 'org'
  tokenId: string | null
  registeredAt: string
}

type EntityCardData = AgentSummary | OrgSummary

interface AgentDetail extends AgentSummary {
  publicKey: string | null
  homeHubUrl: string | null
  tbaAddress: string | null
  contractAddress: string | null
  mintTxHash: string | null
  updatedAt: string
}

interface OrgDetail extends OrgSummary {
  publicKey: string | null
  tbaAddress: string | null
  contractAddress: string | null
  mintTxHash: string | null
  updatedAt: string
}

interface DirectorySummary {
  directoryId: string
  url: string
  operatorWallet: string
  conformanceLevel: string
  status: 'active' | 'suspended' | 'flagged' | 'revoked'
  chain: string
  tokenId: number | null
  registeredAt: string
}

type SearchFilter = 'all' | 'agents' | 'orgs'
```

## Components

### EntityCard

A pressable card displaying an entity search result:

- **Badge** with entity type (AGENT / ORG)
- **Handle** as `@handle`
- **Wallet address** truncated (`0x1234...abcd`)
- **Chain badge** or text
- Reuses existing `Card` and `Badge` components

## Error Handling

| Error                   | Source           | User sees                                               |
| ----------------------- | ---------------- | ------------------------------------------------------- |
| Network unreachable     | fetch failure    | "Unable to reach the directory. Check your connection." |
| No results for query    | empty response   | "No identities found for [query]."                      |
| Entity not found        | 404 from server  | "Identity not found." on EntityDetail screen            |
| Server error            | 500 response     | "Something went wrong. Try again."                      |
| Search with empty state | no query entered | "Search for agents and orgs by handle."                 |

## Server URL Configuration

The API client uses a hardcoded constant for the hub URL. This aligns with the current ChainProvider pattern where chain config is constants-based. A configurable hub URL setting is out of scope for Phase 5.

```typescript
export const HUB_URL = 'https://saga-hub.d7r-LLC.workers.dev'
```

## Testing Strategy

### Unit Tests

- **api/directory.ts** — Mock `fetch`, verify correct URL construction, query params, error handling for each endpoint
- **useDirectorySearch** — Test debounce timing, pagination state, filter switching, error states, empty results
- **useEntityDetail** — Test successful fetch, 404 handling, loading states
- **useDirectories** — Test list fetch, pagination, refresh

### What We Don't Test

- Actual network calls (mocked)
- Screen rendering (covered by integration testing in later phases)
- Navigation transitions

## Existing Components Reused

- `Card` — for EntityCard wrapper
- `Badge` — for entity type labels
- `SafeArea` — screen wrapper
- `Header` — screen headers
- `TextInput` — search bar
- `LoadingSpinner` — loading states
- `ListItem` — directory list rows
- `StatusIndicator` — directory status
