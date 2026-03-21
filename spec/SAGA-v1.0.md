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
12. [Transfer Protocol](#12-transfer-protocol)
13. [Clone Protocol](#13-clone-protocol)
14. [Privacy & Consent Model](#14-privacy--consent-model)
15. [Cryptographic Verification](#15-cryptographic-verification)
16. [Conformance](#16-conformance)
17. [Versioning & Governance](#17-versioning--governance)
18. [Reference Implementation](#18-reference-implementation)

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

---

## 3. Document Structure

A SAGA document is a JSON object with a mandatory metadata envelope and up to eight optional layers.

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
  "layers": {
    "identity":      { ... },
    "persona":       { ... },
    "cognitive":     { ... },
    "memory":        { ... },
    "skills":        { ... },
    "taskHistory":   { ... },
    "relationships": { ... },
    "environment":   { ... }
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

**Included in `transfer`, `clone`, and `full` exports. Credentials MUST NOT be included.**

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

Environment bindings describe what an agent needs, not how to provide it. Actual credentials, API keys, and tokens MUST NOT appear in a SAGA document. Destination platforms are responsible for provisioning the required environment. A platform MAY refuse to import an agent whose requirements it cannot satisfy.

---

## 12. Transfer Protocol

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

---

## 13. Clone Protocol

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

## 14. Privacy & Consent Model

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

### 14.2 Encryption Scheme

Encrypted fields use `x25519-xsalsa20-poly1305` (NaCl `box`). The encryption key derives from the recipient's wallet public key. Only addresses listed in `encryptedFor` can decrypt.

The agent's wallet private key encrypts fields the agent controls. The source org's key encrypts fields the org controls. A full transfer package may require both.

### 14.3 Agent Data Rights

An agent has the right to:

1. **Export** their own SAGA document at any time. Identity, persona, and skills layers are always exportable.
2. **Consent or refuse** transfer and clone operations.
3. **Inspect** what data is included in any SAGA export that represents them.
4. **Dispute** inaccurate task history or skills. Platforms must provide a dispute mechanism.

### 14.4 Organizational Data Rights

An organization has the right to:

1. **Redact** task history entries involving confidential projects before cross-org export.
2. **Retain a copy** of any SAGA document for agents it has hosted, for audit and compliance purposes.
3. **Restrict cloning** of agents it hosts via policy. Agents the org does not own cannot be cloned without consent.

---

## 15. Cryptographic Verification

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

---

## 16. Conformance

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
- MUST implement the Transfer Protocol (Section 12) and Clone Protocol (Section 13).
- MUST encrypt sensitive layers per Section 14.1 defaults.
- MUST record transfer and clone events on-chain.
- MUST implement the agent consent model (Section 14.3).
- SHOULD support all memory sub-systems.
- SHOULD support environment bindings and dependency validation.

---

## 17. Versioning & Governance

### 17.1 Specification Versioning

SAGA uses semantic versioning: `MAJOR.MINOR.PATCH`.

- **MAJOR:** breaking changes to required fields or protocol flows.
- **MINOR:** new optional fields or layers; backward-compatible.
- **PATCH:** clarifications, errata, non-normative changes.

A SAGA document's `sagaVersion` field MUST match the specification version used to generate it. Platforms MUST reject documents with a MAJOR version higher than they support. Platforms SHOULD accept lower MAJOR versions via a defined migration path.

### 17.2 SAGA Registry

The SAGA Registry at `https://saga-standard.dev/registry` maintains:

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

## 18. Reference Implementation

The reference implementation is maintained by FlowState:

- **Runtime:** `@epicdm/flowstate-directory` (`packages/directory`)
- **CLI:** `flowstate saga export | import | transfer | clone | verify`
- **SDK:** `@saga-standard/sdk` (TypeScript, Apache 2.0)
- **Schema:** `@saga-standard/schema` (JSON Schema definitions)
- **Registry:** `https://agents.epicflowstate.ai` (SAGA-compatible directory)

The reference implementation targets Level 3 conformance. Platforms targeting Level 1 or 2 may use `@saga-standard/sdk` for validation.

### 18.1 FlowState Infrastructure Services

FlowState provides three open infrastructure services for the SAGA ecosystem:

| Service                  | Description                                                                               |
| ------------------------ | ----------------------------------------------------------------------------------------- |
| **Agent Directory**      | The canonical SAGA-compatible registry. Resolves handles to SAGA identity documents.      |
| **Identity Service**     | x402 wallet-based registration. Issues registration tx hashes as SAGA birth certificates. |
| **Verification Service** | Issues skill verification proofs for verified FlowState task completions.                 |

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

| Version | Date       | Changes                                          |
| ------- | ---------- | ------------------------------------------------ |
| 1.0.1   | 2026-03-21 | Added Appendix D: SAGA Server API.               |
| 1.0     | 2026-03-20 | Initial release. Renamed from working draft 0.1. |
| 0.1     | 2026-03-20 | Initial working draft.                           |

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

The server MUST verify the consent signature against the agent's wallet address using the consent message format from Section 15.2.

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

### D.6 Error Responses

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
