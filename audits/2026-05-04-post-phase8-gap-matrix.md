# Post-Phase-8 Re-Audit — Unified Gap Matrix

**Date:** 2026-05-04
**Engagement:** Re-audit of `packages/contracts/` after Phase 8 (PRs #45–#49)
**Bundle:** 278 KB (vs 223 KB in the original audit — growth from new tests + invariants)

---

## Run summary

| Provider  | Model                  | Duration | Input → Output   | Findings posted                                             |
| --------- | ---------------------- | -------- | ---------------- | ----------------------------------------------------------- |
| Anthropic | claude-opus-4-7        | 205.3s   | 117,786 → 12,885 | 13 (1 Crit / 2 High / 5 Med / 3 Low / 2 Info)               |
| OpenAI    | gpt-5.5                | 193.0s   | 68,696 → 10,453  | 6 (3 Med / 2 Low / 1 Info)                                  |
| Gemini    | gemini-3.1-pro-preview | 140.7s   | 80,605 → 1,517   | 4 (1 Crit / 1 High / 1 Med / 1 Info) **— output truncated** |

Output paths:

- `audits/2026-05-04T15-41-11__.../response.md` — Anthropic
- `audits/2026-05-04T15-44-30__.../response.md` — OpenAI
- `audits/2026-05-04T15-49-34__.../response.md` — Gemini (partial, 108 lines)

---

## Verification of Phase 8 closures

All 13 originally-closed findings were independently re-verified by at least one provider. **All Phase 8 fixes hold.**

| Original | Phase 8 fix landed in | Re-verified by                                                                                           | Status                                                     |
| -------- | --------------------- | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| **F-1**  | PR #45 (8A)           | Anthropic, OpenAI, Gemini — all confirm scoped registration gates by directory existence + active status | ✅ HOLDS (but see G-1, G-11 side effects below)            |
| **F-2**  | PR #45 (8A)           | Anthropic + OpenAI explicitly verified CEI ordering + `nonReentrant`                                     | ✅ HOLDS                                                   |
| **F-3**  | PR #45 (8A)           | Anthropic + OpenAI verified `Ownable2Step` + `renounceOwnership` revert across all 4 contracts           | ✅ HOLDS                                                   |
| **F-4**  | PR #46 (8B)           | All 3 confirm self-TBA `_update` guard (G-12 is a refinement)                                            | ✅ HOLDS                                                   |
| **F-5**  | PR #45 (8A)           | All 3 confirm `vm.envAddress` + `code.length` check on `TBA_IMPLEMENTATION`                              | ✅ HOLDS                                                   |
| **F-6**  | PR #46 (8B)           | Anthropic confirmed `setBaseURI` validates URL + emits event                                             | ✅ HOLDS                                                   |
| **F-7**  | PR #48 (8D)           | All 3 confirm fuzz + invariant tests present (G-17 / G-18 refinements)                                   | ✅ HOLDS                                                   |
| **F-8**  | PR #45 (8A)           | Anthropic confirmed `code.length` checks on identity + TBA constructors                                  | ✅ HOLDS (but see G-3: missing on TransferOwnership.s.sol) |
| **F-9**  | PR #47 (8C)           | Anthropic confirmed 32-byte cap + docstring                                                              | ✅ HOLDS (G-7 refinement on TS bindings)                   |
| **F-10** | PR #46 (8B)           | Anthropic confirmed flagged/revoked transfer block AND `updateDirectoryUrl` block                        | ✅ HOLDS (G-1 lockout side effect)                         |
| **F-12** | PR #47 (8C)           | Anthropic confirmed validateUrl rejects bare `http://` / `https://`                                      | ✅ HOLDS                                                   |
| **F-14** | PR #47 (8C)           | Confirmed via lib/ submodule SHA in repo                                                                 | ✅ HOLDS                                                   |
| **F-15** | PR #47 (8C)           | DeployOrg.s.sol header note confirmed                                                                    | ✅ HOLDS                                                   |
| **F-11** | (Accepted)            | Anthropic re-flagged at LOW; same accept-as-is rationale stands                                          | 🟡 ACCEPTED                                                |
| **F-13** | (Accepted)            | Not re-flagged                                                                                           | 🟡 ACCEPTED                                                |

---

## NEW findings introduced by Phase 8 OR missed in the original audit

This is the headline content — issues **not in the original 15** that surfaced once the contracts were re-bundled. Sorted by triage severity (max watermark across providers).

| ID       | Finding                                                                                                                                                                                          | Anthropic | OpenAI | Gemini   | Origin                               | Triage       | Action                                                                                                                  |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- | ------ | -------- | ------------------------------------ | ------------ | ----------------------------------------------------------------------------------------------------------------------- |
| **G-1**  | F-10 + F-1 interaction: revoked/flagged directories permanently freeze their entire scoped namespace AND cannot be transferred to a remediation steward                                          | **CRIT**  | —      | —        | **Phase 8B side effect**             | **CRITICAL** | Add governance-only transfer override on flagged/revoked directories (NEEDED before mainnet)                            |
| **G-4**  | `_scopedHandleKey` hashes raw `directoryId` (case-sensitive) while `_handleKey(directoryId)` lowercases for lookup — duplicate scoped handles via case variants                                  | —         | MED    | **CRIT** | **Pre-existing, missed**             | **CRITICAL** | One-line fix: `_toLower(directoryId)` in `_scopedHandleKey`                                                             |
| **G-11** | `dirRecord.contractAddress == directoryIdentity` strict singleton pin → V1 directories permanently break if V2 SAGADirectoryIdentity ever deploys                                                | —         | —      | **HIGH** | **Phase 8A Copilot-fix side effect** | **HIGH**     | Replace single-address check with `mapping(address => bool) trustedDirectoryContracts`                                  |
| **G-2**  | `_validateHandle` accepts `..`, `--`, `__`, `.-`, `-.` consecutive separators — homoglyph attacks (`m.arcus` ≈ `marcus`)                                                                         | HIGH      | —      | —        | **Pre-existing, missed**             | **HIGH**     | Reject consecutive separators in inner-loop check                                                                       |
| **G-3**  | `TransferOwnership.s.sol` doesn't `require(NEW_OWNER.code.length > 0)` — typo'd Safe address creates confused pendingOwner state                                                                 | HIGH      | —      | —        | **Phase 8A incomplete**              | **HIGH**     | One-line guard, mirror `Deploy.s.sol:25`                                                                                |
| **G-5**  | `resolveScopedHandle` does not re-check directory status — revoked directories still resolve historically-registered scoped handles                                                              | —         | MED    | —        | **Pre-existing design**              | **MEDIUM**   | Decision: status-aware resolver vs explicit dual-API (`resolveScopedHandle` raw + `resolveActiveScopedHandle` filtered) |
| **G-6**  | `Deploy.s.sol` `code.length > 0` check on `TBA_IMPLEMENTATION` does NOT pin to the canonical Tokenbound address per chain — any code-bearing contract passes                                     | —         | MED    | —        | **F-5 refinement**                   | **MEDIUM**   | Add chain-pinned allowlist (`if block.chainid == 8453 require addr == 0x...`)                                           |
| **G-7**  | TS bindings expose `conformanceLevel: string` with no `verified: boolean` — F-9 doc fix didn't reach the consumer-facing API                                                                     | MED       | —      | —        | **F-9 refinement**                   | **MEDIUM**   | Rename TS export to `claimedConformanceLevel` + add README caveat                                                       |
| **G-8**  | `setBaseURI` is owner-controlled and atomically redirects every NFT — Safe-compromise → instant phishing on metadata. No timelock.                                                               | MED       | —      | —        | **F-6 refinement**                   | **MEDIUM**   | 24h timelock OR move to immutable IPFS CID                                                                              |
| **G-9**  | `_handleKey` vs `_scopedHandleKey` collision-safety not pinned by an invariant — fragile against future merge refactors                                                                          | MED       | —      | —        | **Defense-in-depth**                 | **MEDIUM**   | Add `testFuzz_handleKeyAndScopedKeyDisjoint`                                                                            |
| **G-10** | Indexer event ordering across registry+identity contracts not pinned by integration test (documentation gap)                                                                                     | MED       | —      | —        | **Off-chain spec gap**               | **MEDIUM**   | README + `vm.recordLogs`-based ordering test                                                                            |
| **G-12** | Self-TBA guard only blocks `(default impl, salt=0)` — ERC-6551 permits multiple accounts per NFT with other salts/impls                                                                          | —         | LOW    | MED      | **F-4 refinement**                   | **MEDIUM**   | Document the limitation OR maintain a denylist of known self-TBA derivations                                            |
| **G-13** | `setDirectoryIdentity` has `code.length > 0` but no ABI probe — wrong contract type silently breaks scoped registration                                                                          | LOW       | —      | —        | **F-1 refinement**                   | **LOW**      | `try IDirectoryStatus(addr).directoryStatus(0)` probe                                                                   |
| **G-14** | `setAuthorizedContract` has no batch revoke and no time-lock; deauthorized contracts' historical handles persist forever                                                                         | LOW       | —      | —        | **Defense-in-depth**                 | **LOW**      | Document residual risk; consider `removeHandle(bytes32)` admin function                                                 |
| **G-15** | `tokenURI` = `_baseTokenURI + tokenId.toString()` is unbounded — up to 1102 bytes for max uint256 tokenId                                                                                        | LOW       | —      | —        | **Doc only**                         | **LOW**      | None needed; document                                                                                                   |
| **G-16** | Published TS ABIs (`src/ts/abis/*.ts`) are stale: missing `acceptOwnership`, `pendingOwner`, scoped registration funcs, new constructor signatures                                               | —         | LOW    | —        | **Phase 8 build artifact**           | **LOW**      | Regenerate from `out/*.json` + add CI check                                                                             |
| **G-17** | F-2 reentrancy regression test asserts post-mint state, not callback-time state — a future refactor moving `_safeMint` earlier could re-introduce the half-init window without breaking the test | —         | INFO   | —        | **F-7 refinement**                   | **INFO**     | Add malicious receiver that reads `agentHandle()` from inside `onERC721Received`                                        |
| **G-18** | Missing invariants: cross-mapping disjointness (`_handles` ∩ `_scopedHandles`), URL-validation closure across every writer, self-TBA-guard universality                                          | INFO      | —      | —        | **F-7 refinement**                   | **INFO**     | 4 new invariants per Anthropic §5                                                                                       |
| **G-19** | `_statuses[tokenId]` is `string`; could be `uint8` enum for ~20K gas saved per `updateDirectoryStatus` and avoid keccak-comparison pattern                                                       | INFO      | —      | —        | **Style/gas**                        | **INFO**     | Future major version                                                                                                    |

---

## Severity rollup

| Triage Severity | Count  | IDs                                 |
| --------------- | ------ | ----------------------------------- |
| **CRITICAL**    | 2      | G-1, G-4                            |
| **HIGH**        | 3      | G-2, G-3, G-11                      |
| **MEDIUM**      | 7      | G-5, G-6, G-7, G-8, G-9, G-10, G-12 |
| **LOW**         | 4      | G-13, G-14, G-15, G-16              |
| **INFO**        | 3      | G-17, G-18, G-19                    |
| **TOTAL**       | **19** |                                     |

---

## Origin breakdown

Where did each new finding come from? This is what determines whether Phase 8 net-improved or net-introduced risk.

| Origin                                      | Count | IDs                                                                                                          |
| ------------------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------ |
| **Pre-existing (missed in original audit)** | 3     | G-2, G-4, G-5 — including G-4 CRITICAL casing bug                                                            |
| **Phase 8 side effects (need follow-up)**   | 2     | G-1 (8B transfer block), G-11 (8A Copilot fix)                                                               |
| **Phase 8 incomplete fixes**                | 1     | G-3 (8A code.length check didn't propagate to TransferOwnership.s.sol)                                       |
| **Phase 8 build artifacts**                 | 1     | G-16 (TS ABIs not regenerated)                                                                               |
| **Refinements of closed findings**          | 7     | G-6 (F-5), G-7 (F-9), G-8 (F-6), G-12 (F-4), G-13 (F-1), G-17 (F-2 test depth), G-18 (F-7 invariant breadth) |
| **Defense-in-depth**                        | 3     | G-9 (collision invariant), G-14 (handle persistence), G-19 (gas opt)                                         |
| **Off-chain / docs**                        | 2     | G-10 (indexer ordering), G-15 (tokenURI length)                                                              |

**Net assessment:** Phase 8 closed 13 findings cleanly. It introduced 2 side-effect findings (G-1, G-11) and 1 incomplete propagation (G-3) — these need a Phase 9. Pre-existing findings (G-2, G-4, G-5) were genuinely missed in the original three-provider review and would have required a fourth pass to surface; G-4 in particular is a CRITICAL casing bug that bypasses scoped uniqueness.

---

## Disagreement / divergence

### G-4 severity disagreement

- **Gemini: CRITICAL** — characterized as "directory namespace hijack" with a concrete attack scenario
- **OpenAI: MEDIUM** — same root cause, framed as canonicalization gap
- **Anthropic: not flagged** — the casing-attack class wasn't explored

The fix is one line: `_toLower(directoryId)` inside `_scopedHandleKey`. **Triage as CRITICAL** — both providers that flagged it agree the impact is namespace bypass; severity disagreement is about framing, not facts. Cheapest fix in the matrix.

### G-1 vs G-5 distinction

- **G-1** (Anthropic CRITICAL): the _registration_ path is locked when status >= flagged. Combined with F-10's transfer block, this freezes the directory namespace permanently.
- **G-5** (OpenAI MEDIUM): the _resolution_ path doesn't check status. Existing scoped handles still resolve after revocation.

These are complementary, not duplicates. G-1 is a write-side lockout (need rescue path); G-5 is a read-side stale-state issue (need design decision).

### G-11 — Gemini-only HIGH

Anthropic and OpenAI didn't surface this. The reasoning is sound: if SAGADirectoryIdentity is ever upgraded (immutable architecture means new deploy, not proxy), V1 directories permanently break because their on-chain `dirRecord.contractAddress` no longer matches the registry's configured `directoryIdentity`. **Triage as HIGH** — the immutable architecture means this is forever once V2 ships.

---

## Recommended Phase 9 PR queue

### Phase 9A — Mainnet-blocking (must land before Base mainnet)

| Order | Finding | LOC estimate | Action                                                                                   |
| ----- | ------- | ------------ | ---------------------------------------------------------------------------------------- |
| 1     | G-4     | ~3 lines     | `_toLower(directoryId)` in `_scopedHandleKey` + casing regression test                   |
| 2     | G-1     | ~10 lines    | `_update` allows governance-initiated rescue transfer on flagged/revoked + matching test |
| 3     | G-11    | ~15 lines    | `mapping(address => bool) trustedDirectoryContracts` replacing the single-address check  |
| 4     | G-3     | ~1 line      | `require(newOwner.code.length > 0)` in `TransferOwnership.s.sol`                         |
| 5     | G-2     | ~5 lines     | Reject consecutive separators in `_validateHandle` + fuzz test                           |

### Phase 9B — Strongly recommended

| Order | Finding | LOC       | Action                                                                 |
| ----- | ------- | --------- | ---------------------------------------------------------------------- |
| 6     | G-5     | decision  | Add `resolveActiveScopedHandle` OR make existing resolver status-aware |
| 6     | G-6     | ~10 lines | Chain-pinned TBA implementation allowlist in `Deploy.s.sol`            |
| 7     | G-13    | ~5 lines  | ABI probe in `setDirectoryIdentity`                                    |
| 8     | G-12    | doc only  | Document self-TBA guard limitation in README                           |
| 9     | G-8     | ~30 lines | 24h timelock on `setBaseURI`                                           |
| 10    | G-16    | CI work   | Regenerate TS ABIs + add CI freshness check                            |

### Phase 9C — Test hardening + docs

| Order | Finding    | Action                                                                       |
| ----- | ---------- | ---------------------------------------------------------------------------- |
| 11    | G-9        | `testFuzz_handleKeyAndScopedKeyDisjoint`                                     |
| 12    | G-17       | Malicious-receiver test reading state during `onERC721Received`              |
| 13    | G-18       | 3 new invariants (cross-mapping disjointness, URL closure, TBA universality) |
| 14    | G-7        | Rename TS export `conformanceLevel` → `claimedConformanceLevel`              |
| 15    | G-10       | Indexer event-ordering integration test                                      |
| 16    | G-14       | Document `setAuthorizedContract` + handle-persistence residual risk          |
| 17    | G-15, G-19 | Doc-only / future major version                                              |

---

## Final assessment

The contracts are **closer to mainnet-ready than before Phase 8** but **not there yet.** Two CRITICAL items (G-1, G-4) and three HIGH items (G-2, G-3, G-11) need to land in a Phase 9A before the mainnet broadcast. G-4 in particular is a one-line fix that bypasses the entire scoped-uniqueness guarantee — failing to ship it is a clear regression of intent.

**Recommendation:** open a Phase 9 milestone with 5 fix tasks for the CRITICAL/HIGH items, plus the 6 recommended MEDIUM items, plus the test hardening. Estimated 2 PRs (9A + 9B). The accepted-as-is findings (F-11, F-13) remain accepted; G-19 is a future major version. The Sepolia + Safe handoff manual checklist from the previous matrix still applies.

---

## Phase 9 closure (2026-05-04)

All 18 actionable findings closed across three PRs against `dev`. G-19
remains deferred to a future major version per the original triage.

| ID   | Severity | Closed by   | Notes                                                                                                                                 |
| ---- | -------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| G-1  | CRITICAL | PR #50 (9A) | Governance bypass in `_update` + `_isAuthorized` override; existing token-owner / approved paths still blocked when status >= flagged |
| G-4  | CRITICAL | PR #50 (9A) | `_scopedHandleKey` lowercases `directoryId`                                                                                           |
| G-2  | HIGH     | PR #50 (9A) | Consecutive-separator rejection in `_validateHandle` + regression + F-7 fuzz predicate updated in 9B                                  |
| G-3  | HIGH     | PR #50 (9A) | `code.length > 0` check on `NEW_OWNER` in `TransferOwnership.s.sol`                                                                   |
| G-11 | HIGH     | PR #50 (9A) | Singleton `directoryIdentity` replaced with `mapping(address => bool) trustedDirectoryContracts`                                      |
| G-5  | MEDIUM   | PR #51 (9B) | New `resolveActiveScopedHandle` view; raw `resolveScopedHandle` preserved for indexers                                                |
| G-6  | MEDIUM   | PR #51 (9B) | Chain-pinned Tokenbound V3 allowlist in `Deploy.s.sol` for chainId 8453 + 84532                                                       |
| G-7  | MEDIUM   | PR #51 (9B) | TS export rename `conformanceLevel` → `claimedConformanceLevel` with JSDoc                                                            |
| G-8  | MEDIUM   | PR #51 (9B) | 24h timelock (`setBaseURI` queue + `applyBaseURI`) across all three identity contracts                                                |
| G-12 | MEDIUM   | PR #51 (9B) | README `Security Notes / Known limitation: self-TBA transfer guard scope` documents salt + impl scope + UX-layer mitigations          |
| G-13 | LOW      | PR #50 (9A) | Decision documented (no probe — deployer/governance verifies); `setTrustedDirectoryContract` docstring updated                        |
| G-16 | LOW      | PR #51 (9B) | `scripts/generate-abis.mjs` + `pnpm abi:gen`; per-contract ABI freshness fingerprint tests pin the post-Phase-9 surface               |
| G-9  | MEDIUM   | PR #52 (9C) | `testFuzz_g9_handleAndScopedKeyDisjoint`                                                                                              |
| G-10 | MEDIUM   | PR #52 (9C) | `test_g10_eventOrdering_handleBeforeNftTransfer` via `vm.recordLogs` pinning HandleRegistered → Transfer → AgentRegistered            |
| G-14 | LOW      | PR #52 (9C) | README `Authorized contracts: residual risk` section                                                                                  |
| G-15 | LOW      | PR #52 (9C) | README `tokenURI length expectations` section                                                                                         |
| G-17 | INFO     | PR #52 (9C) | `ProbingReceiver` reads `agentHandle()` from inside `onERC721Received` — pins F-2 CEI ordering against future regressions             |
| G-18 | INFO     | PR #52 (9C) | New `IdentityInvariantsTest` invariants: self-TBA universality + agent URL closure (cross-mapping disjointness covered by G-9 fuzz)   |
| G-19 | INFO     | DEFERRED    | `_statuses` enum refactor — future major version                                                                                      |

**Test counts after Phase 9 closure:** 202 forge tests passing
(was 178 pre-Phase-9), 33 vitest TS tests passing (was 25 pre-Phase-9).
`forge build` clean. Sepolia + Safe handoff manual checklist still
applies; chain-pin in Deploy.s.sol now hard-blocks any non-canonical
TBA implementation on Base mainnet / Base Sepolia.
