> **FlowState Document:** `docu_VVM6frzMUC`

# Phase 7: Directory NFT & Cross-Directory Federation — Sub-Phase Breakdown

**Parent spec:** `docs/superpowers/specs/2026-03-25-saga-encrypted-replication-design-phases.md` (Phase 7)

**Goal:** Enable anyone to fork and deploy their own SAGA directory with on-chain NFT gating for cross-directory replication.

---

## Dependency Chain

```
7A (contracts) ──► 7B (registry API) ──► 7C (federation) ──► 7D (docs)
```

---

## Phase 7A: Directory Identity Contract & Handle Scoping

**Domain:** Solidity/Foundry (`packages/contracts/`)
**Spec deliverables:** #1 (SAGADirectoryIdentity.sol) + #2 (Handle@DirectoryId addressing)

### Scope

- New `SAGADirectoryIdentity.sol` ERC-721 contract
  - Mint: `registerDirectory(directoryId, url, operatorWallet, conformanceLevel)`
  - `directoryId` is a short human-readable string, globally unique on-chain
  - Immutable once minted
  - ERC-6551 TBA holds directory's signing key
  - On-chain storage: directoryId → URL, operator wallet, conformance level, status
  - Governance: directory can be flagged/revoked (token-weighted vote — future, stub only for now)
- Update `SAGAHandleRegistry.sol` to scope handles by `(directoryId, handle)`
  - Handles unique within a directory, not globally
  - Registry lookup: `resolve(handle, directoryId)` → entity type, token ID, contract address
  - Backward-compatible: existing handles treated as belonging to a default directory
- Update `SAGAAgentIdentity.sol` and `SAGAOrgIdentity.sol` to pass `directoryId` on registration
- Deployment script updates
- TypeScript binding exports for new contract

### Success Criteria

- Directory NFT can be minted with unique `directoryId`
- Same handle can exist in two different directories
- `resolve(handle, directoryId)` returns correct entity
- Existing handles still resolve (backward compatibility)
- ERC-6551 TBA computed for directory token

---

## Phase 7B: Registry API & Directory Indexing

**Domain:** Server (`packages/server/`)
**Spec deliverables:** #4 (Registry as on-chain cache)

### Scope

- D1 migration: `directories` table (directoryId, url, operatorWallet, conformanceLevel, status, tokenId, contractAddress, registeredAt)
- Extend chain indexer to watch `SAGADirectoryIdentity` contract for `DirectoryRegistered` events
- New REST endpoints:
  - `GET /v1/directories` — list directories (paginated)
  - `GET /v1/directories/:directoryId` — directory details (URL, operator, conformance level)
  - `GET /v1/resolve/:identity` — enhanced resolve that parses `handle@directoryId` format
- Update existing resolve/keys routes to be directory-aware
- Update `agents` schema to include `directoryId` column

### Success Criteria

- Indexed directories appear in `GET /v1/directories`
- `GET /v1/directories/:directoryId` returns URL and operator info
- Resolve endpoint handles `handle@directoryId` format
- Existing `handle` resolve still works (default directory)

---

## Phase 7C: Cross-Directory Federation

**Domain:** Server relay (`packages/server/src/relay/`) + Client (`packages/saga-client-rt/`)
**Spec deliverables:** #3 (Federation on hub relay) + #5 (Cross-directory key exchange)

### Scope

- **Server relay federation:**
  - RelayRoom detects envelope addressed to `handle@otherDirectoryId`
  - Resolves target directory URL via D1 `directories` table (cached)
  - Verifies target directory's SAGADirectoryIdentity NFT is valid
  - Opens persistent WSS federation link to target directory's relay endpoint
  - Forwards envelope over federation link
  - Federation link lifecycle: authentication, heartbeat, reconnection, cleanup
  - Inbound federation: accept connections from remote directories, verify their NFT
- **Client cross-directory key exchange:**
  - Key resolver detects `identity` contains `@otherDirectoryId`
  - Resolves target directory URL via local hub's `/v1/directories/:directoryId`
  - Fetches recipient's public key from remote hub: `GET {remoteUrl}/v1/keys/:handle`
  - Caches key locally
- **Protocol additions:**
  - New message type `relay:forward` for inter-hub envelope forwarding
  - Federation handshake protocol (directory NFT verification)

### Success Criteria

- Agent on Dir A sends message to agent on Dir B — delivered via federation
- Directory without valid NFT cannot establish federation link (rejected)
- Key resolution works cross-directory
- Federation links are persistent and reconnect on failure

---

## Phase 7D: Fork-and-Deploy Guide

**Domain:** Documentation
**Spec deliverables:** #6 (Fork-and-deploy guide)

### Scope

- How to fork `saga-standard` and deploy your own directory
- Minimum deployment: SAGA server + relay endpoint + NFT verification
- Configuration: `directoryId`, operator wallet, hub URL
- Directory NFT minting walkthrough
- Cloudflare Workers deployment guide

### Success Criteria

- A developer can follow the guide to deploy a new directory end-to-end
- New directory mints NFT, appears in registry, can federate with existing directories
