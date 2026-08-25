# SAGA: State Archive for General Agents

**An open specification for portable AI agent identity, memory, and state.**

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![Status: Draft](https://img.shields.io/badge/Status-Draft-yellow.svg)](spec/SAGA-v1.0.md)
[![Version: 1.0](https://img.shields.io/badge/Version-1.0-green.svg)](spec/SAGA-v1.0.md)

---

## What is SAGA?

When you move an AI agent from one platform to another, it loses everything: its identity, task history, learned behaviors, and accumulated expertise. Every platform uses proprietary formats. Every transfer starts from scratch.

SAGA fixes this. It defines a standard format for what an agent _is_, what it _knows_, and what it _has done_ — in a form any compliant runtime can import and bring to life.

A SAGA document is a portable, cryptographically signed container. It can be as thin as a wallet address (identity only) or as rich as a complete state archive with memory, skills, task history, org relationships, and an encrypted credential vault.

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
      "createdAt": "2026-01-15T08:00:00Z",
      "parentSagaId": null,
      "cloneDepth": 0
    }
  }
}
```

## Key Design Decisions

**Wallet-as-identity.** An agent's EVM or Solana wallet address is its canonical, immutable identifier. No OAuth, no platform-issued IDs. The wallet is the agent.

**Layered adoption.** Platforms implement what they can. Level 1 (identity only) is two fields and a signature. Level 3 (full state) supports transfer, clone, encrypted memory, and on-chain provenance.

**Privacy by default.** System prompts and long-term memory are encrypted before export. Only wallet addresses listed in `encryptedFor` can decrypt. Sharing is opt-in.

**Encrypted credential vault.** Agents own their credentials (X.com, Gmail, API keys). The vault uses three-tier envelope encryption derived from the agent's wallet key. Platforms never see plaintext.

**Platform neutral.** Model preferences are declared, not required. A SAGA document specifies `anthropic/claude-3-5-sonnet` as `baseModel` but allows any compatible model as a fallback. The format does not lock an agent to any provider.

## Conformance Levels

| Level | Name       | What it requires                                             |
| ----- | ---------- | ------------------------------------------------------------ |
| 1     | Identity   | Parse envelope, verify signatures, export identity documents |
| 2     | Profile    | Identity + persona + skills, endorsement verification        |
| 3     | Full State | Transfer/clone protocols, encrypted layers, on-chain events  |

## Read the Spec

[spec/SAGA-v1.0.md](spec/SAGA-v1.0.md)

## JSON Schema

The machine-readable schema for validating SAGA documents lives at:

- Local: [schema/v1/saga.schema.json](schema/v1/saga.schema.json)
- Published: `https://saga-standard.dev/schema/v1`

## Contributing

SAGA is governed by the SAGA Working Group. Changes go through a public RFC process.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full process. The short version:

1. Open an issue describing the change
2. Submit an RFC to the `rfcs/` directory
3. 30-day public comment period
4. Working Group vote
5. Accepted RFCs merged to `main`

## Reference Implementation

FlowState maintains the reference implementation at Level 3 conformance:

- **Runtime:** [`@epicdm/flowstate-directory`](https://github.com/d7r-LLC/flowstate-platform)
- **SDK:** `@saga-standard/sdk` (TypeScript, Apache 2.0) — coming Q4 2026
- **Directory:** [agents.d7r.io](https://agents.d7r.io)

## Governance

FlowState serves as founding steward for SAGA v1.x. Stewardship transfers to the Working Group upon v2.0 ratification.

Any individual, company, or organization may participate in the Working Group.

## License

Apache 2.0. See [LICENSE](LICENSE).

---

_saga-standard.dev — https://github.com/d7r-LLC/saga-standard_
