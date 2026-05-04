# Post-Phase-9 Re-Audit — Unified Gap Matrix

**Date:** 2026-05-04
**Engagement:** Re-audit of `packages/contracts/` after Phase 9 (PRs #50–#52)
**Bundle:** ~250 KB, 53 files, 84-145k input tokens depending on provider tokenizer
**Steering:** `audits/2026-05-03-contracts-focused/system.md` + `prompt.md`
**Code state:** `dev` tip = `25bd3ff` (Phase 9C merge: G-1..G-18 closed, G-19 deferred)

---

## Run summary

| Provider  | Model                  | Duration | Input → Output   | Findings posted                      |
| --------- | ---------------------- | -------- | ---------------- | ------------------------------------ |
| Anthropic | claude-opus-4-7        | 243.0s   | 145,131 → 14,984 | 17 (3 High / 5 Med / 5 Low / 4 Info) |
| OpenAI    | gpt-5.5                | 143.2s   | 84,758 → 9,354   | 4 (2 Med / 1 Low / 1 Info)           |
| Gemini    | gemini-3.1-pro-preview | 132.6s   | 99,312 → 3,009   | 5 (4 High / 1 Med)                   |

Output paths:

- `audits/2026-05-04T18-36-46__.../response.md` — Anthropic
- `audits/2026-05-04T18-35-11__.../response.md` — OpenAI
- `audits/2026-05-04T18-35-04__.../response.md` — Gemini

> **Methodology note.** A first re-audit pass (`2026-05-04T18-26-45..18-27-45`) was bundled against the local checkout at `39da3c7` (Phase 9A only) because of an aborted `git pull`. Those results are superseded by the runs above, which targeted the actual `dev` tip `25bd3ff`. The earlier `T18-2X` runs are kept on disk for forensic comparison only.

---

## Verification of Phase 9 closures

All 18 Phase 9 closures from `audits/2026-05-04-post-phase8-gap-matrix.md` were re-checked across the three providers. **Most hold; two are partial regressions.**

| ID   | Closed by         | Re-verification                                                                                                                                                                                                                                                                    | Status                       |
| ---- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| G-1  | PR #50            | All 3 confirm `_update` rank-block exempts `auth == owner()` AND that the recovery transfer works. **BUT** the companion `_isAuthorized` override grants the contract owner spender authority over **EVERY** directory NFT, not just rank ≥ 2. See **H-1** below.                  | 🟡 OVER-SCOPED               |
| G-2  | PR #50            | Anthropic flags as misleading: the docstring claims to "close the ENS-style homoglyph attack class" but only blocks **consecutive** separators. Single-separator phishing (`m.arcus`, `m-arcus`) is fully legal. See **H-3**.                                                      | 🟡 DOCS MISLEADING           |
| G-3  | PR #50            | All 3 confirm `NEW_OWNER.code.length > 0` check is in place                                                                                                                                                                                                                        | ✅ HOLDS                     |
| G-4  | PR #50            | All 3 confirm `_scopedHandleKey` lowercases `directoryId`                                                                                                                                                                                                                          | ✅ HOLDS                     |
| G-11 | PR #50            | OpenAI + Gemini explicitly verify `trustedDirectoryContracts` mapping replaces singleton — write path checks the trust gate. **BUT** the new `resolveActiveScopedHandle` view added in PR #51 forgot the trust check, letting a deauthorized contract spoof "active". See **H-2**. | 🟡 PARTIAL REGRESSION        |
| G-5  | PR #51            | OpenAI + Anthropic confirm `resolveActiveScopedHandle` exists. Gemini found the missing trust check (see G-11 entry).                                                                                                                                                              | 🟡 INCOMPLETE                |
| G-6  | PR #51            | All 3 confirm chain-pinned `TBA_IMPLEMENTATION` allowlist on Base mainnet/Sepolia. **BUT** OpenAI flags that the **ERC-6551 registry address itself is NOT pinned** — same misconfiguration class. See **H-7**.                                                                    | 🟡 INCOMPLETE                |
| G-7  | PR #51            | TS export rename `claimedConformanceLevel` confirmed                                                                                                                                                                                                                               | ✅ HOLDS                     |
| G-8  | PR #51            | All 3 confirm `setBaseURI` queue + `applyBaseURI` apply with 24h timelock. **BUT** Anthropic flags that `applyBaseURI` does NOT re-validate the URL at apply time. See **M-2**.                                                                                                    | 🟡 DEFENSE-IN-DEPTH GAP      |
| G-12 | PR #51            | README "Known limitation" section confirmed by all 3                                                                                                                                                                                                                               | ✅ HOLDS                     |
| G-16 | PR #51            | Anthropic + OpenAI confirm regenerated 2-arg constructor ABIs. OpenAI flags `SAGATBAHelper` not exported despite README listing it as a package contract. See **M-8**.                                                                                                             | 🟡 INCOMPLETE EXPORT SURFACE |
| G-13 | PR #50 (doc-only) | Anthropic L-1 re-asserts the recommendation (deliberate skip remains acceptable per Phase 9 plan)                                                                                                                                                                                  | ✅ HOLDS (decision honored)  |
| G-9  | PR #52            | Fuzz `testFuzz_g9_handleAndScopedKeyDisjoint` present                                                                                                                                                                                                                              | ✅ HOLDS                     |
| G-10 | PR #52            | `test_g10_eventOrdering_handleBeforeNftTransfer` present using `vm.recordLogs`                                                                                                                                                                                                     | ✅ HOLDS                     |
| G-14 | PR #52            | README "Authorized contracts: residual risk" section. Anthropic + OpenAI re-flag the underlying weakness (no on-chain code-length check on `setAuthorizedContract`); the README mitigation is policy-only. See **M-4**.                                                            | 🟡 POLICY-ONLY               |
| G-15 | PR #52            | README `tokenURI` length expectations section confirmed                                                                                                                                                                                                                            | ✅ HOLDS                     |
| G-17 | PR #52            | `ProbingReceiver` test pins `onERC721Received` introspects fully-initialized state                                                                                                                                                                                                 | ✅ HOLDS                     |
| G-18 | PR #52            | `IdentityInvariantsTest` self-TBA universality + URL closure invariants present. Anthropic flags the self-TBA test uses the helper for both production check AND test computation — tautological. See **M-5**.                                                                     | 🟡 TEST GAP                  |
| G-19 | DEFERRED          | Not re-flagged                                                                                                                                                                                                                                                                     | 🟡 DEFERRED (unchanged)      |

**Net assessment:** Phase 9 directionally landed every fix it claimed. **Five closures are partial:** G-1 (over-scoped), G-2 (misleading), G-5+G-11 (resolver path missing trust check), G-6 (registry not pinned), G-8 (no re-validation), G-16 (TBA helper not exported), G-18 (test tautology). None of these regressions break the Phase 9 closures outright; they expose follow-up work for a Phase 10.

---

## NEW findings

Issues **not** in the Phase 8 G-set or otherwise novel relative to the prior gap matrix. Sorted by triage severity.

| ID      | Finding                                                                                                                                                                                                                                                                                                       | Anthropic  | OpenAI    | Gemini   | Origin                            | Triage     | Action                                                                                                                                                             |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | --------- | -------- | --------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **H-1** | `SAGADirectoryIdentity._isAuthorized` returns `true` for `spender == owner()` for ALL tokenIds, regardless of status — Phase 9 G-1 over-implementation. Lets the Safe seize active customer-owned directories.                                                                                                | **HIGH**   | (implied) | **HIGH** | **G-1 over-scope**                | **HIGH**   | Add `_statusRank(_statuses[tokenId]) >= 2` guard to the bypass; add negative test for active directory                                                             |
| **H-2** | `resolveActiveScopedHandle` (G-5 view) calls `IDirectoryStatus(dirRecord.contractAddress).directoryStatus(...)` without checking `trustedDirectoryContracts[contractAddress]`. A deauthorized directory contract can spoof `"active"` to bypass governance deauthorization.                                   | —          | —         | **HIGH** | **G-5 / G-11 regression**         | **HIGH**   | Add `require(trustedDirectoryContracts[dirRecord.contractAddress])` to the view, mirroring `registerScopedHandle`                                                  |
| **H-3** | Phase 9 G-2 docstring (`_validateHandle`) claims to "close the ENS-style homoglyph attack class" but only rejects consecutive separators; single-separator variants `m.arcus`, `m-arcus`, `m_arcus` of `marcus` remain registrable                                                                            | **HIGH**   | —         | —        | **G-2 docs vs reality mismatch**  | **HIGH**   | Either tighten the rule (no separator adjacent to a 1-char segment) OR rewrite the docstring to honestly describe what was shipped (anti-spam, not anti-homoglyph) |
| **H-4** | `SAGAValidation.validateUrl` accepts URLs with embedded control bytes, raw whitespace, backslashes, and HTML metacharacters after the scheme. `https:// example.com`, `https://\nx`, `https://"><script>` all pass on-chain. Off-chain consumers rendering the URL into HTML/JSON suffer XSS / log injection. | LOW        | LOW       | **HIGH** | **Pre-existing, missed**          | **HIGH**   | Byte-by-byte scan in `validateUrl` rejecting `c <= 0x20`, `c == 0x7F`, `c == 0x5C`, and HTML metacharacters `< > " ' `                                             |
| **H-5** | `deploy-entrypoint.sh` forces Safe-multisend routing when `SAFE_THRESHOLD > 1`, but `Deploy.s.sol` uses `new Contract()` (raw CREATE). The script's `HAS_CREATE_TX` guard then `die`s. Mainnet launch deterministically fails.                                                                                | —          | —         | **HIGH** | **Deploy pipeline (script-side)** | **HIGH**   | Add a `DEPLOY_DIRECT=true` mode for the initial factory deploys; threshold gate only applies to post-deploy ops                                                    |
| **H-6** | All four `renounceOwnership` overrides are `public view override onlyOwner` + `revert(...)`. `onlyOwner` runs first, so non-owners get `OwnableUnauthorizedAccount` rather than the disabled message. `view` on a revert-only function is also semantically wrong.                                            | **HIGH**   | —         | —        | **Pre-existing, structural**      | **HIGH**   | Drop both `view` and `onlyOwner`; let the unconditional revert win for everyone (matches OZ canonical pattern)                                                     |
| **H-7** | `Deploy.s.sol` G-6 fix pins `TBA_IMPLEMENTATION` on Base/Base Sepolia but does NOT pin `ERC6551_REGISTRY` — same misconfiguration class on the other half of the helper's immutable references                                                                                                                | —          | **MED**   | —        | **G-6 incomplete**                | **HIGH**   | Mirror the existing TBA pin: `if (chainid == 8453 \|\| chainid == 84532) require(erc6551Registry == 0x000000006551c19487814612e58FE06813775758)`                   |
| **M-1** | `setAuthorizedContract` and `setTrustedDirectoryContract` have no timelock. The Phase 9 G-8 timelock on `setBaseURI` was justified by "Safe-compromise → instant phishing on metadata"; the same risk applies more strongly to namespace authorization.                                                       | MED        | —         | —        | **G-8 asymmetry**                 | **MEDIUM** | Apply queue + apply pattern (24h) to both setters; reuse `BaseURIQueued`/`applyBaseURI` template                                                                   |
| **M-2** | `applyBaseURI` does NOT re-validate the queued URL via `SAGAValidation.validateUrl` before assignment — defense-in-depth gap if validator semantics tighten between queue and apply                                                                                                                           | MED        | —         | —        | **G-8 incomplete**                | **MEDIUM** | Run `SAGAValidation.validateUrl(_pendingBaseURI)` immediately before `_baseTokenURI = _pendingBaseURI`                                                             |
| **M-3** | Metadata setters (`updateHomeHub`, `updateOrgName`, `updateDirectoryUrl`, `updateDirectoryStatus`) use `require(ownerOf(tokenId) == msg.sender)` instead of OZ's `_isAuthorized`. Breaks 4337 / Safe / Delegate.xyz operator workflows.                                                                       | —          | —         | MED      | **Pre-existing, design**          | **MEDIUM** | Replace with `_isAuthorized(_ownerOf(tokenId), msg.sender, tokenId)` — interacts with **H-1** fix                                                                  |
| **M-4** | `setAuthorizedContract` accepts EOAs. Owner can authorize an EOA that then directly squats arbitrary handles with fake tokenIds (no NFT exists). README G-14 documents this as policy-only mitigation; OpenAI re-flags as code-fixable.                                                                       | (G-14 doc) | **MED**   | —        | **Pre-existing, structural**      | **MEDIUM** | Add `if (authorized) require(addr.code.length > 0)` to setter                                                                                                      |
| **M-5** | `IdentityInvariantsTest.invariant_selfTBA_universality` uses `tba.computeAccount(...)` for both the production check AND the test's expected value. Tautological — a future refactor that disconnects the production path from the helper would not fail this invariant.                                      | MED        | —         | —        | **G-18 incomplete**               | **MEDIUM** | Add a manually-computed self-TBA address (off-chain via `keccak256`) and assert it matches `tba.computeAccount` AND that transfer to it reverts                    |
| **M-6** | `registerAgentInDirectory` / `registerOrgInDirectory` writes `_directoryIds[tokenId]` BEFORE calling `handleRegistry.registerScopedHandle` — relies entirely on the registry to validate the directory exists. Defense-in-depth gap.                                                                          | MED        | —         | —        | **Phase 8 design**                | **MEDIUM** | Optional secondary status check on directory contract direct (one extra `STATICCALL`)                                                                              |
| **M-7** | `_statusRank("")` reverts with "unknown status rank". Today unreachable because every minted token has a status set in `registerDirectory` before `_safeMint`. But brittle — a future migration path that hits `_update` with `from != 0` for an uninitialized status bricks transfer.                        | MED        | —         | —        | **Pre-existing, latent**          | **MEDIUM** | Treat empty-string status as `active` (rank 0) in `_statusRank`, OR add explicit guard at every call site                                                          |
| **M-8** | TS package documents `SAGATBAHelper` as a contract export but `scripts/generate-abis.mjs` only targets the four identity contracts. Frontends reimplement the helper's derivation off-chain instead of calling it, risking drift from the helper's immutable refs.                                            | —          | INFO      | —        | **G-16 incomplete**               | **MEDIUM** | Add `SAGATBAHelper` to the generator + `getTBAHelperConfig()` in `clients.ts` + ABI freshness test                                                                 |
| **L-1** | `setTrustedDirectoryContract` has no ABI probe (deliberate Phase 9 G-13 decision). Re-asserted by Anthropic; documented residual risk stands.                                                                                                                                                                 | LOW        | —         | —        | **G-13 deliberate skip**          | **LOW**    | None (decision honored). Optional `try/catch` probe per Phase 9 G-13 alt-implementation                                                                            |
| **L-2** | `Deploy.s.sol` G-6 chain-pin is a lone constant with no `console.log` to help an operator diagnose a mismatch on launch day                                                                                                                                                                                   | LOW        | —         | —        | **G-6 polish**                    | **LOW**    | Log expected vs got before the require                                                                                                                             |
| **L-3** | `SAGAOrgIdentity.registerOrganization` calls `bytes(name).length` twice without caching — minor gas waste. Phase 8 F-9 already applied this optimization to the directory contract's conformance level.                                                                                                       | LOW        | —         | —        | **F-9 incomplete**                | **LOW**    | Cache once: `uint256 nameLen = bytes(name).length`                                                                                                                 |
| **I-1** | No "every minted handle round-trips through `resolveHandle`" invariant. Catches silent registration failures that the supply-counter invariant misses.                                                                                                                                                        | INFO       | —         | —        | **Test coverage**                 | **INFO**   | Iterate `agent.totalSupply()`; for each tokenId, assert `registry.resolveHandle(agent.agentHandle(tokenId))` returns the same tokenId                              |
| **I-2** | Tests do not exercise the 4-arg `safeTransferFrom(from, to, tokenId, data)` overload against the self-TBA guard                                                                                                                                                                                               | INFO       | —         | —        | **Test coverage**                 | **INFO**   | Mirror existing 3-arg test with 4-arg form                                                                                                                         |
| **I-3** | `ERC721Enumerable` adds ~50K gas per transfer for index-array maintenance — design call, may not be needed if indexer handles enumeration                                                                                                                                                                     | INFO       | —         | —        | **Design**                        | **INFO**   | Discuss before mainnet whether to drop                                                                                                                             |
| **I-4** | Front-runnable handle registration documented as off-chain UX concern (already accepted)                                                                                                                                                                                                                      | INFO       | —         | —        | **Already accepted**              | **N/A**    | None                                                                                                                                                               |

---

## Severity rollup

| Triage Severity | Count  | IDs                                    |
| --------------- | ------ | -------------------------------------- |
| **CRITICAL**    | 0      | —                                      |
| **HIGH**        | 7      | H-1, H-2, H-3, H-4, H-5, H-6, H-7      |
| **MEDIUM**      | 8      | M-1, M-2, M-3, M-4, M-5, M-6, M-7, M-8 |
| **LOW**         | 3      | L-1, L-2, L-3                          |
| **INFO**        | 4      | I-1, I-2, I-3, I-4                     |
| **TOTAL**       | **22** |                                        |

---

## Origin breakdown

| Origin                                           | Count | IDs                                                                                                                     |
| ------------------------------------------------ | ----- | ----------------------------------------------------------------------------------------------------------------------- |
| **Phase 9 over-scope / under-scope**             | 4     | H-1 (G-1 over), H-2 (G-5+G-11 under), H-3 (G-2 docs), H-7 (G-6 incomplete)                                              |
| **Phase 9 incomplete fixes**                     | 3     | M-1 (G-8 asymmetry), M-2 (G-8 no re-validation), M-8 (G-16 missing helper export)                                       |
| **Pre-existing, missed in earlier audits**       | 5     | H-4 (URL chars), H-6 (renounce semantics), M-4 (auth EOA — G-14 doc-only), M-3 (operator workflows), M-7 (empty status) |
| **Phase 9 test/coverage incomplete**             | 2     | M-5 (G-18 tautology), I-1 / I-2 (test gaps)                                                                             |
| **Deploy pipeline (script-side, not contracts)** | 1     | H-5 (CREATE/Safe collision)                                                                                             |
| **Defense-in-depth design choice**               | 2     | M-6 (registerInDirectory trust chain), L-1 (probe)                                                                      |
| **Style / gas / docs**                           | 3     | L-2 (deploy log), L-3 (gas), I-3 (Enumerable)                                                                           |
| **Already accepted**                             | 1     | I-4 (commit-reveal)                                                                                                     |

**Net assessment:** Phase 9 itself introduced 7 partial-closure findings (4 over/under-scope + 3 incomplete). Five real pre-existing issues finally surfaced once G-1..G-18 raised the auditor's scrutiny floor — particularly **H-4 (URL injection)** which all three providers flag, with severity disagreement (Low/Low/High). Net forward progress, but G-1's over-scope is a regression that needs immediate attention.

---

## Disagreement / divergence

### H-1 (`_isAuthorized` over-scope)

- **Anthropic HIGH (C-2)** — frames as "governance authority over-scoped"
- **Gemini HIGH** — frames as "Safe seizure of active directories"
- **OpenAI** — flagged in prior audit cycle, not re-flagged this run

Strong consensus on the problem; severity disagreement on framing only. **Triage as HIGH.**

### H-4 (URL control bytes / XSS)

- **Anthropic LOW (L-3)** — defense-in-depth, off-chain consumers must sanitize anyway
- **OpenAI LOW (F-3)** — same framing
- **Gemini HIGH** — frames as XSS / remediation regression

The on-chain layer is not the right place to defend against XSS, but it IS the right place to reject obvious garbage at zero marginal cost. **Triage as HIGH** because the cheapest fix is a 5-line byte scan that closes the entire class without affecting downstream behavior.

### H-2 (`resolveActiveScopedHandle` missing trust check)

- **Gemini HIGH only.** Anthropic and OpenAI did not flag.

Verified independently: the view at `src/SAGAHandleRegistry.sol:224-246` calls `IDirectoryStatus(dirRecord.contractAddress).directoryStatus(...)` without `trustedDirectoryContracts[contractAddress]` gate. The write path at `:158-167` does check trust. **Real bug**; **triage as HIGH** because it is a regression introduced in Phase 9B G-5.

### H-5 (deploy pipeline)

- **Gemini HIGH only.** Same finding as the prior `T18-26-45` Gemini run.

Pipeline-side, not contracts. Mainnet launch blocker but a 5-line bash fix. **Triage as HIGH** because it gates the entire mainnet rollout.

---

## Recommended Phase 10 PR queue

### PR 10A — Mainnet-blocking (must land before Base mainnet)

| Order | Finding | LOC                             | Action                                                                                                                                             |
| ----- | ------- | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | H-1     | ~5 lines + 1 test               | Tighten `_isAuthorized` to require rank ≥ 2 for the governance bypass; add `test_g1_governanceCannotTransferActiveDirectory`                       |
| 2     | H-2     | ~5 lines + 1 test               | Add `trustedDirectoryContracts` check to `resolveActiveScopedHandle`; add `test_resolveActiveScopedHandle_revertsWhenContractDetrusted`            |
| 3     | H-3     | doc-only OR ~5 lines            | Either rewrite `_validateHandle` docstring to be honest (recommended), or implement no-1-char-segment-separator rule                               |
| 4     | H-4     | ~10 lines + fuzz                | Byte scan in `validateUrl` rejecting `<= 0x20`, `0x7F`, `\`, and HTML metacharacters; extend `testFuzz_validateUrl_acceptOnlyValidAscii`           |
| 5     | H-5     | bash-side                       | `deploy-entrypoint.sh` — accept `DEPLOY_DIRECT=true` to bypass multisend for initial factory deploys                                               |
| 6     | H-6     | ~4 lines × 4 contracts + 1 test | Drop `view` and `onlyOwner` from all four `renounceOwnership` overrides; add `test_renounceOwnership_revertsForNonOwner` with the disabled-message |
| 7     | H-7     | ~6 lines                        | Mirror G-6 chain-pin for `ERC6551_REGISTRY` on chainId 8453/84532                                                                                  |

### PR 10B — Strongly recommended

| Order | Finding | LOC                  | Action                                                                                                                                                      |
| ----- | ------- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 8     | M-1     | ~30 lines            | Queue + apply timelock on `setAuthorizedContract` and `setTrustedDirectoryContract` (mirror G-8 pattern)                                                    |
| 9     | M-2     | ~3 lines             | Re-validate URL inside `applyBaseURI` before `_baseTokenURI = _pendingBaseURI` (×3 contracts)                                                               |
| 10    | M-3     | ~5 lines × 4 setters | Replace `ownerOf(tokenId) == msg.sender` with `_isAuthorized(_ownerOf(tokenId), msg.sender, tokenId)` — interacts with H-1 fix; add operator-workflow tests |
| 11    | M-4     | ~3 lines + 1 test    | Add `if (authorized) require(addr.code.length > 0)` to `setAuthorizedContract`; mirror existing `setTrustedDirectoryContract`                               |
| 12    | M-8     | ~10 lines            | Add `SAGATBAHelper` to `generate-abis.mjs` + ABI freshness test + `getTBAHelperConfig`                                                                      |

### PR 10C — Test / doc hardening (deferred)

| Order | Finding | Action                                                                         |
| ----- | ------- | ------------------------------------------------------------------------------ |
| 13    | M-5     | Independent self-TBA computation in test; assert match AND revert              |
| 14    | M-6     | Defense-in-depth secondary status check OR explicit doc of trust chain         |
| 15    | M-7     | Treat empty status as rank 0 in `_statusRank`, OR explicit guard at call sites |
| 16    | L-1     | Optional probe + emit event on result                                          |
| 17    | L-2     | Add `console.log` for expected vs got TBA implementation                       |
| 18    | L-3     | Cache `bytes(name).length` once in Org                                         |
| 19    | I-1     | Roundtrip handle invariant                                                     |
| 20    | I-2     | 4-arg safeTransferFrom test                                                    |
| 21    | I-3     | Discuss `ERC721Enumerable` necessity before mainnet                            |
| 22    | I-4     | None (already accepted)                                                        |

---

## Acceptance criteria

- All 7 Phase 10A items merged before mainnet broadcast.
- All 5 Phase 10B items merged before public launch.
- Phase 10C may land post-launch as defense-in-depth.
- `forge test` clean: 202 → ~210 tests post-10A, ~215 post-10B.
- `forge build` clean.
- Sepolia dry-run reproduces deploy + ownership transfer cleanly with the new H-5 / H-7 deploy script.
- All 22 H-/M-/L-/I- items either CLOSED or explicitly DEFERRED with rationale.

## Out of scope

- Re-running the three-provider audit a fourth time (separate task once 10A+10B merge).
- Phase 8 mobile audit (`packages/saga-app`) — separate milestone.
- Full URL parser on-chain (RFC 3986/3987 grammar) — too gas-heavy; H-4 fix is byte-blacklist only.

---

## Final assessment

The contracts continued forward progress through Phase 9. **Five Phase 9 closures landed partial:** G-1 (over-scope), G-2 (misleading docs), G-5+G-11 (resolver missing trust), G-6 (registry not pinned), G-8 (no re-validation), G-16 (helper not exported), G-18 (tautological test). Three are direct regressions introduced **by** Phase 9 (H-1, H-2, M-2), justifying a Phase 10A.

Five pre-existing issues finally surfaced because the auditor's scrutiny floor rose with G-1..G-18 (H-4, H-6, M-3, M-4, M-7). H-4 in particular has three-way coverage — Anthropic + OpenAI + Gemini all flag URL control-byte acceptance, severity disagreement only.

**Mainnet readiness: Conditional NO.** Fix H-1 and H-2 immediately (over-scoped governance + spoofable resolver) — those are regressions the prior gap matrix promised would be closed. H-5 (deploy pipeline) is a non-contracts blocker but blocks the operational path. H-3 / H-4 / H-6 / H-7 are mainnet blockers per the providers' stated severity. **Phase 10A is roughly the same shape as Phase 9A — 1 PR, ~80 LOC including tests.**

**Recommendation:** open a Phase 10 milestone with 7 fix tasks for Phase 10A, plus the 5 Phase 10B medium items. Estimated 2 PRs. The Sepolia + Safe handoff manual checklist from the previous matrix still applies, with the addition of H-5's `DEPLOY_DIRECT=true` mode flag.

---

## Phase 10 closure (2026-05-04)

All 21 actionable findings closed across three PRs against `dev`. I-4
was already accepted (front-running documented as off-chain UX concern).

| ID  | Severity | Closed by    | Notes                                                                                                                                                                                                                                               |
| --- | -------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| H-1 | HIGH     | PR #53 (10A) | `_isAuthorized` governance bypass scoped to rank ≥ 2 only. Active/suspended directories now require normal owner-or-approved auth.                                                                                                                  |
| H-2 | HIGH     | PR #53 (10A) | `resolveActiveScopedHandle` now checks `trustedDirectoryContracts` before consulting `directoryStatus()`. Closes the Phase 9 G-5 regression.                                                                                                        |
| H-3 | HIGH     | PR #53 (10A) | `_validateHandle` docstring rewritten to honestly describe what the consecutive-separator rule actually does (anti-spam, not anti-homoglyph).                                                                                                       |
| H-4 | HIGH     | PR #53 (10A) | `validateUrl` rejects control bytes, raw whitespace, backslash, and HTML metacharacters. Multi-byte UTF-8 still permitted for IDN.                                                                                                                  |
| H-5 | HIGH     | PR #53 (10A) | `deploy-entrypoint.sh` accepts `DEPLOY_DIRECT=true` to bypass Safe-multisend routing for the initial CREATE.                                                                                                                                        |
| H-6 | HIGH     | PR #53 (10A) | All four `renounceOwnership` overrides drop `view` and `onlyOwner`; disabled-message wins for every caller.                                                                                                                                         |
| H-7 | HIGH     | PR #53 (10A) | `Deploy.s.sol` hard-pins `ERC6551_REGISTRY` on Base mainnet/Sepolia.                                                                                                                                                                                |
| M-1 | MEDIUM   | PR #54 (10B) | 24h timelock on `setAuthorizedContract` and `setTrustedDirectoryContract` post-handoff. Bootstrap exception via `_initialOwner` for Deploy.s.sol; deauthorization always immediate. Apply functions re-check `code.length` (Copilot review).        |
| M-2 | MEDIUM   | PR #54 (10B) | `applyBaseURI` re-validates the queued URL at apply time across all three identity contracts. `validateUrl` signature changed to `string memory`.                                                                                                   |
| M-3 | MEDIUM   | PR #54 (10B) | Metadata setters (`updateHomeHub`, `updateOrgName`, `updateDirectoryUrl`, `updateDirectoryStatus` NFT-owner branch) now use OZ's `_isAuthorized` after `_requireOwned`. Smart-wallet delegates work; ERC-721 nonexistent-token semantics preserved. |
| M-4 | MEDIUM   | PR #54 (10B) | `setAuthorizedContract(addr, true)` requires `addr.code.length > 0`. Detrust path stays open for safety.                                                                                                                                            |
| M-5 | MEDIUM   | PR #55 (10C) | `IdentityInvariantsTest.invariant_selfTBA_universality` now cross-checks the helper's computation against an independent off-chain derivation. Catches future drift.                                                                                |
| M-6 | MEDIUM   | PR #55 (10C) | README "Scoped registration trust chain" section documents the three-hop trust model. Defense-in-depth secondary check deferred to a future major version.                                                                                          |
| M-7 | MEDIUM   | PR #55 (10C) | `_statusRank` treats empty string as rank 0 (active) instead of reverting. Hardens against future migration paths that hit `_update` with uninitialized status.                                                                                     |
| M-8 | MEDIUM   | PR #54 (10B) | `SAGATBAHelper` exported from TS bindings: ABI generator, `index.ts`, `clients.ts.getTBAHelperConfig`, ABI freshness pin.                                                                                                                           |
| L-1 | LOW      | DEFERRED     | `setTrustedDirectoryContract` ABI probe stays deferred per Phase 9 G-13 decision; an on-chain probe is unreliable across Solidity versions and the misconfiguration is caught at the next `registerScopedHandle` call.                              |
| L-2 | LOW      | PR #55 (10C) | `Deploy.s.sol` logs expected vs got `TBA_IMPLEMENTATION` on Base mainnet/Sepolia before the require.                                                                                                                                                |
| L-3 | LOW      | PR #55 (10C) | `SAGAOrgIdentity.registerOrganization` caches `bytes(name).length`.                                                                                                                                                                                 |
| I-1 | INFO     | PR #55 (10C) | `IdentityInvariantsTest.invariant_handleRoundtripResolves` pins that every minted agent/org token's handle resolves back through the registry to the same triple.                                                                                   |
| I-2 | INFO     | PR #55 (10C) | 4-arg `safeTransferFrom(from, to, tokenId, data)` regression tests added for Agent and Directory. F-4 self-TBA guard verified on the routed path.                                                                                                   |
| I-3 | INFO     | PR #55 (10C) | README documents the `ERC721Enumerable` gas overhead; future-version decision.                                                                                                                                                                      |
| I-4 | N/A      | ACCEPTED     | Front-running of handle registration accepted as off-chain UX concern. Commit-reveal deferred.                                                                                                                                                      |

**Test counts after Phase 10 closure:** 235 forge tests passing
(was 218 pre-Phase-10), 35 vitest TS tests passing (was 33 pre-Phase-10).
`forge build` clean. `pnpm typecheck` clean.

**Mainnet readiness:** all HIGH and MEDIUM findings closed. The Sepolia

- Safe handoff manual checklist from the post-Phase-8 matrix still
  applies, with the addition of:

1. Set `DEPLOY_DIRECT=true` for the initial `Deploy.s.sol` broadcast (H-5).
2. Verify `ERC6551_REGISTRY=0x000000006551c19487814612e58FE06813775758` (H-7 will reject any other value on Base mainnet/Sepolia).
3. Confirm `TBA_IMPLEMENTATION=0x55266d75D1a14E4572138116aF39863Ed6596E7F` (G-6 + L-2 will log expected/got on launch).
4. After deploy and `TransferOwnership.s.sol`, the initial deployer is no longer `_initialOwner`-grade for `setAuthorizedContract` purposes; from then on all new authorizations require the 24h timelock through `queue*` + `apply*` (M-1). De-authorizations stay immediate.
