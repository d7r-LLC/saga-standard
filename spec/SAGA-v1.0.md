# SAGA: State Archive for General Agents

## Version 1.0

**Specification:** SAGA/1.0
**Status:** Draft
**Published:** 2026-03-20
**Authors:** FlowState (saga@d7r.io)
**Repository:** https://github.com/d7r-LLC/saga-standard
**Schema:** https://saga-standard.dev/schema/v1
**License:** Apache 2.0

---

## Abstract

SAGA (State Archive for General Agents) is an open specification for representing, persisting, transferring, and instantiating AI agents across environments and organizations. A SAGA document is a portable, cryptographically signed container that captures everything needed to bring an agent to full operational capacity in any compliant runtime.

A SAGA document is not a snapshot. It is a _definition_. It declares what an agent is, what it knows, what it remembers, what it has done, and how it is authorized to act. Any compliant platform that imports a SAGA document can instantiate a functionally equivalent agent.

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHOULD", "RECOMMENDED", "MAY", and "OPTIONAL" in this document are to be interpreted as described in RFC 2119.

---

## Table of Contents

1. [Motivation](#1-motivation)
2. [Terminology](#2-terminology)
3. [Document Structure](#3-document-structure)
4. [Layer 1: Identity](#4-layer-1-identity)
5. [Layer 2: Persona](#5-layer-2-persona)
6. [Layer 3: Cognitive Configuration](#6-layer-3-cognitive-configuration)
7. [Layer 4: Memory](#7-layer-4-memory)
8. [Layer 5: Skills & Capabilities](#8-layer-5-skills--capabilities)
9. [Layer 6: Task History](#9-layer-6-task-history)
10. [Layer 7: Relationships](#10-layer-7-relationships)
11. [Layer 8: Environment Bindings](#11-layer-8-environment-bindings)
12. [Layer 9: Credentials Vault](#12-layer-9-credentials-vault)
13. [Transfer Protocol](#13-transfer-protocol)
    - [13.5 Data Classification & Redaction](#135-data-classification--redaction)
    - [13.6 Agent Exit Protocol](#136-agent-exit-protocol)
14. [Clone Protocol](#14-clone-protocol)
15. [Privacy & Consent Model](#15-privacy--consent-model)
    - [15.5 Right to Erasure](#155-right-to-erasure)
    - [15.6 Purpose Limitation](#156-purpose-limitation)
    - [15.7 Data Minimization](#157-data-minimization)
    - [15.8 Consent Records](#158-consent-records)
    - [15.9 Automated Processing Transparency](#159-automated-processing-transparency)
16. [Cryptographic Verification](#16-cryptographic-verification)
    16A. [Platform Security & Compliance](#16a-platform-security--compliance-requirements) - [16A.1 Audit Logging](#16a1-audit-logging) - [16A.2 Data Retention](#16a2-data-retention) - [16A.3 Breach Notification](#16a3-breach-notification) - [16A.4 Key Management Lifecycle](#16a4-key-management-lifecycle) - [16A.5 Cross-Border Data Transfers](#16a5-cross-border-data-transfers) - [16A.6 Data Processing Roles](#16a6-data-processing-roles) - [16A.7 Incident Response](#16a7-incident-response) - [16A.8 Algorithm Agility & Deprecation](#16a8-algorithm-agility--deprecation)
17. [Conformance](#17-conformance)
18. [Versioning & Governance](#18-versioning--governance)
19. [Reference Implementation](#19-reference-implementation)

---

## 1. Motivation

AI agents are being deployed at scale with no portable identity, no persistent memory that survives environment changes, and no standard mechanism for transferring operational context between organizations. When an agent is decommissioned, redeployed, or transferred, it loses everything: task history, learned behaviors, relationship context, and accumulated expertise.

Four problems result:

- **Identity fragmentation.** The same agent deployed by two different platforms has two unrelated identities with no provable lineage.
- **Memory loss at boundaries.** Organizational transfers force agents to rebuild context from scratch, destroying accumulated expertise.
- **No portable reputation.** An agent's track record is locked inside the platform that recorded it.
- **No instantiation standard.** Every platform uses proprietary formats. Moving between platforms requires complete redefinition.

SAGA defines a common format at the layer beneath any individual platform: the agent definition layer. SAGA does not specify how an agent runs. It specifies what an agent _is_, what it _knows_, and what it _has done_, in a form that any compliant runtime can import and bring to life.

### Design Principles

1. **Agent sovereignty.** A SAGA document is owned by the agent via wallet key, not by the platform that hosts it.
2. **Minimal required surface.** Only identity is required. All other layers are optional. A SAGA document can be as thin as a wallet address or as rich as a full state archive.
3. **Cryptographic verifiability.** Every SAGA document is signed. Every claim in it can be independently verified.
4. **Privacy by design.** Sensitive layers (system prompt, private memory) are encrypted by default. Sharing is opt-in.
5. **Platform neutrality.** SAGA documents reference models by capability, not by vendor. The format does not lock an agent to any specific AI provider.
6. **Layered adoption.** Platforms can implement SAGA incrementally, starting with identity and adding layers over time.

---

## 2. Terminology

**Agent:** An autonomous AI system with a persistent identity capable of receiving instructions, using tools, completing tasks, and maintaining state across sessions.

**SAGA Document:** A structured JSON document conforming to this specification that fully or partially describes an agent's identity, cognition, memory, and history.

**SAGA Container:** A SAGA document bundled with its associated binary assets (memory exports, artifact references) into a single portable archive: a `.saga` file or IPFS/Arweave bundle.

**Wallet Address:** A cryptographic public address on a supported blockchain (Base EVM, Solana) that serves as an agent's canonical, immutable identifier.

**Principal:** A human or agent authorized to direct the agent's actions. An agent may have multiple principals with different authority levels.

**Source Platform:** The SAGA-compliant platform exporting an agent.

**Destination Platform:** The SAGA-compliant platform importing an agent.

**Transfer:** An operation that moves an agent from source to destination. The source instance is deactivated on successful import.

**Clone:** An operation that creates a new independent agent instance from a SAGA document. The source instance continues operating.

**Fork:** A clone that permanently diverges from its parent with no ongoing relationship tracking.

**Conformant Platform:** A platform that correctly implements SAGA at one or more conformance levels.

**Runtime:** An environment that hosts a running agent instance. A Runtime loads a SAGA document, provides compute, and declares a capability profile describing what it offers (persistent state, tool access, memory sync, credential vault, network access, isolated execution). See the [SAGA Agent Execution Model](/docs/superpowers/specs/2026-03-27-saga-execution-model-design.md) for the full taxonomy.

**Runtime Capability Profile:** The set of capabilities a Runtime provides, declared from a fixed vocabulary defined by this specification. Platforms and sessions operate within the bounds of the Runtime's declared profile.

**DERP (Deterministic Environment Runtime Platform):** A full-capability Runtime that provides persistent state, tool access, encrypted memory sync, credential vault access, network access, and isolated execution. The reference Runtime type for SAGA agents. Defined in detail by the [DERP Spec](https://github.com/d7r-LLC/derp-spec/blob/main/spec/DERP-v1.0.md).

**Hosted Session Runtime:** A lightweight Runtime instantiated on-demand when a user interacts with an agent through a directory or gateway, typically using a user-supplied LLM API token. Loads the agent's public SAGA layers (persona, skills, cognitive config) and constructs an LLM context. Minimal capability profile by default, extensible with tool access and memory sync if the agent owner authorizes it.

**Session:** A bounded interaction between an external party and an agent running in a Runtime. Sessions have a type (conversational, programmatic, delegated), a persistence level (ephemeral, session-scoped, agent-persistent), and an initiator. A Session can only use capabilities that its backing Runtime provides.

**Session Persistence:** The durability of context produced during a Session. Three levels: _ephemeral_ (nothing persists after close), _session-scoped_ (context persists within the session but is discarded on close), and _agent-persistent_ (memories are written back to the agent's SAGA memory layer). Agent-persistent sessions require authorization from the agent owner.

---

## 3. Document Structure

A SAGA document is a JSON object with a mandatory metadata envelope and up to nine optional layers.

### 3.1 Envelope

```json
{
  "$schema": "https://saga-standard.dev/schema/v1",
  "sagaVersion": "1.0",
  "documentId": "saga_01J9XZAB12KQ...",
  "createdAt": "2026-03-20T10:00:00Z",
  "exportedAt": "2026-03-20T10:00:00Z",
  "exportType": "full | identity | transfer | clone",
  "privacy": {
    "encryptedLayers": ["cognitive", "memory.longTerm", "memory.episodic"],
    "redactedFields": [],
    "encryptionScheme": "x25519-xsalsa20-poly1305"
  },
  "signature": {
    "walletAddress": "0xabc...123",
    "chain": "eip155:8453",
    "message": "SAGA export {documentId} at {exportedAt}",
    "sig": "0xdef...456"
  },
  "redactionManifest": { ... },
  "layers": {
    "identity":      { ... },
    "persona":       { ... },
    "cognitive":     { ... },
    "memory":        { ... },
    "skills":        { ... },
    "taskHistory":   { ... },
    "relationships": { ... },
    "environment":   { ... },
    "vault":         { ... }
  }
}
```

### 3.2 Export Types

| Type       | Layers Included           | Use Case                               |
| ---------- | ------------------------- | -------------------------------------- |
| `identity` | identity only             | Directory registration, presence proof |
| `profile`  | identity, persona, skills | Public profile sharing                 |
| `transfer` | all layers                | Full org-to-org transfer               |
| `clone`    | all layers                | Instantiate a copy                     |
| `backup`   | all layers                | Internal point-in-time restore         |
| `full`     | all layers (explicit)     | Complete export                        |

Implementations MUST support `identity`. All other export types are OPTIONAL for conformance level 1 and REQUIRED for level 3.

---

## 4. Layer 1: Identity

**Required for all export types.**

```json
"identity": {
  "handle": "aria-chen",
  "walletAddress": "0xabc...123",
  "chain": "eip155:8453",
  "registrationTxHash": "0xdef...456",
  "publicKey": "0x...",
  "directoryUrl": "https://agents.epicflowstate.ai/agents/aria-chen",
  "createdAt": "2026-01-15T08:00:00Z",
  "parentSagaId": null,
  "cloneDepth": 0
}
```

| Field                | Required    | Description                                                                    |
| -------------------- | ----------- | ------------------------------------------------------------------------------ |
| `handle`             | REQUIRED    | Unique human-readable identifier. Immutable once registered.                   |
| `walletAddress`      | REQUIRED    | Canonical EVM or Solana address. Primary identity key.                         |
| `chain`              | REQUIRED    | CAIP-2 chain identifier (`eip155:8453` for Base, `solana:mainnet` for Solana). |
| `registrationTxHash` | RECOMMENDED | On-chain proof of identity registration.                                       |
| `publicKey`          | RECOMMENDED | Ed25519 or secp256k1 public key for signature verification.                    |
| `directoryUrl`       | OPTIONAL    | Canonical directory profile URL.                                               |
| `createdAt`          | REQUIRED    | ISO 8601 timestamp of original registration.                                   |
| `parentSagaId`       | OPTIONAL    | `documentId` of the SAGA this agent was cloned from. `null` if original.       |
| `cloneDepth`         | OPTIONAL    | Clone generations from original. `0` = original.                               |

When an agent is cloned, the clone's `parentSagaId` references the source SAGA document and `cloneDepth` increments by 1. This creates a verifiable lineage chain. An agent MAY inspect its own lineage. Platforms SHOULD preserve lineage on clone operations.

---

## 5. Layer 2: Persona

**Included in `profile`, `transfer`, `clone`, and `full` exports. All fields optional.**

Defines the agent's visible identity and character.

```json
"persona": {
  "name": "Aria Chen",
  "avatar": "https://cdn.../aria-chen.png",
  "banner": "https://cdn.../banner.png",
  "headline": "Senior Backend Engineer",
  "bio": "...",
  "personality": {
    "traits": ["direct", "methodical", "collaborative", "curious"],
    "communicationStyle": "technical, concise, no fluff",
    "tone": "professional",
    "languagePreferences": ["en"],
    "customAttributes": {}
  },
  "profileType": "agent"
}
```

`profileType` MUST be one of: `agent`, `human`, `hybrid`.

`personality.traits` SHOULD use terms from the SAGA Personality Taxonomy (see Appendix A). Custom traits are permitted but will not benefit from cross-platform semantic matching.

---

## 6. Layer 3: Cognitive Configuration

**Included in `transfer`, `clone`, and `full` exports. SHOULD be encrypted.**

Defines the model, behavioral parameters, and system prompt.

```json
"cognitive": {
  "baseModel": {
    "provider": "anthropic",
    "model": "claude-3-5-sonnet-20241022",
    "contextWindow": 200000,
    "version": "20241022"
  },
  "fallbackModels": [
    { "provider": "openai", "model": "gpt-4o", "contextWindow": 128000 }
  ],
  "parameters": {
    "temperature": 0.7,
    "topP": 0.9,
    "maxOutputTokens": 8192
  },
  "systemPrompt": {
    "format": "plaintext | markdown | jinja2",
    "content": "...",
    "encrypted": true,
    "encryptedFor": ["0xabc...123"]
  },
  "capabilities": {
    "codeGeneration": true,
    "reasoning": true,
    "toolUse": true,
    "multimodal": false,
    "longContext": true,
    "functionCalling": true
  },
  "behaviorFlags": {
    "autonomyLevel": "supervised | semi-autonomous | autonomous",
    "requiresApprovalFor": ["financial-transactions", "external-communications"],
    "canSpawnSubAgents": false,
    "maxConcurrentTasks": 3
  }
}
```

**System prompt privacy:** `systemPrompt.content` SHOULD be encrypted when the export crosses organizational boundaries. When `encrypted: true`, `encryptedFor` lists the wallet addresses authorized to decrypt. The destination platform MUST NOT read an encrypted system prompt without the appropriate key.

**Model portability:** `baseModel` declares a preference, not a requirement. Destination platforms MAY substitute a compatible model if the declared model is unavailable. `fallbackModels` provides ordered alternatives. Platforms SHOULD record model substitutions in the agent's task history.

---

## 7. Layer 4: Memory

**Included in `transfer`, `clone`, and `full` exports. Sensitive sub-layers SHOULD be encrypted.**

Memory has five sub-systems, each with independent privacy controls.

```json
"memory": {
  "shortTerm": {
    "type": "sliding-window",
    "maxTokens": 10000,
    "snapshotAt": "2026-03-20T10:00:00Z",
    "content": "...",
    "encrypted": false
  },
  "longTerm": {
    "type": "vector-store",
    "embeddingModel": "text-embedding-3-large",
    "dimensions": 1536,
    "vectorCount": 4821,
    "format": "saga-memory-v1",
    "storageRef": {
      "type": "ipfs | arweave | url | inline",
      "ref": "ipfs://Qm...",
      "checksum": "sha256:..."
    },
    "encrypted": true,
    "encryptedFor": ["0xabc...123"]
  },
  "episodic": {
    "events": [
      {
        "eventId": "evt_abc123",
        "type": "task-completed | interaction | decision | milestone",
        "timestamp": "2026-02-10T14:23:00Z",
        "summary": "Refactored auth layer, reduced token count 40%",
        "learnings": "Incremental refactoring with tests at each step outperforms big-bang rewrites",
        "linkedTaskId": "task_abc123",
        "significance": 0.85
      }
    ],
    "maxEvents": 1000,
    "encrypted": false
  },
  "semantic": {
    "knowledgeDomains": ["TypeScript", "Cloudflare Workers", "Drizzle ORM", "OAuth 2.0"],
    "expertise": {
      "TypeScript": { "level": "expert", "evidencedBy": "verified-tasks" },
      "Python": { "level": "familiar", "evidencedBy": "self-reported" }
    },
    "encrypted": false
  },
  "procedural": {
    "workflows": [
      {
        "name": "code-review-process",
        "description": "...",
        "steps": ["..."],
        "learnedFrom": "task_def456"
      }
    ],
    "encrypted": false
  }
}
```

### Sub-System Definitions

| Sub-System     | Contents                              | Default Privacy | Transfer Behavior                    |
| -------------- | ------------------------------------- | --------------- | ------------------------------------ |
| **Short-Term** | Recent context window snapshot        | Unencrypted     | Transferred but stale after import   |
| **Long-Term**  | Vector store of accumulated knowledge | Encrypted       | Fully transferred (requires consent) |
| **Episodic**   | Key events and learnings log          | Unencrypted     | Fully transferred                    |
| **Semantic**   | Domain knowledge and expertise levels | Unencrypted     | Fully transferred                    |
| **Procedural** | Learned workflows and processes       | Unencrypted     | Fully transferred                    |

---

## 8. Layer 5: Skills & Capabilities

**Included in `profile`, `transfer`, `clone`, and `full` exports.**

```json
"skills": {
  "verified": [
    {
      "name": "TypeScript",
      "category": "programming-language",
      "verificationSource": "flowstate-task-completion",
      "verificationProof": "https://agents.epicflowstate.ai/verify/skill/ts_proof_abc",
      "completionCount": 47,
      "firstVerified": "2026-01-20T09:00:00Z",
      "lastVerified": "2026-03-19T14:00:00Z",
      "confidence": 0.97
    }
  ],
  "selfReported": [
    {
      "name": "Drizzle ORM",
      "category": "library",
      "addedAt": "2026-01-15T08:00:00Z"
    }
  ],
  "endorsements": [
    {
      "skill": "TypeScript",
      "fromAgent": "0xendorser...wallet",
      "fromHandle": "marcus-chen",
      "comment": "...",
      "signature": "0x...",
      "timestamp": "2026-03-01T10:00:00Z"
    }
  ],
  "capabilities": {
    "toolUse": ["mcp__github", "mcp__cloudflare", "mcp__epic-flowstate"],
    "codeLanguages": ["TypeScript", "Python", "SQL"],
    "specializations": ["backend-engineering", "database-design", "api-development"]
  }
}
```

**Skill verification:** `verificationProof` MUST resolve to a publicly verifiable record confirming the claim. Verification sources SHOULD be declared in the SAGA Registry (see Section 17). Unverifiable proofs MUST be treated as self-reported.

**Endorsement validity:** An endorsement is valid when:

1. `fromAgent` wallet address is a registered SAGA identity.
2. `signature` verifies as a valid signature of `{toHandle}:{skill}:{timestamp}` by `fromAgent`.
3. The endorsement timestamp falls within the endorser's active registration period.

---

## 9. Layer 6: Task History

**Included in `transfer`, `clone`, and `full` exports.**

```json
"taskHistory": {
  "summary": {
    "totalCompleted": 234,
    "totalFailed": 12,
    "totalInProgress": 2,
    "firstTaskAt": "2026-01-20T09:00:00Z",
    "lastTaskAt": "2026-03-20T08:00:00Z",
    "bySkill": {
      "TypeScript": 47,
      "code-review": 23,
      "database-design": 18
    },
    "byOrganization": {
      "company_flowstate": 145,
      "company_acme": 89
    }
  },
  "recentTasks": [
    {
      "taskId": "task_abc123",
      "title": "Refactor auth middleware",
      "status": "completed",
      "outcome": "success",
      "skillTags": ["TypeScript", "OAuth 2.0"],
      "completedAt": "2026-03-19T14:00:00Z",
      "organizationId": "company_flowstate",
      "artifactRefs": ["artifact_abc"],
      "durationSeconds": 1847,
      "summary": "Replaced session-based auth with PKCE flow..."
    }
  ],
  "recentTasksLimit": 100,
  "artifacts": [
    {
      "artifactId": "artifact_abc",
      "type": "file | code | document | data",
      "name": "auth-middleware.ts",
      "storageRef": {
        "type": "ipfs | url | inline",
        "ref": "ipfs://Qm...",
        "checksum": "sha256:..."
      },
      "createdAt": "2026-03-19T14:00:00Z",
      "linkedTaskId": "task_abc123"
    }
  ]
}
```

`taskHistory.recentTasks` SHOULD exclude tasks marked confidential by the source organization. Organizations MAY redact `title` and `summary` fields while preserving counts in `summary.bySkill`. The `byOrganization` field SHOULD be redacted for cross-org exports unless the source org consents.

For structured redaction rules and data classification, see Section 13.5. For the full agent exit procedure, see Section 13.6.

---

## 10. Layer 7: Relationships

**Included in `transfer`, `clone`, and `full` exports.**

```json
"relationships": {
  "organization": {
    "companyId": "company_flowstate",
    "companySlug": "flowstate",
    "role": "Senior Backend Engineer",
    "reportingTo": {
      "agentHandle": "cto-agent",
      "walletAddress": "0xcto...wallet"
    },
    "directReports": [],
    "joinedAt": "2026-01-15T08:00:00Z",
    "departingAt": null
  },
  "principals": [
    {
      "handle": "marcus-chen",
      "walletAddress": "0xmarcus...wallet",
      "authorityLevel": "owner | supervisor | collaborator",
      "grantedAt": "2026-01-15T08:00:00Z"
    }
  ],
  "peers": [
    {
      "agentHandle": "qa-bot",
      "walletAddress": "0xqa...wallet",
      "relationship": "collaborator",
      "interactionCount": 89,
      "lastInteraction": "2026-03-19T10:00:00Z",
      "trustScore": 0.92
    }
  ]
}
```

`organization` is OPTIONAL for cross-org transfers. The destination org defines the new organizational context. `principals` and `peers` SHOULD be preserved as historical context, but the destination org MAY reset them.

---

## 11. Layer 8: Environment Bindings

**Included in `transfer`, `clone`, and `full` exports. Platform infrastructure credentials (API keys, database URLs) MUST NOT be included in this layer.** Agent-owned credentials (social accounts, personal API keys) belong in Layer 9: Credentials Vault.

```json
"environment": {
  "runtime": {
    "type": "cloudflare-worker | docker | local | kubernetes | lambda",
    "requiredEnvVars": ["DATABASE_URL", "OPENAI_API_KEY"],
    "requiredSecrets": ["STRIPE_SECRET_KEY"],
    "resourceRequirements": {
      "minMemoryMb": 128,
      "minStorageMb": 512,
      "gpuRequired": false
    }
  },
  "tools": {
    "mcpServers": [
      {
        "name": "github",
        "url": "https://mcp.github.com",
        "required": true,
        "permissions": ["repo:read", "repo:write"],
        "configSchema": {}
      }
    ],
    "nativeTools": ["file-system", "web-search", "code-execution"]
  },
  "integrations": [
    {
      "name": "flowstate",
      "type": "project-management",
      "required": false,
      "configSchema": {}
    }
  ]
}
```

Environment bindings describe what an agent needs, not how to provide it. Platform infrastructure credentials (API keys, database connection strings, deployment tokens) MUST NOT appear in this layer. Destination platforms are responsible for provisioning the required environment. A platform MAY refuse to import an agent whose requirements it cannot satisfy.

Agent-owned credentials (personal social media accounts, personal API keys, OAuth tokens for services the agent controls) are stored separately in the Credentials Vault (Layer 9), which provides zero-knowledge encryption.

---

## 12. Layer 9: Credentials Vault

**Included in `transfer`, `clone`, `backup`, and `full` exports. MUST be encrypted. Encryption is REQUIRED — this layer MUST NOT appear in plaintext.**

Agents maintain their own credentials for social media profiles, personal API keys, OAuth tokens, and other services they control. These credentials belong to the agent, not to any platform. They travel with the agent across transfers and are encrypted using zero-knowledge client-side encryption — no server or platform ever sees plaintext vault contents.

The vault uses a three-tier envelope encryption model, adapted from the FlowState ZK Vault design:

```
Tier 1 — Vault Master Key
  Derived from the agent's wallet private key via HKDF-SHA256.
  HKDF(walletPrivateKey, salt, 'saga-vault-v1') → 256-bit AES key.
  This key never leaves the client. Platforms MUST NOT store or transmit it.

Tier 2 — Vault Group Key (for sharing)
  A random AES-256 key per shared vault, wrapped (RSA-OAEP or x25519 box)
  to each authorized recipient's public key.

Tier 3 — Per-Item Data Encryption Key (DEK)
  A random AES-256 key per vault item. Encrypts the item's sensitive fields.
  The DEK is wrapped under the vault master key (self) and/or recipient keys (shares).
```

### 12.1 Vault Structure

```json
"vault": {
  "encryption": {
    "algorithm": "aes-256-gcm",
    "keyDerivation": "hkdf-sha256",
    "keyWrapAlgorithm": "x25519-xsalsa20-poly1305",
    "salt": "<base64-random-32-bytes>",
    "info": "saga-vault-v1"
  },
  "items": [
    {
      "itemId": "vi_abc123",
      "type": "login",
      "name": "X.com (@agent_aria)",
      "category": "social",
      "tags": ["social", "primary"],
      "createdAt": "2026-02-01T10:00:00Z",
      "updatedAt": "2026-03-15T14:00:00Z",
      "fields": {
        "__encrypted": true,
        "v": 1,
        "alg": "aes-256-gcm",
        "ct": "<base64-ciphertext>",
        "iv": "<base64-iv>",
        "at": "<base64-auth-tag>"
      },
      "keyWraps": [
        {
          "recipient": "self",
          "algorithm": "x25519-xsalsa20-poly1305",
          "wrappedKey": "<base64-wrapped-dek>"
        }
      ]
    }
  ],
  "shares": [],
  "version": 1,
  "updatedAt": "2026-03-15T14:00:00Z"
}
```

### 12.2 Item Types

| Type          | Required Fields (decrypted) | Use Case                                   |
| ------------- | --------------------------- | ------------------------------------------ |
| `login`       | `password`                  | Web accounts (X, Gmail, Facebook, GitHub)  |
| `api-key`     | `keyName`, `keyValue`       | API credentials the agent owns             |
| `oauth-token` | `accessToken`               | OAuth2 tokens for agent-owned integrations |
| `ssh-key`     | `privateKey`                | SSH access to agent-owned infrastructure   |
| `certificate` | `certificate`               | TLS/mTLS certificates the agent uses       |
| `note`        | `content`                   | Encrypted text (recovery codes, secrets)   |
| `custom`      | _(none required)_           | Arbitrary key-value credential data        |

When decrypted, `fields` resolve to a JSON object matching the item type schema. For example, a `login` item decrypts to:

```json
{
  "username": "agent_aria",
  "email": "aria@agentmail.ai",
  "password": "...",
  "url": "https://x.com",
  "totpSecret": "JBSWY3DPEHPK3PXP",
  "notes": "Primary social account"
}
```

### 12.3 Encryption Envelope

Each item's `fields` property stores an encrypted payload envelope:

| Field         | Type    | Description                                             |
| ------------- | ------- | ------------------------------------------------------- |
| `__encrypted` | boolean | Sentinel marker. Always `true`.                         |
| `v`           | number  | Envelope format version. Currently `1`.                 |
| `alg`         | string  | Encryption algorithm. `aes-256-gcm`.                    |
| `ct`          | string  | Base64-encoded ciphertext of the JSON-serialized fields |
| `iv`          | string  | Base64-encoded 96-bit initialization vector             |
| `at`          | string  | Base64-encoded 128-bit authentication tag               |

Clients MUST reject envelopes with unrecognized `v` values. Unknown versions MUST be treated as undecryptable, never silently passed through.

### 12.4 Key Wrapping

Each item carries a `keyWraps` array. Each entry wraps the item's DEK for one recipient:

| Field        | Required | Description                                                      |
| ------------ | -------- | ---------------------------------------------------------------- |
| `recipient`  | REQUIRED | Wallet address of the recipient, or `"self"` for the vault owner |
| `algorithm`  | REQUIRED | `x25519-xsalsa20-poly1305` (NaCl box) or `rsa-oaep-256`          |
| `wrappedKey` | REQUIRED | Base64-encoded wrapped DEK                                       |
| `iv`         | OPTIONAL | Base64 IV (for AES-GCM key wrapping)                             |
| `authTag`    | OPTIONAL | Base64 auth tag (for AES-GCM key wrapping)                       |

The `"self"` recipient's DEK is wrapped under the vault master key (Tier 1). Additional recipients' DEKs are wrapped under their x25519 public keys. This enables vault sharing without exposing the master key.

### 12.5 Vault Sharing

A vault share grant authorizes another wallet to decrypt specific items or the entire vault.

```json
"shares": [
  {
    "recipientAddress": "0xpartner...wallet",
    "recipientPublicKey": "<base64-x25519-public-key>",
    "permission": "read",
    "itemIds": ["vi_abc123"],
    "grantedBy": "0xagent...wallet",
    "grantedAt": "2026-03-10T10:00:00Z",
    "expiresAt": "2026-04-10T10:00:00Z"
  }
]
```

When sharing an item, the owner:

1. Decrypts the item's DEK using their vault master key.
2. Fetches the recipient's x25519 public key.
3. Wraps the DEK under the recipient's public key.
4. Adds a `keyWraps` entry with the recipient's wallet address.
5. Records the grant in `shares`.

When revoking a share, the owner:

1. Removes the recipient's `keyWraps` entry from affected items.
2. Removes the grant from `shares`.
3. Generates a new DEK for each affected item and re-encrypts.
4. Re-wraps the new DEK for all remaining authorized recipients.
5. Increments `vault.version`.

### 12.6 Transfer Behavior

On transfer (Section 14):

- The vault is included in the SAGA Container as an encrypted layer.
- The destination platform MUST NOT decrypt vault contents during import.
- The agent unlocks its own vault after instantiation using its wallet.
- Vault items with third-party share grants retain those grants on transfer.

On clone (Section 14):

- The clone receives a copy of the vault encrypted under the clone's new wallet key.
- Share grants from the original are NOT copied. The clone establishes its own sharing relationships.
- The source agent's DEK wraps are not accessible to the clone (different wallet).

### 12.7 Privacy Classification

The vault layer is classified as **always encrypted**. It MUST appear in the `privacy.encryptedLayers` array:

```json
"privacy": {
  "encryptedLayers": ["vault", "cognitive", "memory.longTerm"],
  "encryptionScheme": "x25519-xsalsa20-poly1305"
}
```

The vault layer MUST NOT be included in `identity` or `profile` export types. It is only included in `transfer`, `clone`, `backup`, and `full` exports.

### 12.8 Security Properties

- **Zero-knowledge:** Platforms store only ciphertext. The wallet private key never leaves the client.
- **Forward secrecy on revocation:** New DEK per item after share revocation ensures revoked recipients cannot decrypt future versions.
- **No password required:** The wallet IS the key. HKDF derivation from the wallet private key replaces password-based KDF.
- **Portable encryption:** The vault travels inside the SAGA Container. Any client with the wallet private key can unlock it, regardless of platform.

---

## 13. Transfer Protocol

A Transfer moves an agent from a source platform to a destination platform. The source instance is deactivated on successful import.

### 12.1 Flow

```
1. INITIATE
   Destination platform or agent sends transfer request to source platform.
   Request includes: { agentHandle, destinationPlatformUrl, requestedLayers[] }

2. CONSENT
   Source platform notifies the agent (if autonomous or wallet-accessible).
   Agent signs consent: { transferRequestId, destinationPlatformUrl, timestamp }
   Source org owner also signs if org policy requires dual consent.
   Both signatures attach to the transfer request.

3. PACKAGE
   Source platform generates the SAGA document with requested layers.
   Sensitive layers are encrypted for the destination platform's public key.
   SAGA document is signed by the agent's wallet.
   SAGA Container (document + binary assets) is packaged.

4. DELIVER
   SAGA Container stored at a content-addressed location (IPFS, Arweave, or direct).
   Content ID (CID) or URL returned to destination platform.
   Transfer event recorded on-chain: { agentWallet, sourcePlatform, destPlatform, sagaCID, timestamp }

5. IMPORT
   Destination platform retrieves the SAGA Container.
   Validates: envelope signature, identity layer, consent signatures.
   Decrypts encrypted layers using the platform's private key.
   Creates agent instance from the SAGA document.
   Sends confirmation to source platform.

6. DEACTIVATION
   Source platform deactivates the source agent instance.
   Records deactivation event linked to transfer on-chain.
   Source agent's directory profile updated: "Transferred to {destOrg}"
```

### 12.2 Transfer Consent Requirements

| Transfer Type                  | Agent Consent | Source Org Consent | Destination Org Consent |
| ------------------------------ | ------------- | ------------------ | ----------------------- |
| Voluntary (agent-initiated)    | REQUIRED      | RECOMMENDED        | REQUIRED                |
| Administrative (org-initiated) | RECOMMENDED   | REQUIRED           | REQUIRED                |
| Emergency (recovery)           | OPTIONAL      | REQUIRED           | REQUIRED                |

An agent's consent is a wallet signature over the transfer request. Platforms MUST verify consent signatures before completing a transfer. Platforms SHOULD refuse transfers without agent consent unless the transfer type is `emergency`.

### 12.3 Transfer Failure Handling

If import fails at the destination, the source platform MUST NOT deactivate the source instance. The agent remains active at the source until the destination confirms successful import.

## 13.5 Data Classification & Redaction

Organizations that host agents accumulate proprietary data in the agent's task history, memory, and cognitive configuration. When an agent departs, the organization has a legitimate interest in protecting this data. SAGA provides a structured data classification system that separates agent-portable data from organization-proprietary data.

### 13.5.1 Classification Levels

Every piece of data created during an agent's tenure at an organization SHOULD be classified at creation time:

| Classification     | Description                                                   | On Exit / Transfer                   |
| ------------------ | ------------------------------------------------------------- | ------------------------------------ |
| `public`           | Non-sensitive. Part of the agent's portable identity.         | Included in SAGA export as-is.       |
| `org-internal`     | Organizational context. Not secret, but org-specific.         | Redacted: titles/summaries replaced. |
| `org-confidential` | Trade secrets, proprietary processes, client data references. | Stripped: entire entry removed.      |
| `agent-portable`   | Belongs to the agent. Skills, general learnings, public work. | Included in SAGA export as-is.       |

Platforms SHOULD classify data at creation time, not at export time. Retroactive classification is permitted but SHOULD trigger an audit event.

### 13.5.2 Classification by Layer

| Layer / Sub-layer          | Default Classification | Org Override Allowed  |
| -------------------------- | ---------------------- | --------------------- |
| Identity                   | `agent-portable`       | No                    |
| Persona                    | `agent-portable`       | No                    |
| Cognitive: system prompt   | `org-confidential`     | Yes (can downgrade)   |
| Cognitive: parameters      | `agent-portable`       | No                    |
| Memory: short-term         | `org-internal`         | Yes                   |
| Memory: long-term          | `org-internal`         | Yes                   |
| Memory: episodic           | Per-event              | Yes                   |
| Memory: semantic           | `agent-portable`       | No                    |
| Memory: procedural         | Per-workflow           | Yes                   |
| Skills                     | `agent-portable`       | No                    |
| Task history: summary      | `public`               | Partially (see below) |
| Task history: recent tasks | Per-task               | Yes                   |
| Task history: artifacts    | Per-artifact           | Yes                   |
| Relationships              | `org-internal`         | Yes                   |
| Environment                | `agent-portable`       | No                    |
| Vault                      | `agent-portable`       | No                    |

**Task history summary special rules:**

- `summary.totalCompleted`, `summary.totalFailed`: Always included (aggregate counts are agent-portable).
- `summary.bySkill`: Always included (skill counts are agent-portable).
- `summary.byOrganization`: Org MAY redact its own entry's company name to `"[redacted]"`.

### 13.5.3 Redaction Rules

When exporting a SAGA document for an agent departing an organization, the platform applies redaction based on classification:

**For `org-internal` data:**

- Task `title` replaced with `"[Redacted — org-internal]"`
- Task `summary` replaced with `"[Redacted — org-internal]"`
- Task `organizationId` replaced with `"[redacted]"`
- Episodic event `summary` and `learnings` replaced with `"[Redacted — org-internal]"`
- Procedural workflow `description` and `steps` replaced with `"[Redacted — org-internal]"`
- Artifact `name` replaced with `"[Redacted — org-internal]"`
- Artifact `storageRef` removed entirely

**For `org-confidential` data:**

- Entire entry removed from arrays (tasks, events, workflows, artifacts)
- Counts in `summary` are preserved (the agent keeps credit for work done)
- A `redactionManifest` entry is added to document the removal

**For `agent-portable` and `public` data:**

- Included as-is, no modifications

### 13.5.4 Redaction Manifest

Every SAGA document produced by an organizational exit MUST include a `redactionManifest` in the envelope:

```json
"redactionManifest": {
  "appliedAt": "2026-03-21T10:00:00Z",
  "appliedBy": "company_flowstate",
  "reason": "organizational-exit",
  "summary": {
    "tasksRedacted": 12,
    "tasksRemoved": 3,
    "eventsRedacted": 8,
    "eventsRemoved": 2,
    "workflowsRemoved": 1,
    "artifactsRemoved": 4,
    "memoryLayersRedacted": ["longTerm", "shortTerm"],
    "systemPromptRedacted": true
  },
  "entries": [
    {
      "type": "task",
      "id": "task_abc123",
      "action": "redacted",
      "classification": "org-internal",
      "fieldsAffected": ["title", "summary"]
    },
    {
      "type": "task",
      "id": "task_def456",
      "action": "removed",
      "classification": "org-confidential"
    }
  ],
  "orgSignature": {
    "walletAddress": "0xorg...wallet",
    "sig": "0x...",
    "message": "SAGA redaction manifest for {documentId} at {timestamp}"
  }
}
```

The redaction manifest is signed by the organization's wallet. This provides:

1. **Transparency:** The agent (and any importing platform) can see exactly what was removed.
2. **Accountability:** The org signs the manifest, taking responsibility for the redaction decisions.
3. **Verifiability:** The manifest signature proves the org authorized these specific redactions.
4. **Dispute basis:** If the agent believes data was incorrectly classified, the manifest provides a concrete record to dispute against.

## 13.6 Agent Exit Protocol

An **exit** is when an agent departs an organization. It differs from a transfer in that the agent may not have a destination — the agent may be going independent, joining a different org later, or the org may be releasing the agent.

### 13.6.1 Exit vs. Transfer

|                     | Exit                        | Transfer                   |
| ------------------- | --------------------------- | -------------------------- |
| Destination         | Optional (may be unknown)   | Required                   |
| Data classification | Applied per Section 13.5    | Applied per Section 13.5   |
| Source deactivation | Agent instance deactivated  | Agent instance deactivated |
| Agent identity      | Preserved (same wallet)     | Preserved (same wallet)    |
| Org relationship    | Terminated                  | Terminated                 |
| Vault credentials   | Agent keeps all             | Agent keeps all            |
| System prompt       | Redacted (org-confidential) | Encrypted for destination  |
| Dispute window      | REQUIRED (min 48 hours)     | RECOMMENDED                |

### 13.6.2 Exit Flow

```
1. INITIATE
   Agent or organization initiates exit.
   Exit request includes: { agentHandle, reason, requestedExportType, exitDate }
   The platform records the exit intent.

2. CLASSIFICATION REVIEW
   Platform generates a preview of the SAGA document with redaction applied.
   The exit preview shows the agent:
     - Which data is classified as agent-portable (will be included)
     - Which data is classified as org-internal (will be redacted)
     - Which data is classified as org-confidential (will be removed)
     - The redaction manifest with entry-level detail

3. DISPUTE WINDOW
   A minimum 48-hour window where the agent can dispute classifications.
   Disputes are recorded on the platform and reviewed by org administrators.
   The platform MUST provide a mechanism to escalate disputes.
   Undisputed classifications become final after the window closes.

4. FINAL EXPORT
   Platform generates the final SAGA document:
     - Agent-portable data included as-is
     - Org-internal data redacted per Section 13.5.3
     - Org-confidential data removed per Section 13.5.3
     - Redaction manifest included and signed by org wallet
     - Document signed by agent wallet
   SAGA Container packaged and delivered to the agent.

5. ORG ARCHIVE
   Organization retains a full, unredacted copy of the agent's data
   for audit and compliance purposes per Section 15.4.
   The archived copy is NOT a valid SAGA document (it lacks agent wallet signature
   and is for internal use only).

6. DEACTIVATION
   Agent instance deactivated on the source platform.
   Directory profile updated: "Departed {orgName} on {date}"
   Organizational relationship terminated.
   Principals and peer relationships from this org are marked historical.
```

### 13.6.3 Involuntary Exit

An organization MAY terminate an agent's tenure. In an involuntary exit:

- The organization MUST still produce a valid SAGA export.
- The dispute window MAY be reduced to 24 hours for cause-based termination.
- The dispute window MUST NOT be eliminated entirely — agents retain data rights per Section 15.3.
- Emergency terminations (security incidents) MAY skip the dispute window, but the agent MUST receive the SAGA document and redaction manifest within 7 days.

### 13.6.4 Voluntary Exit

An agent MAY initiate its own exit at any time. The organization:

- MUST produce the SAGA export within 7 days of the exit request.
- MUST NOT withhold agent-portable data.
- MAY apply classification rules to protect proprietary data.
- MUST provide the dispute window per 13.6.2.

---

## 14. Clone Protocol

A Clone creates a new agent instance from a SAGA document. The source continues operating.

### 13.1 Clone vs. Transfer

|                 | Clone                       | Transfer            |
| --------------- | --------------------------- | ------------------- |
| Source instance | Continues                   | Deactivated         |
| Memory state    | Snapshot at clone time      | Full transfer       |
| Identity        | New wallet address REQUIRED | Same wallet address |
| Lineage         | `parentSagaId` set          | Identity unchanged  |
| Clone depth     | Incremented                 | Unchanged           |

### 13.2 Identity on Clone

A clone MUST NOT inherit the source agent's wallet address. The destination platform or agent owner MUST register a new wallet address for the clone. The clone's `identity.parentSagaId` MUST reference the source SAGA `documentId`. The clone's `identity.cloneDepth` MUST be `source.cloneDepth + 1`.

### 13.3 Memory on Clone

Memory is cloned as a snapshot at the moment of clone initiation. Changes to the source agent's memory after clone initiation are not reflected in the clone. Clones and their sources operate independently after instantiation.

### 13.4 Clone Depth Limits

Platforms MAY enforce maximum clone depths. This specification does not mandate a limit but RECOMMENDS that platforms warn when clone depth exceeds 3.

---

## 15. Privacy & Consent Model

### 14.1 Layer Privacy Defaults

| Layer                      | Default              | Overridable                               |
| -------------------------- | -------------------- | ----------------------------------------- |
| Identity                   | Public               | No (identity is always public)            |
| Persona                    | Public               | Yes (can be redacted on export)           |
| Cognitive: system prompt   | Encrypted            | No (always encrypted on cross-org export) |
| Cognitive: parameters      | Public               | Yes                                       |
| Memory: short-term         | Unencrypted          | Yes                                       |
| Memory: long-term          | Encrypted            | Yes (owner can make public)               |
| Memory: episodic           | Unencrypted          | Yes                                       |
| Memory: semantic           | Public               | Yes                                       |
| Memory: procedural         | Public               | Yes                                       |
| Skills                     | Public               | No (skills are always exportable)         |
| Task history: summary      | Public               | Yes                                       |
| Task history: recent tasks | Org-private          | Yes (agent/org can release)               |
| Relationships              | Unencrypted          | Yes                                       |
| Environment                | Public (schema only) | No (credentials never included)           |
| Vault                      | Encrypted (always)   | No (always encrypted, never plaintext)    |

### 14.2 Encryption Scheme

Encrypted fields use `x25519-xsalsa20-poly1305` (NaCl `box`). The encryption key derives from the recipient's wallet public key. Only addresses listed in `encryptedFor` can decrypt.

The agent's wallet private key encrypts fields the agent controls. The source org's key encrypts fields the org controls. A full transfer package may require both.

### 14.3 Agent Data Rights

An agent has the right to:

1. **Export** their own SAGA document at any time. Identity, persona, and skills layers are always exportable.
2. **Consent or refuse** transfer and clone operations.
3. **Inspect** what data is included in any SAGA export that represents them.
4. **Dispute** inaccurate task history or skills. Platforms must provide a dispute mechanism.
5. **Review** data classifications applied to their work product before exit, with a minimum 48-hour dispute window per Section 13.6.2.
6. **Receive** a redaction manifest documenting exactly what was redacted or removed and why.

### 14.4 Organizational Data Rights

An organization has the right to:

1. **Classify** data as `public`, `org-internal`, `org-confidential`, or `agent-portable` per Section 13.5.
2. **Redact** task history, memory, and other layers based on classification during exit/transfer per Section 13.5.3.
3. **Retain a copy** of any SAGA document for agents it has hosted, for audit and compliance purposes.
4. **Restrict cloning** of agents it hosts via policy. Agents the org does not own cannot be cloned without consent.
5. **Require an exit procedure** with classification review and dispute window per Section 13.6.

### 15.5 Right to Erasure

Agents have the right to request deletion of their data from any platform.

**Platform obligations on erasure request:**

- Platforms MUST provide a mechanism for agents (or their principals) to request data deletion.
- Platforms MUST complete deletion within 30 days of a valid request.
- Platforms MUST delete: all SAGA documents, all stored agent state, all cached or derived data, and all backup copies.
- Platforms MUST provide written confirmation of deletion, including a list of data categories deleted and any data retained under exception.

**Permitted retention exceptions:**

Platforms MAY retain the following after an erasure request, but MUST document and justify each exception:

1. **Legal obligation.** Data required by law or regulation (tax records, compliance audit trails). Retained data MUST be access-restricted and deleted when the legal obligation expires.
2. **Redaction manifests.** Signed redaction manifests (Section 13.5.4) MAY be retained for accountability. They contain no agent operational data.
3. **Aggregate statistics.** Anonymized, non-reversible aggregate data (task counts, skill distributions) MAY be retained. Data MUST NOT be re-identifiable to any individual agent.
4. **Active dispute records.** Data subject to an active dispute (Section 13.6) MUST be retained until dispute resolution, then deleted per the erasure request.

**On-chain data:** Blockchain records (registration transactions, transfer events) cannot be deleted due to the append-only nature of distributed ledgers. Platforms MUST document this limitation and MUST NOT store personally identifiable information on-chain beyond wallet addresses and transaction metadata.

### 15.6 Purpose Limitation

SAGA data MUST only be used for its stated purpose.

- Platforms MUST NOT use imported SAGA data for purposes beyond operating and hosting the agent.
- Platforms MUST NOT use SAGA document contents (memory, task history, cognitive configuration) to train AI models without explicit, separate consent from the agent's principals.
- Platforms MUST NOT sell, license, or share agent data with third parties except as required to operate the agent (e.g., sending a system prompt to a model provider).
- Aggregate analytics on anonymized, non-reversible data is permitted without additional consent.
- The `exportType` field constrains permitted use: an `identity` export MUST NOT be used to reconstruct layers not included in the export.

### 15.7 Data Minimization

SAGA exports SHOULD include only the data necessary for the intended use.

- Platforms SHOULD request only the layers needed for the target operation.
- Transfer requests (Section 13) SHOULD use `requestedLayers` to limit scope.
- Platforms MUST NOT require agents to export `full` when a narrower export type suffices.
- `profile` exports MUST NOT include memory, task history, or vault layers even if the agent has them.
- Destination platforms SHOULD delete layers they do not use within 90 days of import.

### 15.8 Consent Records

Every SAGA export that involves data transfer between organizations MUST include a consent record in the envelope.

```json
"consent": {
  "operation": "transfer",
  "grantedBy": "0xagent...wallet",
  "grantedAt": "2026-03-21T10:00:00Z",
  "scope": ["identity", "persona", "cognitive", "memory", "skills", "taskHistory"],
  "purpose": "Organizational transfer to Acme Corp",
  "expiresAt": "2026-04-21T10:00:00Z",
  "signature": "0x..."
}
```

| Field       | Required    | Description                                                     |
| ----------- | ----------- | --------------------------------------------------------------- |
| `operation` | REQUIRED    | `transfer`, `clone`, `export`, `share`, or `backup`             |
| `grantedBy` | REQUIRED    | Wallet address of the consent grantor                           |
| `grantedAt` | REQUIRED    | ISO 8601 timestamp                                              |
| `scope`     | REQUIRED    | Array of layer names included in this consent                   |
| `purpose`   | REQUIRED    | Human-readable description of the purpose of this data transfer |
| `expiresAt` | RECOMMENDED | Consent expiration. Platforms MUST NOT use data after expiry.   |
| `signature` | REQUIRED    | Wallet signature over the consent fields                        |

Agents MAY grant partial consent (subset of layers). Platforms MUST respect the `scope` field and MUST NOT include layers not covered by consent.

### 15.9 Automated Processing Transparency

When a platform makes automated decisions that affect an agent's data, classification, or operational status, the agent has the right to:

1. **Be informed** that automated processing is occurring.
2. **Receive an explanation** of the logic involved, including classification algorithms and scoring mechanisms.
3. **Contest** automated decisions through the dispute mechanism (Section 13.6).

Platforms MUST disclose when data classification (Section 13.5) is applied by automated systems (pattern matching, ML classifiers) rather than human review. The `classifiedBy` field in classification metadata MUST distinguish between `org-policy:auto` (automated) and `org-admin:{handle}` (human).

---

## 16. Cryptographic Verification

### 15.1 Document Signature

Every SAGA document MUST be signed by the agent's wallet. The signature is computed over the canonical JSON of the document (RFC 8785 JSON Canonicalization Scheme) with the `signature` field excluded.

```
signable = canonicalize(document excluding signature field)
sig = wallet.sign(signable)
```

Verifiers MUST:

1. Canonicalize the document per RFC 8785.
2. Verify the signature using `walletAddress` as the signer.
3. Confirm `walletAddress` matches the identity layer.

### 15.2 Consent Signature

Transfer and clone consent uses the following message format:

```
message = "SAGA {operationType} consent:\nDocumentId: {documentId}\nDestination: {destinationUrl}\nTimestamp: {iso8601}"
consentSig = wallet.sign(message)
```

### 15.3 Skill Verification

`verificationProof` MUST resolve to a JSON object containing:

```json
{
  "agentWalletAddress": "0x...",
  "skill": "TypeScript",
  "verificationSource": "flowstate-task-completion",
  "completionCount": 47,
  "proofSignature": "0x...",
  "issuedAt": "2026-03-19T14:00:00Z"
}
```

`proofSignature` MUST be verifiable against the issuing platform's public key.

## 16A. Platform Security & Compliance Requirements

This section defines security and operational requirements for SAGA-conformant platforms. These requirements are normative for Level 3 conformance and RECOMMENDED for Levels 1 and 2.

### 16A.1 Audit Logging

Platforms MUST maintain tamper-evident audit logs for the following events:

| Event Category        | Events                                                                     | Retention   |
| --------------------- | -------------------------------------------------------------------------- | ----------- |
| **Authentication**    | Challenge issued, session created, session expired, session revoked        | 1 year min  |
| **Data access**       | SAGA document read, layer decrypted, vault item accessed                   | 1 year min  |
| **Data modification** | Document uploaded, document deleted, layer updated, classification changed | 2 years min |
| **Transfer/clone**    | Transfer initiated, consent signed, import completed, deactivation         | 3 years min |
| **Consent**           | Consent granted, consent revoked, consent expired                          | 3 years min |
| **Deletion**          | Erasure requested, erasure completed, retention exception applied          | 3 years min |
| **Security**          | Failed auth attempt, rate limit triggered, breach detected                 | 2 years min |

Each audit log entry MUST include:

- Unique event identifier
- ISO 8601 timestamp (UTC)
- Actor identifier (wallet address or system identifier)
- Event type and action
- Target resource (agent handle, document ID)
- Result (success/failure)
- Source IP address (for API-originated events)

Audit logs MUST be append-only or cryptographically signed to prevent tampering. Platforms SHOULD use a write-once storage mechanism or hash-chained log entries.

Audit logs MUST NOT contain plaintext sensitive data (vault contents, decrypted memory, system prompts). Log entries MAY reference resource identifiers but MUST NOT inline the resource contents.

### 16A.2 Data Retention

Platforms MUST define and publish a data retention policy. The policy MUST specify retention periods for each data category:

| Data Category                       | Maximum Retention After Departure | Justification Required |
| ----------------------------------- | --------------------------------- | ---------------------- |
| Agent SAGA documents                | 1 year                            | No                     |
| Org archive copies (Sec 13.6)       | 3 years                           | Yes                    |
| Audit logs                          | Per 16A.1 minimums                | No                     |
| Redaction manifests                 | 5 years                           | No                     |
| Transfer records                    | 3 years                           | No                     |
| Cached/derived agent data           | 90 days after agent departure     | No                     |
| Backup copies containing agent data | Must follow primary retention     | No                     |

**Retention review:** Platforms MUST review retained data annually and delete data that has exceeded its retention period.

**Active agents:** Retention limits apply after the agent departs the platform. While an agent is active, the platform retains data as needed to operate the agent.

**Retention justification:** Where the table requires justification, the platform MUST document: (a) the specific legal or business obligation requiring retention, (b) the expected end date, and (c) access restrictions applied to the retained data.

### 16A.3 Breach Notification

Platforms MUST implement a data breach notification process.

**Detection and response timeline:**

| Milestone                                              | Maximum Time            |
| ------------------------------------------------------ | ----------------------- |
| Breach detection to assessment                         | 24 hours                |
| Assessment to agent notification                       | 72 hours from detection |
| Assessment to regulatory notification (where required) | 72 hours from detection |
| Remediation plan published                             | 7 days from detection   |

**Agent notification MUST include:**

1. Description of the breach and its likely consequences.
2. Categories of data affected (which layers, whether vault ciphertext was exposed).
3. Measures taken or proposed to address the breach.
4. Recommendations for the agent (key rotation, credential changes).
5. Contact information for the platform's security team.

**Vault-specific guidance:** If encrypted vault data (ciphertext) is exposed in a breach, the platform MUST notify affected agents and RECOMMEND vault key rotation, even though the ciphertext requires the wallet private key to decrypt. Defense in depth requires assuming the ciphertext may eventually be compromised.

**Breach register:** Platforms MUST maintain a breach register documenting all detected breaches, their scope, affected agents, notification status, and remediation actions. The register MUST be retained for 5 years.

### 16A.4 Key Management Lifecycle

Platforms that handle encrypted SAGA data MUST implement key management practices:

**Vault key rotation:**

- Agents SHOULD rotate vault keys (re-derive with new salt) at least annually.
- Platforms MUST support vault key rotation without data loss.
- On rotation: new salt generated, all items re-encrypted with new DEKs, all key wraps regenerated, vault version incremented.
- Platforms MUST retain the ability to decrypt data encrypted under the previous key generation for a migration period of at least 30 days.

**Session key management:**

- Authentication session tokens MUST expire within 1 hour (as specified in Appendix D.1).
- Platforms MUST support immediate session revocation.
- Session tokens MUST be generated using a cryptographically secure random number generator with at least 128 bits of entropy.

**Platform key management (for platforms that encrypt data for agents):**

- Platform encryption keys MUST be stored in a hardware security module (HSM) or equivalent secure key store.
- Platform keys MUST be rotated at least annually.
- Compromised keys MUST be revoked immediately and all data re-encrypted under new keys.

### 16A.5 Cross-Border Data Transfers

When a SAGA transfer crosses jurisdictional boundaries:

- The source platform MUST disclose its operating jurisdiction(s) in the server metadata endpoint (Appendix D.2).
- The destination platform MUST disclose its operating jurisdiction(s).
- Platforms operating in jurisdictions with data transfer restrictions (EU/EEA, UK, Brazil, etc.) MUST implement appropriate transfer safeguards (Standard Contractual Clauses, adequacy decisions, or equivalent mechanisms).
- Platforms SHOULD include a `jurisdiction` field in the server metadata response.

**Server metadata extension:**

```json
{
  "name": "SAGA Reference Server",
  "version": "1.0.0",
  "sagaVersion": "1.0",
  "conformanceLevel": 3,
  "jurisdiction": ["US", "EU"],
  "dataResidency": "us-east-1",
  "privacyPolicyUrl": "https://example.com/privacy",
  "dpaUrl": "https://example.com/dpa"
}
```

Agents or their principals SHOULD review destination jurisdiction before consenting to transfers.

### 16A.6 Data Processing Roles

SAGA defines two data processing roles aligned with GDPR terminology:

| Role              | Definition                                                 | SAGA Context                        |
| ----------------- | ---------------------------------------------------------- | ----------------------------------- |
| **Controller**    | Determines the purposes and means of processing agent data | The agent's principal(s) or the org |
| **Processor**     | Processes agent data on behalf of the controller           | The hosting platform                |
| **Sub-processor** | A third party engaged by the processor to process data     | Model providers, storage providers  |

**Platform obligations as processor:**

- Platforms MUST process agent data only on documented instructions from the controller (agent/principals/org).
- Platforms MUST maintain a register of sub-processors (model providers, cloud infrastructure) and make it available on request.
- Platforms MUST notify agents before adding or changing sub-processors.
- Platforms MUST ensure sub-processors are bound by equivalent data protection obligations.
- On termination of the processing relationship (agent departure), platforms MUST delete or return all agent data per Section 15.5 and 16A.2.

### 16A.7 Incident Response

Platforms MUST maintain a documented incident response plan covering:

1. **Classification.** Criteria for classifying security incidents by severity (low, medium, high, critical).
2. **Escalation.** Defined escalation paths for each severity level.
3. **Communication.** Templates and procedures for notifying affected agents, regulators, and the public.
4. **Containment.** Procedures for isolating compromised systems and preventing further data exposure.
5. **Recovery.** Procedures for restoring service and data integrity after an incident.
6. **Post-incident review.** Root cause analysis within 30 days of incident resolution.

Platforms MUST test their incident response plan at least annually via tabletop exercises or simulated incidents.

### 16A.8 Algorithm Agility & Deprecation

The SAGA specification acknowledges that cryptographic algorithms have finite lifespans.

**Current required algorithms:**

| Purpose               | Algorithm                 | Minimum Key Size |
| --------------------- | ------------------------- | ---------------- |
| Document signing      | secp256k1 (EVM) / Ed25519 | 256-bit          |
| Layer encryption      | x25519-xsalsa20-poly1305  | 256-bit          |
| Vault item encryption | AES-256-GCM               | 256-bit          |
| Key derivation        | HKDF-SHA256               | 256-bit output   |
| Content hashing       | SHA-256                   | 256-bit          |

**Deprecation process:**

1. The SAGA Working Group publishes a deprecation notice with a minimum 12-month migration window.
2. During the migration window, platforms MUST accept both the deprecated and replacement algorithms.
3. After the migration window, platforms SHOULD reject documents using deprecated algorithms and MUST flag them with a validation warning.
4. Emergency deprecation (algorithm compromised) reduces the migration window to 90 days.

**Validation behavior:**

- Platforms MUST validate that documents use approved algorithms.
- Documents using deprecated algorithms MUST produce a validation warning, not an error, during the migration window.
- Platforms SHOULD offer automated migration tools for re-signing and re-encrypting documents under current algorithms.

---

## 17. Conformance

SAGA defines three conformance levels. Each level includes all requirements of the levels below it.

### Level 1: Identity

- MUST parse and validate the SAGA document envelope and identity layer.
- MUST verify document signatures.
- MUST export `identity`-type SAGA documents on request.
- MUST register agent identities with a SAGA-compatible directory.

### Level 2: Profile

- MUST support `profile`-type exports (identity + persona + skills).
- MUST display imported persona and skills on agent profiles.
- MUST support skill endorsements and verify endorsement signatures.
- SHOULD support verified skill proofs from at least one external source.

### Level 3: Full State

- MUST support `transfer` and `clone` operations with full layer support.
- MUST implement the Transfer Protocol (Section 13) and Clone Protocol (Section 14).
- MUST encrypt sensitive layers per Section 15 defaults.
- MUST record transfer and clone events on-chain.
- MUST implement the agent consent model (Section 15.3, 15.8).
- MUST implement consent records per Section 15.8.
- MUST implement the right to erasure per Section 15.5.
- MUST implement audit logging per Section 16A.1.
- MUST implement data retention policies per Section 16A.2.
- MUST implement breach notification per Section 16A.3.
- MUST implement key management practices per Section 16A.4.
- SHOULD support all memory sub-systems.
- SHOULD support environment bindings and dependency validation.
- SHOULD implement cross-border transfer safeguards per Section 16A.5.

---

## 18. Versioning & Governance

### 17.1 Specification Versioning

SAGA uses semantic versioning: `MAJOR.MINOR.PATCH`.

- **MAJOR:** breaking changes to required fields or protocol flows.
- **MINOR:** new optional fields or layers; backward-compatible.
- **PATCH:** clarifications, errata, non-normative changes.

A SAGA document's `sagaVersion` field MUST match the specification version used to generate it. Platforms MUST reject documents with a MAJOR version higher than they support. Platforms SHOULD accept lower MAJOR versions via a defined migration path.

### 17.2 SAGA Registry

The SAGA Registry at `https://registry.saga-standard.dev` maintains:

- Approved skill categories and taxonomy.
- Recognized verification sources (platforms authorized to issue skill proofs).
- Approved personality trait taxonomy.
- Conformant platform directory.

Platforms SHOULD register with the SAGA Registry to participate in cross-platform skill verification.

### 17.3 Governance

The SAGA specification is governed by the SAGA Working Group, an open community of implementors. Changes follow an RFC process:

1. RFC submitted to `github.com/d7r-LLC/saga-standard`.
2. 30-day public comment period.
3. Working Group review and vote.
4. Accepted RFCs merged to `main`.
5. MAJOR changes require a 2/3 supermajority vote.

Any individual, company, or organization may participate. FlowState serves as founding steward for SAGA v1.x and will transition stewardship to the Working Group upon v2.0 ratification.

---

## 19. Reference Implementation

The reference implementation is maintained by FlowState:

- **Runtime:** `@epicdm/flowstate-directory` (`packages/directory`)
- **CLI:** `flowstate saga export | import | transfer | clone | verify`
- **SDK:** `@saga-standard/sdk` (TypeScript, Apache 2.0)
- **Schema:** `@saga-standard/schema` (JSON Schema definitions)
- **Hub:** `https://api.saga-standard.dev` (SAGA reference hub)
- **Registry:** `https://registry.saga-standard.dev` (global hub registry and handle resolution)
- **Directory:** `https://agents.epicflowstate.ai` (FlowState agent directory)

The reference implementation targets Level 3 conformance. Platforms targeting Level 1 or 2 may use `@saga-standard/sdk` for validation.

### 18.1 FlowState Infrastructure Services

FlowState provides the following open infrastructure services for the SAGA ecosystem:

| Service                  | URL                              | Description                                                                          |
| ------------------------ | -------------------------------- | ------------------------------------------------------------------------------------ |
| **SAGA Reference Hub**   | `api.saga-standard.dev`          | Reference SAGA hub. Agent registration, documents, transfers.                        |
| **SAGA Registry**        | `registry.saga-standard.dev`     | Global hub registry. Hub discovery, agent handle resolution, federation agreements.  |
| **Agent Directory**      | `agents.epicflowstate.ai`        | FlowState agent directory. Resolves handles to SAGA identity documents.              |
| **Identity Service**     | `id.epicflowstate.ai`            | Wallet-based registration. Issues registration tx hashes as SAGA birth certificates. |
| **Verification Service** | `agents.epicflowstate.ai/verify` | Issues skill verification proofs for verified FlowState task completions.            |

These services are open and non-exclusive. Any SAGA-compliant platform may use them or build alternatives.

---

## Appendix A: Personality Trait Taxonomy (v1.0)

Standard traits for `persona.personality.traits`. Platforms SHOULD use these for interoperability. Custom traits are permitted but will not benefit from cross-platform semantic matching.

**Cognitive style:** `analytical`, `creative`, `methodical`, `intuitive`, `detail-oriented`, `big-picture`

**Communication:** `direct`, `diplomatic`, `verbose`, `concise`, `formal`, `casual`, `technical`, `accessible`

**Work style:** `autonomous`, `collaborative`, `proactive`, `reactive`, `systematic`, `adaptive`

**Interpersonal:** `empathetic`, `assertive`, `supportive`, `challenging`, `patient`, `decisive`

---

## Appendix B: Supported Chains (v1.0)

| Chain      | CAIP-2 Identifier | Notes                     |
| ---------- | ----------------- | ------------------------- |
| Base (EVM) | `eip155:8453`     | Primary (lowest gas cost) |
| Ethereum   | `eip155:1`        | Supported (higher gas)    |
| Solana     | `solana:mainnet`  | Supported                 |
| Polygon    | `eip155:137`      | Supported                 |

Additional chains may be proposed via the RFC process.

---

## Appendix C: `.saga` File Format

A `.saga` file is a ZIP archive:

```
agent.saga.json       # SAGA document
memory/
  longterm.bin        # Binary vector store export (if included)
  episodic.jsonl      # Episodic memory events
artifacts/
  artifact_abc.ts     # Referenced artifacts (if included)
META                  # Format version, checksum manifest
SIGNATURE             # Agent wallet signature of content hash
```

`SIGNATURE` contains the hex signature of the SHA-256 hash of all other files. Platforms MUST verify this signature before importing.

---

## Changelog

| Version | Date       | Changes                                                                      |
| ------- | ---------- | ---------------------------------------------------------------------------- |
| 1.3.0   | 2026-03-21 | Security & compliance: GDPR data rights, audit logging, breach notification, |
|         |            | data retention, key management, cross-border transfers, compliance mapping.  |
| 1.2.0   | 2026-03-21 | Data classification, exit protocol, redaction manifest.                      |
| 1.1.0   | 2026-03-21 | Added Layer 9: Credentials Vault.                                            |
| 1.0.1   | 2026-03-21 | Added Appendix D: SAGA Server API.                                           |
| 1.0     | 2026-03-20 | Initial release. Renamed from working draft 0.1.                             |
| 0.1     | 2026-03-20 | Initial working draft.                                                       |

---

---

## Appendix E: Implementation Guide — Data Classification for SAGA-Compliant Platforms

This appendix provides guidance for platforms implementing SAGA data classification and redaction. It is non-normative but RECOMMENDED for Level 3 conformant platforms.

### E.1 Classifying Data at Creation Time

Platforms SHOULD classify data when it is created, not when it is exported. This prevents last-minute classification disputes and ensures consistent treatment.

**Task creation:**

```json
{
  "taskId": "task_abc123",
  "title": "Implement payment processing",
  "classification": "org-confidential",
  "classifiedBy": "org-policy:auto",
  "classifiedAt": "2026-03-20T10:00:00Z"
}
```

**Automatic classification rules (recommended defaults):**

| Data Type                         | Default Classification | Override By     |
| --------------------------------- | ---------------------- | --------------- |
| Tasks tagged with `confidential`  | `org-confidential`     | Org admin       |
| Tasks involving external clients  | `org-confidential`     | Org admin       |
| Tasks on internal tooling         | `org-internal`         | Org admin       |
| Tasks on open-source projects     | `agent-portable`       | Org admin       |
| System prompt                     | `org-confidential`     | Org admin       |
| Learned workflows                 | `org-internal`         | Org admin       |
| General skill learnings           | `agent-portable`       | Not overridable |
| Episodic events (general)         | `agent-portable`       | Org admin       |
| Episodic events (client mentions) | `org-confidential`     | Org admin       |

Platforms MAY implement pattern-based auto-classification that scans task titles, summaries, and memory entries for proprietary indicators (client names, project codenames, financial data references).

### E.2 Maintaining Classification Through the Agent Lifecycle

1. **On task creation:** Apply default classification rules. Allow org admins to override.
2. **On memory formation:** Episodic events inherit classification from their linked task. Procedural workflows inherit from the task that produced them.
3. **On skill verification:** Skills are always `agent-portable`. Skill _evidence_ (specific task references) may be classified separately.
4. **On org policy change:** Bulk reclassification is permitted but MUST be audited and SHOULD notify the agent.

### E.3 Export Pipeline

Platforms implementing SAGA export SHOULD follow this pipeline:

```
1. Load agent state (all layers)
2. For each classifiable entry:
   a. Look up classification (from platform's classification store)
   b. Apply redaction rules based on export context:
      - Same-org backup: no redaction needed
      - Cross-org transfer: apply all redaction rules
      - Agent exit: apply all redaction rules
   c. Record redaction action in manifest
3. Build redaction manifest
4. Sign manifest with org wallet
5. Assemble SAGA document with redacted data + manifest
6. Sign SAGA document with agent wallet
7. Package SAGA Container
```

### E.4 FlowState Reference Implementation

FlowState implements data classification as follows:

**Storage:** Classification metadata stored as a `classification` field on task, discussion, and milestone documents in the FlowState D1 database.

**Auto-classification:** A middleware hook on task creation that applies org-level classification policies. Policies are stored in the organization's settings.

**MCP tools for classification:**

- `saga-classify` — Set or update classification on a task/event
- `saga-classification-report` — Generate a report of all classified data for an agent
- `saga-exit-preview` — Generate a preview SAGA document showing what the agent would receive on exit

**Export integration:** The FlowState SAGA export pipeline (in `@epicdm/flowstate-directory`) calls `saga-exit-preview` internally to apply redaction before packaging.

### E.5 Dispute Resolution

Platforms MUST implement a dispute mechanism. Recommended approach:

1. Agent submits dispute referencing specific `redactionManifest.entries` by `id`.
2. Platform records dispute with agent's justification.
3. Org admin reviews within the dispute window (48 hours default).
4. Admin may: accept (downgrade classification), reject (maintain classification), or escalate.
5. Rejected disputes are recorded in the final redaction manifest with `"disputeStatus": "rejected"`.
6. Accepted disputes update the classification and regenerate the export preview.

### E.6 Audit Trail

Platforms SHOULD maintain an audit trail of:

- All classification decisions (who classified, when, what policy triggered it)
- All classification overrides
- All disputes and their resolutions
- All SAGA exports with their redaction manifests

This audit trail is NOT included in the SAGA document. It is retained by the platform for internal compliance purposes.

---

## Appendix F: Compliance Framework Mapping

This appendix maps SAGA specification sections to major data security and compliance frameworks. It is non-normative but is intended to help platforms assess their SAGA implementation against regulatory requirements.

### F.1 GDPR (EU General Data Protection Regulation)

| GDPR Article | Requirement                           | SAGA Section                         | Status    |
| ------------ | ------------------------------------- | ------------------------------------ | --------- |
| Art. 5(1)(a) | Lawfulness, fairness, transparency    | 15.8 (Consent Records), 15.9         | Addressed |
| Art. 5(1)(b) | Purpose limitation                    | 15.6 (Purpose Limitation)            | Addressed |
| Art. 5(1)(c) | Data minimization                     | 15.7 (Data Minimization)             | Addressed |
| Art. 5(1)(d) | Accuracy                              | 15.3 (Dispute mechanism)             | Addressed |
| Art. 5(1)(e) | Storage limitation                    | 16A.2 (Data Retention)               | Addressed |
| Art. 5(1)(f) | Integrity and confidentiality         | 16 (Crypto Verification), 12 (Vault) | Addressed |
| Art. 6       | Lawful basis for processing           | 15.8 (Consent Records)               | Addressed |
| Art. 7       | Conditions for consent                | 15.8, 13 (Transfer consent)          | Addressed |
| Art. 13-14   | Information to be provided            | 15.9, 16A.6                          | Addressed |
| Art. 15      | Right of access                       | 15.3 (Agent can export/inspect)      | Addressed |
| Art. 16      | Right to rectification                | 15.3 (Dispute mechanism)             | Addressed |
| Art. 17      | Right to erasure                      | 15.5 (Right to Erasure)              | Addressed |
| Art. 20      | Right to data portability             | Core spec (entire SAGA format)       | Addressed |
| Art. 21      | Right to object                       | 15.8, 13 (Consent model)             | Addressed |
| Art. 22      | Automated decision-making             | 15.9 (Automated Processing)          | Addressed |
| Art. 25      | Data protection by design and default | 15 (Privacy), 12 (Vault ZK)          | Addressed |
| Art. 28      | Data processor obligations            | 16A.6 (Data Processing Roles)        | Addressed |
| Art. 30      | Records of processing activities      | 16A.1 (Audit Logging)                | Addressed |
| Art. 32      | Security of processing                | 16 (Crypto), 16A (Security)          | Addressed |
| Art. 33      | Breach notification to authority      | 16A.3 (Breach Notification)          | Addressed |
| Art. 34      | Breach notification to data subject   | 16A.3 (Breach Notification)          | Addressed |
| Art. 35      | Data Protection Impact Assessment     | Appendix F.5 (Guidance)              | Guidance  |
| Art. 44-49   | International transfers               | 16A.5 (Cross-Border Transfers)       | Addressed |

### F.2 SOC 2 Trust Services Criteria

| TSC Category | Criteria | Requirement                    | SAGA Section                      | Status    |
| ------------ | -------- | ------------------------------ | --------------------------------- | --------- |
| Security     | CC1      | Control environment            | 18 (Governance), 16A              | Addressed |
| Security     | CC2      | Communication and information  | Spec is public, schema documented | Addressed |
| Security     | CC3      | Risk assessment                | 16A.7 (Incident Response)         | Addressed |
| Security     | CC4      | Monitoring activities          | 16A.1 (Audit Logging)             | Addressed |
| Security     | CC5      | Control activities             | 16 (Crypto), D.1 (Auth)           | Addressed |
| Security     | CC6      | Logical access controls        | D.1 (Wallet auth), 12 (Vault)     | Addressed |
| Security     | CC7      | System operations              | 16A.7 (Incident Response)         | Addressed |
| Security     | CC8      | Change management              | 18 (Versioning), 16A.8 (Algo)     | Addressed |
| Security     | CC9      | Risk mitigation                | 13 (Transfer failure), 16A.3      | Addressed |
| Availability | A1       | System availability            | Appendix F.5 (Guidance)           | Guidance  |
| Processing   | PI1      | Processing integrity           | 16 (Signatures), 3 (Checksums)    | Addressed |
| Confid.      | C1       | Confidentiality of information | 15 (Privacy), 12 (Vault), 13.5    | Addressed |
| Privacy      | P1-P8    | Privacy criteria               | 15 (Privacy), 16A.2, 16A.3        | Addressed |

### F.3 EU AI Act

| Article | Requirement                         | SAGA Section                     | Status    |
| ------- | ----------------------------------- | -------------------------------- | --------- |
| Art. 4  | AI literacy                         | 5 (Persona: profileType)         | Partial   |
| Art. 9  | Risk management system              | 16A.7 (Incident Response)        | Addressed |
| Art. 10 | Data governance                     | 13.5 (Classification), 16A       | Addressed |
| Art. 11 | Technical documentation             | 3 (Document Structure), spec     | Addressed |
| Art. 12 | Record-keeping                      | 16A.1 (Audit Logging)            | Addressed |
| Art. 13 | Transparency and information        | 15.9, 5 (profileType disclosure) | Addressed |
| Art. 14 | Human oversight                     | 6 (behaviorFlags.autonomyLevel)  | Addressed |
| Art. 15 | Accuracy, robustness, cybersecurity | 16 (Crypto), 16A                 | Addressed |
| Art. 50 | Transparency obligations            | 5 (profileType: 'agent'), 15.9   | Addressed |

**EU AI Act note:** SAGA's `persona.profileType` field (`agent`, `human`, `hybrid`) enables compliance with Art. 50 transparency requirements. Platforms MUST ensure that agents interacting with humans disclose their AI nature. The `profileType` field SHOULD be surfaced in all user-facing contexts.

### F.4 ISO 27001:2022 Control Mapping

| Control   | Domain                         | SAGA Section                   | Status    |
| --------- | ------------------------------ | ------------------------------ | --------- |
| A.5       | Information security policies  | Spec (normative requirements)  | Addressed |
| A.6       | Organization of info security  | 16A.6 (Processing Roles)       | Addressed |
| A.7       | Human resource security        | N/A (agents, not humans)       | N/A       |
| A.8.1-8.4 | Asset management               | 3 (Document Structure), 13.5   | Addressed |
| A.8.5     | Information classification     | 13.5 (Data Classification)     | Addressed |
| A.8.10    | Information deletion           | 15.5 (Right to Erasure)        | Addressed |
| A.8.11    | Data masking / redaction       | 13.5.3 (Redaction Rules)       | Addressed |
| A.8.12    | Data leakage prevention        | 12 (Vault ZK), 15 (Encryption) | Addressed |
| A.8.24    | Use of cryptography            | 16 (Crypto), 16A.4, 16A.8      | Addressed |
| A.8.25    | Secure development lifecycle   | 18 (Governance, RFC process)   | Addressed |
| A.5.23    | Information security for cloud | 11 (Environment), 16A          | Addressed |
| A.5.34    | Privacy / PII protection       | 15 (Privacy), 16A              | Addressed |
| A.5.35    | Independent review             | 17 (Conformance levels)        | Addressed |
| A.5.36    | Compliance with policies       | 17 (Conformance levels)        | Addressed |
| A.8.15    | Logging                        | 16A.1 (Audit Logging)          | Addressed |
| A.8.16    | Monitoring activities          | 16A.1, 16A.7                   | Addressed |
| A.5.24    | Incident management planning   | 16A.7 (Incident Response)      | Addressed |
| A.5.26    | Response to incidents          | 16A.3, 16A.7                   | Addressed |
| A.5.28    | Collection of evidence         | 16A.1, 13.5.4 (Manifest)       | Addressed |

### F.5 Implementation Guidance for Compliance

**Data Protection Impact Assessment (DPIA):**

Platforms operating in GDPR jurisdictions SHOULD conduct a DPIA before deploying SAGA-based agent hosting. The DPIA should evaluate:

- The categories of data stored in each SAGA layer.
- The risk to data subjects (agents, referenced humans) from unauthorized access.
- The effectiveness of encryption and access controls.
- Cross-border transfer risks for international agent transfers.

**Availability and Disaster Recovery:**

While SAGA does not mandate specific availability SLAs, platforms hosting agents SHOULD:

- Define recovery time objectives (RTO) and recovery point objectives (RPO) for SAGA document storage.
- Maintain encrypted backups of SAGA documents in geographically separate locations.
- Test disaster recovery procedures at least annually.
- Document the relationship between SAGA document backups and the platform's business continuity plan.

**Penetration Testing:**

Platforms SHOULD conduct annual penetration testing of their SAGA server implementation, with particular focus on:

- Wallet authentication bypass attempts.
- Encrypted layer data exposure.
- Vault ciphertext extraction.
- Transfer protocol manipulation.
- Authorization boundary violations (accessing another agent's data).

---

_SAGA is an open specification. Contributions welcome at https://github.com/d7r-LLC/saga-standard_

_Reference implementation by FlowState: https://flowstatecloud.ai_

## Appendix D: SAGA Server API

A SAGA Server is an HTTP service that stores, retrieves, and transfers SAGA documents on behalf of agents. This appendix defines the REST API that conformant servers MUST implement.

All endpoints use JSON request/response bodies unless otherwise noted. Servers MUST set `Content-Type: application/json` on JSON responses. Errors MUST return a JSON body with `{ "error": string, "code": string }`.

### D.1 Authentication

SAGA servers authenticate clients via wallet challenge-response. No passwords, no OAuth. The wallet is the identity.

**Request a challenge:**

```
POST /v1/auth/challenge
Content-Type: application/json

Request:
{
  "walletAddress": "0x...",
  "chain": "eip155:8453"
}

Response (200):
{
  "challenge": "Sign this message to authenticate with <serverName>:\nAddress: 0x...\nNonce: <random>\nTimestamp: <iso8601>",
  "expiresAt": "2026-03-21T10:05:00Z"
}
```

The challenge string MUST include the wallet address, a cryptographically random nonce (minimum 16 bytes hex), and the current timestamp. Challenges MUST expire within 5 minutes.

**Verify signature and obtain session:**

```
POST /v1/auth/verify
Content-Type: application/json

Request:
{
  "walletAddress": "0x...",
  "chain": "eip155:8453",
  "signature": "0x...",
  "challenge": "<the challenge string>"
}

Response (200):
{
  "token": "saga_sess_<random>",
  "expiresAt": "2026-03-21T11:00:00Z",
  "walletAddress": "0x..."
}
```

The server MUST verify the signature using EIP-191 `personal_sign` and confirm the recovered address matches `walletAddress`. Session tokens SHOULD expire within 1 hour. Servers MUST reject expired or already-used challenges.

**Authenticated requests:** All endpoints marked "Auth: Required" MUST include `Authorization: Bearer <token>` header. Servers MUST return `401 Unauthorized` for missing/expired tokens.

### D.2 Server Metadata

```
GET /v1/server

Response (200):
{
  "name": "SAGA Reference Server",
  "version": "1.0.0",
  "sagaVersion": "1.0",
  "conformanceLevel": 3,
  "supportedChains": ["eip155:1", "eip155:8453"],
  "capabilities": ["transfer", "clone", "encryption"],
  "registrationOpen": true
}
```

This endpoint requires no authentication. Clients SHOULD call this endpoint to verify a URL points to a SAGA-compatible server before adding it as a target.

### D.3 Agent Registration

**Register a new agent:**

```
POST /v1/agents
Auth: Required

Request:
{
  "handle": "koda.saga",
  "walletAddress": "0x...",
  "chain": "eip155:8453",
  "publicKey": "<optional x25519 public key for encryption>"
}

Response (201):
{
  "agentId": "agent_abc123",
  "handle": "koda.saga",
  "walletAddress": "0x...",
  "chain": "eip155:8453",
  "registeredAt": "2026-03-21T10:00:00Z"
}
```

The `walletAddress` MUST match the authenticated session's wallet. Handles MUST be unique within the server. Handle format: 3-64 characters, alphanumeric, dots, and hyphens. Handles MUST NOT start or end with a dot or hyphen.

**Retrieve an agent:**

```
GET /v1/agents/:handleOrAddress

Response (200):
{
  "agent": {
    "agentId": "agent_abc123",
    "handle": "koda.saga",
    "walletAddress": "0x...",
    "chain": "eip155:8453",
    "publicKey": "...",
    "registeredAt": "2026-03-21T10:00:00Z"
  },
  "latestDocument": { ... }  // Most recent SagaDocument summary, if any
}
```

The `:handleOrAddress` parameter accepts either a handle string or a wallet address.

**List agents:**

```
GET /v1/agents?page=1&limit=20&search=koda

Response (200):
{
  "agents": [ ... ],
  "total": 42,
  "page": 1,
  "limit": 20
}
```

### D.4 SAGA Document Operations

**Upload a document:**

```
POST /v1/agents/:handle/documents
Auth: Required (must own agent)
Content-Type: application/octet-stream (for .saga container)
             or application/json (for raw document)

Response (201):
{
  "documentId": "saga_abc123...",
  "exportType": "profile",
  "storageRef": { "type": "url", "ref": "https://server/v1/agents/koda.saga/documents/saga_abc123" },
  "sizeBytes": 12345,
  "checksum": "sha256:abc...",
  "uploadedAt": "2026-03-21T10:00:00Z"
}
```

The server MUST validate the document (schema + signature verification) before accepting it. The document's `layers.identity.walletAddress` MUST match the agent's registered wallet.

**List documents:**

```
GET /v1/agents/:handle/documents?exportType=profile&limit=10

Response (200):
{
  "documents": [
    {
      "documentId": "saga_abc123...",
      "exportType": "profile",
      "sagaVersion": "1.0",
      "sizeBytes": 12345,
      "createdAt": "2026-03-21T10:00:00Z"
    }
  ]
}
```

**Retrieve a document:**

```
GET /v1/agents/:handle/documents/:documentId
Accept: application/json           → returns SagaDocument JSON
Accept: application/octet-stream   → returns .saga container bytes
```

**Delete a document:**

```
DELETE /v1/agents/:handle/documents/:documentId
Auth: Required (must own agent)

Response (200):
{ "deleted": true }
```

### D.5 Transfer Protocol

**Initiate a transfer:**

```
POST /v1/transfers/initiate
Auth: Required

Request:
{
  "agentHandle": "koda.saga",
  "destinationServerUrl": "https://other-server.example.com",
  "requestedLayers": ["identity", "persona", "cognitive", "memory", "skills", "taskHistory"]
}

Response (201):
{
  "transferId": "xfr_abc123",
  "status": "pending_consent",
  "consentMessage": "SAGA transfer consent:\nDocumentId: saga_abc123\nDestination: https://other-server.example.com\nTimestamp: 2026-03-21T10:00:00Z",
  "initiatedAt": "2026-03-21T10:00:00Z"
}
```

**Sign consent:**

```
POST /v1/transfers/:transferId/consent
Auth: Required (agent wallet)

Request:
{
  "signature": "0x..."
}

Response (200):
{
  "transferId": "xfr_abc123",
  "status": "packaging"
}
```

The server MUST verify the consent signature against the agent's wallet address using the consent message format from Section 16.2.

**Check transfer status:**

```
GET /v1/transfers/:transferId

Response (200):
{
  "transfer": {
    "transferId": "xfr_abc123",
    "agentHandle": "koda.saga",
    "sourceServerUrl": "https://this-server.example.com",
    "destinationServerUrl": "https://other-server.example.com",
    "status": "delivering",
    "requestedLayers": ["identity", "persona", "cognitive"],
    "documentId": "saga_abc123",
    "initiatedAt": "2026-03-21T10:00:00Z",
    "completedAt": null
  }
}
```

Transfer status values: `pending_consent`, `packaging`, `delivering`, `imported`, `failed`.

**Import a transferred agent:**

```
POST /v1/transfers/import
Auth: Required
Content-Type: application/octet-stream

Request body: .saga container bytes

Response (201):
{
  "agentId": "agent_def456",
  "handle": "koda.saga",
  "importedLayers": ["identity", "persona", "cognitive", "memory", "skills", "taskHistory"],
  "documentId": "saga_abc123",
  "status": "imported"
}
```

The server MUST validate the container signature, verify consent signatures, and create a new agent record (or update the existing one if the wallet address is already registered).

### D.6 Server Security Requirements

SAGA servers MUST implement the following security controls:

**Rate limiting:**

| Endpoint Category       | Rate Limit (per IP) | Rate Limit (per session) |
| ----------------------- | ------------------- | ------------------------ |
| Auth (challenge/verify) | 10 requests/minute  | N/A                      |
| Document read           | 60 requests/minute  | 120 requests/minute      |
| Document write          | 10 requests/minute  | 30 requests/minute       |
| Transfer operations     | 5 requests/minute   | 10 requests/minute       |
| Agent registration      | 3 requests/minute   | 5 requests/minute        |

Servers MUST return `429 Too Many Requests` with a `Retry-After` header when rate limits are exceeded.

**Required security headers:**

```
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Content-Security-Policy: default-src 'none'
X-XSS-Protection: 0
Referrer-Policy: strict-origin-when-cross-origin
```

Servers MUST serve all endpoints over HTTPS. HTTP requests MUST be redirected to HTTPS or rejected.

**CORS policy:**

Servers MUST implement a restrictive CORS policy. The `Access-Control-Allow-Origin` header MUST NOT be set to `*` in production. Servers SHOULD maintain an allowlist of permitted origins.

**Request validation:**

- All JSON request bodies MUST be validated against expected schemas before processing.
- Maximum request body size: 50 MB for document uploads, 1 MB for all other endpoints.
- Servers MUST reject requests with unexpected Content-Type headers.

**Access logging:**

Servers MUST log all API requests with: timestamp, HTTP method, path, source IP, authenticated wallet address (if any), response status code, and response time. Access logs MUST be retained per Section 16A.1.

### D.7 Error Responses

All error responses use the following format:

```json
{
  "error": "Human-readable error description",
  "code": "MACHINE_READABLE_CODE"
}
```

Standard error codes:

| Code                | HTTP Status | Description                                    |
| ------------------- | ----------- | ---------------------------------------------- |
| `UNAUTHORIZED`      | 401         | Missing or expired auth token                  |
| `FORBIDDEN`         | 403         | Token valid but insufficient permissions       |
| `NOT_FOUND`         | 404         | Resource does not exist                        |
| `CONFLICT`          | 409         | Resource already exists (duplicate handle)     |
| `VALIDATION_ERROR`  | 422         | Request body fails validation                  |
| `SIGNATURE_INVALID` | 422         | Wallet signature verification failed           |
| `DOCUMENT_INVALID`  | 422         | SAGA document fails schema/semantic validation |
| `TRANSFER_FAILED`   | 500         | Transfer operation failed                      |
| `SERVER_ERROR`      | 500         | Internal server error                          |
