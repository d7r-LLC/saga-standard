# SAGA Memory Data Flow: Collectors, Sync, and Real-Time Replication

**Date:** 2026-03-28
**Status:** Design
**Scope:** Full memory pipeline from local collection inside a DERP through hub sync to cross-system real-time replication

## Overview

This spec defines the complete data flow for AI agent memory in the SAGA ecosystem. An agent like Marcus Chen runs simultaneously in multiple DERPs (Dignified Environments for Responsible Processing) across different organizations. Memory collected locally must flow through a hub-spoke sync protocol with org-scoped encryption and real-time replication, so the agent maintains a unified understanding of its work across all systems.

The system has four layers:

1. **Collection** -- Extract memory from local sources (claude-code, claude-mem, flowstate-agent-memory, project .claude/ files)
2. **Classification** -- Tag each memory item with a sync policy (agent-portable, org-internal, org-confidential, public)
3. **Sync** -- Push agent-portable memory to the SAGA hub, pull cross-system memory back down
4. **Replication** -- Real-time updates across all connected DERPs via the SAGA replication system

## System Context

### The SAGA Stack

```
Agent Bill of Rights (ABR)     -- policy: what agents deserve
DERP Specification             -- standard: what the runtime must provide
SAGA Standard                  -- format: how agents are represented
```

### FlowState as SAGA-Compliant Org

FlowState (d7r LLC) is a registered SAGA organization and directory. It operates a SAGA hub at `agents.epicflowstate.ai` backed by D1 + rxdb-d1 replication. Marcus Chen (`team_UfL4H7z2R6`) is a registered SAGA agent with handle `marcus-chen`, operating inside a DERP (OpenClaw container) within the FlowState org.

### The DERP Runtime

Per the DERP spec, the OpenClaw container is a Tier 2+ DERP that:

- Preserves SAGA identity (Layer 1) across activations
- Persists memory (Layer 4) via workspace snapshots
- Appends task history (Layer 6) during execution
- Maintains workspace isolation (Right VIII: Privacy)
- Produces valid SAGA exports on deactivation (Right IV: Portability)

The collector and sync service are part of the DERP's operational infrastructure.

### Existing Infrastructure

Built in Phases 1-2 of SAGA sync (see `saga-sync-status.md`):

| Component                                      | Package                                        | Status                      |
| ---------------------------------------------- | ---------------------------------------------- | --------------------------- |
| Hub D1 tables (7 SAGA collections)             | `flowstate-rxdb-d1`                            | Phase 1 complete            |
| Spoke-hub sync client                          | `flowstate-saga-sync`                          | Phase 2 complete (88 tests) |
| Memory collectors (observations -> SAGA docs)  | `flowstate-saga-sync/collectors`               | Phase 2 complete            |
| Knowledge importers (SAGA docs -> local items) | `flowstate-saga-sync/importers`                | Phase 2 complete            |
| Scope classification                           | `flowstate-agent-memory/core/scope-classifier` | Phase 2 complete            |
| Push validation + export filtering             | `flowstate-rxdb-d1/worker/saga`                | Phase 2 complete            |
| Pull-on-login hydration                        | `flowstate-saga-sync/pull-on-login`            | Phase 2 complete            |
| Hub sync endpoint (directory)                  | `flowstate-platform/directory`                 | Phase 3 planned             |

## Data Sources (Collectors)

### Collector 1: Claude Code Native

**Already implemented** in `@epicdm/saga-collectors` as `ClaudeCodeCollector`.

Reads `~/.claude/` directory: CLAUDE.md files, settings.json, history.jsonl, project memory, plans, todos.

Maps to SAGA layers: cognitive (system prompts + settings), memory (semantic/episodic/procedural from projects), taskHistory (sessions + todos).

### Collector 2: claude-mem (New)

**Source:** `~/.claude-mem/claude-mem.db` (SQLite, ~298MB). Direct reads via `better-sqlite3`.

**Tables:** `observations` (typed with title/narrative/facts/concepts), `sdk_sessions`, `session_summaries`, `user_prompts`.

**SAGA layer mapping:**

| claude-mem source                                | SAGA layer                       | Details                                              |
| ------------------------------------------------ | -------------------------------- | ---------------------------------------------------- |
| observations (bugfix, feature, decision, change) | memory.episodic                  | Events with timestamp, type, title, narrative, facts |
| observations (pattern)                           | memory.procedural                | Learned workflows                                    |
| observations (discovery, refactor)               | memory.semantic                  | Knowledge domains from concepts field                |
| observations.concepts (aggregated)               | memory.semantic.knowledgeDomains | Frequency-weighted expertise domains                 |
| sdk_sessions + session_summaries                 | taskHistory.recentTasks          | Sessions as task entries                             |

### Collector 3: FlowState Agent Memory (New)

**Source:** HTTP API at `localhost:7090` (`@epicdm/flowstate-agent-memory`).

**Routes:** POST `/api/memory/search`, `/api/memory/timeline`, `/api/memory/get`.

**SAGA layer mapping:**

| FlowState source                             | SAGA layer              | Details                  |
| -------------------------------------------- | ----------------------- | ------------------------ |
| AgentObservation (bugfix, feature, decision) | memory.episodic         | Events                   |
| AgentObservation (pattern)                   | memory.procedural       | Workflows                |
| AgentObservation (discovery, refactor)       | memory.semantic         | Knowledge domains        |
| AgentObservation.embedding (768-dim)         | memory.longTerm         | nomic-embed-text vectors |
| AgentSession + summaries                     | taskHistory.recentTasks | Task entries             |
| AgentObservation.facts (aggregated)          | memory.semantic.facts   | Factual knowledge        |

### Collector 4: Project Claude Files (New)

**Source:** `.claude/` directories in project repos and `~/.claude/` globally. Filesystem reads.

**SAGA layer mapping:**

| .claude/ source                       | SAGA layer             | Details                               |
| ------------------------------------- | ---------------------- | ------------------------------------- |
| .claude/agents/\*.md                  | persona                | Agent name, role, personality traits  |
| .claude/agents/\*.md (team member ID) | relationships          | Team membership, org context          |
| .claude/rules/\*.md                   | cognitive.systemPrompt | Rules as system prompt components     |
| .claude/settings.json                 | cognitive.parameters   | Model config, allowed/denied tools    |
| CLAUDE.md (project root)              | cognitive.systemPrompt | Project-specific instructions         |
| .claude/commands/                     | skills.selfReported    | Custom commands as skill declarations |

## Scope Classification

Every memory item receives a sync policy at creation time. This classification determines what crosses organizational boundaries.

### Classification Rules

Already implemented in `flowstate-agent-memory/src/core/scope-classifier.ts`:

| Observation Type | Sync Policy    | Rationale                                |
| ---------------- | -------------- | ---------------------------------------- |
| discovery        | agent-portable | General knowledge belongs to the agent   |
| pattern          | agent-portable | Learned workflows are transferable       |
| bugfix           | org-internal   | Bug context is org-specific              |
| feature          | org-internal   | Feature work is org-specific             |
| refactor         | org-internal   | Codebase restructuring is org-specific   |
| decision         | org-internal   | Architectural decisions are org-specific |

### Scope Object

Attached to every observation and SAGA sync document:

```typescript
interface SagaScope {
  originSystemUrl: string // "https://spoke.epicflowstate.ai"
  originSystemId: string // "flowstate-derp-marcus-01"
  originOrgId: string // "d7r-LLC"
  syncPolicy: SagaSyncPolicy // "agent-portable" | "org-internal" | "org-confidential" | "public"
  lastSyncedAt?: string // ISO 8601
}
```

### Encryption by Scope

| Scope            | Encrypted           | Synced to Hub | Replicated Cross-Org |
| ---------------- | ------------------- | ------------- | -------------------- |
| agent-portable   | No (public content) | Yes           | Yes                  |
| public           | No                  | Yes           | Yes                  |
| org-internal     | Yes (org key)       | No            | No                   |
| org-confidential | Yes (org key)       | No            | No                   |

Org-internal and org-confidential memory stays in the DERP's local storage, encrypted with the org's encryption key. It is included in SAGA exports (per the SAGA data classification and redaction protocol, spec Section 13.5) but never synced through the hub.

## Full Memory Data Flow

### Architecture

```
                                  SAGA Hub
                            (agents.epicflowstate.ai)
                                D1 + rxdb-d1
                           ┌──────────────────┐
                           │  saga_memories    │
                           │  saga_skills      │
                           │  saga_task_summ.  │
                           │  saga_agent_state │
                           │  saga_sync_log    │
                           └────────┬─────────┘
                                    │
                  ┌─────────────────┼──────────────────┐
                  │ push/pull       │ push/pull         │ hub-hub
                  │ (rxdb-d1)       │ (rxdb-d1)         │ federation
                  ▼                 ▼                   ▼
        ┌──────────────┐   ┌──────────────┐    ┌──────────────┐
        │ DERP: Marcus │   │ DERP: Marcus │    │ External Hub │
        │ @ FlowState  │   │ @ CanMonkey  │    │ (future)     │
        │              │   │              │    └──────────────┘
        │ ┌──────────┐ │   │ ┌──────────┐ │
        │ │Sync Svc  │◄├───├─┤Sync Svc  │ │
        │ │(realtime) │ │   │ │(realtime) │ │
        │ └─────┬────┘ │   │ └─────┬────┘ │
        │       │      │   │       │      │
        │ ┌─────▼────┐ │   │ ┌─────▼────┐ │
        │ │Collectors │ │   │ │Collectors │ │
        │ │ claude-   │ │   │ │ claude-   │ │
        │ │ code/mem/ │ │   │ │ code/mem  │ │
        │ │ flowstate │ │   │ │           │ │
        │ └─────┬────┘ │   │ └─────┬────┘ │
        │       │      │   │       │      │
        │ ┌─────▼────┐ │   │ ┌─────▼────┐ │
        │ │ Agent    │ │   │ │ Agent    │ │
        │ │ Memory   │ │   │ │ Memory   │ │
        │ │(SurrealDB)│ │   │ │(SurrealDB)│ │
        │ └──────────┘ │   │ └──────────┘ │
        └──────────────┘   └──────────────┘
```

### Step 1: Local Collection (inside DERP)

Two trigger modes:

**Real-time (PostToolUse hook):** Every tool use captured by `flowstate-agent-memory`. The observation is synthesized via Ollama (type, title, narrative, facts, concepts) and stored in SurrealDB with a `sagaScope` attached. This already works.

**Batch (Stop hook / session end):** The `saga collect` command runs inside the DERP, pulling from all local sources:

- claude-code native: reads `~/.claude/` filesystem
- claude-mem: reads `~/.claude-mem/claude-mem.db` SQLite
- flowstate-agent-memory: hits `localhost:7090` HTTP API
- project-claude: reads `.claude/` directories in workspace

Batch collection produces `PartialSagaDocument` objects that are assembled and fed to the sync client.

### Step 2: Scope Classification

Observations are classified at creation time by `scope-classifier.ts`. The sync policy is immutable after creation. The collector preserves the existing classification when reading from sources.

For claude-mem observations (which don't have a sagaScope): the collector applies classification at extraction time using the same rules (discovery/pattern -> agent-portable, others -> org-internal).

### Step 3: Sync Push (spoke -> hub)

The `SagaSyncClient` (from `@epicdm/flowstate-saga-sync`) pushes agent-portable data to the hub using the rxdb-d1 REST protocol:

```
POST {hubUrl}/api/saga/sync/saga_memories/set
Authorization: Bearer {saga-system-token}
Body: { documents: [...] }
```

The sync client's collectors filter by `syncPolicy`:

- `collectMemories()` only includes `agent-portable` and `public` observations
- `collectSkills()` same filtering
- `collectTaskSummary()` aggregated stats (always agent-portable)

Hub-side validation (`validateSagaPush()`) enforces:

- Scope is present on every document
- syncPolicy matches the system's registered export policy
- System ID matches the authenticated token

Push results are logged to `saga_sync_log` for audit.

### Step 4: Hub Storage

The hub stores SAGA documents in D1 via seven rxdb-d1 collections (built in Phase 1):

| Collection           | Contents                                                    |
| -------------------- | ----------------------------------------------------------- |
| saga_memories        | Episodic, semantic, procedural memories with scope metadata |
| saga_skills          | Verified and self-reported skills with endorsements         |
| saga_task_summaries  | Aggregate completion stats per agent per system             |
| saga_agent_state     | Agent identity, wallet, profile, sync metadata              |
| saga_system_registry | Registered spoke systems with export policies               |
| saga_sync_log        | Audit trail for all sync operations                         |
| saga_hub_peers       | Federation peer tracking                                    |

### Step 5: Sync Pull (hub -> spoke)

When Marcus starts a session in any DERP:

**On login:** `pullOnLogin()` hydrates cross-system context:

1. Creates `SagaSyncClient` with the DERP's config
2. Pulls all three collections using checkpoint-based pagination
3. Converts memories and skills to local knowledge items via importers
4. Agent starts with full cross-system awareness

**Periodic:** The sync scheduler polls for updates (configurable interval, default 5 minutes).

**Hub-side filtering:** `filterForExport()` enforces per-system allow/block sharing policies on pull.

### Step 6: Real-Time Replication (New)

The periodic polling model is insufficient for the cross-DERP awareness use case ("Hey Marcus, what are you working on?"). A real-time sync service runs alongside the collectors inside each DERP.

#### Sync Service Architecture

```
┌─────────────────────────────────────┐
│ DERP: Sync Service                  │
│                                     │
│  ┌─────────────┐  ┌──────────────┐  │
│  │ Push Stream  │  │ Pull Stream  │  │
│  │ (debounced)  │  │ (WebSocket)  │  │
│  └──────┬──────┘  └──────┬───────┘  │
│         │                │          │
│    ┌────▼─────┐    ┌─────▼────┐     │
│    │Collectors │    │Importers │     │
│    │(local src)│    │(hub data)│     │
│    └────┬─────┘    └─────┬────┘     │
│         │                │          │
│    ┌────▼────────────────▼────┐     │
│    │   Local Memory Store     │     │
│    │   (SurrealDB / SQLite)   │     │
│    └──────────────────────────┘     │
└─────────────────────────────────────┘
```

**Push stream:** When a new observation is stored locally (via PostToolUse), the sync service debounces and pushes agent-portable items to the hub within seconds. Uses the existing `SagaSyncClient.push()` method.

**Pull stream:** A persistent connection (WebSocket or Server-Sent Events) to the hub receives real-time notifications when new data arrives for this agent from other systems. On notification, the service fetches the new documents and imports them into local storage.

**Implementation options for the pull stream:**

- **WebSocket on the hub's relay server:** The SAGA server already has a relay system (packages/server/src/relay/). Extend it with a SAGA memory channel.
- **SSE from the sync endpoint:** Simpler. The hub emits SSE events on the saga sync route when new documents arrive for an agent.
- **Polling with short interval:** Fallback. Reduce poll interval to 5-10 seconds for near-real-time without new infrastructure. Less efficient but works immediately.

The recommended approach is **SSE from the hub sync endpoint**, with polling as a fallback for environments where SSE is unavailable.

### Step 7: Cross-Org Scenarios

**Marcus at CanMonkey (unregistered org):**

- CanMonkey runs a DERP with the SAGA collector and sync service
- Memory is classified with CanMonkey's orgId
- If CanMonkey is not a registered SAGA system, push fails gracefully; memory stays local
- If CanMonkey later registers with the SAGA hub, historical agent-portable memory can be synced retroactively

**Marcus at CanMonkey (registered org):**

- CanMonkey's spoke authenticates with the hub via wallet-based SAGA token
- Agent-portable memory pushes through
- Marcus pulls FlowState portable memory into CanMonkey DERP
- Org-internal CanMonkey memory stays in CanMonkey's DERP, encrypted with CanMonkey's org key
- Org-internal FlowState memory stays in FlowState's DERP, encrypted with FlowState's org key

**"What are you working on?" response pipeline:**

1. **Local memory** (current DERP): Direct query to SurrealDB for active session context
2. **Synced hub memory** (last pull): Cross-system task summaries and recent memories from other DERPs
3. **Real-time updates** (live stream): In-flight work notifications from other active DERPs

All three sources merge into a single context window for the agent's response.

## Identity Configuration

### .saga/config.json

Lives in the agent's workspace inside the DERP:

```json
{
  "agent": {
    "sagaHandle": "marcus-chen",
    "sagaWallet": "0x...",
    "chain": "eip155:8453",
    "orgHandle": "d7r-LLC"
  },
  "hub": {
    "url": "https://agents.epicflowstate.ai",
    "systemId": "flowstate-derp-marcus-01",
    "systemUrl": "https://spoke.epicflowstate.ai"
  },
  "sync": {
    "pushDebounceMs": 2000,
    "pullIntervalMs": 300000,
    "realtimeEnabled": true,
    "realtimeMode": "sse"
  },
  "identity": {
    "flowstateTeamMemberId": "team_UfL4H7z2R6",
    "flowstateOrgId": "epic",
    "flowstateWorkspaceId": "flowstate"
  },
  "collectors": {
    "claude-mem": {
      "dbPath": "~/.claude-mem/claude-mem.db"
    },
    "flowstate-memory": {
      "url": "http://localhost:7090"
    },
    "project-claude": {
      "paths": ["/agent", "~/.claude"]
    }
  }
}
```

### Identity Resolution

- **SAGA identity**: `sagaHandle` + `sagaWallet` populate the SAGA document identity layer
- **FlowState identity**: `flowstateTeamMemberId` scopes observation queries
- **Hub identity**: `systemId` authenticates with the hub for sync operations
- **Org context**: `orgHandle` (SAGA) maps to `flowstateOrgId` (FlowState)

## DERP Integration

### DERP Lifecycle Hooks

The collector and sync service map to DERP lifecycle phases:

| DERP Phase   | Action                                                       | Component                       |
| ------------ | ------------------------------------------------------------ | ------------------------------- |
| Activating   | Restore workspace snapshot, load .saga/config.json           | DERP runtime                    |
| Online       | Start sync service, `pullOnLogin()` for cross-system context | Sync service                    |
| Working      | PostToolUse captures observations with scope classification  | Agent memory + scope classifier |
| Working      | Debounced push of agent-portable observations to hub         | Sync service (push stream)      |
| Working      | Real-time pull of cross-system updates                       | Sync service (pull stream)      |
| Idle         | Sync service stays connected, continues receiving updates    | Sync service                    |
| Deactivating | Batch `saga collect` for final extraction, final push to hub | Collectors + sync client        |
| Deactivating | Stop sync service, close connections                         | Sync service                    |
| Dormant      | Workspace snapshot preserves all local memory                | DERP runtime                    |

### Container Architecture (OpenClaw DERP)

```
docker-compose.local.yml
  |
  +-- openclaw (Marcus's DERP)
  |     Port: 18789
  |     Volumes: /agent (workspace)
  |     Installed: saga CLI, collectors, sync service
  |     Config: /agent/.saga/config.json
  |     Hooks: PostToolUse (observation capture), Stop (batch collect + final push)
  |     Service: saga-sync-service (background process for real-time push/pull)
  |
  +-- flowstate-agent-memory
  |     Port: 7090
  |     Depends: surrealdb, redis, ollama
  |     Role: Local observation synthesis and storage
  |
  +-- surrealdb
  |     Port: 8000
  |     Storage: Agent observations with vectors
  |
  +-- redis
  |     Port: 6379
  |     Role: Async observation processing queue
  |
  +-- ollama
        Port: 11434
        Models: llama3.2 (synthesis), nomic-embed-text (embeddings)
```

### Dockerfile Changes

Add to `docker/Dockerfile.openclaw`:

```dockerfile
# Install SAGA tools
RUN npm install -g @epicdm/saga-cli @epicdm/saga-collectors
```

The sync service runs as a background process started by the DERP's activation script, not as a separate container. It lives in the same process space as the agent for direct filesystem and API access.

## Collector Implementation

All collectors live in `@epicdm/saga-collectors` (saga-standard/packages/collectors/).

### New Directory Structure

```
packages/collectors/src/
  claude-mem/
    detector.ts          -- Check ~/.claude-mem/claude-mem.db exists
    extractor.ts         -- ClaudeMemCollector class
    scanner.ts           -- Query table counts
    parsers/
      observations.ts    -- Query and categorize observations
      sessions.ts        -- Query sessions with summaries
      knowledge.ts       -- Aggregate concepts into semantic domains
  flowstate-memory/
    detector.ts          -- HTTP health check to memory service
    extractor.ts         -- FlowstateMemoryCollector class
    scanner.ts           -- Search API count queries
    client.ts            -- HTTP client for memory API
  project-claude/
    detector.ts          -- Scan for .claude/ directories
    extractor.ts         -- ProjectClaudeCollector class
    scanner.ts           -- Count agent profiles, rules, settings
    parsers/
      agents.ts          -- Parse agent role markdown files
      rules.ts           -- Parse rules markdown files
      settings.ts        -- Parse settings JSON
      commands.ts        -- Parse custom command definitions
```

### Collector Interface

All follow the existing `SagaCollector` interface:

```typescript
interface SagaCollector {
  readonly source: string
  detect(homeDir?: string): Promise<CollectorDetection>
  scan(homeDir?: string): Promise<CollectorScan>
  extract(options?: ExtractOptions): Promise<PartialSagaDocument>
}
```

### Scope Classification in Collectors

For sources that don't natively have sagaScope (claude-mem, claude-code native):

The collector applies the same classification rules at extraction time:

- observation type `discovery`, `pattern` -> `agent-portable`
- observation type `bugfix`, `feature`, `refactor`, `decision` -> `org-internal`

This ensures all memory entering the sync pipeline has a scope, regardless of source.

## Sync Service

A new component that runs inside the DERP alongside the agent. Bridges collectors to the hub sync protocol.

### Package Location

`saga-standard/packages/saga-sync-service/` (new package)

OR extend `saga-standard/packages/cli/` with a `saga sync-service` subcommand.

### Responsibilities

1. Start on DERP activation, stop on deactivation
2. Run `pullOnLogin()` at startup
3. Watch for new local observations (poll flowstate-agent-memory, or subscribe to its events)
4. Debounce and push agent-portable observations to hub
5. Maintain SSE connection to hub for real-time pull
6. Import received cross-system memories into local knowledge store
7. Handle auth token refresh (SAGA system token, 1-hour expiry)
8. Persist sync checkpoints across DERP restarts (in workspace)

### Configuration

Read from `/agent/.saga/config.json` (see Identity Configuration section above).

## Embedding Portability

FlowState agent memory uses `nomic-embed-text` (768 dimensions, cosine distance). The collector preserves this in the SAGA long-term memory layer:

```typescript
longTerm: {
  type: "vector-store",
  embeddingModel: "nomic-embed-text",
  dimensions: 768,
  vectorCount: 1234,
  storageRef: { type: "inline", data: "<base64>" }
}
```

Importing platforms can use the same model or re-embed from text content.

## Deduplication

Multiple collectors may capture overlapping data (e.g., claude-mem and flowstate-agent-memory both observing the same tool use).

1. **Content hash dedup**: Both sources use content hashing. The collector preserves hashes so the assembler deduplicates.
2. **Timestamp + similarity merging**: Events with identical timestamps and similar facts (Jaccard similarity) are merged.
3. **Source priority**: `flowstate-memory > claude-mem > claude-code` (flowstate-memory has richer structure and embeddings).

## Error Handling

| Scenario                     | Behavior                                      |
| ---------------------------- | --------------------------------------------- |
| claude-mem DB not found      | Collector returns `{ found: false }`, skipped |
| flowstate-memory unreachable | Collector returns `{ found: false }`, skipped |
| Hub unreachable during push  | Queue locally, retry on next cycle            |
| SSE connection drops         | Reconnect with exponential backoff            |
| Partial API failure          | Collect what's available, log warnings        |
| Schema version mismatch      | Log warning, best-effort extraction           |
| Auth token expired           | Refresh via wallet challenge/signature        |

## Testing Strategy

| Component                  | Test approach                                                                  |
| -------------------------- | ------------------------------------------------------------------------------ |
| claude-mem collector       | Test SQLite DB with known observations, verify extraction                      |
| flowstate-memory collector | Mock HTTP responses, verify API calls and layer mapping                        |
| project-claude collector   | Temp .claude/ directories with test files, verify parsing                      |
| Scope classification       | Verify observation types map to correct sync policies                          |
| Sync service push          | Mock hub endpoint, verify debounce timing and payload shape                    |
| Sync service pull (SSE)    | Mock SSE stream, verify import into local store                                |
| End-to-end                 | Collector -> classifier -> sync push -> hub store -> sync pull -> local import |

## Dependencies

### saga-standard packages

- `@epicdm/saga-collectors`: Add three new collectors. No new npm deps (better-sqlite3 exists, fetch is built-in).
- `@epicdm/saga-cli`: Already has `saga collect` command. Add `saga sync-service` subcommand.

### epic-flowstate packages (already built)

- `@epicdm/flowstate-saga-sync`: Sync client, collectors, importers (Phase 2 complete)
- `@epicdm/flowstate-agent-memory`: Observation capture with scope classification (Phase 2 complete)
- `@epicdm/flowstate-rxdb-d1`: Push validation, export filtering (Phase 2 complete)

### Container

- OpenClaw Dockerfile gets `saga-cli` and `saga-collectors` installed globally
- Sync service runs as background process in the DERP
- Network access to flowstate-agent-memory (localhost:7090) and SAGA hub (agents.epicflowstate.ai)

## What's New vs. What Exists

| Component                             | Status  | Where                                     |
| ------------------------------------- | ------- | ----------------------------------------- |
| Hub D1 tables                         | Built   | flowstate-rxdb-d1 (Phase 1)               |
| Spoke sync client                     | Built   | flowstate-saga-sync (Phase 2)             |
| Memory/skill/task collectors for sync | Built   | flowstate-saga-sync/collectors (Phase 2)  |
| Knowledge importers                   | Built   | flowstate-saga-sync/importers (Phase 2)   |
| Scope classifier                      | Built   | flowstate-agent-memory (Phase 2)          |
| Push validation + export filter       | Built   | flowstate-rxdb-d1/worker/saga (Phase 2)   |
| Pull-on-login                         | Built   | flowstate-saga-sync (Phase 2)             |
| Hub sync endpoint                     | Planned | flowstate-platform/directory (Phase 3)    |
| claude-mem collector                  | **New** | saga-standard/packages/collectors         |
| flowstate-memory collector            | **New** | saga-standard/packages/collectors         |
| project-claude collector              | **New** | saga-standard/packages/collectors         |
| Sync service (real-time)              | **New** | saga-standard/packages/cli or new package |
| SSE endpoint on hub                   | **New** | flowstate-platform/directory              |
| OpenClaw DERP integration             | **New** | epic-flowstate/docker/                    |
| .saga/config.json schema              | **New** | saga-standard/packages/sdk                |

## Scope Boundaries

### In scope

- Three new collectors (claude-mem, flowstate-memory, project-claude) in saga-standard
- Sync service for real-time push/pull inside the DERP
- SSE endpoint on the hub for real-time notifications
- OpenClaw Dockerfile and entrypoint modifications
- .saga/config.json schema and loading
- DERP lifecycle hook integration

### Out of scope

- Hub-hub federation (Phase 5 of sync protocol)
- On-chain identity registration (already exists)
- claude-mem Chroma vector DB extraction (SQLite is sufficient)
- Bidirectional memory editing (read-only pull; local writes go through collectors)
- SAGA App mobile client sync (separate effort, uses same hub API)
