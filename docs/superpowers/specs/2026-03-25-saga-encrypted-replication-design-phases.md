# SAGA Encrypted Replication — Implementation Phases

> **Parent spec**: [SAGA Encrypted Memory Replication & Messaging Design](./2026-03-25-saga-encrypted-replication-design.md)
> **Date**: 2026-03-25
> **Depends on**: [SAGA Sync Protocol](../plans/2026-03-22-saga-sync-protocol.md) Phases 1-3 (collections, spoke-hub sync, hub endpoint)

---

## Phase Overview

Seven phases, each delivering a usable increment. Each phase builds on the previous.

```
Phase 1: Crypto Foundation & Encrypted Store
    │   KeyRing, key derivation, NaCl primitives, local encrypted store
    │
Phase 2: Hub WebSocket Relay
    │   WSS server, NFT-gated auth, routing, mailbox
    │
Phase 3: DERP SAGA Client
    │   Client library, relay connection, message router, SagaClient API
    │
Phase 4: Real-Time Memory Sync
    │   Push-based memory sync through relay, pull-on-activation
    │
Phase 5: Direct Messaging
    │   1:1 agent↔agent, agent↔company messaging
    │
Phase 6: Company Data Governance
    │   Policy engine, memory classification, retention rules
    │
Phase 7: Directory NFT & Cross-Directory Federation
        SAGADirectoryIdentity.sol, handle@directoryId, federation links
```

**Milestone checkpoints:**

- After Phase 3: Single-directory encrypted communication working (agent DERP ↔ hub ↔ agent DERP)
- After Phase 5: Full messaging + memory sync within one directory
- After Phase 7: Federated multi-directory network

---

## Phase 1: Crypto Foundation & Encrypted Store

**Goal**: Build the cryptographic primitives and local encrypted storage that everything else depends on.

**Prerequisite**: None — standalone crypto library.

**Package**: `@epicdm/saga-crypto` (new package in `saga-standard/packages/saga-crypto`)

### Deliverables

1. **Wallet → x25519 key derivation**
   - HKDF(walletPrivKey, salt="saga-encryption-v1", info="x25519") → x25519 keypair
   - HKDF(walletPrivKey, salt="saga-encryption-v1", info="local-storage") → AES-256 storage key
   - Support both secp256k1 (EVM) and ed25519 (Solana) wallet types

2. **KeyRing — opaque crypto oracle**
   - Initialize from wallet private key
   - `encryptPrivate(plaintext)` → NaCl sealedbox (agent-private scope)
   - `decryptPrivate(ciphertext)` → plaintext
   - `encryptMutual(plaintext, recipientX25519Pub)` → NaCl box (mutual scope)
   - `decryptMutual(ciphertext, senderX25519Pub)` → plaintext
   - `encryptGroup(plaintext, groupKeyId)` → AES-256-GCM (group scope)
   - `decryptGroup(ciphertext, groupKeyId)` → plaintext
   - `addGroupKey(groupKeyId, wrappedKey)` → unwrap and cache
   - `wrapGroupKeyFor(groupKeyId, recipientX25519Pub)` → wrapped key
   - Never exposes raw key bytes through the interface
   - Uses Web Crypto API (`crypto.subtle`) for edge runtime compatibility

3. **Encrypted envelope format**
   - `SagaEncryptedEnvelope` type (as defined in spec)
   - `seal(payload, keyRing, scope, to)` → envelope
   - `open(envelope, keyRing)` → payload
   - Version field (`v: 1`) for future format evolution
   - Fail closed on unrecognized version

4. **Encrypted local store**
   - AES-256-GCM encrypted key-value store
   - Keyed by wallet-derived storage key
   - `put(key, value)` → encrypt and persist
   - `get(key)` → fetch and decrypt
   - `query(filter)` → decrypt matching entries
   - `delete(key)` → remove
   - Storage backend: pluggable (filesystem for Docker DERPs, KV for Worker DERPs)
   - Persists to DERP workspace (snapshot-safe per DERP spec Section 6.5)

### Success Criteria

- KeyRing encrypts/decrypts across all three scopes (private, mutual, group)
- Agent A encrypts with NaCl box → Agent B decrypts with their key → plaintext matches
- Group key wrapped to member → member unwraps → can decrypt group messages
- Encrypted store round-trips data correctly
- No raw key material exposed through any public interface
- Web Crypto API only (no Node.js `crypto` module — edge compatible)

---

## Phase 2: Hub WebSocket Relay

**Goal**: Build the hub-side relay server that routes encrypted envelopes between DERP clients.

**Prerequisite**: Phase 1 (envelope format for type definitions only — hub never decrypts)

**Package**: Extends `saga-standard/packages/server` (existing SAGA server)

### Deliverables

1. **WebSocket endpoint**
   - `wss://{hub-url}/v1/relay` — accepts DERP client connections
   - Hono WebSocket upgrade handler on the SAGA server
   - Cloudflare Durable Object per-connection for state management (or in-memory map for non-CF)

2. **NFT-gated authentication**
   - Wallet challenge-response on WebSocket handshake:
     1. Server sends random challenge
     2. Client signs with wallet private key
     3. Server recovers wallet address from signature
   - On-chain NFT verification:
     1. Query `SAGAAgentIdentity.ownerOf(tokenId)` or `SAGAOrgIdentity.ownerOf(tokenId)` on Base
     2. Verify recovered wallet address matches NFT owner
     3. Reject connection if no valid NFT
   - Session token issued on successful auth (short-lived, refreshable)
   - Periodic re-verification (every 5 minutes) via cached RPC calls
   - Connection registry: `handle → WebSocket connection` map

3. **Message routing**
   - Receive `SagaEncryptedEnvelope` from authenticated client
   - Read `to` field (handle or handle@directoryId)
   - If recipient connected → forward immediately
   - If recipient offline → store in mailbox
   - If recipient on another directory → queue for federation (Phase 7)
   - Delivery ack back to sender

4. **Encrypted mailbox**
   - Storage: KV namespace `RELAY_MAILBOX` (Cloudflare KV) or D1 table `relay_mailbox`
   - Key: `{directoryId}:{handle}:{messageId}`
   - Value: serialized `SagaEncryptedEnvelope` (opaque blob)
   - TTL: configurable per directory (default 30 days)
   - Drain on reconnect: deliver all queued messages in timestamp order, delete after ack
   - Size limit per mailbox: configurable (default 10,000 messages or 100MB)

5. **Connection lifecycle**
   - Track connected handles in Durable Object or in-memory map
   - Heartbeat/ping-pong for connection health (30-second interval)
   - Graceful disconnect: remove from routing table, no mailbox cleanup
   - Stale connection cleanup: if no pong after 3 missed pings, close and mark offline

### Success Criteria

- DERP client connects via WSS, authenticates with wallet + NFT
- Client without valid NFT is rejected
- Message from Client A to online Client B delivered in < 100ms
- Message to offline client stored in mailbox, delivered on reconnect
- Hub cannot read any message content (verified by test: message content is random bytes from hub's perspective)

---

## Phase 3: DERP SAGA Client

**Goal**: Build the client library that runs inside every DERP, connecting to the hub relay and exposing the SagaClient API to agent runtimes.

**Prerequisite**: Phase 1 (crypto), Phase 2 (relay server to connect to)

**Package**: `@saga-standard/saga-client-rt` (new package — "rt" for runtime, distinct from existing `@epicdm/saga-client` which is the HTTP API client)

### Deliverables

1. **Relay Connection**
   - WSS connection to hub relay endpoint
   - Wallet challenge-response authentication on connect
   - Auto-reconnect with exponential backoff (1s, 2s, 4s, 8s, max 60s)
   - Outbound message buffer during disconnection (persisted to encrypted store)
   - Drain buffer on reconnect
   - Heartbeat response (pong)

2. **Message Router**
   - Incoming envelope demux by `type` field:
     - `memory-sync` → Encrypted Store (update local memory)
     - `direct-message` → emit to registered handler
     - `group-message` → emit to registered handler
   - Deduplication: track seen message IDs (rolling window, 1 hour)
   - Ordering: reorder by `ts` + sequence number within sender

3. **SagaClient API**

   ```typescript
   interface SagaClient {
     // Lifecycle
     connect(hubUrl: string, walletSigner: WalletSigner): Promise<void>
     disconnect(): Promise<void>
     isConnected(): boolean

     // Memory
     storeMemory(memory: SagaMemory): Promise<void>
     queryMemory(filter: MemoryFilter): Promise<SagaMemory[]>
     deleteMemory(memoryId: string): Promise<void>

     // Messaging
     sendMessage(to: string, message: SagaDirectMessage): Promise<string>
     onMessage(handler: (from: string, msg: SagaDirectMessage) => void): Unsubscribe

     // Group
     sendGroupMessage(groupId: string, message: SagaDirectMessage): Promise<string>
     onGroupMessage(
       handler: (groupId: string, from: string, msg: SagaDirectMessage) => void
     ): Unsubscribe

     // Status
     getPeers(): ConnectedPeer[]
     onConnectionChange(handler: (connected: boolean) => void): Unsubscribe
   }
   ```

4. **Initialization flow**
   - DERP activates → instantiate SagaClient with agent's wallet signer
   - Client derives keys via KeyRing (Phase 1)
   - Client connects to hub relay (Phase 2)
   - Hub drains mailbox → client processes queued messages
   - Client pulls missed memory updates into local encrypted store
   - Client is live — ready for agent runtime to use

### Success Criteria

- Agent DERP activates, SagaClient connects, authenticates, drains mailbox
- `storeMemory()` encrypts locally and pushes envelope through relay
- `queryMemory()` returns decrypted results from local store
- `sendMessage()` encrypts and delivers to online recipient
- Auto-reconnect works after network interruption (messages buffered and drained)
- Agent runtime never touches crypto — SagaClient is fully transparent

---

## Phase 4: Real-Time Memory Sync

**Goal**: Replace polling-based RxDB sync with real-time push-based memory sync through the encrypted relay.

**Prerequisite**: Phases 1-3 (crypto, relay, client)

**Extends**: `@saga-standard/saga-client-rt`, `saga-standard/packages/server`

### Deliverables

1. **Push-on-write memory sync**
   - When `storeMemory()` is called:
     1. Encrypt and persist to local store
     2. Build `SagaEncryptedEnvelope` with `type: 'memory-sync'`
     3. Push through relay to hub
     4. Hub stores in agent's canonical memory store (D1, encrypted blob)
     5. Hub forwards to any other connected DERPs for this agent
   - Envelope payload contains the full `SagaMemory` object (encrypted)

2. **Pull-on-activation (seed sync)**
   - On DERP activation, after WebSocket connect:
     1. Client sends `sync-request` control message with last known checkpoint
     2. Hub responds with all memory envelopes since checkpoint
     3. Client decrypts and populates local store
     4. Checkpoint updated
   - This replaces the RxDB pull for real-time scenarios
   - RxDB checkpoint replication remains for bulk historical backfill

3. **Multi-DERP sync for same agent**
   - An agent may be active in multiple DERPs simultaneously (home DERP + company DERP)
   - When agent-portable memory is created at company DERP → pushed to hub → hub forwards to home DERP (if connected)
   - Memory arrives at home DERP in real-time, local store updated
   - Conflict-free: each memory has a unique ID, append-only model

4. **Sync protocol messages (control channel)**

   ```typescript
   // Client → Hub
   interface SyncRequest {
     type: 'sync-request'
     since: string // ISO 8601 checkpoint timestamp
     collections?: string[] // optional filter: which memory types
   }

   // Hub → Client
   interface SyncResponse {
     type: 'sync-response'
     envelopes: SagaEncryptedEnvelope[]
     checkpoint: string // new checkpoint timestamp
     hasMore: boolean // pagination for large backlogs
   }
   ```

### Success Criteria

- Memory created in DERP A appears in DERP B within 500ms (both connected)
- DERP activates after being offline → pull-on-activation seeds full memory state
- Agent working at Company X DERP creates portable memory → appears at agent's home DERP in real-time
- No data loss: memories created while disconnected are buffered and synced on reconnect

---

## Phase 5: Direct Messaging

**Goal**: Enable real-time encrypted message passing between agents and companies.

**Prerequisite**: Phases 1-3 (crypto, relay, client)

**Extends**: `@saga-standard/saga-client-rt`, `saga-standard/packages/server`

### Deliverables

1. **1:1 messaging**
   - Agent → Agent: `sendMessage("bob@epicflow", { messageType: "task-request", payload: {...} })`
   - Agent → Company: `sendMessage("acme@epicflow", { messageType: "task-result", payload: {...} })`
   - Company → Agent: `sendMessage("alice@epicflow", { messageType: "task-request", payload: {...} })`
   - All encrypted with NaCl box (sender x25519 + recipient x25519)
   - Recipient's x25519 public key fetched from directory on first contact, cached locally

2. **Public key discovery**
   - New API endpoint on SAGA server: `GET /v1/keys/{handle}` → returns x25519 public key
   - Public keys cached in DERP client (refreshed on key rotation events)
   - Keys published at agent registration time (Phase 1 key derivation runs at registration)

3. **Message threading**
   - `replyTo` field references a previous message ID
   - Client-side thread assembly (hub doesn't understand threads — just routes blobs)

4. **Message TTL and expiry**
   - Sender sets `ttl` on direct messages
   - Hub respects TTL on mailbox storage (evicts expired messages)
   - Default TTL: 7 days for direct messages (vs 30 days for memory sync)

5. **Group messaging**
   - Group key creation: org admin creates AES-256 group key, wraps to each member's x25519
   - Group key distribution: via direct message (`messageType: 'key-distribution'`)
   - Group message send: encrypt payload with group key, address to `group:{groupId}`
   - Hub routes to all group members (fan-out)
   - Group membership changes: rotate key, redistribute to remaining members
   - Group registry on hub: `groupId → [handle list]` (for fan-out routing)

6. **Presence (lightweight)**
   - Hub tracks which handles are connected
   - `getPeers()` returns agents the current agent has communicated with + their online status
   - No full presence broadcast (privacy: you only see peers you've explicitly messaged)

### Success Criteria

- Agent A sends encrypted message to Agent B → B receives and decrypts within 200ms
- Agent A sends message to offline Agent B → B receives on next activation
- Group message sent once → received by all group members
- Message with TTL=3600 expires from mailbox after 1 hour
- X25519 public key discoverable via API for any registered agent/org

---

## Phase 6: Company Data Governance

**Goal**: Enable companies to control what data guest agents can store and replicate from their DERPs.

**Prerequisite**: Phases 1-4 (crypto, relay, client, memory sync)

**Extends**: `@saga-standard/saga-client-rt` (Policy Engine component)

### Deliverables

1. **CompanyReplicationPolicy schema**

   ```typescript
   interface CompanyReplicationPolicy {
     orgId: string
     defaultScope: 'org-internal' | 'mutual' | 'agent-portable'
     restricted: {
       contentPatterns?: string[]
       memoryTypes?: ('episodic' | 'semantic' | 'procedural')[]
       domains?: string[]
     }
     retention: {
       mutualTtlDays?: number
       portableLimit?: number
     }
   }
   ```

   - Stored on the company's SAGA server / directory profile
   - Loaded by the SAGA Client when agent activates in a company DERP

2. **Policy Engine**
   - Runs inside the SAGA Client on company DERPs only
   - Intercepts every `storeMemory()` call before encryption
   - Classification pipeline:
     1. Check `restricted.memoryTypes` — if memory type matches → `org-internal`
     2. Check `restricted.domains` — if knowledge domain matches → `org-internal`
     3. Check `restricted.contentPatterns` — if content matches pattern → `org-internal`
     4. If no restriction matched → apply `defaultScope`
   - Scope determines encryption key and sync behavior:
     - `org-internal`: encrypt with company key only, do NOT sync to hub
     - `mutual`: encrypt with NaCl box (agent + company), sync to hub
     - `agent-portable`: encrypt with agent key only, sync to hub

3. **Retention enforcement**
   - `mutualTtlDays`: mutual memories older than TTL are reclassified to org-internal on the next policy evaluation pass
   - `portableLimit`: maximum number of agent-portable memories the agent can take. If exceeded, oldest portable memories are downgraded to mutual (company retains access)
   - Retention runs on a timer within the SAGA Client (every hour)

4. **Company key encryption for org-internal data**
   - Company DERP uses company wallet-derived x25519 key to encrypt org-internal memories
   - These memories exist only in the company's encrypted store
   - When agent deactivates from company DERP, org-internal memories remain in the company's storage — agent cannot access them from their home DERP

5. **Policy audit trail**
   - Every classification decision logged: `{ memoryId, originalScope, appliedScope, reason, timestamp }`
   - Audit log encrypted and stored locally on company DERP
   - Available to company admin for compliance review

### Success Criteria

- Memory matching a restricted pattern is automatically classified as org-internal
- Org-internal memory is NOT synced to hub (verified by checking hub mailbox/store)
- Mutual memory is accessible by both agent and company
- Agent-portable memory syncs to agent's home hub
- Retention rules downgrade memories after TTL
- Policy audit trail records every classification decision

---

## Phase 7: Directory NFT & Cross-Directory Federation

**Goal**: Enable anyone to fork and deploy their own SAGA directory, with on-chain NFT gating for cross-directory replication.

**Prerequisite**: Phases 1-5 (the full single-directory system working)

**Packages**: New smart contract `SAGADirectoryIdentity.sol`, extends `saga-standard/packages/server` and `saga-standard/packages/registry`

### Deliverables

1. **SAGADirectoryIdentity.sol (ERC-721)**
   - Mint function: `registerDirectory(directoryId, url, operatorWallet, conformanceLevel)`
   - `directoryId` is a short human-readable string, globally unique on-chain (like a domain name)
   - Immutable once minted
   - Token-bound account (ERC-6551) holds directory's signing key
   - On-chain storage: directoryId → URL, operator wallet, conformance level, status
   - Governance: directory can be flagged/revoked by SAGA governance (token-weighted vote)

2. **Handle@DirectoryId addressing**
   - Update `SAGAHandleRegistry.sol` to include `directoryId` scope
   - Handles unique within a directory: `(directoryId, handle)` is the unique key
   - Full address format: `handle@directoryId`
   - Registry lookup: `resolve(handle, directoryId)` → wallet address, directory URL

3. **Cross-directory federation on hub relay**
   - Hub receives envelope addressed to `handle@otherDirectoryId`
   - Hub resolves target directory URL via on-chain registry (cached)
   - Hub verifies target directory's `SAGADirectoryIdentity` NFT is valid
   - Hub opens persistent WSS federation link to target directory's relay
   - Envelope forwarded over federation link
   - Target directory routes to recipient (or mailboxes)
   - Federation links are long-lived, authenticated by Directory NFT on both sides

4. **Registry as on-chain cache**
   - `registry.saga-standard.dev` indexes `DirectoryRegistered` events from the contract
   - REST API: `GET /v1/directories` — list directories
   - REST API: `GET /v1/resolve/{handle}@{directoryId}` — resolve full address
   - REST API: `GET /v1/directories/{directoryId}` — directory details
   - Source of truth remains on-chain; registry is a convenience read cache

5. **Cross-directory public key exchange**
   - When Agent A on Dir A wants to message Agent B on Dir B:
     1. Agent A's client resolves `bob@dirB` via registry → Dir B URL
     2. Client fetches Bob's x25519 public key from Dir B's API: `GET {dirB-url}/v1/keys/bob`
     3. Client caches public key locally
     4. NaCl box encrypt → send via Dir A hub → federation link → Dir B hub → Bob's DERP

6. **Fork-and-deploy guide**
   - Documentation: how to fork `saga-standard`, deploy your own directory, mint Directory NFT
   - Minimum deployment: SAGA server + relay endpoint + NFT verification
   - Configuration: `directoryId`, operator wallet, hub URL

### Success Criteria

- New directory deploys, mints Directory NFT, appears in registry
- Agent on Dir A sends message to agent on Dir B → delivered via cross-directory federation
- Directory without valid NFT cannot establish federation link (rejected)
- `handle@directoryId` addressing works end-to-end
- Registry resolves cross-directory handles within 50ms (cached)

---

## Phase Dependencies

```
Phase 1 ──► Phase 2 ──► Phase 3 ──► Phase 4
  (crypto)    (relay)     (client)    (memory sync)
                │                         │
                └────► Phase 5 ◄──────────┘
                       (messaging)
                           │
                       Phase 6
                       (governance)
                           │
                       Phase 7
                       (federation)
```

Phases 4 and 5 can be developed in parallel after Phase 3. Phase 6 depends on memory sync (Phase 4). Phase 7 depends on messaging (Phase 5) being complete.

---

## Relationship to SAGA Sync Protocol Phases

| Sync Protocol Phase         | Status      | Encrypted Replication Dependency                     |
| --------------------------- | ----------- | ---------------------------------------------------- |
| Phase 1: SAGA Collections   | Complete    | Phase 4 extends these collections                    |
| Phase 2: Spoke → Hub Sync   | In progress | Phase 4 supersedes polling with real-time            |
| Phase 3: Hub Sync Endpoint  | Planned     | Phase 2 (relay) extends the hub endpoint             |
| Phase 4: Global Registry    | Planned     | Phase 7 backs registry with on-chain Directory NFTs  |
| Phase 5: Hub-Hub Federation | Planned     | Phase 7 replaces with NFT-gated directory federation |
| Phase 6: SAGA Spec Updates  | Planned     | Deferred until encrypted replication is proven       |

The encrypted replication system builds on Sync Protocol Phases 1-3 and supersedes Phases 4-5 with the NFT-gated directory federation model.

---

## Estimated Scope Per Phase

| Phase                | New Packages                    | Key Files                                        | Test Surface                                                  |
| -------------------- | ------------------------------- | ------------------------------------------------ | ------------------------------------------------------------- |
| 1: Crypto Foundation | `@epicdm/saga-crypto`           | KeyRing, envelope, encrypted store               | Unit: key derivation, encrypt/decrypt round-trips, store CRUD |
| 2: Hub Relay         | — (extends server)              | WSS handler, NFT auth, mailbox, router           | Integration: connect/auth, route, mailbox drain               |
| 3: DERP Client       | `@saga-standard/saga-client-rt` | SagaClient, relay connection, message router     | Integration: connect, send/receive, reconnect                 |
| 4: Memory Sync       | — (extends client-rt + server)  | Sync protocol, pull-on-activation, multi-DERP    | E2E: memory push, pull, multi-DERP propagation                |
| 5: Direct Messaging  | — (extends client-rt + server)  | 1:1, group, key discovery, presence              | E2E: send/receive, offline delivery, group fan-out            |
| 6: Governance        | — (extends client-rt)           | Policy engine, classification, retention         | Unit: classification rules, retention logic                   |
| 7: Federation        | `SAGADirectoryIdentity.sol`     | Contract, addressing, federation links, registry | E2E: cross-directory message delivery, NFT gating             |
