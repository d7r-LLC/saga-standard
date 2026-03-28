# SAGA Collectors: claude-mem, FlowState Agent Memory, and Project Claude

**Date:** 2026-03-28
**Status:** Design
**Scope:** `@epicdm/saga-collectors` package + OpenClaw container integration

## Overview

Extend the existing `@epicdm/saga-collectors` package with three new collectors that capture AI agent memory from different sources and map it into the SAGA portable document format. Integrate the collectors into the OpenClaw Docker container so Marcus (and other FlowState agents) automatically export memory to SAGA after each session.

## Data Sources

### 1. claude-mem (Direct SQLite)

**What it is:** A Claude Code plugin that captures observations, session summaries, and vector embeddings from Claude Code sessions. Stores data in `~/.claude-mem/claude-mem.db` (SQLite) and `~/.claude-mem/vector-db/` (Chroma).

**Access method:** Direct SQLite reads via `better-sqlite3` (already a dependency).

**Tables:**

- `observations` - Typed observations (bugfix, feature, decision, discovery, refactor, change) with title, narrative, facts, concepts, files_read, files_modified, discovery_tokens
- `sdk_sessions` - Session records with content_session_id, memory_session_id, project, status
- `session_summaries` - AI-generated session summaries (request, investigated, learned, completed, next_steps)
- `user_prompts` - FTS5-indexed user prompts

**Schema version:** 20 (tracked via `schema_versions` table).

### 2. FlowState Agent Memory (HTTP API)

**What it is:** A hook-driven agent memory service (`@epicdm/flowstate-agent-memory`) that captures observations from Claude Code tool use, synthesizes them via Ollama, and stores them in SurrealDB with vector embeddings.

**Access method:** HTTP API at configurable URL (default `http://localhost:7090`).

**API routes used:**

- `POST /api/memory/search` - Hybrid vector + BM25 search with scope filtering
- `POST /api/memory/timeline` - Chronological context around an anchor observation
- `POST /api/memory/get` - Fetch full observations by IDs

**Data model:**

- `AgentObservation` - Typed observations with 768-dim nomic-embed-text vectors, scoped by orgId/workspaceId/codebaseId/agentId
- `AgentSession` - Session lifecycle with summaries (request, investigated, learned, completed, nextSteps)

### 3. Project Claude Files (Filesystem)

**What it is:** Claude Code project configuration stored in `.claude/` directories within codebases and at `~/.claude/` globally. Contains agent role definitions, behavioral rules, settings, and project-specific instructions.

**Access method:** Filesystem reads.

**File sources:**

- `.claude/agents/*.md` - Agent role profiles (persona, team member ID, responsibilities)
- `.claude/rules/*.md` - Behavioral rules and guidelines
- `.claude/settings.json` / `.claude/settings.local.json` - Model configuration, allowed tools
- `CLAUDE.md` (project root) - Project-specific system prompt
- `.claude/commands/` - Custom slash commands (skill definitions)

## Collector Architecture

All three collectors follow the existing `SagaCollector` interface:

```typescript
interface SagaCollector {
  readonly source: string
  detect(homeDir?: string): Promise<CollectorDetection>
  scan(homeDir?: string): Promise<CollectorScan>
  extract(options?: ExtractOptions): Promise<PartialSagaDocument>
}
```

Registered in the same `packages/collectors/src/registry.ts` alongside `claude-code` and `openclaw`.

### New Directory Structure

```
packages/collectors/src/
  claude-mem/
    detector.ts          - Check ~/.claude-mem/claude-mem.db exists
    extractor.ts         - ClaudeMemCollector class
    scanner.ts           - Query table counts
    parsers/
      observations.ts    - Query and categorize observations
      sessions.ts        - Query sessions with summaries
      knowledge.ts       - Aggregate concepts into semantic domains
  flowstate-memory/
    detector.ts          - HTTP health check to memory service
    extractor.ts         - FlowstateMemoryCollector class
    scanner.ts           - Search API count queries
    client.ts            - HTTP client for memory API
  project-claude/
    detector.ts          - Scan for .claude/ directories
    extractor.ts         - ProjectClaudeCollector class
    scanner.ts           - Count agent profiles, rules, settings
    parsers/
      agents.ts          - Parse agent role markdown files
      rules.ts           - Parse rules markdown files
      settings.ts        - Parse settings JSON
      commands.ts        - Parse custom command definitions
```

## SAGA Layer Mapping

### claude-mem -> SAGA Layers

| claude-mem source                                        | SAGA layer                         | Details                                                                          |
| -------------------------------------------------------- | ---------------------------------- | -------------------------------------------------------------------------------- |
| `observations` (type: bugfix, feature, decision, change) | `memory.episodic`                  | Each observation -> episodic event with timestamp, type, title, narrative, facts |
| `observations` (type: pattern)                           | `memory.procedural`                | Learned workflows and repeatable processes                                       |
| `observations` (type: discovery, refactor)               | `memory.semantic`                  | Knowledge domains extracted from concepts field                                  |
| `observations.concepts` (aggregated)                     | `memory.semantic.knowledgeDomains` | Frequency-weighted concept list -> expertise domains                             |
| `sdk_sessions` + `session_summaries`                     | `taskHistory.recentTasks`          | Each session -> task entry with request/outcome/learnings                        |
| Session count, observation type distribution             | `taskHistory.summary`              | Aggregate statistics                                                             |

### FlowState Agent Memory -> SAGA Layers

| FlowState source                                     | SAGA layer                         | Details                                                       |
| ---------------------------------------------------- | ---------------------------------- | ------------------------------------------------------------- |
| `AgentObservation` (type: bugfix, feature, decision) | `memory.episodic`                  | Same mapping as claude-mem observations                       |
| `AgentObservation` (type: pattern)                   | `memory.procedural`                | Workflows                                                     |
| `AgentObservation` (type: discovery, refactor)       | `memory.semantic`                  | Knowledge domains                                             |
| `AgentObservation.concepts` (aggregated)             | `memory.semantic.knowledgeDomains` | Expertise domains                                             |
| `AgentObservation.embedding` (768-dim)               | `memory.longTerm`                  | Vector store with model metadata (nomic-embed-text, 768 dims) |
| `AgentSession` + summaries                           | `taskHistory.recentTasks`          | Session -> task mapping                                       |
| `AgentObservation.facts` (aggregated)                | `memory.semantic.facts`            | Factual knowledge base                                        |

### Project Claude -> SAGA Layers

| .claude/ source                        | SAGA layer               | Details                                          |
| -------------------------------------- | ------------------------ | ------------------------------------------------ |
| `.claude/agents/*.md`                  | `persona`                | Agent name, role description, personality traits |
| `.claude/agents/*.md` (team member ID) | `relationships`          | Team membership, organization context            |
| `.claude/rules/*.md`                   | `cognitive.systemPrompt` | Rules concatenated as system prompt components   |
| `.claude/settings.json`                | `cognitive.parameters`   | Model name, temperature, allowed/denied tools    |
| `CLAUDE.md` (project root)             | `cognitive.systemPrompt` | Project-specific behavioral instructions         |
| `.claude/commands/`                    | `skills.selfReported`    | Custom command definitions as skill declarations |

## Identity Scoping

The collectors bridge between FlowState identity and SAGA identity:

### Configuration

A `.saga/config.json` in the agent's workspace provides identity mapping:

```json
{
  "agent": {
    "sagaHandle": "marcus.saga",
    "sagaWallet": "0x...",
    "orgHandle": "epic.saga"
  },
  "collectors": {
    "flowstate-memory": {
      "url": "http://localhost:7090",
      "flowstateTeamMemberId": "team_marcus_xxx",
      "flowstateOrgId": "epic",
      "flowstateWorkspaceId": "flowstate",
      "flowstateCodebaseId": "epic-flowstate"
    },
    "claude-mem": {
      "dbPath": "~/.claude-mem/claude-mem.db"
    },
    "project-claude": {
      "paths": ["/agent", "~/.claude"]
    }
  }
}
```

### Identity Resolution

- **SAGA identity**: `sagaHandle` and `sagaWallet` populate the SAGA document's identity layer
- **FlowState identity**: `flowstateTeamMemberId` scopes observation queries to the correct agent
- **Organization context**: `orgHandle` (SAGA) and `flowstateOrgId` (FlowState) link the agent to its org in both systems

When running inside the OpenClaw container, the agent's SAGA wallet can be derived from its registered identity (stored in the container's environment or a local keyfile).

## Embedding Portability

FlowState agent memory uses `nomic-embed-text` (768 dimensions, cosine distance). The collector preserves this in the SAGA long-term memory layer:

```typescript
longTerm: {
  type: "vector-store",
  embeddingModel: "nomic-embed-text",
  dimensions: 768,
  vectorCount: 1234,
  storageRef: { type: "inline", data: "<base64 encoded vectors>" },
  // For large stores, use IPFS: { type: "ipfs", cid: "Qm..." }
}
```

Importing platforms can either:

1. Use the same embedding model directly
2. Re-embed from the text content stored in episodic/semantic/procedural sub-layers

## OpenClaw Container Integration

### Dockerfile Changes

Add to `docker/Dockerfile.openclaw`:

```dockerfile
# Install SAGA collectors and CLI
RUN npm install -g @epicdm/saga-cli @epicdm/saga-collectors
```

### Hook Configuration

Add a Stop hook to the OpenClaw agent's hook config:

```json
{
  "hooks": {
    "Stop": [
      {
        "type": "command",
        "command": "saga collect --source claude-code --source flowstate-memory --output /agent/.saga-partials/"
      }
    ]
  }
}
```

### Collection Flow

```
Marcus completes a coding session
  |
  v
Stop hook fires
  |
  v
saga collect runs inside the container
  |-- claude-code collector: reads /agent/.claude/ (Marcus's local state)
  |-- flowstate-memory collector: hits http://localhost:7090 (agent-memory service)
  |
  v
Writes PartialSagaDocuments to /agent/.saga-partials/
  |
  v
(Optional) saga export --type backup
  |-- Assembles partials into a single SagaDocument
  |-- Signs with Marcus's wallet
  |-- Packages as .saga container
```

### Container Architecture

```
docker-compose.local.yml
  |
  +-- openclaw (Marcus)
  |     Port: 18789
  |     Volumes: /agent (workspace)
  |     Has: saga CLI, collectors, .saga/config.json
  |     Stop hook: saga collect
  |
  +-- flowstate-agent-memory
  |     Port: 7090
  |     Depends: surrealdb, redis, ollama
  |     Receives: PostToolUse observations from Marcus
  |
  +-- surrealdb
  |     Port: 8000
  |     Storage: agent observations + vectors
  |
  +-- redis
  |     Port: 6379
  |     Role: async processing queue
  |
  +-- ollama
        Port: 11434
        Models: llama3.2, nomic-embed-text
```

## Deduplication

Multiple collectors may capture overlapping data. The assembler handles this:

1. **Content hash dedup**: Both claude-mem and flowstate-memory use content hashing. The collector preserves these hashes so the assembler can deduplicate across sources.
2. **Timestamp-based merging**: Episodic events with identical timestamps and similar content (Jaccard similarity on facts) are merged.
3. **Source priority**: Configurable via `saga export --source-priority flowstate-memory,claude-mem,claude-code`. FlowState memory is recommended as primary since it has richer observation structure and embeddings.

## Error Handling

| Scenario                                     | Behavior                                                |
| -------------------------------------------- | ------------------------------------------------------- |
| claude-mem DB not found                      | Collector returns `{ found: false }` in detect, skipped |
| flowstate-memory service unreachable         | Collector returns `{ found: false }` in detect, skipped |
| Partial API failure (some observations fail) | Collect what's available, log warnings, continue        |
| SQLite schema version mismatch               | Log warning, attempt best-effort extraction             |
| Empty results (no observations)              | Return empty layers, not an error                       |

## Testing Strategy

Each collector gets unit tests following the existing pattern:

- **claude-mem**: Create test SQLite DB with known observations, verify extraction
- **flowstate-memory**: Mock HTTP responses, verify correct API calls and layer mapping
- **project-claude**: Create temp `.claude/` directories with test files, verify parsing
- **Integration**: End-to-end test that runs all collectors and verifies assembled document

## Dependencies

### New dependencies for `@epicdm/saga-collectors`

- None. `better-sqlite3` is already a dependency. HTTP fetch is built into Node.js.

### Container dependencies

- `@epicdm/saga-cli` installed globally in OpenClaw container
- Network access from OpenClaw container to flowstate-agent-memory container (same Docker network)

## Scope Boundaries

### In scope

- Three new collectors (claude-mem, flowstate-memory, project-claude)
- Registration in existing collector registry
- CLI `saga collect` auto-discovery of new collectors
- OpenClaw Dockerfile modifications
- Stop hook configuration for auto-collection
- `.saga/config.json` identity mapping

### Out of scope

- SAGA hub upload (already exists in CLI as `saga export`)
- On-chain identity registration (already exists)
- Real-time streaming collection (batch only)
- claude-mem Chroma vector DB extraction (SQLite observations are sufficient; vectors can be re-embedded)
- Bidirectional sync (SAGA -> FlowState)
