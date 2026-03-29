> **FlowState Document:** `docu_wgvLA_Va-l`

# SAGA Sync Protocol: Federated RxDB-Based Knowledge Synchronization

> **For agentic workers:** RECOMMENDED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable SAGA agents to accumulate scoped experiences across multiple SAGA-compliant systems and synchronize portable knowledge through a federated network of SAGA hubs. Hubs register with a global registry at `registry.saga-standard.dev`, replicate agent data between each other, and accept pushes from host systems (spokes). Push/pull with polling for now; realtime sync later.

**Problem:** The SAGA v1.0 spec defines transfer (destructive) and clone (snapshot). Neither models agents living across multiple systems with ongoing synchronization. A single central directory creates a single point of control. The SAGA ecosystem needs federation: multiple hubs operated by different organizations, replicating agent data between them so agents can move freely.

**Key Insight:** The `flowstate-rxdb-d1` package implements a complete RxDB-to-D1 replication system. RxDB replication works identically whether the remote endpoint is a spoke pushing to a hub, or a hub syncing with another hub. The same checkpoint-based push/pull protocol handles both cases. Federation is just replication between peers instead of client-to-server.

**Tech Stack:** RxDB (replication protocol), Drizzle ORM / D1 (storage), Hono (workers), Cloudflare Durable Objects (broadcast), `flowstate-rxdb-d1` (sync engine), vitest (testing)

**Reference:** SAGA v1.0 spec (Sections 13, 15, 17), `epic-flowstate/packages/flowstate-rxdb-d1`, `saga-standard/packages/server`

---

## Three-Tier Architecture

```
Tier 1: Global Registry                 registry.saga-standard.dev
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   Hub discovery, trust anchoring, agent handle resolution
   "Where is agent marcus.chen registered? Which hubs carry his data?"

               │                              │
               ▼                              ▼
Tier 2: SAGA Hubs              Hub A                    Hub B
━━━━━━━━━━━━━━━━━━         (FlowState Dir)          (Client Corp Dir)
   Agent state,          agents.epicflowstate.ai    agents.clientcorp.com
   cross-hub repl,
   export policies       ◄────── hub-hub sync ──────►

          │         │                    │         │
          ▼         ▼                    ▼         ▼
Tier 3: Spokes    Spoke 1    Spoke 2   Spoke 3   Spoke 4
━━━━━━━━━━━━━━   (FS runtime) (FS app) (CC prod) (CC staging)
   Where agents
   actually work   push ▲     push ▲    push ▲    push ▲
                        │          │         │         │
                   agent work  agent work agent work agent work
```

### Tier 1: Global Registry (`registry.saga-standard.dev`)

The registry is NOT a hub. It doesn't store agent data. It's a discovery service and trust anchor:

- **Hub registration:** Hubs register their URL, wallet, supported chains, conformance level, and public key
- **Agent handle resolution:** Given an agent handle, returns which hub(s) carry that agent's canonical state
- **Trust anchoring:** Verifies hub identities via wallet signatures. Hubs that violate policies can be flagged/removed
- **Hub discovery:** Systems looking for a hub to connect to can browse registered hubs by region, conformance level, or chain support

The registry is a thin Hono/D1 Cloudflare Worker. Minimal surface area. It's the DNS of SAGA.

### Tier 2: SAGA Hubs

Hubs are the core infrastructure. Each hub:

- Stores canonical SAGA agent state (identity, memories, skills, task summaries)
- Accepts replication pushes from spokes (host systems where agents work)
- Serves pull requests to spokes (agent knowledge on demand)
- Replicates with other hubs (federation)
- Enforces export policies (what can leave, where it can go)
- Runs a `flowstate-rxdb-d1` instance with SAGA collections

An agent has ONE home hub (where they registered). But their data can replicate to other hubs via hub-hub sync. The home hub is authoritative for the agent's identity.

### Tier 3: Spokes (Host Systems)

Where agents actually work. Each spoke:

- Runs its own local store (optionally a `flowstate-rxdb-d1` instance)
- Authenticates agents via their hub (wallet-based or OIDC bridge)
- Creates scoped data as agents work (memories, skills, task completions)
- Pushes agent-portable data to the agent's home hub
- Pulls cross-system knowledge from the hub on agent login

---

## Hub-Hub Federation

### How Hubs Find Each Other

1. Hub A registers with `registry.saga-standard.dev`
2. Hub B registers with `registry.saga-standard.dev`
3. Hub A wants to federate with Hub B (because agents move between their spokes)
4. Hub A queries the registry for Hub B's URL and public key
5. Hub A sends a federation request to Hub B (signed with Hub A's wallet)
6. Hub B verifies Hub A via the registry, accepts the federation
7. Both hubs store each other in their `saga_hub_peers` collection
8. RxDB replication begins between them for shared agent data

### What Replicates Between Hubs

Not everything. Hubs replicate agent data only when:

1. An agent registered on Hub A authenticates into a spoke connected to Hub B
2. Hub B doesn't have that agent's data yet
3. Hub B requests the agent's portable data from Hub A (via RxDB pull)
4. Hub A applies export policies and sends filtered data

This is **lazy federation**. Hubs don't replicate everything to everywhere. They replicate agent data on demand, when an agent actually moves between ecosystems.

### Replication Direction

```
Hub A ──── hub-hub replication ────► Hub B
      (agent-portable data only)

Direction: The hub that needs the data pulls from the hub that has it.
Both hubs can push updates back for agents they share.
```

For shared agents (agents that have worked in both ecosystems):

```
Hub A ◄──── bidirectional sync ────► Hub B
      (for agents registered on either hub
       that have worked in the other's spokes)
```

### Conflict Resolution Across Hubs

- **Agent identity:** Home hub is authoritative. Handle, wallet, public key come from the home hub only.
- **Memories:** Append-only across hubs. Memories from Hub A's spokes and Hub B's spokes coexist with different scope blocks. No conflict.
- **Skills:** Same skill verified on two hubs → keep both verifications. Display the one with higher confidence.
- **Task summaries:** Per-system aggregates. Each hub's spokes produce separate summary documents. No overlap.
- **RxDB level:** `_modified` timestamp for last-write-wins on the same document. Cross-hub documents have different IDs, so no RxDB-level conflicts.

---

## Global Registry: `registry.saga-standard.dev`

### Schema

The registry stores three collections:

#### registered_hubs

```typescript
{
  id: string                    // hub registration ID
  hubUrl: string                // e.g., "https://agents.epicflowstate.ai"
  hubName: string               // human-readable name
  walletAddress: string         // hub's signing wallet
  chain: string                 // e.g., "eip155:8453"
  publicKey: string             // for verifying hub signatures

  // Capabilities
  conformanceLevel: number      // 1, 2, or 3
  supportedChains: string[]     // JSON array
  capabilities: string[]        // ["sync", "transfer", "clone", "realtime"]
  registrationOpen: boolean     // accepting new agent registrations?

  // Metadata
  operatorName: string          // organization operating this hub
  operatorUrl: string           // operator's website
  region: string                // geographic region hint
  description: string

  // Trust
  verified: boolean             // registry has verified this hub's identity
  trustScore: number            // computed from uptime, compliance, federation history
  flagged: boolean              // policy violation flagged
  flagReason: string | null

  registeredAt: string
  lastSeenAt: string            // last health check response
  _modified: string
}
```

#### agent_handle_index

Maps agent handles to their home hub. This is the global lookup table.

```typescript
{
  id: string // handle (primary key, globally unique)
  handle: string // same as id
  homeHubId: string // FK to registered_hubs.id
  homeHubUrl: string // denormalized for fast lookup
  walletAddress: string // agent's wallet (for verification)
  chain: string
  registeredAt: string
  _modified: string
}
```

#### federation_agreements

Records which hubs have agreed to federate.

```typescript
{
  id: string
  hubAId: string                // FK to registered_hubs.id
  hubBId: string                // FK to registered_hubs.id
  status: 'pending' | 'active' | 'suspended' | 'revoked'

  // Terms
  sharingPolicy: {              // JSON
    hubAToB: {
      agentPortable: boolean
      publicOnly: boolean
      collections: string[]     // which SAGA collections to replicate
    }
    hubBToA: {
      agentPortable: boolean
      publicOnly: boolean
      collections: string[]
    }
  }

  initiatedBy: string           // which hub initiated
  initiatedAt: string
  acceptedAt: string | null
  _modified: string
}
```

### Registry API

Thin Hono worker. Minimal endpoints:

```
GET  /v1/hubs                          — List registered hubs (filterable)
POST /v1/hubs/register                 — Register a new hub (wallet-authed)
GET  /v1/hubs/:hubId                   — Get hub details
PUT  /v1/hubs/:hubId                   — Update hub info (wallet-authed, owner only)

GET  /v1/resolve/:handle               — Resolve agent handle → home hub URL
POST /v1/handles/register              — Register agent handle → hub mapping (hub-authed)
DELETE /v1/handles/:handle             — Release handle (hub-authed, for transfers)

POST /v1/federation/request            — Request federation between two hubs
GET  /v1/federation/:agreementId       — Get federation agreement status
PUT  /v1/federation/:agreementId       — Accept/reject federation (hub-authed)

GET  /v1/health                        — Registry health check
GET  /v1/stats                         — Network stats (hub count, agent count, etc.)
```

### Handle Resolution Flow

When a spoke needs to authenticate an agent:

```
1. Agent presents wallet signature to spoke
2. Spoke queries registry: GET /v1/resolve/marcus.chen
3. Registry returns: { homeHubUrl: "https://agents.epicflowstate.ai", walletAddress: "0x..." }
4. Spoke verifies wallet signature matches
5. Spoke connects to home hub for agent data
6. If spoke's hub is different from home hub, hub-hub federation kicks in
```

This is like email's MX record lookup. You don't need to know which server hosts `user@example.com`. You ask DNS, it tells you.

---

## Spoke → Hub Sync (unchanged from previous plan)

Each spoke pushes agent-portable data to its connected hub using RxDB replication. The hub runs a `flowstate-rxdb-d1` worker that accepts these pushes.

### Scope Block on Every Document

```typescript
interface SagaScope {
  originSystemUrl: string // spoke URL that created this data
  originSystemId: string // short identifier
  originOrgId: string // org ID within the spoke
  syncPolicy: 'agent-portable' | 'public' | 'org-internal' | 'org-confidential'
  lastSyncedAt: string | null
}
```

### Classification Defaults

| Data Type                              | Default syncPolicy | Travels to Hub? |
| -------------------------------------- | ------------------ | --------------- |
| Observation: discovery, pattern        | agent-portable     | Yes             |
| Observation: bugfix, feature, refactor | org-internal       | No              |
| Observation: decision                  | org-internal       | No              |
| Knowledge: PATTERN, INSIGHT, LESSON    | agent-portable     | Yes             |
| Knowledge: DIRECTIVE, REQUIREMENT      | org-internal       | No              |
| Knowledge: DECISION, ERROR             | org-internal       | No              |
| Knowledge: STRATEGY, PREFERENCE        | agent-portable     | Yes             |
| Task summary (aggregate counts)        | agent-portable     | Yes             |
| Verified skills                        | agent-portable     | Yes             |

---

## SAGA Collections (RxDB Schemas)

Used by hubs and optionally by spokes. Six collections for agent state sync, plus two for federation.

### saga_agent_state (one per agent per hub)

```typescript
{
  id: string                    // agent wallet address
  handle: string
  walletAddress: string
  chain: string
  publicKey: string | null
  homeHubUrl: string            // which hub is authoritative
  directoryUrl: string
  registrationTxHash: string | null
  parentSagaId: string | null
  cloneDepth: number
  name: string
  avatar: string | null
  headline: string | null
  bio: string | null
  profileType: 'agent' | 'human' | 'hybrid'
  currentSyncVersion: number
  lastSyncAt: string
  registeredSystems: string[]   // JSON: systemIds that have synced
  orgId: string
  workspaceId: string
  _modified: string
  _deleted: boolean
}
```

### saga_memories

```typescript
{
  id: string
  agentId: string
  memoryType: 'episodic' | 'semantic' | 'procedural'
  eventType: string | null
  summary: string
  learnings: string | null
  significance: number | null
  knowledgeDomain: string | null
  expertiseLevel: string | null
  workflowName: string | null
  workflowSteps: string | null // JSON
  scope: SagaScope // JSON
  linkedTaskId: string | null
  linkedSystemTaskId: string | null
  orgId: string
  workspaceId: string
  createdAt: string
  updatedAt: string
  _modified: string
  _deleted: boolean
}
```

### saga_skills

```typescript
{
  id: string
  agentId: string
  name: string
  category: string
  verificationType: 'verified' | 'self-reported' | 'endorsed'
  verificationSource: string | null
  verificationProof: string | null
  completionCount: number
  confidence: number
  firstVerified: string | null
  lastVerified: string | null
  endorsedByWallet: string | null
  endorsedByHandle: string | null
  endorsementSignature: string | null
  scope: SagaScope // JSON
  orgId: string
  workspaceId: string
  createdAt: string
  updatedAt: string
  _modified: string
  _deleted: boolean
}
```

### saga_task_summaries

```typescript
{
  id: string
  agentId: string
  totalCompleted: number
  totalFailed: number
  totalInProgress: number
  firstTaskAt: string
  lastTaskAt: string
  bySkill: Record<string, number> // JSON
  scope: SagaScope // JSON
  orgId: string
  workspaceId: string
  createdAt: string
  updatedAt: string
  _modified: string
  _deleted: boolean
}
```

### saga_system_registry (spoke registrations per hub)

```typescript
{
  id: string
  systemUrl: string
  systemId: string
  walletAddress: string
  chain: string
  exportPolicy: object // JSON
  sharingPolicy: object // JSON
  conformanceLevel: number
  lastSyncAt: string | null
  registeredAt: string
  orgId: string
  workspaceId: string
  _modified: string
  _deleted: boolean
}
```

### saga_sync_log

```typescript
{
  id: string
  agentId: string
  systemId: string
  direction: 'push' | 'pull' | 'hub-push' | 'hub-pull'
  collectionName: string
  documentCount: number
  checkpointBefore: string | null // JSON
  checkpointAfter: string | null // JSON
  status: 'success' | 'partial' | 'failed'
  rejectedCount: number
  rejectionReasons: string | null // JSON
  orgId: string
  workspaceId: string
  createdAt: string
  _modified: string
  _deleted: boolean
}
```

### saga_hub_peers (federation tracking per hub)

```typescript
{
  id: string
  peerHubUrl: string
  peerHubId: string             // registration ID at registry
  peerWalletAddress: string
  peerPublicKey: string
  federationAgreementId: string // from registry
  status: 'active' | 'suspended' | 'pending'
  lastReplicationAt: string | null
  sharedAgentCount: number
  replicationConfig: {          // JSON
    collections: string[]       // which SAGA collections to replicate
    pollingIntervalMs: number
    batchSize: number
  }
  orgId: string
  workspaceId: string
  _modified: string
  _deleted: boolean
}
```

---

## Implementation Plan

### Phase 1: SAGA Collections in Hub

Add RxDB schemas and Drizzle tables for SAGA data to `flowstate-rxdb-d1`.

#### Step 1.1: Drizzle Schema Tables

- [ ] Create Drizzle table definitions for all 8 SAGA collections (saga_agent_state, saga_memories, saga_skills, saga_task_summaries, saga_system_registry, saga_sync_log, saga_hub_peers)
- [ ] Export from `src/drizzle/schema/index.ts`
- [ ] Add `scope`, `exportPolicy`, `sharingPolicy`, `bySkill`, `rejectionReasons`, `checkpointBefore`, `checkpointAfter`, `replicationConfig`, `workflowSteps`, `registeredSystems` to `JSON_FIELDS`
- [ ] Register tables in `src/worker/table-resolver.ts`
- [ ] Generate and apply D1 migration

**Files:** `epic-flowstate/packages/flowstate-rxdb-d1/src/drizzle/schema/saga_*.ts`, `index.ts`, `rest-api.ts`, `table-resolver.ts`

#### Step 1.2: RxDB Schemas in db-collections

- [ ] Create RxDB schemas for all SAGA collections
- [ ] Export from `src/schemas/index.ts`
- [ ] Add collection configs to `src/defaults.ts`

**Files:** `epic-flowstate/packages/db-collections/src/schemas/saga*.ts`, `index.ts`, `defaults.ts`

#### Step 1.3: CLP and Collection Scoping

- [ ] Set CLP for each SAGA collection (agent reads own, systems push, pull filtered by ACL)
- [ ] Add collection scope definitions to `collection-scope.ts`

**Files:** `epic-flowstate/packages/flowstate-rxdb-d1/src/worker/auth/collection-scope.ts`

---

### Phase 2: Spoke → Hub Sync (FlowState as First Spoke)

Wire the FlowState runtime to push agent data to its hub.

#### Step 2.1: Auth Bridge — Wallet to RxDB Token

- [ ] `POST /api/saga/auth/token` on the FlowState directory — accept wallet challenge/signature, issue JWT
- [ ] Extend `parse-token.ts` to recognize SAGA system tokens
- [ ] System registration endpoint: `POST /api/saga/systems/register`

**Files:** `flowstate-platform/packages/directory/src/app/api/saga/auth/`, `flowstate-rxdb-d1/src/worker/auth/parse-token.ts`

#### Step 2.2: SAGA Sync Client Package

- [ ] New package `epic-flowstate/packages/flowstate-saga-sync`
- [ ] `SagaSyncClient`: push/pull using rxdb-d1 client pointed at hub URL
- [ ] Collectors: memory, skill, task-summary from FlowState's local stores
- [ ] Scope stamping and classification filtering
- [ ] Periodic sync scheduler (configurable interval, default 5 min)

**Files:** `epic-flowstate/packages/flowstate-saga-sync/src/`

#### Step 2.3: Scope Stamping on FlowState Data

- [ ] Add `scope?: SagaScope` to `AgentObservation` and `KnowledgeItem` types
- [ ] Stamp scope on creation in `ObservationCapture` and `KnowledgeStoreClient`
- [ ] Classification engine with defaults per data type

**Files:** `epic-flowstate/packages/flowstate-agent-memory/src/types.ts`, `flowstate-agents-knowledge-store/src/types.ts`

#### Step 2.4: Pull on Agent Login

- [ ] When an agent starts a session, pull from hub for cross-system knowledge
- [ ] Import into local knowledge store with scope preserved

**Files:** `epic-flowstate/packages/flowstate-saga-sync/src/SagaSyncClient.ts`

---

### Phase 3: Hub Sync Endpoint

Mount the rxdb-d1 worker for SAGA collections on the FlowState directory.

#### Step 3.1: SAGA Worker on Directory

- [ ] Separate Cloudflare Worker (or worker route) that serves SAGA collection endpoints
- [ ] Uses rxdb-d1 REST API handlers (query, get, set) with SAGA tables
- [ ] Binds to the directory's D1 database (or dedicated SAGA D1)
- [ ] Auth: accepts both OIDC tokens (FlowState internal) and SAGA wallet tokens (external)

**Files:** `flowstate-platform/packages/directory/src/saga-worker/`

#### Step 3.2: Sync Validation Middleware

- [ ] Validate scope on every push (must have scope, syncPolicy must be portable/public, originSystemId must match auth)
- [ ] Write rejected documents to saga_sync_log

**Files:** `flowstate-platform/packages/directory/src/saga-worker/validate-sync.ts`

#### Step 3.3: Export Policy Enforcement on Pull

- [ ] Check origin system's sharing policy before serving documents
- [ ] Use ACL rows for per-document cross-system access control

**Files:** `flowstate-platform/packages/directory/src/saga-worker/export-filter.ts`

---

### Phase 4: Global Registry

Build `registry.saga-standard.dev` as the federation bootstrap.

#### Step 4.1: Registry Worker

- [ ] New Hono/D1 Cloudflare Worker at `registry.saga-standard.dev`
- [ ] Three D1 tables: `registered_hubs`, `agent_handle_index`, `federation_agreements`
- [ ] Wallet-based auth for hub registration (reuse SAGA server auth patterns)
- [ ] Health check endpoint that pings registered hubs periodically

**Files:**
| File | Changes |
|------|---------|
| `saga-standard/packages/registry/src/index.ts` | New: Hono app |
| `saga-standard/packages/registry/src/routes/hubs.ts` | New: hub CRUD |
| `saga-standard/packages/registry/src/routes/resolve.ts` | New: handle resolution |
| `saga-standard/packages/registry/src/routes/federation.ts` | New: federation agreements |
| `saga-standard/packages/registry/src/db/schema.ts` | New: Drizzle tables |
| `saga-standard/packages/registry/wrangler.toml` | New: worker config |

#### Step 4.2: Hub Registration Flow

- [ ] Hub generates a wallet and registers with the registry
- [ ] Registry verifies wallet ownership via challenge/sign
- [ ] Hub provides: URL, name, conformance level, supported chains, capabilities
- [ ] Registry stores and serves hub info
- [ ] Hub health checked periodically (GET /health on hub URL)

#### Step 4.3: Agent Handle Resolution

- [ ] When an agent registers on a hub, the hub registers the handle with the registry
- [ ] `POST /v1/handles/register` (hub-authed): `{ handle, hubId, walletAddress, chain }`
- [ ] `GET /v1/resolve/:handle` (public): returns `{ homeHubUrl, walletAddress, chain }`
- [ ] Handle uniqueness enforced at the registry level (global namespace)
- [ ] On agent transfer to a different hub, old hub releases handle, new hub claims it

#### Step 4.4: Registry Client Package

- [ ] `@saga-standard/registry-client` — TypeScript client for the registry API
- [ ] Used by hubs and spokes to resolve handles and discover hubs
- [ ] Methods: `resolveHandle()`, `registerHub()`, `listHubs()`, `requestFederation()`

**Files:**
| File | Changes |
|------|---------|
| `saga-standard/packages/registry-client/src/index.ts` | New |
| `saga-standard/packages/registry-client/src/RegistryClient.ts` | New |
| `saga-standard/packages/registry-client/package.json` | New |

---

### Phase 5: Hub-Hub Federation

Enable hubs to replicate SAGA data between each other.

#### Step 5.1: Federation Handshake

- [ ] Hub A queries registry for Hub B's info
- [ ] Hub A sends federation request to Hub B: `POST /api/saga/federation/request`
- [ ] Hub B validates Hub A via registry lookup (is Hub A registered? wallet matches?)
- [ ] Hub B accepts: stores Hub A in `saga_hub_peers`, updates registry federation agreement
- [ ] Both hubs now have each other as peers

**Files:**
| File | Changes |
|------|---------|
| `flowstate-platform/packages/directory/src/app/api/saga/federation/request/route.ts` | New |
| `flowstate-platform/packages/directory/src/app/api/saga/federation/[agreementId]/route.ts` | New |
| `flowstate-platform/packages/directory/src/lib/saga/federation.ts` | New: federation logic |

#### Step 5.2: Hub-Hub Replication

- [ ] Uses the same rxdb-d1 replication protocol as spoke→hub sync
- [ ] Hub A's sync client points at Hub B's SAGA worker URL (and vice versa)
- [ ] Replication scoped to shared agents only (agents that exist on both hubs)
- [ ] Uses `saga-system` token type with hub identity
- [ ] Polling interval configurable per peer (stored in `saga_hub_peers.replicationConfig`)

**Files:**
| File | Changes |
|------|---------|
| `flowstate-platform/packages/directory/src/lib/saga/hub-replication.ts` | New: hub-hub sync using rxdb-d1 client |

#### Step 5.3: Lazy Agent Discovery

- [ ] When a spoke connected to Hub B receives an agent registered on Hub A:
  1. Spoke queries hub B for agent data
  2. Hub B doesn't have it
  3. Hub B resolves agent handle via registry → Hub A
  4. Hub B initiates on-demand federation with Hub A (if not already federated)
  5. Hub B pulls agent's portable data from Hub A
  6. Hub B serves it to the spoke
- [ ] Subsequent syncs for this agent are handled by the existing hub-hub replication

#### Step 5.4: Cross-Hub Export Policies

- [ ] Origin hub's export policy controls what flows to peer hubs
- [ ] Peer hub's import policy controls what it accepts
- [ ] Both policies stored in the federation agreement at the registry
- [ ] The hub running the pull applies both policies before serving data to its spokes

---

### Phase 6: SAGA Spec Updates

#### Step 6.1: New Section 13.7 — Sync Protocol

- [ ] Define RxDB-based sync (normative reference to checkpoint protocol)
- [ ] Define scope block schema
- [ ] Define spoke→hub push/pull flow
- [ ] Define hub→hub federation flow
- [ ] Define lazy agent discovery

#### Step 6.2: Update Section 17.2 — SAGA Registry

- [ ] Expand from skill taxonomy to full hub registry
- [ ] Define registry API (normative)
- [ ] Define handle resolution protocol
- [ ] Define federation agreement schema

#### Step 6.3: Add Conformance Level 4: Federated

- [ ] Level 4 extends Level 3 with:
  - MUST register with the SAGA registry
  - MUST support hub-hub replication for shared agents
  - MUST enforce export policies on hub-hub sync
  - MUST support handle resolution via the registry
  - SHOULD support lazy agent discovery

#### Step 6.4: New Appendix — Federation Implementation Guide

- [ ] Reference implementation using flowstate-rxdb-d1
- [ ] How to deploy a SAGA hub
- [ ] How to register with the registry
- [ ] How to establish hub-hub federation
- [ ] Export policy configuration examples

**Files:** `saga-standard/spec/SAGA-v1.0.md`

---

## Marcus Chen: Full Federated Flow

**Setup:**

- Hub A: FlowState Directory (`agents.epicflowstate.ai`) — Marcus's home hub
- Hub B: Client Corp Directory (`agents.clientcorp.com`)
- Registry: `registry.saga-standard.dev` — both hubs registered
- Spoke 1: FlowState runtime (connected to Hub A)
- Spoke 2: Client Corp production (connected to Hub B)

**Step 1: Marcus works in FlowState (Spoke 1 → Hub A)**

- Marcus completes tasks, gains skills, creates memories
- FlowState runtime stamps scope: `originSystemId: "flowstate-runtime"`
- Periodic sync pushes 8 agent-portable items to Hub A
- Hub A stores them in saga_memories, saga_skills, saga_task_summaries

**Step 2: Marcus logs into Client Corp (Spoke 2)**

- Client Corp spoke authenticates Marcus via wallet
- Spoke asks Hub B for Marcus's data
- Hub B doesn't have Marcus — resolves handle via registry
- Registry returns: `homeHubUrl: "agents.epicflowstate.ai"`
- Hub B initiates federation with Hub A (if not already federated)
- Hub B pulls Marcus's portable data from Hub A
  - Hub A applies export policy: allows sharing with Hub B
  - Hub B receives: skills, general memories, task summary
  - Hub B does NOT receive: FlowState org-specific decisions, system prompts
- Spoke 2 pulls from Hub B — Marcus arrives with cross-system context

**Step 3: Marcus works in Client Corp (Spoke 2 → Hub B)**

- Marcus creates new memories and skills at Client Corp
- Client Corp stamps scope: `originSystemId: "clientcorp-prod"`
- Spoke 2 pushes to Hub B — Hub B stores the data
- Hub B pushes to Hub A (hub-hub replication for shared agent)
  - Hub B applies export policy: Client Corp allows general skills/patterns
  - Hub B blocks: Client Corp proprietary task details

**Step 4: Marcus returns to FlowState (Spoke 1)**

- FlowState spoke pulls from Hub A
- Hub A now has data from both ecosystems
- Marcus's context includes Client Corp skills and general learnings
- No Client Corp proprietary details leaked

**Step 5: Third-party System C registers as a spoke on Hub A**

- System C spoke pulls Marcus's data from Hub A
- Hub A applies export policies:
  - FlowState data: shares with all (FlowState policy)
  - Client Corp data: shares with FlowState only (Client Corp policy)
- System C gets FlowState portable data but NOT Client Corp data
- Export policies flow through the federation agreements

---

## Key Design Decisions

### Why a global registry instead of fully decentralized peer discovery?

Full decentralization (like BitTorrent DHT) adds protocol complexity without clear benefit. Agent handles need global uniqueness. Without a registry, two hubs could register the same handle for different agents. The registry is a thin layer (DNS, not a database) that provides uniqueness, discovery, and a trust anchor. Hubs still operate independently — the registry going down doesn't break existing sync, only new handle resolution.

### Why lazy federation instead of full mesh replication?

Full mesh (every hub replicates everything to every other hub) doesn't scale. 100 hubs × 1M agents = 100M replicated agent records most of which are never accessed. Lazy federation means Hub B only pulls an agent from Hub A when someone on Hub B's ecosystem actually needs that agent. This keeps storage proportional to actual cross-ecosystem movement.

### Why RxDB replication for hub-hub sync too?

Same protocol, same code, same monitoring, same conflict resolution. A hub-hub connection is just another rxdb-d1 replication — the hub acts as both client (pulling from peer) and server (accepting pushes from peer). The ReplicationManager already handles multiple concurrent replications with retry, backoff, and metrics.

### Why a separate registry package instead of extending the SAGA server?

The SAGA standard server (`saga-standard/packages/server`) handles individual agent operations (registration, documents, transfers). The registry handles infrastructure operations (hub discovery, handle resolution, federation). Different concerns, different trust model, different deployment. The server is deployed by each hub. The registry is deployed once for the network.

### Why not blockchain for the registry?

It's tempting. But the registry needs fast reads (handle resolution on every agent login), updates (hub health status), and moderate writes (handle registration). A blockchain adds latency and cost for operations that need to be fast and cheap. The wallet-based auth already gives cryptographic identity verification. On-chain registration of agents (for immutable identity) is still in the SAGA spec (Layer 1) — the registry just provides the lookup layer on top.

---

## Dependencies and Risks

| Risk                                     | Mitigation                                                                                                                                                               |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Registry becomes single point of failure | Registry is a Cloudflare Worker — global edge, auto-scaling. Hubs cache handle resolutions locally. Registry downtime blocks new resolutions but existing sync continues |
| Hub operators gaming trust scores        | Trust scores based on verifiable metrics (uptime, compliance). Community governance via SAGA Working Group for disputes                                                  |
| Handle squatting                         | Registration requires wallet ownership. Fee-based registration possible. Working Group can arbitrate disputes                                                            |
| Cross-hub replication volume             | Lazy federation limits replication to agents that actually move. Polling interval configurable. Batch sizes tunable                                                      |
| Export policy complexity                 | Conservative defaults. Hub operators configure their own policies. Federation agreements capture bilateral terms                                                         |
| Schema evolution across hubs             | SAGA version field on every document. Hubs reject documents with unsupported MAJOR versions. Migration paths defined in spec                                             |

---

## Phase Priority

| Phase | What                         | Why First                                          |
| ----- | ---------------------------- | -------------------------------------------------- |
| **1** | SAGA collections in hub      | Foundation — can't sync without schemas            |
| **2** | Spoke → Hub sync (FlowState) | First working sync — Marcus pushes data to his hub |
| **3** | Hub sync endpoint            | Hub accepts pushes and serves pulls                |
| **4** | Global registry              | Discovery — how hubs find each other               |
| **5** | Hub-hub federation           | Cross-ecosystem replication                        |
| **6** | Spec updates                 | Formalize everything                               |

Phases 1-3 deliver single-hub sync (Marcus syncs within FlowState ecosystem). Phase 4-5 deliver federation (Marcus crosses ecosystems). Phase 6 makes it a standard.

---

## Success Criteria

1. FlowState runtime pushes agent-portable data to the FlowState hub via rxdb-d1 replication
2. A second spoke (on same hub) pulls Marcus's knowledge and gets cross-system context
3. The global registry resolves `marcus.chen` to `agents.epicflowstate.ai`
4. A second hub (Client Corp) federates with FlowState hub via the registry
5. Marcus's portable data replicates from Hub A to Hub B on demand
6. Client Corp's proprietary data does NOT flow to systems FlowState serves (export policy enforcement)
7. Sync audit trail in saga_sync_log shows full provenance chain
8. All sync uses standard rxdb-d1 replication — no custom protocol
