**FlowState Task:** `task_zvCoHOp10W`
**FlowState Milestone:** `mile_Xv442v-fH8`
**FlowState Project:** `proj__3viGkPhXu`
**FlowState Spec:** `docu_13E_mSxrv3`

# Phase 1 — Mainnet-blocking contract + deploy fixes

## Context

Three Critical findings + one Medium finding from the 2026-05-03 audit must land before `saga deploy --chain base --broadcast --production` runs. Per the spec, this PR resolves them in a single mainnet-gating change.

## Findings resolved

| #   | Severity | Source   | Action                                                                   |
| --- | -------- | -------- | ------------------------------------------------------------------------ |
| 1.1 | Critical | A-Crit#4 | `SAGADirectoryIdentity.updateDirectoryStatus` operator-cannot-self-rehab |
| 1.2 | Critical | A-Crit#3 | Deploy entrypoint reads mnemonic from stdin, not argv                    |
| 1.3 | Critical | A-Crit#3 | Deploy container runs `--read-only` with tmpfs for forge cache           |
| 1.4 | Medium   | A-Med#14 | Solidity URL validation on `hubUrl`, `directoryUrl`, `newUrl` fields     |
| 1.5 | High     | A-High#9 | DECISION: ship FCFS handle registration as-is + document risk            |

## Implementation

### 1.1 Operator self-rehab restriction

The current `SAGADirectoryIdentity.updateDirectoryStatus(tokenId, newStatus)` accepts ANY status from EITHER the token owner OR the contract owner. A directory operator caught misbehaving and flagged by governance can flip their status back to `active` 1 second later, defeating Safe-multisig oversight.

**Fix:** rank-order the four statuses (`active=0, suspended=1, flagged=2, revoked=3`) and apply role-aware authority:

- **Contract owner (Safe):** can set any status (full governance authority).
- **Token owner (operator):** can only DOWNGRADE — i.e., set a status with a _higher or equal_ rank than the current status. They cannot upgrade from `flagged` back to `active` or `suspended`.

A status change to the same rank is a no-op (still allowed for both, idempotent).

### 1.2 Mnemonic-via-stdin (and never argv)

The existing entrypoint passes the BIP-39 mnemonic to `cast wallet private-key "$SIGNER_INPUT" "$DERIVATION_PATH"`. The mnemonic appears in `/proc/$pid/cmdline` for the duration of the cast process — readable by any sibling process inside the container.

`cast wallet private-key` does not currently accept the mnemonic via stdin. Fix: add `packages/contracts/scripts/derive-mnemonic.mjs` — a tiny Node helper that reads the mnemonic from stdin, validates it, derives the seed, and walks the HD path using `@scure/bip39` + `@scure/bip32` (audited, dependency-light primitives — same family viem uses internally). The hex private key is written to stdout with no trailing newline, no logs, no argv exposure.

The entrypoint script locates the helper via a path probe (canonical install at `/usr/local/lib/saga-deploy/derive-mnemonic.mjs` inside the container; sibling-of-script for local dev) and pipes the mnemonic in:

```bash
SIGNER_KEY=$(printf '%s' "$SIGNER_INPUT" \
  | node "$DERIVE_HELPER" "$DERIVATION_PATH")
unset SIGNER_INPUT
```

The hex private-key path through `cast wallet` is retained for hex-format credentials (single-line / 1 word).

`@scure/bip32` and `@scure/bip39` are declared as runtime dependencies of `@saga-standard/contracts` so local execution resolves them via the workspace `node_modules`. The deploy container additionally installs them globally at pinned minor versions so the helper can run with `--read-only` (no per-run `npm install` needed inside the container).

### 1.3 Read-only container + tmpfs

`buildDockerRunArgs` in `packages/cli/src/deploy-docker.ts` is updated to:

- Add `--read-only` to the `docker run` args.
- Add `--tmpfs /forge-cache:rw,size=512m,mode=1777` for forge's cache directory.
- Add `--tmpfs /tmp:rw,size=128m,mode=1777` for general temp use (cast, jq, curl).

Foundry honors `FOUNDRY_CACHE_PATH` env var. The deploy entrypoint sets `FOUNDRY_CACHE_PATH=/forge-cache` so forge writes to the tmpfs.

### 1.4 Solidity URL validation

A shared `SAGAValidation` library exposes:

```solidity
library SAGAValidation {
    uint256 internal constant MAX_URL_BYTES = 1024;
    error InvalidUrlLength();
    error InvalidUrlProtocol();

    function validateUrl(string calldata url) internal pure {
        bytes calldata b = bytes(url);              // calldata view, no memory copy
        uint256 len = b.length;
        if (len == 0 || len > MAX_URL_BYTES) revert InvalidUrlLength();
        // require http:// or https:// prefix
        ...
    }
}
```

Reading `bytes(url)` as `bytes calldata` (rather than `bytes memory`) avoids a calldata-to-memory copy on every URL ingress. Gas savings are small per call but apply to every register / update on every identity contract.

Apply at every URL ingress:

- `SAGAAgentIdentity.registerAgent(handle, hubUrl)`
- `SAGAAgentIdentity.registerAgentInDirectory(handle, hubUrl, directoryId)`
- `SAGAAgentIdentity.updateHomeHub(tokenId, newHubUrl)`
- `SAGADirectoryIdentity.registerDirectory(directoryId, url, operator, conformanceLevel)`
- `SAGADirectoryIdentity.updateDirectoryUrl(tokenId, newUrl)`

`SAGAOrgIdentity` has no URL fields (uses `name`), so it's untouched.

### 1.5 FCFS handle decision

Per the spec, default is **ship FCFS as-is for MVP1, document the front-running risk in `docs/spec.md`, plan commit-reveal for v2**. The registry isn't user-callable directly (only the identity contracts call it), so the front-running surface is the identity-contract `register*` functions — which are already public mints by design. Adding commit-reveal to a permissionless mint is non-trivial UX-wise and not justified pre-launch.

Action: add a "Handle registration semantics" section to `docs/spec.md` documenting the FCFS behavior and front-running awareness for client implementers.

### 1.6 Forge tests

New tests in `packages/contracts/test/`:

- `SAGAValidation.t.sol` — covers `validateUrl` length and protocol checks.
- Expansions to `SAGADirectoryIdentity.t.sol` — token owner can downgrade but cannot upgrade; contract owner has full authority.
- Expansion to `SAGAAgentIdentity.t.sol` — URL validation reverts.

### 1.7 Deploy.s.sol

No constructor changes from 1.1 or 1.4 (only function bodies + new library import). `Deploy.s.sol` does not need updates.

## Acceptance criteria

- All Forge tests green (`forge test`)
- `pnpm --filter @d7r/saga-cli typecheck` green (deploy-docker.ts changes type-check)
- `pnpm --filter @d7r/saga-cli test` green (deploy-docker tests still pass)
- New tests cover: downgrade allowed, upgrade reverts, oversized URL reverts, malformed protocol reverts, mnemonic-stdin script derives correct key for known test mnemonic
- Manual smoke: `node packages/contracts/scripts/derive-mnemonic.mjs "m/44'/60'/0'/0/0"` with the 12-word "test test ... junk" mnemonic on stdin emits `0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80` (Hardhat first account)

## Out of scope

- Upgradability. Contract changes are direct — old testnet bytecode is stale, redeploy is the answer.
- Mainnet broadcast. This PR makes mainnet broadcast safe to do; broadcast itself is a separate operator action.
- Phase 2+ findings.

## Commit plan

Single commit:

```
feat(security): Phase 1 — mainnet-blocking contract + deploy fixes

Built with d7r FlowState
```
