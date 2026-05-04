# SAGA Contracts Audit — Unified Gap Matrix

**Date:** 2026-05-03
**Engagement:** Pre-mainnet smart-contract security audit
**Scope:** `packages/contracts/src/` + deploy scripts + tests
**Bundle:** 223 KB across 6 contracts, 6 tests, 3 deploy scripts

---

## Phase 8 Closure Status — 2026-05-04

All 15 findings have a resolution. **Phase 8** — the contract-audit
remediation milestone — landed in 5 PRs against `dev`:

| Phase | PR  | Findings closed                       |
| ----- | --- | ------------------------------------- |
| 8A    | #45 | F-1, F-2, F-3, F-5, F-8 (5)           |
| 8B    | #46 | F-4, F-6, F-10 (3)                    |
| 8C    | #47 | F-9, F-12, F-14, F-15 (4)             |
| 8D    | #48 | F-7 (1) — fuzz + invariant tests      |
| Final | #49 | Gap matrix closure + gas report       |

Closure breakdown:

- **13/15 findings closed** by code change (Phases 8A-8D)
- **2/15 findings accepted as-is** without code change (F-11, F-13 — see Status column below)
- **0/15 findings deferred** to follow-up tasks

Test coverage growth across the milestone:

| Stage     | Tests | Notable additions                                |
| --------- | ----- | ------------------------------------------------ |
| Baseline  | 124   | Phase 7 baseline                                 |
| After 8A  | 147   | +23 (Ownable2Step, CEI, F-1 directory check, F-8 constructor checks) |
| After 8B  | 166   | +19 (self-TBA, baseURI event, flagged/revoked transfer block) |
| After 8C  | 172   | +6 (URL prefix-only, conformance cap)            |
| After 8D  | 178   | +6 (4 fuzz tests + 2 invariants × 12,800 calls)  |

**Manual checklist before Base mainnet broadcast:**

- [ ] Run `forge script script/Deploy.s.sol --rpc-url base_sepolia --broadcast --verify` from a clean checkout of `dev` to confirm the new constructor signatures + setDirectoryIdentity wiring deploy cleanly.
- [ ] Run `forge script script/TransferOwnership.s.sol --rpc-url base_sepolia --broadcast` against a Sepolia test Safe; verify on BaseScan that each contract's `pendingOwner` is the Safe and `owner()` is still the deployer.
- [ ] Submit `acceptOwnership()` from the Sepolia test Safe via Safe Transaction Builder; verify `owner()` flips to Safe on each contract.
- [ ] Visually confirm the production Safe address in `deploy.config.yaml` (signers + threshold) before mainnet broadcast.
- [ ] Run final mainnet broadcast → Safe accept → freeze.

---

## Provider runs

| # | Provider  | Model                       | Duration | Input → Output tokens | Findings |
| - | --------- | --------------------------- | -------- | --------------------- | -------- |
| 1 | Anthropic | claude-opus-4-7             | 229.4s   | 95,639 → 15,458       | 14 (3 HIGH / 3 MED / 5 LOW / 3 INFO) |
| 2 | OpenAI    | gpt-5.5                     | 166.8s   | 55,923 → 11,632       | 9  (1 HIGH / 3 MED / 4 LOW / 1 INFO) |
| 3 | Gemini    | gemini-3.1-pro-preview      | 94.2s    | 65,771 → 3,237        | 6  (2 HIGH / 3 MED / 0 LOW / 1 INFO) |

Output paths:
- `audits/2026-05-04T02-02-02__.../response.md` — Anthropic
- `audits/2026-05-04T02-15-25__.../response.md` — OpenAI
- `audits/2026-05-04T02-03-51__.../response.md` — Gemini

---

## Severity consensus methodology

For each finding, the **consensus severity** is the maximum severity called by any provider that flagged it (highest-watermark rule — if any auditor saw it as HIGH, it stays HIGH for triage purposes). The **agreement column** is `n/3` where n is the number of providers that flagged it.

This is a triage tool, not a finding rewrite. Cite the specific provider response file for the original prose.

---

## Unified gap matrix

Status legend: **CLOSED** (code change merged) · **ACCEPTED** (no fix; rationale in Status column).

| ID  | Finding                                                                                          | Consensus | Status | Closed by |
| --- | ------------------------------------------------------------------------------------------------ | --------- | ------ | --------- |
| **F-1**  | Scoped directory registration accepts any `directoryId` (no existence / status / authorization check) | **HIGH**  | ✅ CLOSED | PR #45 (Phase 8A) — registry gains `directoryIdentity` + `setDirectoryIdentity`; scoped registration verifies the directoryId resolves to a DIRECTORY entity registered by the configured directoryIdentity contract AND is currently `active` |
| **F-2**  | `_safeMint` runs before mapping writes / CEI violation / receiver hook sees half-initialized state    | **HIGH**  | ✅ CLOSED | PR #45 (Phase 8A) — `_safeMint` moved to end of all 5 register* functions + `nonReentrant`; PR #45 fix-commit also extends `nonReentrant` to all post-mint mutators (updateHomeHub, updateOrgName, updateDirectoryUrl, updateDirectoryStatus) |
| **F-3**  | `Ownable` single-step + `renounceOwnership` un-overridden across all 4 contracts                      | **HIGH**  | ✅ CLOSED | PR #45 (Phase 8A) — all 4 Ownable contracts migrated to `Ownable2Step`; `renounceOwnership` reverts on each; `TransferOwnership.s.sol` updated for two-step handoff (deployer transfers, Safe accepts) |
| **F-4**  | ERC-6551 ownership loop — NFT can be locked inside its own TBA permanently                            | **MEDIUM**| ✅ CLOSED | PR #46 (Phase 8B) — identity contracts hold immutable `tbaHelper` reference; `_update` override reverts on transfer to `tbaHelper.computeAccount(self, tokenId)` |
| **F-5**  | `Deploy.s.sol` accepts `TBA_IMPLEMENTATION = address(0)` via `vm.envOr` — silent bricking             | **MEDIUM**| ✅ CLOSED | PR #45 (Phase 8A) — `vm.envAddress` reverts hard on unset; `code.length > 0` check rejects zero/EOA |
| **F-6**  | `setBaseURI` unbounded, unvalidated, no event                                                          | **MEDIUM**| ✅ CLOSED | PR #46 (Phase 8B) — pipes through `SAGAValidation.validateUrl` (1024 byte cap, http(s)-only); emits `BaseURIUpdated(old, new)` |
| **F-7**  | No fuzz / invariant / reentrancy-regression tests                                                      | **INFO**  | ✅ CLOSED | PR #48 (Phase 8D) — 4 fuzz tests + 2 invariants × 12,800 calls each (`testFuzz_validateHandle_acceptOnlyValidAscii`, `testFuzz_validateUrl_lengthBoundary`, `testFuzz_computeAccount_*`, `invariant_tokenOwnerNeverUpgradesStatus`, `invariant_registryMatchesNftSupply`) |
| **F-8**  | Identity constructors accept zero / non-contract `registry` address                                    | **MEDIUM**| ✅ CLOSED | PR #45 (Phase 8A) — `code.length > 0` check on registry input across SAGAAgentIdentity, SAGAOrgIdentity, SAGADirectoryIdentity, SAGATBAHelper; PR #46 extends to tbaHelper input |
| **F-9**  | Directory `conformanceLevel` is free-form self-attestation (no whitelist / governance gate)            | **LOW**   | ✅ CLOSED | PR #47 (Phase 8C) — 32-byte cap on input; docstring on `registerDirectory` and `conformanceLevel(uint256)` view explicitly documents "self-claimed" semantics. Function NAME preserved for ABI compat (rename was cosmetic; cap is the security fix) |
| **F-10** | No `_update` override → revoked / flagged directories remain transferable; `updateDirectoryUrl` callable in revoked state | **MEDIUM**| ✅ CLOSED | PR #46 (Phase 8B) — `SAGADirectoryIdentity._update` reverts when `_statusRank >= 2`; `updateDirectoryUrl` gates on the same threshold |
| **F-11** | `ERC721Enumerable` + unbounded permissionless mints — gas griefing on enumeration                      | **LOW**   | 🟡 ACCEPTED — direct attack only hurts the attacker (they pay gas to mint AND for their own future transfers); no on-chain consumer of `tokenOfOwnerByIndex` exists in this repo. Off-chain indexers use `Transfer` events, not enumeration. Documented as accepted; no code change required. |
| **F-12** | `SAGAValidation.validateUrl` accepts `http://` exactly (empty host) — bytes after prefix unvalidated   | **LOW**   | ✅ CLOSED | PR #47 (Phase 8C) — `validateUrl` reverts with `InvalidUrlLength` when `len == 7` (just `http://`) or `len == 8` (just `https://`). Bytes-after-prefix character-level validation deferred — off-chain consumers must still sanitize per SECURITY.md |
| **F-13** | Resolve handle is one-way (tokenId → handle requires a second call); dev-experience gap                | **INFO**  | 🟡 ACCEPTED — dev-experience gap, not a security finding. Indexers already cache the reverse mapping from `Transfer` + `*Registered` events; on-chain reverse lookup would add storage cost without security value. No code change. |
| **F-14** | OpenZeppelin not pinned to commit SHA in `.gitmodules`                                                 | **INFO**  | ✅ CLOSED | PR #47 (Phase 8C) — `.gitmodules` pins openzeppelin-contracts to v5.6.1 and forge-std to v1.9.6. README documents the pinned commits and updates setup instructions to use `git submodule update --init --recursive` |
| **F-15** | `script/DeployOrg.s.sol` will fail post-Safe-transfer (no longer authorized) — confirm intent          | **INFO**  | ✅ CLOSED | PR #46 (Phase 8B fix-commit) + PR #47 (Phase 8C) — DeployOrg.s.sol updated for the new two-arg constructor signature with a top-of-file note about post-Safe-transfer constraints; README "Re-deploying contracts post-Safe-transfer" section documents the Safe-batched workflow |

---

## Mainnet-blocker shortlist (consensus)

These items appear in **at least 2 providers** AND have **MEDIUM-or-higher consensus severity**:

1. **F-1** — Scoped-directory authorization gap (3/3 HIGH)
2. **F-2** — `_safeMint` CEI violation (3/3 HIGH consensus by max-watermark)
3. **F-3** — `Ownable2Step` migration + `renounceOwnership` revert (3/3 HIGH consensus)
4. **F-4** — ERC-6551 self-TBA loop guard (3/3 MEDIUM)
5. **F-5** — `vm.envAddress` for `TBA_IMPLEMENTATION` (3/3 — promoted to MEDIUM by 2/3)
6. **F-6** — `setBaseURI` validation + event (2/3 — Anthropic/OpenAI)

**Singleton MEDIUMs worth landing pre-mainnet:**

7. **F-8** — Constructor address validation in identity contracts (OpenAI only) — small fix, defends a deployer-typo class of bug
8. **F-10** — Block transfers / URL updates of revoked / flagged directories (Anthropic only)

Items 7–8 are singleton (1/3) but cheap to fix and the threat model is sound on its own — landing them costs little, deferring them costs a future audit revisit.

---

## Where the providers diverged

### F-2 severity disagreement
- **Anthropic** + **Gemini**: HIGH — concrete reentrancy + indexer cache pollution scenario.
- **OpenAI**: LOW — argues no direct theft path because a later registry revert unwinds the whole transaction.

OpenAI's downgrade is technically true *for the specific reentrancy attack today* (the entire tx reverts on duplicate handle), but misses the indexer-state-poisoning vector and the regression risk if future code adds a path that doesn't revert. **Treat as HIGH for triage** — the fix (move `_safeMint` to end + `nonReentrant`) is one line per function and closes both severities.

### F-3 severity disagreement
- **Anthropic**: HIGH — emphasizes irreversibility of `transferOwnership` typo + permanent loss of `setAuthorizedContract` if `renounceOwnership` fires.
- **Gemini**: MEDIUM — same argument, called as operational risk.
- **OpenAI**: LOW — calls it "operational bricking risk, not third-party privilege escalation."

OpenAI is correct that this isn't an attacker-driven vuln. Anthropic + Gemini are correct that the consequence (permanent loss of admin) is severe and pre-mainnet is the cheapest moment to fix. **Treat as HIGH for triage.**

### F-5 severity disagreement
- **Anthropic**: LOW — broken TBA layer doesn't lose funds.
- **OpenAI** + **Gemini**: MEDIUM — silent bricking of an immutable contract is a deploy-day disaster.

Gemini and OpenAI are correct that "immutable + silently broken" is materially worse than a bug you can patch. The fix is also trivial (`vm.envAddress` instead of `vm.envOr`). **Treat as MEDIUM for triage.**

---

## Anthropic-specific findings worth keeping

Anthropic was the most thorough (15.5K output tokens vs 11.6K / 3.2K). Items only it surfaced that deserve attention:

- **F-10 — `_update` override for revoked/flagged directories.** Genuine business-logic gap. Without it, governance-revoked directories remain saleable on OpenSea and the new buyer can still call `updateDirectoryUrl` to redirect to phishing. The `A-Crit#4` fix prevents status upgrade but does NOT prevent transfer or URL update.
- **F-11 — Enumerable gas griefing.** Low-impact but worth noting for the indexer team — they should not rely on `tokenOfOwnerByIndex` for enumeration; use Transfer events instead (which they do).
- **F-13 — Resolve handle reverse lookup.** Doc-only.
- **F-14 — OZ pinning.** A 5-second `.gitmodules` change.

## OpenAI-specific findings worth keeping

- **F-8 — Constructor address validation in identity contracts.** OpenAI is the only one to flag that `SAGAAgentIdentity(registry)`, `SAGAOrgIdentity(registry)`, `SAGADirectoryIdentity(registry)` accept zero/non-contract addresses. A typo here in `Deploy.s.sol` deploys broken NFTs that silently succeed at mint but never register handles. Cheap fix: `require(registry.code.length > 0)` in each constructor.
- **F-9 — `conformanceLevel` self-attestation.** Decision required: is this field authoritative or self-claim? Either rename to `claimedConformanceLevel` or replace with an enum gated by governance.

## Gemini-specific findings worth keeping

- **F-12 (boundary case) — `validateUrl` accepts exactly `http://` / `https://`.** Anthropic also caught the broader "no character whitelist" issue but didn't flag this exact 7-byte / 8-byte edge case. Trivial fix: `len > 7` for http, `len > 8` for https.

---

## Recommended remediation phasing

### Phase A — Mainnet-blocking (must land before Base mainnet broadcast)

| Order | Finding | Action |
| ----- | ------- | ------ |
| 1 | F-3 | Migrate all 4 contracts to `Ownable2Step`; override `renounceOwnership` to revert; update `TransferOwnership.s.sol` to expect Safe-side `acceptOwnership`. |
| 2 | F-2 | Move `_safeMint` to end of `registerAgent`, `registerAgentInDirectory`, `registerOrganization`, `registerOrgInDirectory`, `registerDirectory`. Add `nonReentrant` from OZ `ReentrancyGuard`. |
| 3 | F-1 | Add directory existence + status check in `registerAgentInDirectory` / `registerOrgInDirectory` (or via the registry). Decision required: existence-only vs operator-authorization. |
| 4 | F-5 | Change `Deploy.s.sol` to `vm.envAddress("TBA_IMPLEMENTATION")` + `code.length > 0` check. |
| 5 | F-8 | Add `require(registry.code.length > 0)` to all 3 identity constructors. |

### Phase B — Strongly recommended pre-mainnet

| Order | Finding | Action |
| ----- | ------- | ------ |
| 6 | F-4 | Override `_update` in identity contracts to block transfers to the token's own TBA address. Requires injecting `SAGATBAHelper` into each identity contract's constructor. |
| 7 | F-6 | Add `SAGAValidation.validateUrl(newBaseURI)` to `setBaseURI`; emit `BaseURIUpdated(old, new)` event. |
| 8 | F-10 | Override `_update` in `SAGADirectoryIdentity` to block transfers when `_statusRank >= 2` (flagged or revoked); block `updateDirectoryUrl` in those states. |

### Phase C — Decisions / documentation

| Order | Finding | Action |
| ----- | ------- | ------ |
| 9  | F-9 | Decide self-attestation vs governance-gated. Rename to `claimedConformanceLevel` OR replace with enum + owner-set. |
| 10 | F-12 | Tighten `validateUrl` to require `len > 7` (http) or `len > 8` (https). |
| 11 | F-14 | Pin OpenZeppelin commit SHA in `.gitmodules`. |
| 12 | F-15 | Document `DeployOrg.s.sol` post-transfer behavior — must run as Safe, not deployer EOA. |

### Phase D — Test hardening (post-fix)

| Order | Finding | Action |
| ----- | ------- | ------ |
| 13 | F-7 | Add the 5 fuzz / invariant tests recommended across all three responses (handle validation roundtrip, registry consistency, status monotonicity, URL bounds, TBA determinism). |
| —  | —   | Run final `forge test --gas-report` + fresh Sepolia dry-run with all of Phase A/B applied. |
| —  | —   | Visual confirmation of Safe address and signer/threshold in `deploy.config.yaml` before broadcast. |

---

## Confirmed-clean items (cross-provider agreement that the codebase is solid here)

All three providers explicitly called out these properties as **good — keep them**:

- **No proxy / no upgradeability.** Storage-layout footguns absent. OZ v5→v4 incompatibility note doesn't apply.
- **Phase 1 status downgrade-only enforcement is structurally correct** (`_statusRank` 0→3 mapping; `>=` comparison; governance bypass via `if (!isContractOwner)`). A-Crit#4 fix verified by all three.
- **All URL ingress passes through `SAGAValidation.validateUrl`** (except `setBaseURI` — F-6).
- **`_validateHandle` runs BEFORE `_toLower`** in the registry — closes the unbounded-loop DoS vector. ASCII-only validation correctly excludes Unicode homoglyphs.
- **`_handleKey` uses `abi.encodePacked` for global, `_scopedHandleKey` uses `abi.encode` for scoped** — distinct encodings prevent variable-length collision between the two namespaces.
- **No external call surface inside state writes** (no oracles, no payable functions, no `delegatecall`, no `selfdestruct`).
- **Solidity 0.8.24 + Cancun.** No applicable known bugs.
- **Registry writes are restricted to authorized contracts** via `authorizedContracts[msg.sender]` gate.

---

## Open decisions for the team

These are not findings — they are product decisions surfaced by the audit that need an answer before remediation:

1. **F-1 fix scope:** existence-only check (cheaper, accepts FCFS within directories) vs full operator-authorization (proper directory ACL, more code)?
2. **F-4 mitigation:** on-chain `_update` guard (requires constructor wiring of `SAGATBAHelper` ref) vs SDK / wallet-side warnings vs documentation only?
3. **F-9 model:** is `conformanceLevel` self-claim (rename + cap) or governance-authoritative (enum + owner-set)?
4. **F-10 scope:** block transfers of `flagged` directories OR only `revoked`? Block `updateDirectoryUrl` for both?

---

## Files

This matrix lives at `audits/2026-05-03-contracts-focused/gap-matrix.md` alongside the original brief (`prompt.md`, `system.md`, `README.md`). Full provider responses are in their respective timestamped run directories under `audits/`.
