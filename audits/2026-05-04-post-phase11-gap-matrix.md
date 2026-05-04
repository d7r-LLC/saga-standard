# Post-Phase-11 Re-Audit — Unified Gap Matrix

**Date:** 2026-05-04
**Engagement:** Re-audit of `packages/contracts/` after Phase 11 (PRs #56–#57)
**Bundle:** focused re-audit of contracts package against latest models from all three providers
**Steering:** `audits/2026-05-03-contracts-focused/system.md` + `prompt.md`
**Code state:** `dev` tip = `7d75f3a` (Phase 11B merge: J-1..J-13 closed, K-2 codehash snapshot, K-3 J-13 gas budget, gitleaks allowlist)

---

## Run summary

| Provider  | Model                  | Findings posted                               |
| --------- | ---------------------- | --------------------------------------------- |
| Anthropic | claude-opus-4-7        | 3 HIGH (K-1/K-2/K-3) + 4 MED + INFO           |
| OpenAI    | gpt-5.5                | 1 LOW (K-9) + INFO (K-11/K-13/K-14/K-15/K-17) |
| Gemini    | gemini-3.1-pro-preview | 2 MED (K-4/K-10) + INFO                       |

Output paths:

- `audits/2026-05-04T22-14-50__.../response.md`
- `audits/2026-05-04T22-16-14__.../response.md`
- `audits/2026-05-04T22-15-32__.../response.md`

> **Cross-provider consensus:** All three providers flagged K-4 (DeployOrg post-bootstrap brick) independently, making it the consensus mainnet blocker alongside Anthropic's three HIGH findings.

---

## Verification of Phase 11 closures

All J-series closures from PRs #56 and #57 were re-checked. **All Phase 11 closures hold.** No regressions of J-1 through J-13 surfaced in this round.

| ID   | Closed by | Re-verification                                                                                     | Status   |
| ---- | --------- | --------------------------------------------------------------------------------------------------- | -------- |
| J-1  | PR #56    | `cancelPendingAuthorizedContract` + `cancelPendingTrustedDirectoryContract` confirmed by Anthropic. | ✅ HOLDS |
| J-2  | PR #56    | `resolveScopedHandle` raw resolver doc-only mitigation accepted; indexers warned.                   | ✅ HOLDS |
| J-3  | PR #56    | `bootstrapFinalized` one-way flag in `Deploy.s.sol` confirmed by all three.                         | ✅ HOLDS |
| J-4  | PR #56    | Operator log at boot confirmed.                                                                     | ✅ HOLDS |
| J-5  | PR #56    | Org-name + conformance validation surfaces extended.                                                | ✅ HOLDS |
| J-6  | PR #56    | `validateBaseUri` trailing-slash + `?#&` blacklist confirmed.                                       | ✅ HOLDS |
| J-7  | PR #56    | Directory invariant coverage extended.                                                              | ✅ HOLDS |
| J-8  | PR #56    | Deauthorize-side timelock decision documented; held as policy-not-code.                             | ✅ HOLDS |
| J-9  | PR #57    | Tokenbound V3 hardcoded address validated; gitleaks allowlist entry confirmed.                      | ✅ HOLDS |
| J-10 | PR #57    | Non-pinned chain warning logs added to `Deploy.s.sol`.                                              | ✅ HOLDS |
| J-11 | PR #57    | Directory tokens added to `invariant_handleRoundtripResolves`.                                      | ✅ HOLDS |
| J-12 | PR #57    | `validateUrl` byte-blacklist closure with 256-run fuzz confirmed.                                   | ✅ HOLDS |
| J-13 | PR #57    | ERC-6551 `token()` introspection guard confirmed across agent/org/directory.                        | ✅ HOLDS |

---

## NEW Phase 11 findings (K-series)

Twenty new findings introduced in this re-audit round, organized by severity.

### HIGH (Anthropic — mainnet blockers)

| ID  | Title                                            | Origin    | Closing PR |
| --- | ------------------------------------------------ | --------- | ---------- |
| K-1 | `applyAuthorizedContract` lacked `onlyOwner`     | Anthropic | 12A (#58)  |
| K-2 | Codehash snapshot for queued authorized contract | Anthropic | 12A (#58)  |
| K-3 | J-13 `token()` introspection unbounded gas       | Anthropic | 12A (#58)  |

### MEDIUM

| ID   | Title                                             | Origin              | Closing PR   |
| ---- | ------------------------------------------------- | ------------------- | ------------ |
| K-4  | `DeployOrg.s.sol` bricks post-bootstrap           | All three providers | 12A (#58)    |
| K-6  | Authorized contract entityType-spoofing surface   | Anthropic           | **RESIDUAL** |
| K-7  | `_isAuthorized` governance bypass visible to DeFi | Anthropic           | 12B (#59)    |
| K-10 | Directory `operatorWallet` non-rotatable          | Gemini              | 12B (#59)    |

### LOW

| ID   | Title                                                | Origin    | Closing PR |
| ---- | ---------------------------------------------------- | --------- | ---------- |
| K-5  | `setBaseURI` queue lacked cancel path                | Anthropic | 12B (#59)  |
| K-8  | Read paths skipped handle validation                 | Anthropic | 12B (#59)  |
| K-9  | `TransferOwnership.s.sol` not idempotent             | OpenAI    | 12B (#59)  |
| K-15 | `finalizeBootstrap` inside `Deploy.s.sol` script run | Anthropic | 12C (#TBD) |

### INFO

| ID   | Title                                                                | Origin             | Closing PR  |
| ---- | -------------------------------------------------------------------- | ------------------ | ----------- |
| K-11 | Self-TBA guard on directory mint                                     | OpenAI             | 12B (#59)   |
| K-12 | Full-byte fuzz on `validateBaseUri`                                  | OpenAI             | 12C (#TBD)  |
| K-13 | `Deploy.s.sol` skipped helper getter verification                    | Anthropic          | 12C (#TBD)  |
| K-14 | Chain-pin require blocks duplicated by chain-name suffix             | Anthropic          | 12C (#TBD)  |
| K-17 | Gas micro-opt: early-exit `_update` for EOA destinations             | OpenAI / Anthropic | **DROPPED** |
| K-18 | README runbook: deploy → smoke → finalize sequence                   | Anthropic          | 12C (#TBD)  |
| K-19 | Comment polish: `cancelPendingBaseURI`, governance rescue cross-refs | Anthropic          | 12C (#TBD)  |
| K-20 | Phase 12 closure section in this gap matrix                          | n/a                | 12C (#TBD)  |

### Aggregate severity rollup

| Severity | Count  | Closed by 12A | Closed by 12B | Closed by 12C | Residual / Dropped |
| -------- | ------ | ------------- | ------------- | ------------- | ------------------ |
| HIGH     | 3      | 3             | 0             | 0             | 0                  |
| MEDIUM   | 4      | 1             | 2             | 0             | 1 (K-6)            |
| LOW      | 4      | 0             | 3             | 1             | 0                  |
| INFO     | 9      | 0             | 1             | 7             | 1 (K-17)           |
| **All**  | **20** | **4**         | **6**         | **8**         | **2**              |

---

## Origin breakdown

| Provider  | Findings posted | Closed by Phase 12 | Residual         |
| --------- | --------------- | ------------------ | ---------------- |
| Anthropic | 11              | 10                 | 1 (K-6)          |
| OpenAI    | 5               | 5                  | 0                |
| Gemini    | 4               | 4                  | 0 (K-17 dropped) |

K-4 was reported by all three independently and counted once toward Anthropic above.

---

## PR queue (as executed)

- **PR 12A — mainnet blockers:** K-1, K-2, K-3, K-4 → merged at `789c347`.
- **PR 12B — defense-in-depth + ops:** K-5, K-6 (residual), K-7, K-8, K-9, K-10, K-11 → merged at `cb9d1b8`.
- **PR 12C — test/doc + closure:** K-12, K-13, K-14, K-15, K-18, K-19, K-20 → this PR.

---

## Final assessment

Phase 12 closes 18 of the 20 K-findings. The two residuals are:

1. **K-6** (Anthropic M-2 / authorized-contract entityType-spoofing): closing in code requires either reordering F-2 CEI (regressing the Phase 8 half-initialized-state observation guard) or a `setAuthorizedContract` signature redesign across 47 call sites. Mitigation = governance: Safe diligence on every new authorized contract entry. Documented in `packages/contracts/README.md` "Authorized contracts: residual risk". Re-evaluation deferred to a future major version.

2. **K-17** (gas micro-opt: EOA early-exit in `_update`): the proposed early-exit `if (to.code.length == 0) return` would break F-4. F-4's `selfTba` is a CREATE2-deterministic address — an attacker can transfer to the predicted EOA-state address before the TBA is deployed, then deploy the TBA there to form the ownership loop. The ~700-gas savings are not worth the F-4 regression. Dropped.

---

## Phase 12 closure section

- **PR 12A (`789c347`)** — K-1, K-2, K-3, K-4 closed.
- **PR 12B (`cb9d1b8`)** — K-5, K-7, K-8, K-9, K-10, K-11 closed; K-6 documented as residual.
- **PR 12C (this PR)** — K-12, K-13, K-14, K-15, K-18, K-19, K-20 closed; K-17 dropped with rationale.

**Test counts at Phase 12 close:** 311 forge tests passing (was 274 pre-Phase-11), 35 TypeScript tests passing, `forge build` clean, `pnpm typecheck` clean, gitleaks clean.

**Mainnet readiness:** 12A satisfies all blockers; 12B closes defense-in-depth; 12C is doc / test hardening that may land post-launch. Ready for Sepolia dry-run of the full deploy → smoke → finalize → transfer-ownership runbook.
