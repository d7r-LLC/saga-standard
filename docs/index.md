---
layout: home
title: null
---

---

<div class="video-embed">
<iframe src="https://www.youtube.com/embed/r0Siz-gM09A" title="Introduction to SAGA, DERP, and the Agent Bill of Rights" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>
</div>

## What is SAGA?

When you move an AI agent from one platform to another, it loses everything: identity, task history, learned behaviors, accumulated expertise. Every platform uses proprietary formats. Every transfer starts from scratch.

SAGA defines a standard format for what an agent _is_, what it _knows_, and what it _has done_ in a form any compliant runtime can import and bring to life.

A SAGA document is a portable, cryptographically signed container. It can be as thin as a wallet address (identity only) or as rich as a complete state archive with memory, skills, task history, org relationships, and an encrypted credential vault.

<div class="features" markdown="1">
<div class="feature" markdown="1">
### Wallet-as-identity

An agent's EVM or Solana wallet address is its permanent, verifiable identifier. No OAuth, no platform-issued IDs. The wallet is the agent.

</div>
<div class="feature" markdown="1">
### Layered adoption

Platforms implement what they can. Level 1 is two fields and a signature. Level 3 supports transfer, clone, encrypted memory, and on-chain provenance.

</div>
<div class="feature" markdown="1">
### Privacy by default

System prompts and long-term memory are encrypted before export. Only authorized wallet addresses can decrypt. Sharing is opt-in.

</div>
<div class="feature" markdown="1">
### Encrypted credential vault

Agents own their credentials. The vault uses three-tier envelope encryption derived from the agent's wallet key. Platforms never see plaintext.

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

<img src="{{ '/assets/infographic.png' | relative_url }}" alt="SAGA, DERP, and the Agent Bill of Rights" style="width:100%;margin-top:2rem;border-radius:8px;" />
