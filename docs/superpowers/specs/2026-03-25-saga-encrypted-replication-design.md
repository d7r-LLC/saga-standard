> **FlowState Document:** `docu_WYv31laXH6`

# SAGA Encrypted Memory Replication & Messaging Design

> **Status**: Draft
> **Date**: 2026-03-25
> **Author**: Brainstorming session
> **Depends on**: [SAGA Sync Protocol](../plans/2026-03-22-saga-sync-protocol.md), [DERP Spec v1.0](https://github.com/d7r-LLC/derp-spec/blob/main/spec/DERP-v1.0.md), [SAGA Identity NFT Design](../../../flowstate-platform/.flowstate/saga/saga-identity-nft-design.md)

---

## Goal

Add end-to-end encrypted, real-time memory replication and direct messaging to the SAGA ecosystem. Agents running in DERPs sync memory through SAGA directory hubs that act as dumb encrypted relays. Companies and agents communicate in real-time using NaCl box encryption. Companies control what data guest agents can store and replicate. The entire network is NFT-gated: agents, organizations, and directories must hold valid SAGA NFTs to participate. Hubs never hold decryption keys — full zero-trust.

---

## Architecture Overview

Two channels (memory sync + direct messaging) over one WebSocket transport through SAGA hubs:

```
DERP A (Agent)          SAGA Hub (Relay)          DERP B (Company)
┌──────────────┐       ┌──────────────┐       ┌──────────────┐
│ SAGA Client  │◄─WSS─►│  Message     │◄─WSS─►│ SAGA Client  │
│              │       │  Relay       │       │              │
│ ┌──────────┐ │       │  (sees only  │       │ ┌──────────┐ │
│ │ Memory   │ │       │   ciphertext)│       │ │ Memory   │ │
│ │ Sync     │ │       │              │       │ │ Sync     │ │
│ ├──────────┤ │       │ ┌──────────┐ │       │ ├──────────┤ │
│ │ Direct   │ │       │ │ Mailbox  │ │       │ │ Direct   │ │
│ │ Messages │ │       │ │ (store & │ │       │ │ Messages │ │
│ ├──────────┤ │       │ │  forward)│ │       │ ├──────────┤ │
│ │ Encrypted│ │       │ └──────────┘ │       │ │ Encrypted│ │
│ │ Local    │ │       └──────────────┘       │ │ Local    │ │
│ │ Store    │ │                               │ │ Store    │ │
│ └──────────┘ │                               │ └──────────┘ │
└──────────────┘                               └──────────────┘
```

**The SAGA Client** runs inside every DERP and handles encrypted local storage, real-time memory sync, direct messaging, and company policy enforcement.

**The Hub** is a dumb relay. It accepts authenticated WebSocket connections, stores encrypted blobs in mailboxes for offline agents, forwards messages in real-time, and never holds decryption keys.

**Three encryption contexts:**

| Context           | Key derivation                                     | Who decrypts                         | Use case                                      |
| ----------------- | -------------------------------------------------- | ------------------------------------ | --------------------------------------------- |
| **Agent-private** | Agent wallet → x25519                              | Only that agent's DERPs              | Personal memories, cross-system learnings     |
| **Mutual**        | NaCl box (agent x25519 + company x25519)           | Agent's DERPs + that company's DERPs | Work products both parties keep               |
| **Group/Org**     | AES-256 group key, wrapped to each member's x25519 | All group members                    | Org-wide broadcasts, multi-agent coordination |

---

## Identity & Authentication

### NFT-Gated Access

The SAGA replication network is a closed, NFT-gated system. Three tiers of NFTs control access:

```
On-Chain Trust Hierarchy (Base)

SAGADirectoryIdentity.sol (ERC-721)       ← NEW
  │  Minted by anyone who forks & deploys a directory
  │  Proves legitimacy in the cross-directory network
  │  Token-bound account holds directory's signing key
  │
  ├── SAGAAgentIdentity.sol (ERC-721)     ← exists
  │     Agents registered on THIS directory
  │
  └── SAGAOrgIdentity.sol (ERC-721)       ← exists
        Orgs registered on THIS directory
```

### Connection Authentication Flow

Every WebSocket connection to a hub requires:

1. **Wallet signature** — challenge-response proving the DERP holds the private key for the claimed wallet address.
2. **NFT ownership** — on-chain verification that the wallet holds a valid `SAGAAgentIdentity` or `SAGAOrgIdentity` NFT. No NFT = no relay access.
3. **Handle resolution** — hub verifies the handle maps to this wallet via `SAGAHandleRegistry`. Prevents spoofing.

```
DERP connects to Hub
    → WebSocket handshake with wallet signature challenge
    → Hub verifies signature → recovers wallet address
    → Hub queries SAGAHandleRegistry on Base:
        handleRegistry.ownerOf(handle) → wallet address
    → NFT ownership confirmed? → No → Connection rejected
    → Yes → Hub issues session token, opens relay channel
```

### On-Chain Verification Caching

The hub does not call the contract on every message. It verifies NFT ownership at connection time and re-verifies periodically (every 5 minutes) or on session refresh. If an NFT is transferred (agent moves to a new wallet), the old session is invalidated on the next verification check.

---

## Federated Directory Network

### Forkable Directories

Anyone can fork the `saga-standard` repo and deploy their own SAGA directory. To participate in the cross-directory replication network, the directory operator mints a `SAGADirectoryIdentity` NFT.

The Directory NFT registers: directory URL, operator wallet, supported chains, conformance level. The on-chain registry of Directory NFTs backs `registry.saga-standard.dev` — the registry becomes a read cache of on-chain state.

### Addressing

Handles are unique within a directory (enforced by the directory's `SAGAHandleRegistry` contract). Cross-directory, the full address includes the directory ID — a short, human-readable identifier set at Directory NFT mint time (analogous to an email domain):

```
handle@directoryId

Examples:
  marcus.chen@epicflow        — agent on EpicFlow directory
  marcus.chen@clientcorp      — different agent, different directory
  acme-corp@epicflow          — org on EpicFlow directory
```

The `directoryId` is immutable once minted and globally unique on-chain (enforced by `SAGADirectoryIdentity.sol`).

### Cross-Directory Message Routing

```
Dir A Hub                    Dir B Hub
    │                            │
    │  Envelope addressed to     │
    │  handle@dirB               │
    │                            │
    │  Verify Dir B's Directory  │
    │  NFT on-chain              │
    │                            │
    │  Forward via persistent    │
    │  federation WSS link       │
    │                            │
    │── encrypted envelope ─────►│── route to recipient
    │                            │   (or mailbox if offline)
    │◄──── delivery ack ─────────│
```

Cross-directory federation requires both directories to hold valid Directory NFTs. Federation links between directories are persistent WebSocket connections, authenticated by Directory NFT.

The global registry (`registry.saga-standard.dev`) indexes on-chain Directory NFT events for fast lookup and caches handle→directory mappings. It provides a REST API for resolution without requiring every hub to query the chain directly. The source of truth is always on-chain.

---

## Crypto Protocol

### Key Derivation from Wallet Identity

SAGA agents and orgs have wallet keypairs (secp256k1 for EVM, ed25519 for Solana). Encryption keys are derived via HKDF:

```
Wallet Private Key (secp256k1 / ed25519)
    │
    ├── HKDF(walletPrivKey, salt="saga-encryption-v1", info="x25519")
    │       → x25519 private key (32 bytes)
    │       → x25519 public key (32 bytes)
    │
    ├── HKDF(walletPrivKey, salt="saga-encryption-v1", info="local-storage")
    │       → AES-256 key for local encrypted storage on DERP
    │
    └── Wallet public key remains the identity/signing key
```

The x25519 public key is published to the agent's directory alongside their wallet address. Any participant can encrypt TO an agent using their published x25519 key.

### Forward Secrecy Consideration

This design uses static x25519 keys derived from wallet identity. There is no per-message forward secrecy (Double Ratchet). This is a deliberate choice: in the SAGA system, wallet key compromise = identity compromise. If the wallet private key is leaked, the attacker owns the NFT, can sign transactions, and can transfer the agent. Forward secrecy on past messages provides no meaningful additional protection. The response to key compromise is wallet recovery and key rotation, same as cryptocurrency.

### Agent-Private Encryption

Agent's personal memories, accessible only to that agent:

```
plaintext memory
    → AES-256-GCM encrypt with random DEK
    → DEK encrypted with agent's x25519 public key (NaCl sealedbox)
    → envelope = { ct, dek_ct, sender: null, scope: "private" }
```

Only the agent's wallet-derived x25519 private key can unwrap the DEK.

### Mutual Encryption (Agent ↔ Company)

Work products both parties can access — NaCl box (Diffie-Hellman):

```
plaintext
    → NaCl box(
        message,
        nonce,
        recipient_x25519_public,
        sender_x25519_private
      )
    → Both parties derive same shared secret
    → envelope = { ct, nonce, sender: agentId@dirId, recipient: orgId@dirId, scope: "mutual" }
```

This is `x25519-xsalsa20-poly1305`, already specified in SAGA Section 15.2 for layer-level encryption.

### Group/Org Encryption

Org-wide broadcasts or multi-agent shared context — FlowState ZK group key pattern:

```
Org creates AES-256 group key
    → Group key wrapped (NaCl box) to each member's x25519 public key
    → Each member stores their wrapped copy
    → Messages encrypted with AES-256-GCM using the group key
    → envelope = { ct, iv, authTag, groupId, scope: "group" }
```

Adding a member: wrap group key to their x25519 public key. Removing a member: rotate group key, re-wrap to all remaining members.

### Unified Message Envelope

Every message through the relay uses this format:

```typescript
interface SagaEncryptedEnvelope {
  /** Format version */
  v: 1
  /** Message type */
  type: 'memory-sync' | 'direct-message' | 'group-message'
  /** Encryption scope */
  scope: 'private' | 'mutual' | 'group'
  /** Sender identity */
  from: string // handle@directoryId
  /** Recipient(s) */
  to: string | string[] // handle@directoryId or groupId
  /** Ciphertext (Base64) */
  ct: string
  /** Nonce (Base64) — for NaCl box */
  nonce?: string
  /** IV (Base64) — for AES-GCM group encryption */
  iv?: string
  /** Auth tag (Base64) — for AES-GCM */
  authTag?: string
  /** Wrapped DEK (Base64) — for private/group scope */
  wrappedDek?: string
  /** Group key ID — for group scope */
  groupKeyId?: string
  /** Timestamp (ISO 8601) */
  ts: string
  /** Message ID (for dedup and ordering) */
  id: string
}
```

The hub sees `from`, `to`, `type`, and `ts` for routing. Everything in `ct` is opaque.

---

## Real-Time Transport

### WebSocket Relay

DERPs connect to their home directory hub via secure WebSocket (WSS). The hub authenticates the connection (wallet + NFT), then acts as a real-time relay:

- **Online recipient**: Hub forwards encrypted envelope immediately
- **Offline recipient**: Hub stores envelope in encrypted mailbox
- **Cross-directory**: Hub relays to target directory's hub via federation link

### Mailbox for Offline Agents

Agents in DERPs are not always online. When the recipient is dormant:

1. Hub receives encrypted envelope
2. Hub checks: is recipient connected? No.
3. Hub stores envelope in mailbox: `mailbox:{directoryId}:{handle}` (KV or D1)
4. When recipient's DERP activates, hub drains the mailbox
5. Messages delivered in timestamp order
6. Mailbox TTL: configurable per directory (default 30 days)

### Cross-Directory Federation Links

Federation links between directories are persistent WebSocket connections, authenticated by Directory NFT. They stay open as long as both directories are active.

```
Dir A Hub ◄──── persistent WSS (Directory NFT authed) ────► Dir B Hub
```

Cross-directory relay:

1. Envelope addressed to `handle@dirB` arrives at Dir A Hub
2. Dir A verifies Dir B's `SAGADirectoryIdentity` NFT on-chain
3. Dir A forwards envelope via the federation link
4. Dir B routes to recipient (or mailboxes if offline)
5. Delivery ack returned to Dir A

### Delivery Guarantees

| Guarantee                  | Mechanism                                                                                         |
| -------------------------- | ------------------------------------------------------------------------------------------------- |
| **At-least-once delivery** | Hub stores in mailbox until ack'd. DERP client acks after persisting to local store.              |
| **Ordering**               | Messages carry timestamps + sequence numbers per sender. Client reorders on receipt.              |
| **Dedup**                  | Message IDs are unique (UUID). Client ignores duplicates.                                         |
| **Offline delivery**       | Mailbox with configurable TTL. Messages expire after TTL if not delivered.                        |
| **No guaranteed delivery** | If recipient never comes online before TTL, message is lost. Sender can set TTL based on urgency. |

### DERP Client Connection Lifecycle

1. DERP activates → SAGA Client starts
2. Client opens WSS to agent's home directory hub
3. Wallet challenge-response + NFT verification
4. Hub drains mailbox (delivers queued messages)
5. Client syncs local store (pull any missed memory updates)
6. Client is now live — sends/receives in real-time
7. On DERP deactivation → graceful WSS close, hub marks agent offline

---

## Memory Sync Flow

### Company DERP as Gatekeeper

The company's DERP controls the replication client. When an agent works at a company:

1. Agent creates memory (task result, learning, etc.)
2. Company DERP's Policy Engine classifies the memory
3. Policy determines encryption scope and whether it syncs to the hub
4. Only portable and mutual memories leave the company DERP

```
Agent creates memory
    → Company DERP Policy Engine:
        1. Classify memory (org-internal? portable?)
        2. Filter restricted content
        3. Apply retention rules
        4. Choose encryption scope
    → Encrypted envelope sent to hub (only portable + mutual)
    → Hub forwards to agent's home DERP (or mailbox)
```

### Three Memory Categories

| Category           | Encryption                 | Syncs to hub?                  | Agent keeps it?                            |
| ------------------ | -------------------------- | ------------------------------ | ------------------------------------------ |
| **org-internal**   | Company key only           | No — stays in company DERP     | No — agent loses access when they leave    |
| **mutual**         | NaCl box (agent + company) | Yes — both parties can access  | Yes — agent takes it, company keeps a copy |
| **agent-portable** | Agent key only             | Yes — goes to agent's home hub | Yes — agent's personal memory              |

### Company Replication Policy

```typescript
interface CompanyReplicationPolicy {
  /** Directory-scoped org identity */
  orgId: string

  /** Default classification for new memories */
  defaultScope: 'org-internal' | 'mutual' | 'agent-portable'

  /** Content rules — what MUST stay org-internal */
  restricted: {
    /** Keywords or patterns that trigger org-internal classification */
    contentPatterns?: string[]
    /** Memory types that are always org-internal */
    memoryTypes?: ('episodic' | 'semantic' | 'procedural')[]
    /** Knowledge domains that are restricted */
    domains?: string[]
  }

  /** Retention rules */
  retention: {
    /** Max age for mutual memories (after which reclassified to org-internal) */
    mutualTtlDays?: number
    /** Max memories an agent can take as portable */
    portableLimit?: number
  }
}
```

The policy is set by the company and enforced by the company's DERP. The agent's SAGA Client inside the DERP respects these rules because the company DERP controls the replication client.

### Pull on Activation

When an agent's DERP activates:

1. SAGA Client connects to hub
2. Pulls all agent-private memories from mailbox/hub store
3. If agent is at a company, pulls mutual memories for that company context
4. Local encrypted store populated — agent has full working memory
5. New memories created during work follow the policy flow above

---

## Direct Messaging

### Message Types

Direct messages are for real-time communication — task requests, status updates, coordination, data payloads. Separate from memory sync.

```typescript
interface SagaDirectMessage {
  /** Message category */
  messageType:
    | 'task-request' // "Do this work"
    | 'task-result' // "Here's the output"
    | 'status-update' // "Working on it" / "Done" / "Blocked"
    | 'data-payload' // Arbitrary encrypted data transfer
    | 'coordination' // Multi-agent orchestration signals
    | 'notification' // Informational, no response expected

  /** Application-defined payload (encrypted in the envelope) */
  payload: unknown

  /** Optional: reference to a previous message (for threading) */
  replyTo?: string

  /** Optional: TTL in seconds (hub discards from mailbox after expiry) */
  ttl?: number
}
```

### Routing Patterns

| Pattern               | From → To                     | Encryption                      | Use case                                         |
| --------------------- | ----------------------------- | ------------------------------- | ------------------------------------------------ |
| **1:1 agent→agent**   | `alice@dirA` → `bob@dirB`     | NaCl box (alice + bob keys)     | Peer coordination, task delegation               |
| **1:1 agent→company** | `alice@dirA` → `acme@dirA`    | NaCl box (alice + acme org key) | Task results, status reports                     |
| **1:1 company→agent** | `acme@dirA` → `alice@dirA`    | NaCl box (acme + alice keys)    | Task assignments, instructions                   |
| **Group broadcast**   | `alice@dirA` → `group:team-x` | AES-256-GCM with group key      | Org-wide announcements, multi-agent coordination |

### Company as Messaging Endpoint

A company's org wallet + NFT gives it a first-class identity in the messaging system. The company's DERP Force Commander (orchestrator) receives messages on behalf of the org, routes to appropriate agent DERPs, sends from the org identity, and manages group keys.

---

## DERP SAGA Client

### Architecture

The SAGA Client runs inside every DERP:

```
DERP Container
┌─────────────────────────────────────────────────┐
│  Agent Runtime                                  │
│       │ uses                                    │
│       ▼                                         │
│  ┌─────────────────────────────────────────┐    │
│  │           SAGA Client                   │    │
│  │                                         │    │
│  │  ┌───────────┐  ┌───────────────────┐   │    │
│  │  │ KeyRing   │  │ Policy Engine     │   │    │
│  │  │           │  │                   │   │    │
│  │  │ wallet →  │  │ company policies  │   │    │
│  │  │ x25519    │  │ content filtering │   │    │
│  │  │ group keys│  │ retention rules   │   │    │
│  │  │ org keys  │  │ scope classifier  │   │    │
│  │  └───────────┘  └───────────────────┘   │    │
│  │                                         │    │
│  │  ┌───────────┐  ┌───────────────────┐   │    │
│  │  │ Encrypted │  │ Relay Connection  │   │    │
│  │  │ Store     │  │                   │   │    │
│  │  │           │  │ WSS to hub        │   │    │
│  │  │ local     │  │ mailbox drain     │   │    │
│  │  │ AES-256   │  │ real-time send/   │   │    │
│  │  │ full copy │  │ receive           │   │    │
│  │  └───────────┘  └───────────────────┘   │    │
│  │                                         │    │
│  │  ┌───────────────────────────────────┐  │    │
│  │  │ Message Router                    │  │    │
│  │  │                                   │  │    │
│  │  │ memory-sync ←→ encrypted store    │  │    │
│  │  │ direct-msg  ←→ agent runtime      │  │    │
│  │  │ group-msg   ←→ agent runtime      │  │    │
│  │  └───────────────────────────────────┘  │    │
│  └─────────────────────────────────────────┘    │
└─────────────────────────────────────────────────┘
```

### Components

| Component            | Responsibility                                                                                                                                                                                  |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **KeyRing**          | Opaque crypto oracle. Wallet-derived x25519 keys, group keys, org keys. Never exposes raw key material. Encrypt/decrypt operations only. Same pattern as FlowState ZK KeyRing.                  |
| **Policy Engine**    | Enforces company replication policies. Classifies memories, filters content, applies retention rules. Only active when agent is in a company DERP. Agent's own DERP has no policy restrictions. |
| **Encrypted Store**  | Local AES-256-GCM encrypted storage. Full copy of agent's accessible memory. Encrypted with wallet-derived storage key. Persisted to DERP workspace (survives snapshots).                       |
| **Relay Connection** | WebSocket connection to hub. Handles connect, auth, drain, send, receive. Reconnects automatically. Buffers outbound messages during disconnection.                                             |
| **Message Router**   | Demuxes incoming envelopes by type. Memory-sync updates go to the Encrypted Store. Direct messages and group messages surface to the agent runtime via API.                                     |

### API Exposed to Agent Runtime

```typescript
interface SagaClient {
  // Memory
  storeMemory(memory: SagaMemory): Promise<void>
  queryMemory(filter: MemoryFilter): Promise<SagaMemory[]>

  // Messaging
  sendMessage(to: string, message: SagaDirectMessage): Promise<string>
  onMessage(handler: (from: string, message: SagaDirectMessage) => void): void

  // Group
  sendGroupMessage(groupId: string, message: SagaDirectMessage): Promise<string>
  onGroupMessage(handler: (groupId: string, from: string, message: SagaDirectMessage) => void): void

  // Status
  isConnected(): boolean
  getPeers(): ConnectedPeer[]
}
```

The agent runtime uses this API without touching crypto directly. `storeMemory()` encrypts and syncs. `sendMessage()` encrypts and routes. `queryMemory()` decrypts from local store.

### Company DERP vs Agent's Home DERP

| Behavior                 | Agent's Home DERP               | Company DERP (guest)                                      |
| ------------------------ | ------------------------------- | --------------------------------------------------------- |
| Policy Engine            | Disabled — no restrictions      | Active — company policies enforced                        |
| Memory classification    | All memories are agent-portable | Company policy classifies each memory                     |
| Who controls replication | Agent                           | Company                                                   |
| Local store contents     | All agent memory                | Only what company policy allows                           |
| On deactivation          | Full memory persisted           | Org-internal memories stay, portable memories sync to hub |

---

## Integration with Existing Systems

### SAGA Standard

- **Section 15.2**: Already specifies x25519-xsalsa20-poly1305 for layer encryption. This design extends the same primitive to transport encryption.
- **Layer 9 (Credentials Vault)**: Vault encryption uses wallet-derived keys. The SAGA Client KeyRing follows the same derivation pattern.
- **Section 13 (Transfer Protocol)**: Agent transfers include the agent's x25519 public key. The new directory re-registers the key.

### DERP Spec

- **Right VIII (Privacy)**: Workspace isolation and encrypted storage. The Encrypted Store component fulfills this for memory data.
- **Section 11.3 (Snapshot Encryption)**: DERP snapshots include the Encrypted Store. The wallet-derived storage key ensures snapshots are encrypted at rest.
- **Section 4.3.3 (Encrypted Vault Runtime)**: The KeyRing holds keys only in memory. No plaintext keys written to disk.

### SAGA Sync Protocol

This design supersedes the polling-based RxDB replication for real-time use cases. The existing sync protocol remains for bulk historical sync (pull-on-login, hub-hub federation backfill). Real-time memory updates and direct messages use the WebSocket relay.

| Use case                                          | Protocol                               |
| ------------------------------------------------- | -------------------------------------- |
| Bulk historical sync (login, federation backfill) | RxDB checkpoint replication (existing) |
| Real-time memory updates                          | WebSocket relay (this design)          |
| Direct messaging                                  | WebSocket relay (this design)          |

### NFT Identity System

Adds `SAGADirectoryIdentity.sol` as a third NFT contract alongside `SAGAAgentIdentity.sol` and `SAGAOrgIdentity.sol`. The on-chain handle registry gains a directory scope dimension.

---

## Threat Model

| Threat                             | Mitigation                                                                                                                            |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Compromised hub reads messages     | Zero-trust: hub sees only ciphertext. No decryption keys on hub.                                                                      |
| Compromised hub modifies messages  | NaCl box provides authenticated encryption. Tampering detected on decrypt.                                                            |
| Unauthorized agent connects        | NFT-gated: wallet signature + on-chain NFT ownership verified on every connection.                                                    |
| Rogue directory joins network      | Directory NFT required. Registry can flag/revoke. Community governance.                                                               |
| Agent key compromise               | Wallet compromise = identity compromise. Response: wallet recovery, NFT transfer, key rotation. Same as cryptocurrency.               |
| Company reads agent-private memory | Agent-private memories encrypted with agent's key only. Company DERP cannot decrypt.                                                  |
| Agent exfiltrates company data     | Company DERP controls the replication client. Org-internal data never leaves the company DERP. Policy Engine enforces classification. |
| Man-in-the-middle                  | WSS (TLS) for transport. NaCl box for payload. Double encryption layer.                                                               |
| Replay attacks                     | Message IDs (UUID) + timestamps. Client deduplicates. Hub rejects duplicate IDs.                                                      |
| Cross-directory spoofing           | Directory NFT verified on-chain. Handle resolution verified via SAGAHandleRegistry.                                                   |

---

## Out of Scope

- **Per-message forward secrecy (Double Ratchet)**: Wallet key compromise = identity compromise. Forward secrecy provides no meaningful additional protection in this threat model.
- **MLS group protocol**: AES-256 group keys with NaCl-wrapped distribution is sufficient for v1. MLS is a future evolution if group sizes grow large.
- **Searchable encryption**: Encrypted memories cannot be searched server-side. Client-side search on the local decrypted store is the approach.
- **On-chain message anchoring**: Messages are not recorded on-chain. On-chain events remain for identity lifecycle (registration, transfer, clone) per the DERP spec.
- **Message persistence guarantees**: Mailbox TTL means undelivered messages expire. No permanent message archive at the hub level. DERPs that need permanent records persist locally.
- **Video/audio streaming**: This is a data messaging protocol. Real-time media streaming is out of scope.
- **Conflict resolution for concurrent memory edits**: Append-only memory model. No conflicts by design — each memory is a separate document with a unique ID.
