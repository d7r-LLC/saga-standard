# SAGA Standard — Smart Contract Security Audit (focused, contracts-only)

**Engagement scope:** Solidity contracts under `packages/contracts/src/` and the deploy/test scaffolding under `packages/contracts/{script,test,foundry.toml,remappings.txt}`.

**Engagement type:** Pre-mainnet hardening review. Contracts are deployed on Base Sepolia (testnet) but **not yet on Base mainnet**. The team has a Gnosis Safe ready for production ownership transfer.

The bundled XML blob below contains every Solidity file plus the test suite, the foundry config, the deploy scripts, and the audit-history docs. Each file is wrapped in `<file path="..."> ... </file>`.

---

## What was already remediated (DO NOT re-flag these)

The following findings have been closed by Phase 0–1 of the 2026-05-03 security remediation. Do not re-flag them as new issues; only flag follow-on bugs in the remediation logic itself.

| Already-closed | Where it lives now |
| -------------- | ------------------ |
| URL ingress validation (length cap 1024, http(s)-only, calldata bytes) | `SAGAValidation.sol` library; called by every URL writer |
| Directory status downgrade-only enforcement (NFT owner cannot self-rehabilitate from `flagged` / `revoked` back to `active`) | `SAGADirectoryIdentity.updateDirectoryStatus`, `_statusRank()` helper |
| First-come-first-served handle disclosure | `docs/spec.md §4.1` — explicitly documented as front-runnable; commit-reveal deferred |
| Mainnet-blocking deploy pipeline (mnemonic via stdin, hardened Docker container, read-only fs, derive-mnemonic.mjs helper) | `packages/contracts/scripts/derive-mnemonic.mjs`, `Dockerfile.deploy`, `packages/cli/src/deploy-docker.ts` |

If any of the above logic has a flaw (e.g. the URL validator can be bypassed, the status-rank check has an off-by-one), report it as **Critical** under "Remediation regression". Otherwise leave them alone.

---

## What is in scope — focus dimensions

Audit the following dimensions in this priority order. For each contract file, walk every external/public function and answer: **Who can call this? What state does it mutate? What does an attacker gain by calling it in a way the developers didn't intend?**

### A. Access control & ownership

A.1. **Ownable single-step transfer risk.** All four contracts (Registry, AgentIdentity, OrgIdentity, DirectoryIdentity) use OpenZeppelin `Ownable`, not `Ownable2Step`. A typo'd `transferOwnership(0xDEAD...)` would brick admin functions. Pre-mainnet, the team plans to transfer ownership to a Gnosis Safe — assess whether the single-step transfer is safe given that workflow, or whether `Ownable2Step` should be adopted before mainnet.

A.2. **`renounceOwnership` not overridden.** The inherited `renounceOwnership()` is callable by the current owner. After Safe transfer, the Safe could renounce and leave `setAuthorizedContract`, `setBaseURI`, and direct status-override permanently un-administrable. Should `renounceOwnership` be `revert`-overridden?

A.3. **Authorized-contract list is owner-managed without revocation event semantics.** `setAuthorizedContract(address, bool)` has no per-action delay, no two-step accept, and no automatic deauthorization on identity-contract upgrade. If a deployed identity contract has a bug, the only recovery is owner-initiated deauthorization — what is the response-time risk window?

A.4. **`setBaseURI(string)` is owner-controlled and unbounded.** A compromised owner key can redirect `tokenURI(...)` for every minted NFT in one transaction. Is the metadata URL on-chain (good) or is it a base + tokenId path (medium — can be redirected)? Does the marketplace integration (OpenSea, etc.) cache or trust this URL? Note any baseURI length cap (none currently).

A.5. **Directory contract dual-authority on status updates.** `updateDirectoryStatus` accepts EITHER the contract owner (governance) OR the token owner (with downgrade-only). Walk the rank-comparison logic in `_statusRank` and confirm there is no path where a token owner can set status to a numerically equal or smaller value that ALSO equals `active` (i.e. confirm the `<=` vs `<` semantics).

### B. Handle registration & namespace integrity

B.1. **Front-runnable registration.** The spec acknowledges this and defers commit-reveal. Confirm there are no compounding bugs: e.g. the same handle being claimable on two different identity contracts (agent + org) in the SAME block via different call orderings; the scoped-handle namespace overlapping with global; the lowercase-normalization being bypassable via Unicode homoglyphs (cyrillic-a vs latin-a).

B.2. **`registerScopedHandle` directory-id validation.** What stops a malicious caller (an authorized identity contract with a bug) from passing an empty directoryId, a directoryId that doesn't exist on-chain, or a directoryId that aliases an existing global handle? Walk the validation gate.

B.3. **Handle string normalization & length bounds.** 3–64 byte length cap is documented. Test the boundary: 2-byte handle (must reject), 64-byte handle (must accept), 65-byte handle (must reject), handle with leading/trailing punctuation, handle with embedded null byte, handle with multi-byte UTF-8 character that the byte counter treats as one char but the readable form treats as multiple.

B.4. **Authorization escalation via reentrancy.** `registerHandle` writes state then doesn't make external calls — but `_safeMint` in the identity contracts DOES call `onERC721Received` on the recipient. Can a malicious recipient re-enter back into `registerHandle` (or `registerAgent`) during the mint callback and claim a handle the original caller hasn't been charged for?

### C. ERC-6551 Token Bound Account (SAGATBAHelper)

C.1. **Ownership-loop trap.** A documented ERC-6551 vulnerability: the NFT owner can `safeTransferFrom(self, tba, tokenId)` to transfer the NFT INTO its own bound account. The TBA now owns the NFT, but the NFT owns the TBA — neither is recoverable by an external wallet. Does `SAGATBAHelper` (or the NFT contracts) prevent this? If not, what's the recovery path?

C.2. **Front-running on NFT sale with TBA contents.** A buyer makes an offer on an agent NFT assuming the TBA holds tokens. The seller drains the TBA and accepts the offer in the same block. The buyer gets an empty account. Does the SAGA stack expose any mitigation (snapshot of TBA contents at sale time, escrow, opt-in to "TBA-included" semantics)?

C.3. **`computeAccount` vs `createAccount` race.** `computeAccount` returns a deterministic address; `createAccount` deploys it. Between the two calls, can a third party deploy the same address with different `accountImplementation`? (No, because `salt + tokenId + chainId + implementation` is part of the CREATE2 derivation — but confirm the registry library uses CREATE2 with all five inputs and that the hardcoded `DEFAULT_SALT = bytes32(0)` doesn't enable cross-NFT TBA collisions on different identity contracts.)

C.4. **`computeAccountForChain` cross-chain assumption.** This computes a TBA address on a different chainId. If chain A and chain B have different `accountImplementation` deployed at the same address (or one missing), the cross-chain reference is broken. What does the SAGA stack do when it discovers this?

C.5. **TBA implementation immutable but unverified.** `SAGATBAHelper` stores `accountImplementation` as immutable. If the implementation has a known bug (e.g. delegatecall escape, signature-validation flaw), every TBA deployed via this helper inherits it. Audit assumes the canonical Tokenbound implementation (`0x...`) — confirm the Deploy script enforces this and doesn't accept arbitrary impl from env.

### D. Token transfer semantics

D.1. **`ERC721Enumerable` gas griefing risk.** Each transfer iterates over the owner's enumeration array. A malicious actor with hundreds of agent NFTs can cause subsequent `transferFrom` to that wallet to consume more gas, but standard mempool/gas pricing should handle it. Confirm there's no on-chain caller that breaks if a transfer becomes expensive (e.g. a deploy script that batches transfers, an indexer-triggered re-transfer). Reference: `lib/openzeppelin-contracts/contracts/token/ERC721/extensions/ERC721Enumerable.sol`.

D.2. **No `_beforeTokenTransfer` or `_update` override.** OZ v5 uses `_update` (not `_beforeTokenTransfer`). The four identity contracts do not override `_update`. Is there ANY business rule that should run on transfer? Specifically:
- Should an agent NFT scoped to a directory (`_directoryIds[tokenId] != ""`) be transferable to anyone, or only to addresses authorized by that directory?
- Should a directory NFT in `revoked` status be transferable at all? Currently it is.

D.3. **`safeTransferFrom` recipient hooks + reentrancy.** OZ v5's `_safeMint` and `_safeTransfer` both invoke `onERC721Received`. The identity contracts also write to mappings AFTER `_safeMint`. Walk the call ordering to confirm the recipient cannot observe a half-initialized state (e.g. token exists but `_agentHandles[tokenId]` is empty). The pattern in OZ v5 is correct, but the SAGA wrapper might write its mappings AFTER the mint — confirm the order.

### E. Input validation hot spots

E.1. **`SAGAValidation.validateUrl` boundary cases.** Already remediated, but worth a final pass:
- Empty string (already rejected).
- 1023 / 1024 / 1025 byte URLs (boundary on the `<=` check).
- `http://` (exactly 7 bytes — does the protocol check assume length > 7?).
- `https://` followed by no host (`https://`).
- URLs with embedded `%00`, `%0a`, `%5c`.
- URLs with case variants — `HTTP://`, `Http://`, `HTTPS://` (spec says reject — confirm).

E.2. **Org name validation.** 1–128 byte cap. Test: 0-byte (must reject), 128-byte (must accept), 129-byte (must reject), name with embedded HTML / control chars (validation is bytes-only — does the on-chain layer do anything beyond length, or is encoding the responsibility of off-chain consumers?). The Phase 6 markdown safety helper is in the SDK, NOT on-chain — confirm the on-chain layer accepts whatever fits in 128 bytes.

E.3. **Conformance level string.** What values does `SAGADirectoryIdentity.registerDirectory` accept? Free-form string with no whitelist? If so, a directory can self-declare any conformance level — is that intended (off-chain auditors decide what level means) or is it a gap (any string accepted on-chain is treated as authoritative)?

E.4. **String mappings → DoS via storage cost.** Every registration writes a string to a mapping. Storage cost is paid by the caller, but reads (for indexers, marketplaces) pay nothing. A handle of `"a".repeat(64)` is fine; a long `homeHubUrl` capped at 1024 bytes is fine. Anywhere an attacker can inflate per-write storage cost without paying is a DoS vector — walk the writes.

### F. Compiler & toolchain

F.1. **Solidity 0.8.24 + Cancun EVM.** The team uses `via_ir = false`. Cross-reference the [Solidity 0.8.24 known bugs list](https://docs.soliditylang.org/en/latest/bugs.html) and call out any that apply.

F.2. **Optimizer runs = 200.** Reasonable default. Confirm no codepath is depending on the optimizer to elide a check (this is rare but real).

F.3. **`evm_version = "cancun"` on Base.** Base mainnet supports Cancun (post-Dencun). Confirm. No transient storage is used in this codebase, so EIP-1153 isn't a concern, but verify.

F.4. **OpenZeppelin v5.6.1.** Cross-reference [OpenZeppelin Contracts security advisories](https://github.com/OpenZeppelin/openzeppelin-contracts/security/advisories). Any v5.x advisory affecting `ERC721`, `ERC721Enumerable`, or `Ownable` since release? Specifically check the storage-layout compatibility note (`v5.0.0` is incompatible with `v4.x` — only relevant for upgradeable proxies, which this project does not use).

F.5. **forge-std v1.15.0.** Test-only dependency. Low risk but note version.

### G. Test coverage adequacy

G.1. **No fuzz tests, no invariant tests.** 124 unit tests, all standard `function test*`. Cyfrin / Foundry best practice (2026) is to ship at least:
- `testFuzz_*` for any function that takes a string or uint input (handle, URL, tokenId, status string).
- `invariant_*` for "the registry mapping is always consistent with the NFT supply" properties.
Recommend the highest-leverage 3–5 properties this codebase should add. This is **Info severity** unless you find a unit test that masks a bug fuzz would catch.

G.2. **No reentrancy regression test.** Even though no contracts make external calls today, a regression test (`testReentrancyDuringSafeMint`) would pin the property.

G.3. **No event-ordering test.** Event ordering can change silently across compiler versions; pin via `vm.expectEmit`.

### H. Deployment & post-deploy posture

H.1. **`Deploy.s.sol` env reads.** The script reads `ERC6551_REGISTRY` and `TBA_IMPLEMENTATION` from env. Confirm both are validated against known canonical addresses (or that the deploy team's runbook does this manually). A typo'd implementation here would deploy a broken TBA factory.

H.2. **Authorization wired in deploy script.** The deploy script authorizes the three identity contracts on the registry. Confirm this is atomic (single tx OR governance-Safe-batched) — if it spans multiple txs, there's a window where an identity contract is deployed but not authorized, and any front-running attempt to register a handle would revert (good) but this should be confirmed.

H.3. **Ownership transfer to Safe.** The team plans to transfer ownership post-deploy. Walk the script `TransferOwnership.s.sol` and confirm:
- It uses `transferOwnership` (single-step). With Ownable2Step it would be `transferOwnership` + `acceptOwnership` from the Safe.
- The Safe address is read from env (typo risk).
- The script is idempotent / safe to re-run after a partial failure.

H.4. **Verifier integration.** `forge script --verify` is wired up. Confirm the Etherscan API key is loaded from env, not hardcoded. Confirm verification succeeds on Sepolia (the team says it does — confirm the bytecode matches).

### I. Specification alignment

I.1. **Spec ↔ contract divergence.** Compare `docs/spec.md §4` (Identity Layer) and the contract surface. Any function the spec promises that doesn't exist? Any contract function not documented in the spec? Examples to look for: spec mentions `parentSagaId` and `cloneDepth` for clone lineage, but the on-chain layer doesn't seem to track these — is that intentional (off-chain only) or a gap?

I.2. **Event schema alignment.** The off-chain server's indexer (in `packages/server/src/indexer/event-handlers.ts`) parses `AgentRegistered`, `Transfer`, `HomeHubUpdated`, etc. Confirm every field the indexer reads is present in the contract event. A renamed/reordered indexed parameter would silently break indexer correctness.

---

## Required output structure

### 1. Executive summary (3–6 sentences)

Overall risk level (Low / Medium / High / Critical), top three concerns in one line each, and a one-line answer to: *"is this codebase ready for Base mainnet today, or is there a clear blocker?"*

### 2. Findings (severity-ordered)

For each finding, use this format verbatim:

```
[<SEVERITY>] <one-line title>
File: <path>:<line range>
Category: <Access Control | Namespace Integrity | TBA | Transfer Semantics | Input Validation | Toolchain | Test Coverage | Deployment | Spec Alignment | Remediation Regression>
Reference: <which standard / EIP / OZ doc this maps to, with URL>

What it is:
<2-4 sentences>

Why it matters (concrete attack scenario):
<who is the attacker, what do they spend, what do they gain, who is harmed>

How to fix:
<specific change, with example Solidity diff if helpful>

Test that pins it:
<one-line description of a Forge test that would catch a regression of this fix>
```

Severity levels: **Critical** (loss of funds or namespace control), **High** (privilege escalation, denial of service against legitimate users), **Medium** (degraded UX or recovery path required), **Low** (defense-in-depth), **Info** (style, test gap, doc gap). Order strictly by severity descending.

### 3. Cross-reference matrix

A small table mapping each finding to the standard it violates:

| Finding ID | EthTrust v3 § | EIP / OZ Reference | SAGA spec § |
| ---------- | ------------- | ------------------ | ----------- |
| F-1 | …            | …                  | …           |

### 4. Threat model summary

For each external-facing function in each contract, one line: **"Function — who can call it — what they can do — what stops abuse."** Format as a table per contract file.

### 5. Recommended fuzz / invariant additions

Top 3–5 properties this codebase should pin via Foundry fuzz/invariant tests. For each, give the property statement and the handler/target it would run against.

### 6. What's GOOD

A short list of security-positive patterns the team should keep:
- … (e.g. "no proxy / no upgradeability — clean immutable architecture")
- … (e.g. "all URL ingress passes through `SAGAValidation.validateUrl`")
- … (etc.)

### 7. Deferred-to-mainnet checklist

A short list of pre-deploy actions the team should run before pushing to Base mainnet, derived from your findings. Each item one line, in execution order.

---

## Audit rules

### Verify code, do not trust documentation

This is the most important rule of the engagement. **Read the source. Do not trust comments, docstrings, READMEs, this prompt, the spec, or commit messages as evidence of what the code actually does.** Documentation drifts; code is the ground truth.

When evaluating any claim — including the "what was already remediated" table above — your default posture is: **prove it from the code or call it unproven.**

Concrete consequences of this rule:

1. **The "already remediated" table is a hint, not a finding.** For every item in it, walk the actual code path and verify the remediation works as described. If `SAGAValidation.validateUrl` is claimed to enforce a 1024-byte cap — find the comparison, confirm the operator (`<=` vs `<`), confirm it's called from every URL writer (search every `_homeHubUrl`, `_directoryUrl`, `setBaseURI` write), confirm there's no path that bypasses it. If the code disagrees with the table, the code wins and you flag the gap.

2. **Spec claims must be tested against code.** `docs/spec.md §4` says X is true. Does the contract enforce X? If the spec says "FCFS, front-runnable" but the code has a commit-reveal phase nobody documented, report the gap. If the spec promises a field (`parentSagaId`, `cloneDepth`) and the code doesn't track it, report the gap.

3. **Comments in `.sol` files are NOT evidence.** A `/// @dev Status rank: active=0, suspended=1...` comment is just text. Find the `_statusRank` function, read its implementation, confirm the rank assignments match the comment. If the comment says ranks are 0–3 but the code returns 0–4, the comment lied. The same goes for `@notice`, `@param`, `@return` — verify them.

4. **JSDoc / TypeScript types in adjacent packages are NOT evidence either.** If the indexer in `packages/server/src/indexer/event-handlers.ts` claims to read `event.tokenId` as a `bigint`, confirm the contract's event signature actually emits `uint256` (not `uint128` or `uint64`).

5. **Test files are evidence of intent, NOT of correctness.** A test that asserts behavior X is evidence the developer WANTED behavior X — but the test could be testing the wrong thing, or the production code could have a path the test never hits. When you cite a test as proof a property holds, also cite the production code that the test exercises.

6. **Audit history docs are claims to verify, not conclusions to accept.** The repo has prior audit reports under `audits/2026-05-03-three-way-comparison/`. Do not cite them as "this was already audited so it's safe." Treat them as additional hypotheses to verify against current code.

7. **Git commit messages, PR descriptions, and CHANGELOG entries are claims, not proof.** If a commit says "fix(security): close A-Crit#4 self-rehab vector," go find the `_statusRank` implementation and confirm the fix is structurally correct AND has no off-by-one. The commit message is metadata; the code is the artifact.

8. **The bundle excludes some files by default.** If you can't find a file you expect to see (e.g. an interface, an inherited contract, a deployment artifact), say so explicitly: *"Cannot verify claim X because file Y was not bundled."* Do not assume the missing file behaves the way the docs say it does.

9. **When the code and a comment disagree, the code is the finding.** If a contract's `@notice` says it reverts on invalid input but the code silently returns, that's at least a Medium-severity finding (downstream callers will trust the docstring and write broken code).

### Other rules

- If a file looks generated / vendored (e.g. anything in `lib/`, `cache/`, `out/`, `broadcast/`), skip it but mention you did.
- Cite specific line numbers from the bundled XML — `path/to/file.sol:42-58`. If the line numbers are imprecise (because the bundle wraps source), give the function name and a 3-line code excerpt.
- Do NOT re-flag closed remediations from the "already remediated" table UNLESS the remediation logic has a flaw the code reveals — in which case it becomes a **Critical** finding under "Remediation regression".
- Prefer one well-investigated High finding over five generic Lows.
- "Not applicable" findings (where a standard checklist item doesn't fit this codebase) should be brief: one-line dismissal with the reason from the code, not from the docs. Don't waste tokens on negation.
- The team has shipped 7 phases of remediation already and has limited mainnet-blocking budget — your priority order should reflect that.
