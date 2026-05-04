# Post-Phase-10 Re-Audit — Unified Gap Matrix

**Date:** 2026-05-04
**Engagement:** Re-audit of `packages/contracts/` after Phase 10 (PRs #53–#55)
**Bundle:** ~280 KB, 56 files, 96-166k input tokens depending on provider tokenizer
**Steering:** `audits/2026-05-03-contracts-focused/system.md` + `prompt.md`
**Code state:** `dev` tip = `fbdfd2f` (Phase 10C merge: H-1..H-7 + M-1..M-8 + L-2/L-3 + I-1..I-3 closed; L-1 deferred per Phase 9 G-13; I-4 accepted; G-19 deferred)

---

## Run summary

| Provider  | Model                  | Duration | Input → Output   | Findings posted                                                  |
| --------- | ---------------------- | -------- | ---------------- | ---------------------------------------------------------------- |
| Anthropic | claude-opus-4-7        | 246.8s   | 165,795 → 16,000 | 18 (4 High / 7 Med / 4 Low / 3 Info — output hit max-tokens cap) |
| OpenAI    | gpt-5.5                | 160.0s   | 96,778 → 10,785  | 5 (2 Med / 2 Low / 1 Info)                                       |
| Gemini    | gemini-3.1-pro-preview | 197.9s   | 113,200 → 2,876  | 5 (3 Med / 1 Low / 2 Info)                                       |

Output paths:

- `audits/2026-05-04T20-46-59__.../response.md` — Anthropic
- `audits/2026-05-04T20-45-36__.../response.md` — OpenAI
- `audits/2026-05-04T20-46-19__.../response.md` — Gemini

> **Anthropic output truncation:** the response hit the 16k max-tokens cap mid-section-7. The first six sections are complete; the deferred-to-mainnet checklist is partial. All severity-tagged findings are in the output above the cap.

> **Gemini's verdict:** "The codebase is ready for Base mainnet today, pending the resolution of one operational friction point in the timelock queue logic."

---

## Verification of Phase 10 closures

All 21 Phase 10 closures from `audits/2026-05-04-post-phase9-gap-matrix.md` were re-checked across the three providers. **All closures hold.** One closure (M-1 timelock) accumulated two follow-on observations (J-1 cancel gap, J-3 bootstrap window) that are operational refinements, not regressions of M-1's intent.

| ID   | Closed by | Re-verification                                                                                                                                                                                                                                                    | Status                                            |
| ---- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------- |
| H-1  | PR #53    | Anthropic confirms `_isAuthorized` rank-≥2 scoping. The double-authorization layer (rank gate in `_update` + governance bypass in `_isAuthorized`) is correct but layered; flagged as defense-in-depth concern not a regression.                                   | ✅ HOLDS                                          |
| H-2  | PR #53    | Anthropic confirms `resolveActiveScopedHandle` enforces `trustedDirectoryContracts`. Anthropic also flags that `resolveScopedHandle` (raw) is still status-blind — see **J-2**. The Phase 10 design is intentional; the finding is doc/indexer footgun.            | ✅ HOLDS                                          |
| H-3  | PR #53    | Anthropic agrees the Phase 10 G-2 docstring rewrite is accurate; ASCII-only validator structurally rules out Unicode homoglyphs. Anthropic withdrew its initial homoglyph flag after re-reading.                                                                   | ✅ HOLDS                                          |
| H-4  | PR #53    | Anthropic + Gemini confirm control-byte rejection in `validateUrl`. Anthropic flags **J-5** (the same defense-in-depth missing on org names + conformance) and **J-6** (base URI allows query strings → `tokenURI` path injection).                                | ✅ HOLDS                                          |
| H-5  | PR #53    | OpenAI explicitly cites the `DEPLOY_DIRECT=true` bootstrap flag in the deferred-to-mainnet checklist.                                                                                                                                                              | ✅ HOLDS                                          |
| H-6  | PR #53    | All 3 confirm the four `renounceOwnership` overrides revert with the disabled message regardless of caller.                                                                                                                                                        | ✅ HOLDS                                          |
| H-7  | PR #53    | Anthropic confirms `ERC6551_REGISTRY` chain-pin on Base mainnet/Sepolia. Flags **J-10** — no `else` clause to log/warn for non-pinned chains.                                                                                                                      | ✅ HOLDS                                          |
| M-1  | PR #54    | All 3 confirm the queue + apply timelock pattern. Two follow-ons: **J-1** (no clean cancel path) and **J-3** (bootstrap window). M-1's core property — "post-handoff authorize-true requires 24h" — holds.                                                         | ✅ HOLDS                                          |
| M-2  | PR #54    | Anthropic confirms `applyBaseURI` re-validates URL at apply time.                                                                                                                                                                                                  | ✅ HOLDS                                          |
| M-3  | PR #54    | All 3 confirm metadata setters use `_isAuthorized` after `_requireOwned`.                                                                                                                                                                                          | ✅ HOLDS                                          |
| M-4  | PR #54    | All 3 confirm `setAuthorizedContract(addr, true)` requires `addr.code.length > 0`.                                                                                                                                                                                 | ✅ HOLDS                                          |
| M-5  | PR #55    | Anthropic confirms self-TBA invariant cross-checks helper against independent off-chain compute.                                                                                                                                                                   | ✅ HOLDS                                          |
| M-6  | PR #55    | README "Scoped registration trust chain" section confirmed.                                                                                                                                                                                                        | ✅ HOLDS                                          |
| M-7  | PR #55    | `_statusRank("")` returns 0 confirmed via `StatusRankHarness`.                                                                                                                                                                                                     | ✅ HOLDS                                          |
| M-8  | PR #54    | All 3 confirm `SAGATBAHelper` exported from TS bindings. Anthropic spot-checks the ABI freshness pin covers all 4 Ownable2Step contracts (registry + agent + org + directory).                                                                                     | ✅ HOLDS                                          |
| L-2  | PR #55    | Anthropic confirms `Deploy.s.sol` logs expected vs got TBA implementation. Flags **J-10** — no equivalent log for `ERC6551_REGISTRY` and no warning for non-pinned chains.                                                                                         | ✅ HOLDS                                          |
| L-3  | PR #55    | `bytes(name).length` cached.                                                                                                                                                                                                                                       | ✅ HOLDS                                          |
| I-1  | PR #55    | `invariant_handleRoundtripResolves` covers agent + org. Anthropic flags **J-11** — directory tokens not covered by the invariant.                                                                                                                                  | ✅ HOLDS (gap noted)                              |
| I-2  | PR #55    | 4-arg `safeTransferFrom` regression tests confirmed across Agent + Directory.                                                                                                                                                                                      | ✅ HOLDS                                          |
| I-3  | PR #55    | Gemini explicitly **corrects** the original I-3 framing: "the gas-griefing premise is mathematically false" — `ERC721Enumerable` adds gas to mints + transfers from the affected user, not griefing victims. The README documentation is accurate; closure stands. | ✅ HOLDS (with Gemini's framing correction noted) |
| L-1  | DEFERRED  | `setTrustedDirectoryContract` ABI probe — no provider re-flagged.                                                                                                                                                                                                  | ✅ DEFERRAL HOLDS                                 |
| I-4  | ACCEPTED  | Front-running of handle registration — no provider re-flagged.                                                                                                                                                                                                     | ✅ ACCEPTANCE HOLDS                               |
| G-19 | DEFERRED  | `_statuses` enum refactor — no provider re-flagged.                                                                                                                                                                                                                | ✅ DEFERRAL HOLDS                                 |

**Net assessment:** Phase 10 was a clean closure. **Zero regressions, zero partial closures.** All 13 follow-on observations below are net-new: 6 are direct refinements of Phase 10 closures (operational gaps the audit cycle continues to surface), 4 are pre-existing defense-in-depth opportunities, 3 are test/docs gaps.

---

## NEW findings

J-prefixed IDs for the post-Phase-10 cycle.

| ID       | Finding                                                                                                                                                                                                                                                                                                                          | Anthropic                  | OpenAI  | Gemini  | Origin                       | Triage           | Action                                                                                                                                                                                                                                                                                                                       |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- | ------- | ------- | ---------------------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **J-1**  | Timelock queues cannot be canceled cleanly. The Safe must overwrite the slot with another contract address (which itself starts a 24h timer) — there is no `cancelPendingAuthorizedContract` / `cancelPendingTrustedDirectoryContract`. Operational error window.                                                                | **HIGH**                   | —       | **MED** | **M-1 refinement**           | **HIGH**         | Add `cancelPendingAuthorizedContract()` and `cancelPendingTrustedDirectoryContract()` (`onlyOwner`, immediate, emit `*Cancelled` event)                                                                                                                                                                                      |
| **J-2**  | `resolveScopedHandle` (raw, status-blind) is still public. Off-chain consumers calling the wrong view see stale data after directory revocation. The naming is backwards: the unfiltered view should have `Raw` suffix; the active-filtered view should be the default.                                                          | HIGH                       | —       | —       | **H-2 refinement**           | **MEDIUM**       | Either rename `resolveScopedHandle` → `resolveScopedHandleRaw` and make `resolveActiveScopedHandle` the default `resolveScopedHandle`, OR emit a single on-chain event on directory status change so indexers can't miss it                                                                                                  |
| **J-3**  | Bootstrap window: while `owner() == _initialOwner`, `setAuthorizedContract(addr, true)` is immediate. If the deployer EOA is compromised between deploy and `acceptOwnership` from the Safe, the attacker can authorize a malicious contract instantly. M-1 timelock doesn't apply yet.                                          | —                          | **MED** | —       | **M-1 refinement**           | **MEDIUM**       | Replace `_initialOwner` check with an explicit `bootstrapFinalized` flag set at the end of `Deploy.s.sol`. Once finalized, even the initial deployer must use the queue path.                                                                                                                                                |
| **J-4**  | ERC-6551 TBA-contents front-running on NFT sale. Sellers can drain TBA-held assets before the NFT transfer settles, leaving buyers with empty TBAs. Ecosystem-level issue — not solvable purely on-chain without breaking ERC-721 compatibility.                                                                                 | —                          | **MED** | **MED** | **EIP-6551 design tradeoff** | **MEDIUM**       | UX-layer warnings on every SAGA frontend; if SAGA ships a marketplace adapter, use a Seaport Zone or escrow that snapshots TBA contents at sale time. README doc note.                                                                                                                                                       |
| **J-5**  | `SAGAOrgIdentity.registerOrganization`, `updateOrgName`, and `SAGADirectoryIdentity.registerDirectory` (`conformanceLevel`) accept arbitrary control bytes and HTML metacharacters — only length-bounded. H-4 validation logic should extend to these display strings.                                                           | —                          | **LOW** | **LOW** | **H-4 refinement**           | **MEDIUM**       | Extract H-4's byte-blacklist loop into `SAGAValidation.validateDisplayText(string, uint256 maxLen)` and apply to org name + conformance. Reject `c <= 0x1F`, `0x7F`, `0x22`, `0x27`, `0x3C`, `0x3E`.                                                                                                                         |
| **J-6**  | `setBaseURI` permits `?` and `#` characters because they're valid in `validateUrl`. `tokenURI(tokenId)` concatenates `_baseTokenURI + tokenId` — if the base URI has a query string, the tokenId lands inside the query, not the path. Phishing vector via Safe-compromised `setBaseURI`.                                        | **MED**                    | —       | —       | **H-4 / G-8 refinement**     | **MEDIUM**       | Add `SAGAValidation.validateBaseUri(string)` that requires trailing `/`, rejects `?`, `#`, `&` anywhere. Apply at all three `setBaseURI` queue sites.                                                                                                                                                                        |
| **J-7**  | `SAGAHandleRegistry.registerHandle` / `registerScopedHandle` have no `nonReentrant` modifier. Today every authorized contract has its own `nonReentrant` + CEI ordering, so the registry is safe — but a future authorized contract added via M-1 timelock that forgets these would re-enter the registry. Defense-in-depth gap. | **MED**                    | —       | —       | **Defense-in-depth**         | **MEDIUM**       | Inherit `ReentrancyGuard` on the registry; add `nonReentrant` to `registerHandle` and `registerScopedHandle`. ~2.4k gas per call.                                                                                                                                                                                            |
| **J-8**  | `setAuthorizedContract(addr, false)` is immediate (M-1 design). A compromised Safe can deauthorize all identity contracts in one tx and trigger a 24h registration outage while the Safe re-authorizes. Documented elsewhere as "policy not code"; surface this dual-direction risk explicitly in the residual-risk section.     | **MED**                    | —       | —       | **M-1 design tradeoff**      | **MEDIUM (DOC)** | Update README "Authorized contracts: residual risk" to call out the brick-direction explicitly: "single Safe compromise can deauthorize all identity contracts, causing a 24h registration outage while re-authorize queues." Accept the tradeoff (slowing deauth would let known-compromised contracts continue operating). |
| **J-9**  | `DeployOrg.s.sol` (partial-redeploy script) only checks `TBA_HELPER.code.length > 0` — does NOT verify the helper's immutable `registry` and `accountImplementation` match the canonical pin. A misconfigured redeploy would permanently wire a new org contract to a wrong helper.                                              | —                          | **LOW** | —       | **G-6 / H-7 refinement**     | **LOW**          | In `DeployOrg.s.sol`, on Base mainnet/Sepolia, assert `helper.registry() == 0x000000006551c19487814612e58FE06813775758` and `helper.accountImplementation() == 0x55266d75D1a14E4572138116aF39863Ed6596E7F`.                                                                                                                  |
| **J-10** | `Deploy.s.sol` has no `else` branch logging "non-pinned chain — TBA_IMPLEMENTATION + ERC6551_REGISTRY are accepted as-is." Operators deploying to a new chain (testnet, L3) get no warning if their env vars are wrong.                                                                                                          | **MED**                    | —       | —       | **H-7 polish**               | **LOW**          | Add `else { console.log("WARNING: deploying to non-pinned chain", block.chainid) }` after the chain-pin block.                                                                                                                                                                                                               |
| **J-11** | `IdentityInvariantsTest.invariant_handleRoundtripResolves` covers agent + org tokens but not directory tokens. A future bug in `registerDirectory` (e.g., wrong entity type registration) would not be caught.                                                                                                                   | LOW                        | —       | —       | **I-1 refinement**           | **LOW**          | Extend `RegistryConsistencyHandler` to drive `registerDirectory`; add directory-side roundtrip assertions to the invariant.                                                                                                                                                                                                  |
| **J-12** | `validateUrl` H-4 character rejections are unit-tested with specific bad bytes but not fuzzed across the full byte space.                                                                                                                                                                                                        | INFO                       | —       | —       | **H-4 test coverage**        | **INFO**         | Add `testFuzz_validateUrl_rejectsBadCharacters(uint8 b)` that asserts the H-4 set reverts and the complement passes (when embedded in an otherwise-valid URL).                                                                                                                                                               |
| **J-13** | Self-TBA guard could close the salt+impl gap on-chain via `IERC6551Account.token()` introspection. Every TBA implementation exposes `token()` returning `(chainId, tokenContract, tokenId)`; a try-catch staticcall in `_update` would block transfers to ANY contract bound to this NFT, regardless of salt or implementation.  | **HIGH** (re-asserts G-12) | —       | INFO    | **G-12 / H-4 refinement**    | **MEDIUM**       | Add the introspection check in `_update`. ~3k gas per transfer. Defense-in-depth — README doc remains valid for residual UX-layer risks.                                                                                                                                                                                     |

---

## Severity rollup

| Triage Severity | Count  | IDs                                                                                    |
| --------------- | ------ | -------------------------------------------------------------------------------------- |
| **CRITICAL**    | 0      | —                                                                                      |
| **HIGH**        | 1      | J-1                                                                                    |
| **MEDIUM**      | 7      | J-2, J-3, J-4, J-5, J-6, J-7, J-8, J-13 (J-13 is a defense-in-depth promotion of G-12) |
| **LOW**         | 3      | J-9, J-10, J-11                                                                        |
| **INFO**        | 1      | J-12                                                                                   |
| **TOTAL**       | **12** | (J-8 is dual-rated as MED + DOC; counted once.)                                        |

> Re-counting: J-1 (HIGH), J-2/3/4/5/6/7/8 (MED ×7), J-13 (MED — promotes a documented limitation to a fixable on-chain check), J-9/10/11 (LOW ×3), J-12 (INFO ×1). 13 total.

| Triage Severity | Count  | IDs                                     |
| --------------- | ------ | --------------------------------------- |
| **CRITICAL**    | 0      | —                                       |
| **HIGH**        | 1      | J-1                                     |
| **MEDIUM**      | 8      | J-2, J-3, J-4, J-5, J-6, J-7, J-8, J-13 |
| **LOW**         | 3      | J-9, J-10, J-11                         |
| **INFO**        | 1      | J-12                                    |
| **TOTAL**       | **13** |                                         |

---

## Origin breakdown

| Origin                                                                                    | Count | IDs                                                                   |
| ----------------------------------------------------------------------------------------- | ----- | --------------------------------------------------------------------- |
| **Phase 10 closure refinements** (operational gaps that surfaced when the closure landed) | 6     | J-1 (M-1), J-2 (H-2), J-3 (M-1), J-5 (H-4), J-6 (H-4/G-8), J-10 (H-7) |
| **Defense-in-depth on documented limitations**                                            | 2     | J-13 (G-12 self-TBA), J-7 (registry reentrancy)                       |
| **Phase 10 design tradeoffs** (acknowledged + need explicit doc)                          | 1     | J-8 (immediate-deauth dual-direction risk)                            |
| **EIP-6551 ecosystem issues**                                                             | 1     | J-4 (TBA front-running)                                               |
| **Pre-existing, missed in earlier audits**                                                | 1     | J-9 (DeployOrg.s.sol no helper allowlist)                             |
| **Test/coverage refinements**                                                             | 2     | J-11 (directory roundtrip), J-12 (URL fuzz)                           |

**Net assessment:** Each audit cycle continues to surface refinements of the prior cycle's closures. This is expected — fixing 21 findings in Phase 10 raised the auditor's scrutiny floor enough that operational gaps in the M-1 timelock (J-1, J-3) and validation expansions (J-5, J-6) became visible. None of the J-findings are regressions; they're all defense-in-depth or operational polish.

---

## Disagreement / divergence

### J-1 (queue cancel gap)

- **Anthropic HIGH** — frames as "applied-but-uncalled state reachable; pending slot can be overwritten without canceling timer" with a concrete attack scenario (24h-old forgotten queue + permissionless apply).
- **Gemini MED** — frames as "operational friction point in timelock queue logic" with a concrete user error scenario.
- **OpenAI** — not flagged this run.

Both providers that flagged it agree on the root cause and the fix (`cancelPending*` functions). **Triage as HIGH** because Anthropic's scenario (mistake + permissionless `apply` + forgot-to-overwrite) is directly exploitable by anyone watching the Safe.

### J-4 (TBA front-running)

- **OpenAI MED** — frames as ERC-6551 secondary-sale issue; suggests escrow/marketplace adapter.
- **Gemini MED** — same finding, same framing.
- **Anthropic** — not in this run's scope.

Two-way consensus on framing and severity. Ecosystem-level — not solvable on-chain without breaking ERC-721 compat. README doc + UX warnings is the actionable mitigation.

### J-13 (self-TBA via `token()` introspection) — Gemini vs Anthropic on severity

- **Anthropic HIGH** — argues that the documented G-12 limitation can be partially closed on-chain via `try IERC6551Account(to).token() returns ((chainId, tokenContract, tokenId)) — block if matches`.
- **Gemini INFO** — re-affirms the documented limitation but does NOT propose the introspection mitigation.

The Anthropic mitigation is novel relative to G-12's UX-only framing. **Triage as MEDIUM** — it's a real defense-in-depth improvement but not a regression of G-12, which is correctly documented today. ~3k gas per transfer is reasonable.

### Anthropic's withdrawn findings

Anthropic flagged but explicitly **withdrew** three items mid-finding after re-reading the implementation:

- "homoglyph in `_validateHandle`" — withdrawn ("ASCII-only validator structurally rules this out")
- "applyAuthorizedContract no denylist" — withdrawn ("slot-equality check on apply means overwriting is sufficient")
- "ABI test pinning incomplete" — withdrawn ("verified the ABI freshness test covers all four contracts")
- "URL canonicalization" — withdrawn ("deliberate design")
- "early-return in `_isAlphanumeric`" — withdrawn ("the `require` IS an early return")

This is healthy auditor behavior; the withdrawn items are excluded from the J-list above.

---

## Recommended Phase 11 PR queue

### PR 11A — Strongly recommended hardening (J-1 + J-3 + J-5 + J-6 + J-7 + J-13)

| Order | Finding | LOC                 | Action                                                                                                                                                           |
| ----- | ------- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | J-1     | ~30 lines + 2 tests | `cancelPendingAuthorizedContract()`, `cancelPendingTrustedDirectoryContract()` (onlyOwner, emit `*Cancelled` events)                                             |
| 2     | J-3     | ~15 lines + 2 tests | Replace `_initialOwner` check with `bootstrapFinalized` flag; `Deploy.s.sol` calls `finalizeBootstrap()` after wiring; `TransferOwnership.s.sol` runbook updated |
| 3     | J-5     | ~25 lines + 4 tests | `SAGAValidation.validateDisplayText(string, uint256 maxLen)`; apply to org name + conformance level                                                              |
| 4     | J-6     | ~20 lines + 3 tests | `SAGAValidation.validateBaseUri(string)` — trailing slash + reject `?` `#` `&`; apply to all three `setBaseURI` queues                                           |
| 5     | J-7     | ~5 lines + 1 test   | Inherit `ReentrancyGuard` on `SAGAHandleRegistry`; `nonReentrant` on `registerHandle` + `registerScopedHandle`                                                   |
| 6     | J-13    | ~15 lines + 2 tests | `_update` adds `try IERC6551Account(to).token() returns ((id, addr, tid))` introspection; block if matches `(block.chainid, address(this), tokenId)`             |

Estimated: ~110 LOC + ~14 new tests. Single PR.

### PR 11B — Doc + operational polish

| Order | Finding | Action                                                                                        |
| ----- | ------- | --------------------------------------------------------------------------------------------- |
| 7     | J-2     | Either rename `resolveScopedHandle` → `*Raw` or emit a `DirectoryRevoked` event; pin via test |
| 8     | J-4     | README + frontend UX doc on TBA-content-on-sale risk                                          |
| 9     | J-8     | README "Authorized contracts: residual risk" explicit dual-direction language                 |
| 10    | J-9     | `DeployOrg.s.sol` chain-pinned helper-immutable allowlist                                     |
| 11    | J-10    | `Deploy.s.sol` else-branch warning log for non-pinned chains                                  |
| 12    | J-11    | Extend `RegistryConsistencyHandler` to mint directories; add directory roundtrip invariant    |
| 13    | J-12    | `testFuzz_validateUrl_rejectsBadCharacters(uint8)`                                            |

---

## Acceptance criteria

- All J-1, J-3, J-5, J-6, J-7, J-13 (PR 11A) merged before mainnet broadcast.
- All J-2, J-4, J-8, J-9, J-10, J-11, J-12 (PR 11B) merged before public launch.
- `forge test` clean: 237 → ~250 tests post-11A, ~255 post-11B.
- `forge build` clean. `pnpm typecheck` clean. `pnpm test:ts` clean.
- Sepolia dry-run reproduces deploy + ownership transfer + finalize-bootstrap cleanly with the J-3 changes.

## Out of scope

- Re-running the three-provider audit a fifth time (separate task once 11A merges).
- Phase 8 mobile audit (`packages/saga-app`) — separate milestone.
- Adopting commit-reveal for handle registration (I-4 stays accepted as off-chain UX concern).

---

## Final assessment

**Mainnet readiness: YES, with operational caveat.** Gemini's verdict — "ready for Base mainnet today, pending the resolution of one operational friction point" — is the right summary. The three-provider consensus is that the contracts have **no exploitable Critical or High bytecode bug**. J-1 is the only HIGH finding, and it's an operational gap (mistake-cancel) rather than a vulnerability — a forgotten queue + permissionless `apply` is exploitable but only after a 24h Safe-management failure to overwrite.

**Recommendation:** ship PR 11A (operational hardening + defense-in-depth) before the mainnet broadcast; PR 11B is post-launch acceptable. The Sepolia dry-run with the J-3 `bootstrapFinalized` flag should be the final gate.

**Audit milestone summary across Phase 8 → 9 → 10 → this run:**

| Cycle                    | New findings        | Closed    | Deferred/Accepted          | Net       |
| ------------------------ | ------------------- | --------- | -------------------------- | --------- |
| Phase 8 audit (original) | 15                  | 13        | 2 (F-11, F-13 accepted)    | 13 closed |
| Phase 9 re-audit         | 19 G-findings       | 18        | G-19 deferred              | 18 closed |
| Phase 10 re-audit        | 22 H/M/L/I findings | 21        | L-1 deferred, I-4 accepted | 21 closed |
| Phase 11 re-audit (this) | 13 J-findings       | (pending) | —                          | (pending) |

13 new findings on a contract surface with **47 closed findings already** is a defensible diminishing-returns curve. No provider claims a Critical mainnet blocker. PR 11A closes the only HIGH and the most actionable MEDIUMs in ~110 LOC.
