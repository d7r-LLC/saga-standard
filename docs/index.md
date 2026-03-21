---
layout: default
title: null
---

<div class="page-wrapper">
<div class="content-full">

<div class="hero">
  <h1>SAGA Standard</h1>
  <p class="tagline">An open specification for portable AI agent identity, memory, and state.</p>
  <div class="badges">
    <img src="https://img.shields.io/badge/Version-1.0-2563eb" alt="Version 1.0">
    <img src="https://img.shields.io/badge/Status-Draft-eab308" alt="Status: Draft">
    <img src="https://img.shields.io/badge/License-Apache%202.0-22c55e" alt="License: Apache 2.0">
  </div>
  <div class="hero-actions">
    <a href="/spec" class="btn btn-primary">Read the Spec</a>
    <a href="https://github.com/d7r-LLC/saga-standard" class="btn btn-secondary">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
      GitHub
    </a>
  </div>
</div>

---

## What is SAGA?

When you move an AI agent from one platform to another, it loses everything: identity, task history, learned behaviors, accumulated expertise. Every platform uses proprietary formats. Every transfer starts from scratch.

SAGA defines a standard format for what an agent _is_, what it _knows_, and what it _has done_ in a form any compliant runtime can import and bring to life.

A SAGA document is a portable, cryptographically signed container. It can be as thin as a wallet address (identity only) or as rich as a complete state archive with memory, skills, task history, org relationships, and an encrypted credential vault.

<div class="features">
  <div class="feature">
    <h3>Wallet-as-identity</h3>
    <p>An agent's EVM or Solana wallet address is its permanent, verifiable identifier. No OAuth, no platform-issued IDs. The wallet is the agent.</p>
  </div>
  <div class="feature">
    <h3>Layered adoption</h3>
    <p>Platforms implement what they can. Level 1 is two fields and a signature. Level 3 supports transfer, clone, encrypted memory, and on-chain provenance.</p>
  </div>
  <div class="feature">
    <h3>Privacy by default</h3>
    <p>System prompts and long-term memory are encrypted before export. Only authorized wallet addresses can decrypt. Sharing is opt-in.</p>
  </div>
  <div class="feature">
    <h3>Encrypted credential vault</h3>
    <p>Agents own their credentials. The vault uses three-tier envelope encryption derived from the agent's wallet key. Platforms never see plaintext.</p>
  </div>
</div>

## The Nine Layers

| Layer | Name                    | Required        |
| ----- | ----------------------- | --------------- |
| 1     | Identity                | Always          |
| 2     | Persona                 | Profile exports |
| 3     | Cognitive Configuration | Transfer/clone  |
| 4     | Memory                  | Transfer/clone  |
| 5     | Skills & Capabilities   | Profile exports |
| 6     | Task History            | Transfer/clone  |
| 7     | Relationships           | Transfer/clone  |
| 8     | Environment Bindings    | Transfer/clone  |
| 9     | Credentials Vault       | Transfer/clone  |

## Conformance Levels

| Level | Name       | What it requires                                             |
| ----- | ---------- | ------------------------------------------------------------ |
| 1     | Identity   | Parse envelope, verify signatures, export identity documents |
| 2     | Profile    | Identity + persona + skills, endorsement verification        |
| 3     | Full State | Transfer/clone protocols, encrypted layers, on-chain events  |

## Minimal SAGA Document

```json
{
  "$schema": "https://saga-standard.dev/schema/v1",
  "sagaVersion": "1.0",
  "documentId": "saga_01J9XZAB12KQ...",
  "exportedAt": "2026-03-20T10:00:00Z",
  "exportType": "identity",
  "signature": {
    "walletAddress": "0xabc...123",
    "chain": "eip155:8453",
    "message": "SAGA export saga_01J9XZAB12KQ... at 2026-03-20T10:00:00Z",
    "sig": "0xdef...456"
  },
  "layers": {
    "identity": {
      "handle": "aria-chen",
      "walletAddress": "0xabc...123",
      "chain": "eip155:8453",
      "createdAt": "2026-01-15T08:00:00Z"
    }
  }
}
```

## JSON Schema

The machine-readable schema for validating SAGA documents:

- **Published:** [`https://saga-standard.dev/schema/v1/saga.schema.json`](/schema/v1/saga.schema.json)
- **Source:** [`schema/v1/saga.schema.json`](https://github.com/d7r-LLC/saga-standard/blob/main/schema/v1/saga.schema.json)

## Reference Implementation

FlowState maintains the reference implementation at Level 3 conformance:

- **SDK:** [`@epicdm/saga-sdk`](https://github.com/d7r-LLC/saga-standard/tree/main/packages/sdk) (TypeScript, Apache 2.0)
- **CLI:** [`@epicdm/saga-cli`](https://github.com/d7r-LLC/saga-standard/tree/main/packages/cli)
- **Server:** [`@epicdm/saga-server`](https://github.com/d7r-LLC/saga-standard/tree/main/packages/server) (Cloudflare Workers)
- **Directory:** [agents.epicflowstate.ai](https://agents.epicflowstate.ai)

## Governance

SAGA is governed by an open Working Group. Any individual, company, or organization may participate. Changes go through a [public RFC process](/contributing).

FlowState serves as founding steward for v1.x. Stewardship transfers to the Working Group at v2.0.

</div>
</div>
