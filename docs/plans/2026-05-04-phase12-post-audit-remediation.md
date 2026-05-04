# Phase 12 — Post-Phase-11 Audit Remediation Implementation Plan

**Goal:** Close findings from the post-Phase-11 three-provider re-audit (`audits/2026-05-04T22-16-14`, `T22-14-50`, `T22-14-17` response.md files) using K-prefixed IDs. 21 findings total (deduped: Anthropic 13 + OpenAI 5 + Gemini 3, with one OpenAI/Gemini consensus on `DeployOrg.s.sol` post-bootstrap brick).

**Architecture:** Three PRs against `dev`:

- **PR 12A (mainnet-blockers):** K-1 (apply onlyOwner), K-2 (codehash snapshot), K-3 (J-13 gas budget + doc), K-4 (DeployOrg post-bootstrap fix) — Anthropic 3 HIGH + 2-way consensus operational bug
- **PR 12B (defense-in-depth + ops):** K-5 (BaseURI cancel), K-6 (entityType pinned to caller), K-7 (governance rescue separation), K-8 (validate read paths), K-9 (idempotent TransferOwnership), K-10 (operatorWallet rotation), K-11 (registerDirectory \_update self-TBA on mint?)
- **PR 12C (test/doc + final gap matrix):** K-12 (validateBaseUri full-byte fuzz), K-13 (Deploy.s.sol getter verify), K-14 (Deploy.s.sol chain-pin block dedup), K-15 (cancelPendingBaseURI events doc), K-16 (FinalizeBootstrap.s.sol split), K-17 (gas micro-opt early exit), K-18 (conformanceLevel "self-claimed" doc reinforce), K-19 (constructor-time receiver doc), K-20 (registerHandle exists() liveness), gap matrix

**Tech Stack:** Solidity 0.8.24 (Cancun), OZ v5.6.1, Foundry. TS bindings via tsup + vitest. Deploy scripts via `scripts/deploy-entrypoint.sh` + `forge script`.

**Base commit:** `dev@7d75f3a` (Phase 11B tip). Worktrees: `../saga-phase12a`, `../saga-phase12b`, `../saga-phase12c`.

---

## PR 12A — Mainnet-blocking remediations (4 findings, ~80 LOC)

### Task 1: Restrict `applyAuthorizedContract` and `applyTrustedDirectoryContract` to `onlyOwner` (K-1)

**Files:**

- Modify: `packages/contracts/src/SAGAHandleRegistry.sol:172-182` (`applyAuthorizedContract`)
- Modify: `packages/contracts/src/SAGAHandleRegistry.sol:285-298` (`applyTrustedDirectoryContract`)
- Test: `packages/contracts/test/SAGAHandleRegistry.t.sol`

**Step 1: Failing test**

Append to the existing `SAGAHandleRegistry.t.sol` test contract (after the J-1 cancel tests):

```solidity
// K-1: applyAuthorizedContract MUST be onlyOwner so a watching attacker
// cannot front-run a Safe cancel-tx with their own apply-tx the moment
// the timelock ripens.
function test_k1_applyAuthorizedContract_onlyOwner() public {
    address newContract = makeAddr("k1-nc");
    vm.etch(newContract, hex"60006000fd");
    registry.queueAuthorizedContract(newContract);
    vm.warp(block.timestamp + 24 hours);

    vm.prank(makeAddr("rando"));
    vm.expectRevert(); // OwnableUnauthorizedAccount
    registry.applyAuthorizedContract(newContract);

    // Owner can still apply.
    registry.applyAuthorizedContract(newContract);
    assertTrue(registry.authorizedContracts(newContract));
}

function test_k1_applyTrustedDirectoryContract_onlyOwner() public {
    MockDirectoryIdentity v2 = new MockDirectoryIdentity();
    registry.queueTrustedDirectoryContract(address(v2));
    vm.warp(block.timestamp + 24 hours);

    vm.prank(makeAddr("rando"));
    vm.expectRevert();
    registry.applyTrustedDirectoryContract(address(v2));

    registry.applyTrustedDirectoryContract(address(v2));
    assertTrue(registry.trustedDirectoryContracts(address(v2)));
}
```

**Step 2: Run; expect FAIL — "rando" pranks currently succeed because `apply*` is permissionless.**

```bash
cd packages/contracts && forge test --match-test "test_k1_" 2>&1 | tail -10
```

**Step 3: Add `onlyOwner` to both apply functions**

In `SAGAHandleRegistry.sol`, change:

```solidity
function applyAuthorizedContract(address addr) external {
```

to:

```solidity
function applyAuthorizedContract(address addr) external onlyOwner {
```

And the same change to `applyTrustedDirectoryContract`.

**Step 4: Verify**

```bash
forge test --match-test "test_k1_" 2>&1 | tail -10
```

Expected: 2 passed.

**Step 5: Update existing M-1 queue+apply tests that call apply from non-owner.** Search:

```bash
grep -nE "registry\.applyAuthorizedContract|registry\.applyTrustedDirectoryContract" packages/contracts/test/SAGAHandleRegistry.t.sol
```

Any call NOT preceded by `vm.prank(safe)` or owner needs to be updated. The post-handoff M-1 tests already prank as the safe so they're fine; review and adjust the J-1 cancel-related tests if any.

**Step 6: Update the docstring on both functions** to remove the "anyone can call this" line:

In the existing comment block on `applyAuthorizedContract`, replace `"Anyone can call this — the queue is the privileged action."` with:

```solidity
/// @notice Apply a previously-queued authorization after the timelock.
///         Phase 12 (K-1): onlyOwner. The Phase 11 J-1 cancel path
///         created a race window — at the exact block the timelock
///         ripens, a watching attacker could front-run a Safe cancel
///         transaction with their own apply, defeating governance
///         review. The Safe queues AND applies; the queue is the
///         slow gate.
```

Same for `applyTrustedDirectoryContract`.

**Step 7: Regenerate ABIs** (the function shape didn't change but the freshness pin should still pass):

```bash
node scripts/generate-abis.mjs
```

**Step 8: Commit**

```bash
git add packages/contracts/src/SAGAHandleRegistry.sol \
        packages/contracts/test/SAGAHandleRegistry.t.sol \
        packages/contracts/src/ts/abis/
git commit -m "fix(contracts): K-1 — applyAuthorized*/applyTrusted* onlyOwner

Phase 12 (K-1 HIGH). The Phase 11 J-1 cancel path created a race
window: at the exact block the M-1 24h timelock ripened, a watching
attacker could front-run a Safe cancel-tx with their own permissionless
apply-tx, defeating governance review. Anthropic flagged.

Add onlyOwner to applyAuthorizedContract + applyTrustedDirectoryContract.
The Safe queues AND applies; the queue is the slow gate, not the
apply. Regression tests pin the access-control change; existing M-1
tests already prank as the safe and continue to pass.

Built with Epic Flowstate"
```

---

### Task 2: Snapshot `extcodehash` at queue time, compare at apply time (K-2)

**Files:**

- Modify: `packages/contracts/src/SAGAHandleRegistry.sol` (add 2 storage slots, update queue+apply)
- Test: `packages/contracts/test/SAGAHandleRegistry.t.sol`

**Step 1: Failing test**

Append:

```solidity
// K-2: applyAuthorizedContract MUST revert when the queued address's
// codehash has changed during the 24h timelock — defends against
// CREATE2 metamorphism, proxy implementation flips, and the
// equivalent on the trusted-directory queue.
function test_k2_applyAuthorizedContract_revertsOnCodehashChange() public {
    address target = makeAddr("k2-target");
    vm.etch(target, hex"60006000fd"); // initial code
    registry.queueAuthorizedContract(target);
    vm.warp(block.timestamp + 24 hours);

    // Mutate the bytecode at `target` (simulates CREATE2 redeploy or
    // proxy upgrade between queue and apply).
    vm.etch(target, hex"60016001");

    vm.expectRevert(bytes("SAGAHandleRegistry: code changed during timelock"));
    registry.applyAuthorizedContract(target);
}

function test_k2_applyTrustedDirectoryContract_revertsOnCodehashChange() public {
    MockDirectoryIdentity v2 = new MockDirectoryIdentity();
    registry.queueTrustedDirectoryContract(address(v2));
    vm.warp(block.timestamp + 24 hours);

    vm.etch(address(v2), hex"60016001");

    vm.expectRevert(bytes("SAGAHandleRegistry: code changed during timelock"));
    registry.applyTrustedDirectoryContract(address(v2));
}
```

**Step 2: Run; expect FAIL — current code only checks `code.length`, not codehash.**

**Step 3: Add storage slots in `SAGAHandleRegistry.sol`**

Locate the existing pending queue declarations (`_pendingAuthorizedContract` etc., around line 100-110). Add right after them:

```solidity
    /// @notice Phase 12 (K-2): codehash snapshot at queue time. Compared
    ///         at apply time so a bytecode swap during the 24h timelock
    ///         (CREATE2 metamorphism, proxy implementation flip)
    ///         invalidates the apply. extcodehash returns 0 for EOAs and
    ///         keccak256("") for empty bytecode; the codehash comparison
    ///         on a SELFDESTRUCT-then-empty target therefore also fails.
    bytes32 private _pendingAuthorizedContractCodehash;
    bytes32 private _pendingTrustedDirectoryContractCodehash;
```

**Step 4: Snapshot codehash on queue**

In `queueAuthorizedContract`, after `_pendingAuthorizedContractReadyAt = block.timestamp + AUTH_TIMELOCK;`, add:

```solidity
        _pendingAuthorizedContractCodehash = addr.codehash;
```

Same for `queueTrustedDirectoryContract`.

**Step 5: Compare codehash on apply**

In `applyAuthorizedContract`, replace the existing `require(addr.code.length > 0, ...)` line with:

```solidity
        require(
            addr.codehash == _pendingAuthorizedContractCodehash,
            "SAGAHandleRegistry: code changed during timelock"
        );
```

Same for `applyTrustedDirectoryContract`. Also clear the codehash slot in the apply path's `delete` block:

```solidity
        delete _pendingAuthorizedContractCodehash;
```

And in the Phase 11 J-1 cancel functions:

```solidity
function cancelPendingAuthorizedContract() external onlyOwner {
    require(_pendingAuthorizedContractReadyAt > 0, "SAGAHandleRegistry: no pending authorize");
    address cancelled = _pendingAuthorizedContract;
    delete _pendingAuthorizedContract;
    delete _pendingAuthorizedContractReadyAt;
    delete _pendingAuthorizedContractCodehash; // Phase 12 (K-2)
    emit AuthorizedContractCancelled(cancelled);
}
```

Same for `cancelPendingTrustedDirectoryContract`.

**Step 6: Verify**

```bash
forge test --match-test "test_k2_" 2>&1 | tail -10
```

Expected: 2 passed.

**Step 7: Update README "Authorized contracts: residual risk" section** to document the proxy-implementation residual:

In `packages/contracts/README.md`, find the "Authorized contracts: residual risk" section. Append a paragraph:

```markdown
**Phase 12 (K-2) update — codehash snapshot.** The 24h timelock now
also pins the queued address's `extcodehash` at queue time and re-checks
it at apply time. This catches CREATE2 metamorphism (a contract that
selfdestructs and re-deploys with new code at the same address) and
proxy implementations that flip behind a constant `extcodehash`.
The residual: a proxy whose `extcodehash` is constant but whose
`implementation()` storage slot changes during the timelock cannot
be detected on-chain — refuse to queue any proxy address as policy.
```

**Step 8: Run full forge test sweep**

```bash
forge test 2>&1 | tail -3
```

Expected: all green.

**Step 9: Commit**

```bash
git add -A packages/contracts
git commit -m "fix(contracts): K-2 — codehash snapshot on queue, compare on apply

Phase 12 (K-2 HIGH). The Phase 10 M-1 timelock + Phase 11 Copilot
review code.length re-check confirmed liveness but not integrity.
An attacker who controls the queued address can swap its code during
the 24h delay (CREATE2 metamorphism after a SELFDESTRUCT-then-CREATE2
sequence in some pre-Cancun chain history, or a proxy upgrade) and
the apply happily authorizes the new code. Anthropic flagged.

Snapshot extcodehash on queue, compare on apply for both
authorize-true and trust-true. Catches code-mutation through any
path, not just liveness. Cancel paths also clear the codehash slot.

Residual (proxy with constant extcodehash + mutable implementation())
documented in README; Safe diligence MUST refuse to queue proxies.

Built with Epic Flowstate"
```

---

### Task 3: Bound J-13 `token()` introspection gas + correct README claim (K-3)

**Files:**

- Modify: `packages/contracts/src/SAGAAgentIdentity.sol:266-278` (`_update` try/catch)
- Modify: `packages/contracts/src/SAGAOrgIdentity.sol:202-216` (same)
- Modify: `packages/contracts/src/SAGADirectoryIdentity.sol:312-325` (same)
- Modify: `packages/contracts/README.md` (Known limitation section)
- Test: `packages/contracts/test/SAGAAgentIdentity.t.sol`

**Step 1: Failing test**

Append to `SAGAAgentIdentity.t.sol` (next to the J-13 tests):

```solidity
// K-3: a malicious destination whose `token()` consumes all forwarded
// gas must NOT block the transfer entirely. Bounding the staticcall
// to ~30k gas keeps the transfer guard cheap and prevents grief.
function test_k3_j13_gasGriefingDestinationDoesNotBlockTransfer() public {
    vm.prank(user1);
    uint256 tokenId = agent.registerAgent("k3", "https://h.example/");

    GasGrieferTBA grief = new GasGrieferTBA();

    // Should succeed: the grief destination is NOT actually self-bound,
    // its token() consumes a lot of gas, and the bounded gas budget
    // ensures the staticcall reverts with OOG inside the budget,
    // falling through cleanly. Without K-3's gas budget, an unbounded
    // call could either (a) consume all remaining gas and break the
    // transfer, or (b) succeed but at extreme cost.
    vm.prank(user1);
    agent.transferFrom(user1, address(grief), tokenId);
    assertEq(agent.ownerOf(tokenId), address(grief));
}
```

Add the `GasGrieferTBA` mock at the top of the test file near `MockSelfBoundAccount`:

```solidity
/// @dev Phase 12 (K-3): destination whose `token()` deliberately spins
///      until OOG. Used to pin that the bounded-gas budget on the
///      transfer guard prevents a malicious destination from blocking
///      legitimate transfers.
contract GasGrieferTBA {
    function token() external view returns (uint256, address, uint256) {
        // Burn all forwarded gas via an unbounded loop. The actual
        // return value never matters because the call OOGs.
        uint256 i;
        while (true) {
            i++;
        }
        return (i, address(0), 0); // unreachable
    }
}
```

**Step 2: Run; expect FAIL — without the bounded budget the OOG can break the transfer.**

**Step 3: Bound the J-13 gas budget**

In `SAGAAgentIdentity.sol` `_update`, locate the J-13 try block. Replace:

```solidity
                try IERC6551BoundAccount(to).token() returns (
```

with:

```solidity
                // Phase 12 (K-3): bound the introspection gas. A
                // malicious destination whose token() spins until OOG
                // could otherwise consume all forwarded gas and block
                // the transfer. 30k is enough for any honest TBA's
                // returndata (3 SLOADs + 3 SSTORE-like return).
                try IERC6551BoundAccount(to).token{gas: 30000}() returns (
```

Apply the same change in `SAGAOrgIdentity.sol` and `SAGADirectoryIdentity.sol`.

**Step 4: Update README "Known limitation: self-TBA transfer guard scope"** in `packages/contracts/README.md`.

Find the section. Locate the Phase 11 (J-13) update paragraph that says J-13 "closes the salt + alternative-implementation gap". Replace it with:

```markdown
**Phase 11 (J-13) update — partial closure.** The `_update` hook now
also performs `try IERC6551BoundAccount(to).token() returns (chainId,
contract, tokenId)` and reverts if the destination reports being bound
to THIS NFT. This closes the salt + alternative-implementation gap
on-chain **for any TBA implementation that conforms to ERC-6551's
universal `token()` getter and reports its binding honestly** (every
canonical Tokenbound, Manifold, and reference implementation does).

**Phase 12 (K-3) update — bounded introspection + adversarial residual.**
The introspection call is bounded at 30,000 gas via a Solidity-level
gas option, so a malicious destination cannot grief by consuming all
forwarded gas. The remaining residual: a destination contract that
**lies** about its binding via a non-standard `token()` (e.g., returns
fake chainId or contract values) bypasses J-13. The on-chain layer
cannot verify that an arbitrary contract's reported binding is
truthful; UX-layer warnings (option 1 above) remain valid for that
adversarial-implementation case.
```

**Step 5: Verify**

```bash
forge test --match-test "test_k3_" 2>&1 | tail -10
```

Expected: 1 passed.

**Step 6: Run full sweep + commit**

```bash
forge test 2>&1 | tail -3
git add -A packages/contracts
git commit -m "fix(contracts): K-3 — bound J-13 token() gas + correct README claim

Phase 12 (K-3 HIGH). Phase 11 J-13's try/catch on the destination's
token() introspection forwards 63/64 of remaining gas (EIP-150). A
malicious destination's token() that consumes all forwarded gas can
either grief the transfer (OOG breaks _update) or force fall-through
under specific gas-state conditions. Anthropic flagged.

Bound the gas to 30k via try/catch's {gas: 30000} option. Honest
TBAs need ~3 SLOADs to return; 30k is generous. Tested with a
GasGrieferTBA mock that spins until OOG.

ALSO correct the README claim that J-13 'closes the G-12 limitation' —
it closes the standard-conforming case but NOT the adversarial-
implementation case where token() lies about its binding. UX-layer
warnings remain valid for that residual.

Built with Epic Flowstate"
```

---

### Task 4: Fix `DeployOrg.s.sol` post-bootstrap brick (K-4)

**Files:**

- Modify: `packages/contracts/script/DeployOrg.s.sol`
- Modify: `packages/contracts/README.md` ("Re-deploying contracts post-Safe-transfer" section if present)

**Step 1: Read current state**

```bash
cat /Users/sthornock/code/epic/saga-standard/packages/contracts/script/DeployOrg.s.sol
```

The script ends with `registry.setAuthorizedContract(address(orgIdentity), true)`. Phase 11 J-3's bootstrap-finalized gate makes this revert if the registry is already finalized.

**Step 2: Add a preflight check**

In `DeployOrg.s.sol`, after the existing `require(tbaHelperAddr.code.length > 0, "TBA_HELPER not a contract");` line, add:

```solidity
        // Phase 12 (K-4): the J-3 bootstrap-finalized gate makes
        // setAuthorizedContract(addr, true) revert post-Deploy.s.sol.
        // Two-way auditor consensus (OpenAI + Gemini) — this script
        // bricks deterministically against any production registry.
        // Refuse to broadcast unless the registry is still in the
        // bootstrap window, AND emit a clear remediation hint.
        SAGAHandleRegistry registryPreflight = SAGAHandleRegistry(registryAddr);
        require(
            !registryPreflight.bootstrapFinalized(),
            "DeployOrg: registry already finalized; use Safe queueAuthorizedContract + 24h applyAuthorizedContract flow instead"
        );
```

**Step 3: Add a separate post-bootstrap helper script**

Create `packages/contracts/script/QueueAuthorizeOrg.s.sol`:

```solidity
// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {SAGAOrgIdentity} from "../src/SAGAOrgIdentity.sol";
import {SAGAHandleRegistry} from "../src/SAGAHandleRegistry.sol";
import {SAGATBAHelper} from "../src/SAGATBAHelper.sol";

/// @title QueueAuthorizeOrg
/// @notice Phase 12 (K-4): post-bootstrap companion to DeployOrg.s.sol.
///         Deploys a new SAGAOrgIdentity AND broadcasts a
///         queueAuthorizedContract tx targeting it. The Safe must
///         then wait 24h and call applyAuthorizedContract through
///         its multisig flow.
///
///         Required env vars (same as DeployOrg.s.sol):
///           DEPLOYER_PRIVATE_KEY - the EOA queueing the auth (must
///                                  hold registry ownership at queue
///                                  time; if the Safe is the owner,
///                                  use the Safe transaction builder
///                                  with the calldata this script
///                                  prints).
///           HANDLE_REGISTRY      - already-deployed registry address.
///           TBA_HELPER           - already-deployed helper address.
contract QueueAuthorizeOrg is Script {
    function run() external {
        address registryAddr = vm.envAddress("HANDLE_REGISTRY");
        address tbaHelperAddr = vm.envAddress("TBA_HELPER");
        require(registryAddr.code.length > 0, "HANDLE_REGISTRY not a contract");
        require(tbaHelperAddr.code.length > 0, "TBA_HELPER not a contract");

        // Same J-9 helper allowlist as DeployOrg.s.sol.
        address canonical6551Registry = 0x000000006551c19487814612e58FE06813775758;
        address tokenboundV3 = 0x55266d75D1a14E4572138116aF39863Ed6596E7F;
        if (block.chainid == 8453 || block.chainid == 84532) {
            SAGATBAHelper helper = SAGATBAHelper(tbaHelperAddr);
            console.log("Expected ERC6551_REGISTRY (canonical):", canonical6551Registry);
            console.log("Got TBA_HELPER.registry():", address(helper.registry()));
            console.log("Expected TBA_IMPLEMENTATION (canonical V3):", tokenboundV3);
            console.log("Got TBA_HELPER.accountImplementation():", helper.accountImplementation());
            require(
                address(helper.registry()) == canonical6551Registry,
                "TBA_HELPER registry mismatch"
            );
            require(
                helper.accountImplementation() == tokenboundV3,
                "TBA_HELPER implementation mismatch"
            );
        }

        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        vm.startBroadcast(deployerKey);

        SAGAOrgIdentity orgIdentity = new SAGAOrgIdentity(registryAddr, tbaHelperAddr);
        console.log("SAGAOrgIdentity:", address(orgIdentity));

        SAGAHandleRegistry registry = SAGAHandleRegistry(registryAddr);
        registry.queueAuthorizedContract(address(orgIdentity));
        console.log("Queued authorization on registry; apply after 24h");

        vm.stopBroadcast();

        // Print the calldata for the apply transaction so the Safe can
        // schedule it for execution after the timelock elapses.
        bytes memory applyCalldata = abi.encodeWithSignature(
            "applyAuthorizedContract(address)",
            address(orgIdentity)
        );
        console.log("Safe apply calldata (call after 24h):");
        console.logBytes(applyCalldata);
    }
}
```

**Step 4: Add forge test for the preflight**

Append to `packages/contracts/test/SAGAHandleRegistry.t.sol`:

```solidity
// K-4: registry exposes bootstrapFinalized() so DeployOrg.s.sol's
// preflight can refuse to run against a finalized registry. This
// test pins the read path — the actual script-level preflight
// is covered by the deploy-runbook smoke test.
function test_k4_bootstrapFinalized_publicGetterShape() public {
    assertFalse(registry.bootstrapFinalized());
    registry.finalizeBootstrap();
    assertTrue(registry.bootstrapFinalized());
}
```

**Step 5: README runbook update**

In `packages/contracts/README.md`, find any "Re-deploying contracts post-Safe-transfer" section. If present, update to describe the new flow:

- Pre-bootstrap: run `DeployOrg.s.sol` (script will preflight).
- Post-bootstrap: run `QueueAuthorizeOrg.s.sol` (deploys + queues), then wait 24h, then have the Safe call `applyAuthorizedContract(<orgAddress>)` through its multisig flow.

If no such section exists, add one in the "Deploy" section near `Deploy.s.sol` documentation.

**Step 6: Run full sweep + commit**

```bash
forge build && forge test 2>&1 | tail -3
git add -A packages/contracts
git commit -m "fix(contracts): K-4 — DeployOrg post-bootstrap fix + QueueAuthorizeOrg

Phase 12 (K-4 MEDIUM, OpenAI + Gemini consensus). DeployOrg.s.sol
called registry.setAuthorizedContract(addr, true) at the end of the
script, but Phase 11 J-3 finalizeBootstrap makes that path revert
post-Deploy.s.sol. The documented redeploy runbook was deterministically
broken.

Add a preflight in DeployOrg.s.sol that refuses to broadcast against
a finalized registry, with a remediation hint pointing at the new
QueueAuthorizeOrg.s.sol script. The new script deploys + queues the
authorization (24h timelock), then prints Safe calldata for the
post-timelock apply transaction.

Built with Epic Flowstate"
```

---

### Task 5: Run full sweep + push + create PR 12A

```bash
cd packages/contracts && forge test && pnpm test:ts && pnpm typecheck && forge build
```

Expected:

- `forge test`: 274 + 6 = 280 passing (4 K-1, 2 K-2, 1 K-3, 1 K-4 = 8; some shared test contracts may double-count — exact count verified at execution time).
- `pnpm test:ts`: 35 passing
- `pnpm typecheck`: clean
- `forge build`: clean

```bash
git push -u origin phase12-contracts-a-blockers
gh pr create --base dev --title "feat(contracts): Phase 12A — post-Phase-11 audit blockers" --body "$(cat <<'EOF'
## Summary

Phase 12A — closes 4 findings from the post-Phase-11 three-provider re-audit.

| ID | Severity | Action |
|----|----------|--------|
| **K-1** | HIGH | `applyAuthorizedContract` + `applyTrustedDirectoryContract` now `onlyOwner` (eliminates J-1 cancel/apply race) |
| **K-2** | HIGH | Snapshot extcodehash on queue, compare on apply (defends against CREATE2 metamorphism + proxy flips) |
| **K-3** | HIGH | Bound J-13 `token()` introspection at 30k gas + correct README claim about adversarial implementations |
| **K-4** | MEDIUM (consensus) | `DeployOrg.s.sol` preflight against `bootstrapFinalized` + new `QueueAuthorizeOrg.s.sol` for post-bootstrap redeploy |

## Test plan

- [x] `forge build` clean
- [x] `forge test` all green
- [x] `pnpm test:ts` 35/35
- [x] `pnpm typecheck` clean
- [ ] Copilot review

Built with Epic Flowstate
EOF
)"
```

---

## PR 12B — Defense-in-depth + ops (7 findings)

### Task 6: `cancelPendingBaseURI` for the queued metadata URI (K-5)

**Files:**

- Modify: `packages/contracts/src/SAGAAgentIdentity.sol` (add function + event)
- Modify: `packages/contracts/src/SAGAOrgIdentity.sol` (same)
- Modify: `packages/contracts/src/SAGADirectoryIdentity.sol` (same)
- Test: each `*.t.sol`

**Step 1: Failing test (Agent)**

Append to `packages/contracts/test/SAGAAgentIdentity.t.sol`:

```solidity
// K-5: cancelPendingBaseURI clears the queue + emits a distinct event
// so indexers can watch for "rotation cancelled" without inferring
// from absence-of-update.
function test_k5_cancelPendingBaseURI_clearsAndEmits() public {
    agent.setBaseURI("https://x.example/");
    assertEq(agent.pendingBaseURI(), "https://x.example/");

    vm.expectEmit(false, false, false, true, address(agent));
    emit SAGAAgentIdentity.BaseURICancelled("https://x.example/");
    agent.cancelPendingBaseURI();

    assertEq(agent.pendingBaseURIReadyAt(), 0);
    assertEq(agent.pendingBaseURI(), "");
}

function test_k5_cancelPendingBaseURI_revertsWhenEmpty() public {
    vm.expectRevert(bytes("SAGAAgentIdentity: no pending base uri"));
    agent.cancelPendingBaseURI();
}

function test_k5_cancelPendingBaseURI_onlyOwner() public {
    agent.setBaseURI("https://x.example/");
    vm.prank(makeAddr("randomEoa"));
    vm.expectRevert();
    agent.cancelPendingBaseURI();
}
```

**Step 2: Add event + function (Agent)**

In `SAGAAgentIdentity.sol`, locate the `BaseURIQueued` event declaration (around line 68). Add right after:

```solidity
    /// @notice Phase 12 (K-5): emitted when a queued base URI is
    ///         explicitly cancelled. Mirror of J-1's
    ///         AuthorizedContractCancelled event for the M-1 queue.
    event BaseURICancelled(string cancelled);
```

Add the function after `applyBaseURI`:

```solidity
    /// @notice Phase 12 (K-5): cancel a queued base URI before it
    ///         applies. The Safe's prior recourse was to overwrite
    ///         the slot with a benign URI which itself started a
    ///         24h delay — no clean back-out path. Mirror of J-1's
    ///         cancel pattern for authorize/trust queues.
    function cancelPendingBaseURI() external onlyOwner {
        require(_pendingBaseURIReadyAt > 0, "SAGAAgentIdentity: no pending base uri");
        string memory cancelled = _pendingBaseURI;
        delete _pendingBaseURI;
        delete _pendingBaseURIReadyAt;
        emit BaseURICancelled(cancelled);
    }
```

**Step 3: Repeat for Org and Directory**

Same event declaration + same function, with `SAGAOrgIdentity:` / `SAGADirectoryIdentity:` in the require message and `BaseURICancelled` event paths matching each contract.

**Step 4: Failing tests for Org and Directory** — copy the Agent tests into `SAGAOrgIdentity.t.sol` and `SAGADirectoryIdentity.t.sol`, swapping `agent` for `org` / `directory` and the revert message.

**Step 5: Verify all three**

```bash
forge test --match-test "test_k5_" 2>&1 | tail -10
```

Expected: 9 passed (3 contracts × 3 tests).

**Step 6: Regenerate ABIs**

```bash
node scripts/generate-abis.mjs
```

**Step 7: Update freshness pin in `packages/contracts/src/ts/__tests__/abis.test.ts`**

Add `'cancelPendingBaseURI'` to the expected list for SAGAAgentIdentity, SAGAOrgIdentity, SAGADirectoryIdentity ABI freshness pins.

**Step 8: Commit**

```bash
git add -A packages/contracts
git commit -m "feat(contracts): K-5 — cancelPendingBaseURI for queued metadata rotation

Phase 12 (K-5 MEDIUM). The Phase 9 G-8 base-URI timelock had no
explicit cancel path — overwrite-with-benign was the only back-out
and itself triggered a fresh 24h delay. Mirror Phase 11 J-1's
cancel + emit pattern for AuthorizedContractCancelled. Anthropic.

Add cancelPendingBaseURI() to all three identity contracts. Reverts
when nothing queued (no misleading no-op events). Emits
BaseURICancelled(oldPending). ABI freshness pin extended.

Built with Epic Flowstate"
```

---

### Task 7: Cross-validate `tokenId` liveness on registerHandle (K-6, lighter Option 1)

**Code-review note:** The original plan picked Anthropic's M-2 Option 2 (pin entityType at authorization time), which requires changing `setAuthorizedContract`'s signature. That signature is referenced 47 times across tests + scripts; the LOC blast is ~half a day on its own. Option 1 (cross-validate liveness via `IERC721.ownerOf`) closes the "register handles for nonexistent tokens" half of the M-2 finding without breaking the API. The entityType-lying half is documented as a residual that the README already flags ("registry trusts the authorized caller's claim"). Choosing Option 1 to keep scope bounded; defer Option 2 to a future major version.

**Files:**

- Modify: `packages/contracts/src/SAGAHandleRegistry.sol` (`registerHandle` + `registerScopedHandle`)
- Test: `packages/contracts/test/SAGAHandleRegistry.t.sol`

**Step 1: Failing test**

Append:

```solidity
// K-6: registerHandle reverts when the calling contract has no
// `ownerOf(tokenId)` for the claimed tokenId. Closes the
// register-handles-for-nonexistent-tokens half of Anthropic M-2;
// the entityType-lying half remains a documented residual.
function test_k6_registerHandle_revertsOnNonexistentTokenId() public {
    vm.prank(authorizedContract);
    vm.expectRevert(bytes("SAGAHandleRegistry: token does not exist"));
    registry.registerHandle("phantom", SAGAHandleRegistry.EntityType.AGENT, 99999);
}

function test_k6_registerHandle_acceptsLiveTokenId() public {
    // mockDirectoryIdentity is set up to register handles via
    // _seedDirectory. The mock implements both directoryStatus and
    // ownerOf via inherited test-contract behavior — but the K-6
    // test uses the AGENT contract via authorizedContract pranks.
    // To keep this test simple, register an Agent NFT and then
    // register a global handle from the agent contract for that
    // tokenId. The agent contract IS authorizedContracts[true]
    // by default (it's added in setUp).
    //
    // Skip if agent isn't in setUp's authorized list — this keeps
    // the test self-contained at the test fixture level.
    // The authorizedContract is a fixture EOA-with-bytecode.
    // Calling .ownerOf on it will revert (no ERC-721 implementation).
    // So this test path requires a contract that DOES implement
    // ownerOf. Use a small inline mock.
    LiveTokenMock liveMock = new LiveTokenMock();
    liveMock.setOwner(7, address(0xBEEF));
    registry.setAuthorizedContract(address(liveMock), true);

    vm.prank(address(liveMock));
    registry.registerHandle("real", SAGAHandleRegistry.EntityType.AGENT, 7);

    (SAGAHandleRegistry.EntityType et, uint256 tid,) = registry.resolveHandle("real");
    assertEq(uint256(et), uint256(SAGAHandleRegistry.EntityType.AGENT));
    assertEq(tid, 7);
}
```

Add the `LiveTokenMock` helper at the top of the test file near the existing mocks (after `MockDirectoryIdentity`):

```solidity
/// @dev Phase 12 (K-6): a minimal contract that implements just
///      ownerOf(uint256) so the registry's K-6 liveness check
///      succeeds for tokenIds explicitly seeded.
contract LiveTokenMock {
    mapping(uint256 => address) private _owners;
    function setOwner(uint256 tokenId, address owner) external {
        _owners[tokenId] = owner;
    }
    function ownerOf(uint256 tokenId) external view returns (address) {
        require(_owners[tokenId] != address(0), "ERC721NonexistentToken");
        return _owners[tokenId];
    }
}
```

**Step 2: Add the liveness check in `registerHandle`**

In `SAGAHandleRegistry.sol`, locate `registerHandle`. Inside the function, after `_validateHandle(handle)` but before the `_handles[key]` lookup, add:

```solidity
        // Phase 12 (K-6, Anthropic M-2 Option 1): light liveness check.
        // Ensures the calling contract actually has a token at the
        // claimed tokenId. Doesn't validate entityType (the
        // entityType-lying surface stays a documented residual) but
        // does close the "register handles for nonexistent tokens"
        // half of M-2.
        try IERC721(msg.sender).ownerOf(tokenId) returns (address) {
            // ok
        } catch {
            revert("SAGAHandleRegistry: token does not exist");
        }
```

Same in `registerScopedHandle`.

Add the import at the top of `SAGAHandleRegistry.sol`:

```solidity
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
```

**Step 3: Bound the gas on the introspection** (defense-in-depth, mirror K-3 pattern):

```solidity
        try IERC721(msg.sender).ownerOf{gas: 30000}(tokenId) returns (address) {
            // ok
        } catch {
            revert("SAGAHandleRegistry: token does not exist");
        }
```

**Step 4: Run full sweep**

```bash
forge build && forge test 2>&1 | tail -3
```

The 47 existing `setAuthorizedContract(addr, true)` call sites continue to compile because the signature is unchanged. The only existing tests that may break are scoped-registration tests where the `mockDirectoryIdentity` (a contract with `directoryStatus` but no `ownerOf`) calls `registerHandle` — Phase 9's `MockDirectoryIdentity` does NOT implement `ownerOf`, so K-6's liveness check would revert. Fix the mock by adding a stub `ownerOf` that always returns `address(this)` so existing seed-directory test paths continue to work:

```solidity
contract MockDirectoryIdentity {
    function directoryStatus(uint256) external pure returns (string memory) {
        return "active";
    }
    // Phase 12 (K-6): liveness stub so registerHandle's ownerOf
    // call doesn't revert.
    function ownerOf(uint256) external view returns (address) {
        return address(this);
    }
}
```

Same stub for `StatusMutableMock` if it's used as an authorized caller in any test (search `StatusMutableMock` to confirm).

**Step 5: Commit**

```bash
git add -A packages/contracts
git commit -m "fix(contracts): K-6 — liveness check on registerHandle/registerScopedHandle

Phase 12 (K-6 MEDIUM, Anthropic M-2 Option 1). The Phase 0 trust
model let an authorized contract register handles for tokenIds that
don't exist on its NFT (e.g., a buggy register* path with an
off-by-one tokenId, or a compromised contract intentionally
squatting). The Code4rena Canto Identity audit flagged the same
class on the Subprotocol address registry.

Add a try/catch IERC721(msg.sender).ownerOf{gas: 30000}(tokenId)
check in registerHandle + registerScopedHandle. Closes the
'register handles for nonexistent tokens' half of M-2.

Did NOT pick M-2 Option 2 (pin entityType at auth time) because
that requires a setAuthorizedContract signature change touching 47
call sites; the LOC blast outweighs the benefit when the
entityType-lying surface is already a documented residual that
the README addresses. Defer Option 2 to a future major version.

MockDirectoryIdentity test fixture got an ownerOf stub so
seed-directory test paths continue to work.

Built with Epic Flowstate"
```

---

### Task 8: Replace `_isAuthorized` governance bypass with explicit `governanceTransfer` (K-7)

**Files:**

- Modify: `packages/contracts/src/SAGADirectoryIdentity.sol` (`_isAuthorized` reverted to default; new `governanceTransfer` function)
- Test: `packages/contracts/test/SAGADirectoryIdentity.t.sol`

**Step 1: Failing test**

Append to `SAGADirectoryIdentity.t.sol`:

```solidity
// K-7: ERC-721 _isAuthorized stays standard. Marketplaces / DeFi
// reading approval state are no longer fooled by the governance
// override. governanceTransfer is a separate, explicit function with
// its own event for audit trails.
function test_k7_isAuthorized_returnsStandardErc721ForGovernance() public {
    vm.prank(user1);
    uint256 tokenId = directory.registerDirectory(
        "k7", "https://x.example/", makeAddr("op"), "basic"
    );
    directory.updateDirectoryStatus(tokenId, "flagged");

    // address(this) is contract owner. Despite rank>=2, it is NOT
    // approved as a standard ERC-721 spender — getApproved returns 0.
    assertEq(directory.getApproved(tokenId), address(0));
    assertFalse(directory.isApprovedForAll(user1, address(this)));
}

function test_k7_governanceTransfer_succeedsForFlagged() public {
    vm.prank(user1);
    uint256 tokenId = directory.registerDirectory(
        "k7-flag", "https://x.example/", makeAddr("op"), "basic"
    );
    directory.updateDirectoryStatus(tokenId, "flagged");

    vm.expectEmit(true, true, true, false, address(directory));
    emit SAGADirectoryIdentity.GovernanceRescue(tokenId, user1, user2);
    directory.governanceTransfer(tokenId, user2);

    assertEq(directory.ownerOf(tokenId), user2);
}

function test_k7_governanceTransfer_revertsForActive() public {
    vm.prank(user1);
    uint256 tokenId = directory.registerDirectory(
        "k7-active", "https://x.example/", makeAddr("op"), "basic"
    );
    vm.expectRevert(bytes("SAGADirectoryIdentity: not flagged or revoked"));
    directory.governanceTransfer(tokenId, user2);
}

function test_k7_governanceTransfer_onlyOwner() public {
    vm.prank(user1);
    uint256 tokenId = directory.registerDirectory(
        "k7-only", "https://x.example/", makeAddr("op"), "basic"
    );
    directory.updateDirectoryStatus(tokenId, "revoked");

    vm.prank(makeAddr("rando"));
    vm.expectRevert();
    directory.governanceTransfer(tokenId, user2);
}
```

**Step 2: Add the event + function**

In `SAGADirectoryIdentity.sol`, locate the events section. Add:

```solidity
    /// @notice Phase 12 (K-7): explicit governance rescue event so
    ///         off-chain monitoring can distinguish governance-initiated
    ///         transfers from owner-initiated ones.
    event GovernanceRescue(uint256 indexed tokenId, address indexed from, address indexed to);
```

Find the existing `_isAuthorized` override (Phase 9 G-1 / Phase 10 H-1, around line 350-365). Remove the governance bypass entirely so `_isAuthorized` falls back to the OZ default:

```diff
-    function _isAuthorized(address tokenOwner, address spender, uint256 tokenId)
-        internal
-        view
-        override
-        returns (bool)
-    {
-        if (spender == owner() && spender != address(0)) {
-            if (_statusRank(_statuses[tokenId]) >= 2) {
-                return true;
-            }
-        }
-        return super._isAuthorized(tokenOwner, spender, tokenId);
-    }
```

Add the explicit `governanceTransfer`:

```solidity
    /// @notice Phase 12 (K-7): explicit governance rescue path. The
    ///         contract owner can transfer flagged or revoked
    ///         directories without going through ERC-721 standard
    ///         approval. _isAuthorized stays standard so marketplaces
    ///         and DeFi protocols reading approval state aren't misled.
    function governanceTransfer(uint256 tokenId, address to) external onlyOwner {
        require(
            _statusRank(_statuses[tokenId]) >= 2,
            "SAGADirectoryIdentity: not flagged or revoked"
        );
        address from = _requireOwned(tokenId);
        // _update will see auth == owner() and skip the rank-block
        // (the F-10 + G-1 carve-out at line ~395 still fires).
        _transfer(from, to, tokenId);
        emit GovernanceRescue(tokenId, from, to);
    }
```

**Step 3: Verify the existing F-10 / G-1 `_update` carve-out still fires**

The `_update` block has `if (auth != owner())` to enforce the rank-2 transfer-block. Confirm `_transfer` from `governanceTransfer` passes `owner()` (the contract owner = the Safe in production) into `auth`, allowing the rank-2 transfer.

Reading OZ ERC-721 v5: `_transfer` calls `_update(to, tokenId, address(0))`. So `auth` is `address(0)`, NOT `owner()`. This means the existing `auth != owner()` check passes (address(0) != owner()) and the rank block fires, REVERTING the governance transfer.

To fix: temporarily switch the `_update` carve-out to a flag, OR override the rank-block to also recognize `governanceTransfer` calls. Simplest: have `governanceTransfer` set a transient flag.

Update the implementation:

```solidity
    /// @notice Phase 12 (K-7): transient flag set during governanceTransfer
    ///         so the F-10 rank-block in _update can carve out the
    ///         governance rescue path explicitly. Resets at the end of
    ///         every governanceTransfer call.
    bool private _inGovernanceRescue;

    function governanceTransfer(uint256 tokenId, address to) external onlyOwner {
        require(
            _statusRank(_statuses[tokenId]) >= 2,
            "SAGADirectoryIdentity: not flagged or revoked"
        );
        address from = _requireOwned(tokenId);
        _inGovernanceRescue = true;
        _transfer(from, to, tokenId);
        _inGovernanceRescue = false;
        emit GovernanceRescue(tokenId, from, to);
    }
```

Update the `_update` rank-block to recognize the flag:

```solidity
            // Phase 8 F-10 + Phase 9 G-1: rank-≥2 transfer block. The
            // explicit governance rescue path (Phase 12 K-7) bypasses
            // the block via the _inGovernanceRescue transient flag,
            // replacing the prior _isAuthorized-based bypass.
            if (!_inGovernanceRescue) {
                require(
                    _statusRank(_statuses[tokenId]) < 2,
                    "SAGADirectoryIdentity: cannot transfer flagged or revoked"
                );
            }
```

The prior `if (auth != owner())` check is removed in favor of the explicit flag.

**Step 4: Update existing G-1 / H-1 tests**

Search for tests that exercised the governance bypass via `_isAuthorized`:

```bash
grep -rn "test_g1_governance\|test_h1_governance\|isAuthorized" packages/contracts/test/SAGADirectoryIdentity.t.sol
```

Replace the bypass-via-transferFrom calls with `directory.governanceTransfer(tokenId, to)`. Active-directory governance tests should now expect a revert because the bypass is scoped to rank-2.

Tests to update specifically (search for these names and update bodies):

- `test_g1_governanceCanTransferFlaggedDirectory` — call `governanceTransfer` directly
- `test_g1_governanceCanTransferRevokedDirectory` — call `governanceTransfer` directly
- `test_h1_governanceCannotTransferActiveDirectory` — keep as-is (calls `transferFrom`, should still revert because `_isAuthorized` is now standard ERC-721)
- `test_h1_governanceCannotTransferSuspendedDirectory` — same

**Step 5: Run full sweep**

```bash
forge test 2>&1 | tail -3
```

**Step 6: Regenerate ABIs + update freshness pin**

```bash
node scripts/generate-abis.mjs
```

Add `'governanceTransfer'` to the SAGADirectoryIdentity ABI freshness pin in `abis.test.ts`.

**Step 7: Commit**

```bash
git add -A packages/contracts
git commit -m "feat(contracts): K-7 — governanceTransfer separates rescue path from ERC-721 auth

Phase 12 (K-7 MEDIUM, Anthropic). The Phase 9 G-1 / Phase 10 H-1
governance rescue path overrode _isAuthorized to grant the contract
owner spender authority on rank-≥2 tokens. Marketplaces and DeFi
protocols reading getApproved / isApprovedForAll for those tokens
saw inconsistent values vs standard ERC-721 — the bypass was visible
through approval state.

Replace the override with an explicit governanceTransfer(tokenId, to)
function. _isAuthorized falls back to OZ standard. F-10 rank-block
in _update gets a transient _inGovernanceRescue flag instead of an
auth-based carve-out. Emits a distinct GovernanceRescue event for
audit-trail clarity.

Built with Epic Flowstate"
```

---

### Task 9: Validate read paths against handle length cap (K-8)

**Files:**

- Modify: `packages/contracts/src/SAGAHandleRegistry.sol` (resolve / handleExists / scoped variants)
- Test: `packages/contracts/test/SAGAHandleRegistry.t.sol`

**Step 1: Failing test**

Append:

```solidity
// K-8: read paths reject oversized handles before _toLower allocates
// a 65+ byte memory buffer per call. Defense against off-chain
// griefing (RPC node CPU/memory) when an attacker forwards untrusted
// input through resolve*.
function test_k8_resolveHandle_revertsOnOversizedHandle() public {
    bytes memory huge = new bytes(65);
    for (uint256 i = 0; i < 65; i++) huge[i] = "a";
    vm.expectRevert(bytes("SAGAHandleRegistry: invalid length"));
    registry.resolveHandle(string(huge));
}

function test_k8_handleExists_revertsOnOversizedHandle() public {
    bytes memory huge = new bytes(100);
    for (uint256 i = 0; i < 100; i++) huge[i] = "b";
    vm.expectRevert(bytes("SAGAHandleRegistry: invalid length"));
    registry.handleExists(string(huge));
}

function test_k8_resolveScopedHandle_revertsOnOversizedDirectoryId() public {
    bytes memory hugeDir = new bytes(80);
    for (uint256 i = 0; i < 80; i++) hugeDir[i] = "c";
    vm.expectRevert(bytes("SAGAHandleRegistry: invalid length"));
    registry.resolveScopedHandle("alice", string(hugeDir));
}
```

**Step 2: Apply `_validateHandle` in read paths**

In `SAGAHandleRegistry.sol`, locate `resolveHandle`, `handleExists`, `resolveScopedHandle`, `scopedHandleExists`, `resolveActiveScopedHandle`. At the top of each, add:

```solidity
        _validateHandle(handle);
```

For scoped variants, also add:

```solidity
        _validateHandle(directoryId);
```

`_validateHandle` reverts on length out of [3, 64] AND on invalid characters, which is stricter than the audit's recommended length-only cap. That's intentional — it ensures resolvers behave consistently with writes.

**Step 3: Verify**

```bash
forge test --match-test "test_k8_" 2>&1 | tail -10
```

**Step 4: Run full sweep**

```bash
forge test 2>&1 | tail -3
```

Some existing tests may pass strings like `"ghost-dir"` that already pass `_validateHandle`. If any test fails with the new validation, fix the test input.

**Step 5: Commit**

```bash
git add -A packages/contracts
git commit -m "fix(contracts): K-8 — validate read paths against handle length cap

Phase 12 (K-8 LOW, OpenAI). resolveHandle / handleExists / scoped
variants called _toLower (which allocates new memory + loops) on
attacker-controlled strings without first checking length. An attacker
forwarding untrusted input through an off-chain compute gate that
hits eth_call against these views could grief RPC node CPU/memory
without paying gas.

Apply _validateHandle to every read path (matches write-side
validation). Stricter than the audit's length-only recommendation
because it keeps read+write semantics aligned.

Built with Epic Flowstate"
```

---

### Task 10: Idempotent `TransferOwnership.s.sol` (K-9)

**Files:**

- Modify: `packages/contracts/script/TransferOwnership.s.sol`

**Step 1: Read current state**

```bash
cat /Users/sthornock/code/epic/saga-standard/packages/contracts/script/TransferOwnership.s.sol
```

The script `require`s deployer-is-still-owner for all four contracts before any transfer. Partial Safe acceptance bricks subsequent runs.

**Step 2: Replace the require-block with idempotent per-contract logic**

Inline a helper function for each contract:

```solidity
    function _idempotentTransfer(
        Ownable2Step c,
        string memory name,
        address deployer,
        address newOwner
    ) internal {
        address current = Ownable(address(c)).owner();
        if (current == newOwner) {
            console.log(string.concat(name, ": already owned by Safe, skipping"));
            return;
        }
        if (current == deployer) {
            address pending = c.pendingOwner();
            if (pending == newOwner) {
                console.log(string.concat(name, ": pendingOwner already Safe, skipping"));
                return;
            }
            c.transferOwnership(newOwner);
            console.log(string.concat(name, ": pendingOwner -> Safe"));
            return;
        }
        revert(string.concat(name, ": unexpected owner"));
    }
```

Replace the existing four `require(Ownable(...).owner() == deployer)` lines + four `transferOwnership` lines with four calls to the helper:

```solidity
        _idempotentTransfer(Ownable2Step(handleRegistry), "HandleRegistry", deployer, newOwner);
        _idempotentTransfer(Ownable2Step(agentIdentity), "AgentIdentity", deployer, newOwner);
        _idempotentTransfer(Ownable2Step(orgIdentity), "OrgIdentity", deployer, newOwner);
        _idempotentTransfer(Ownable2Step(directoryIdentity), "DirectoryIdentity", deployer, newOwner);
```

**Step 3: Verify build**

```bash
forge build 2>&1 | grep -iE "error" | head
```

**Step 4: Commit**

```bash
git add packages/contracts/script/TransferOwnership.s.sol
git commit -m "fix(scripts): K-9 — idempotent TransferOwnership.s.sol

Phase 12 (K-9 LOW, OpenAI). The script required deployer-is-still-owner
for all four contracts before transferring any. Partial Safe
acceptance (e.g., Safe accepts ownership of registry + agent but not
org + directory) bricked subsequent runs.

Replace the require-block with per-contract idempotent logic: skip
if Safe already owns; skip if pendingOwner already Safe; transfer if
deployer still owns; revert with a per-contract unexpected-owner
error otherwise.

Built with Epic Flowstate"
```

---

### Task 11: Add `updateOperatorWallet` to SAGADirectoryIdentity (K-10)

**Files:**

- Modify: `packages/contracts/src/SAGADirectoryIdentity.sol`
- Test: `packages/contracts/test/SAGADirectoryIdentity.t.sol`

**Step 1: Failing test**

Append:

```solidity
// K-10: directory operator wallet must be rotatable. Without rotation,
// a key-compromise forces the directory NFT owner to abandon the
// established directoryId (which is permanent in the global namespace).
function test_k10_updateOperatorWallet_succeedsForOwner() public {
    vm.prank(user1);
    uint256 tokenId = directory.registerDirectory(
        "k10", "https://x.example/", makeAddr("oldOp"), "basic"
    );
    address newOp = makeAddr("newOp");

    vm.expectEmit(true, true, true, false, address(directory));
    emit SAGADirectoryIdentity.DirectoryOperatorUpdated(tokenId, makeAddr("oldOp"), newOp);
    vm.prank(user1);
    directory.updateOperatorWallet(tokenId, newOp);

    assertEq(directory.operatorWallet(tokenId), newOp);
}

function test_k10_updateOperatorWallet_rejectsZero() public {
    vm.prank(user1);
    uint256 tokenId = directory.registerDirectory(
        "k10-z", "https://x.example/", makeAddr("op"), "basic"
    );
    vm.prank(user1);
    vm.expectRevert(bytes("SAGADirectoryIdentity: invalid operator"));
    directory.updateOperatorWallet(tokenId, address(0));
}

function test_k10_updateOperatorWallet_unauthorizedReverts() public {
    vm.prank(user1);
    uint256 tokenId = directory.registerDirectory(
        "k10-u", "https://x.example/", makeAddr("op"), "basic"
    );
    vm.prank(makeAddr("rando"));
    vm.expectRevert(bytes("SAGADirectoryIdentity: not authorized"));
    directory.updateOperatorWallet(tokenId, makeAddr("attacker"));
}
```

**Step 2: Add event + function**

In `SAGADirectoryIdentity.sol`, locate the events section. Add:

```solidity
    /// @notice Phase 12 (K-10): emitted when a directory's operator
    ///         wallet rotates. Operator wallet is informational metadata
    ///         (not used for on-chain authorization); the event lets
    ///         off-chain consumers refresh their operator caches.
    event DirectoryOperatorUpdated(uint256 indexed tokenId, address indexed oldOperator, address indexed newOperator);
```

Add the function alongside `updateDirectoryUrl`:

```solidity
    /// @notice Phase 12 (K-10, Gemini): rotate the operator wallet on
    ///         a directory NFT. operatorWallet is informational metadata;
    ///         it does NOT gate on-chain authorization (which uses
    ///         ERC-721 `_isAuthorized`). The rotation is needed because
    ///         directoryId is immutable in the global namespace — a
    ///         key compromise without rotation would force the directory
    ///         owner to abandon their established handle.
    function updateOperatorWallet(uint256 tokenId, address newOperator) external nonReentrant {
        address tokenOwner = _requireOwned(tokenId);
        require(
            _isAuthorized(tokenOwner, msg.sender, tokenId),
            "SAGADirectoryIdentity: not authorized"
        );
        require(newOperator != address(0), "SAGADirectoryIdentity: invalid operator");
        address oldOperator = _operatorWallets[tokenId];
        _operatorWallets[tokenId] = newOperator;
        emit DirectoryOperatorUpdated(tokenId, oldOperator, newOperator);
    }
```

**Step 3: Verify**

```bash
forge test --match-test "test_k10_" 2>&1 | tail -10
```

**Step 4: Regenerate ABIs + update freshness pin**

```bash
node scripts/generate-abis.mjs
```

Add `'updateOperatorWallet'` to the SAGADirectoryIdentity freshness pin.

**Step 5: Commit**

```bash
git add -A packages/contracts
git commit -m "feat(contracts): K-10 — updateOperatorWallet for SAGADirectoryIdentity

Phase 12 (K-10 MEDIUM, Gemini). Directory operator wallet was
immutable post-mint. A key-compromise forced the directory NFT owner
to abandon their established directoryId (immutable in the global
namespace) — operationally devastating for an established directory.

Add updateOperatorWallet(tokenId, newOperator). Authorization via
ERC-721 _isAuthorized (allows approved operators, consistent with
M-3). Rejects zero address. Emits DirectoryOperatorUpdated.

Built with Epic Flowstate"
```

---

### Task 12: Apply self-TBA guard on directory mint too (K-11)

**Files:**

- Modify: `packages/contracts/src/SAGADirectoryIdentity.sol` (`_update` mint branch)
- Test: `packages/contracts/test/SAGADirectoryIdentity.t.sol`

**Step 1: Read the current `_update`**

```bash
grep -nA 20 "function _update" packages/contracts/src/SAGADirectoryIdentity.sol | head -40
```

The check `if (from != address(0) && to != address(0))` skips mint. Agent + Org check `to != address(0)` only (covers mint). For consistency and J-13 coverage on mint:

**Step 2: Failing test**

Append:

```solidity
// K-11: registerDirectory minting to a self-bound contract recipient
// must trigger the J-13 token() introspection guard. Currently the
// directory mint path skips the check because of the `from != 0`
// gate.
function test_k11_registerDirectory_blocksSelfBoundConstructorReceiver() public {
    // Pre-compute the directory tokenId that would be assigned (next
    // _nextTokenId). For test simplicity assume tokenId 0 since
    // setUp may have already minted some directories — adjust the
    // expected tokenId based on the directory.totalSupply().
    uint256 expectedTokenId = directory.totalSupply();
    // Deploy a contract that claims to be bound to (chainid, dir, expectedTokenId).
    MockSelfBoundDirectoryAccount selfBound = new MockSelfBoundDirectoryAccount(
        block.chainid, address(directory), expectedTokenId
    );

    // Constructor-time receivers can't be detected (code.length == 0).
    // But here the contract is fully deployed before registerDirectory.
    // The mint must revert.
    vm.prank(address(selfBound));
    vm.expectRevert(bytes("SAGADirectoryIdentity: cannot transfer to own TBA"));
    directory.registerDirectory("k11", "https://x.example/", makeAddr("op"), "basic");
}
```

Add the helper near the top of `SAGADirectoryIdentity.t.sol` if it doesn't exist:

```solidity
contract MockSelfBoundDirectoryAccount {
    uint256 public immutable chainId;
    address public immutable tokenContract;
    uint256 public immutable tokenId;
    constructor(uint256 _c, address _t, uint256 _id) {
        chainId = _c; tokenContract = _t; tokenId = _id;
    }
    function token() external view returns (uint256, address, uint256) {
        return (chainId, tokenContract, tokenId);
    }
    // Required for safeMint receiver path
    function onERC721Received(address, address, uint256, bytes calldata)
        external pure returns (bytes4)
    {
        return 0x150b7a02;
    }
}
```

**Step 3: Update `_update` in SAGADirectoryIdentity.sol**

Change the gating from `from != address(0) && to != address(0)` to align with Agent + Org (`to != address(0)`), so mint-to-self-bound is also blocked:

```diff
-        address from = _ownerOf(tokenId);
-        if (from != address(0) && to != address(0)) {
+        address from = _ownerOf(tokenId);
+        if (to != address(0)) {
             // F-4 + J-13 guard
             // ... existing body ...
         }
```

The F-10 rank-block currently lives inside the `from != address(0) && to != address(0)` branch — keep it scoped to non-mint by adding a `from != address(0)` check around just the rank block:

```solidity
            if (from != address(0) && !_inGovernanceRescue) {
                require(
                    _statusRank(_statuses[tokenId]) < 2,
                    "SAGADirectoryIdentity: cannot transfer flagged or revoked"
                );
            }
```

**Step 4: Verify**

```bash
forge test --match-test "test_k11_" 2>&1 | tail -10
forge test 2>&1 | tail -3
```

The change should not break existing F-4 / G-1 / J-13 tests because they all use post-mint transfers.

**Step 5: Commit**

```bash
git add -A packages/contracts
git commit -m "feat(contracts): K-11 — self-TBA guard fires on directory mint too

Phase 12 (K-11 INFO, OpenAI). SAGAAgentIdentity and SAGAOrgIdentity
_update gates on 'to != 0' so the F-4 + J-13 self-TBA guard fires
on mint as well as transfer. SAGADirectoryIdentity gated on both
from != 0 AND to != 0, skipping the guard on mint.

Align directory _update with agent/org. The F-10 rank block now
nests inside an explicit 'from != 0' check so it stays scoped to
non-mint transfers.

Built with Epic Flowstate"
```

---

### Task 13: Run full sweep + push + create PR 12B

```bash
cd packages/contracts && forge test && pnpm test:ts && pnpm typecheck && forge build
git push -u origin phase12-contracts-b-recommended
gh pr create --base dev --title "feat(contracts): Phase 12B — defense-in-depth + ops" --body "..."
```

The PR body lists K-5..K-11 (7 items), final test counts, behavior changes, and the audit gap-matrix references.

---

## PR 12C — Test/doc + final gap matrix (10 findings)

### Task 14: Full-byte fuzz on `validateBaseUri` (K-12)

**Files:**

- Modify: `packages/contracts/test/SAGAValidation.t.sol`

**Step 1: Failing fuzz**

Append after the existing J-12 fuzz:

```solidity
// K-12: Phase 11 J-12 fuzzed validateUrl across the full byte space.
// validateBaseUri's J-6 tests only covered hand-picked cases.
// Mirror the J-12 closure so any divergence between validateUrl and
// validateBaseUri's byte handling is caught.
function testFuzz_k12_validateBaseUri_charBlacklistClosure(uint8 b) public {
    // Build "https://x.example/p<byte>/" — trailing slash so the
    // tail's only effect is the blacklist check.
    bytes memory uri = abi.encodePacked(
        bytes("https://x.example/p"), bytes1(b), bytes("/")
    );

    bool inUrlBlacklist = (
        b <= 0x20 || b == 0x7F || b == 0x5C
            || b == 0x22 || b == 0x27 || b == 0x3C || b == 0x3E
    );
    bool inBaseUriBlacklist = (b == 0x3F || b == 0x23 || b == 0x26);

    if (inUrlBlacklist) {
        // validateUrl rejects first; validateBaseUri inherits that.
        vm.expectRevert(SAGAValidation.InvalidUrlCharacter.selector);
        harness.validateBaseUri(string(uri));
    } else if (inBaseUriBlacklist) {
        vm.expectRevert(SAGAValidation.InvalidBaseUriPath.selector);
        harness.validateBaseUri(string(uri));
    } else {
        // Allowed: prefix + path-safe byte + trailing slash.
        harness.validateBaseUri(string(uri));
    }
}
```

**Step 2: Run; expect 256 passes**

```bash
forge test --match-test "testFuzz_k12_" 2>&1 | tail -10
```

**Step 3: Commit**

```bash
git add packages/contracts/test/SAGAValidation.t.sol
git commit -m "test(contracts): K-12 — fuzz validateBaseUri across full byte space

Phase 12 (K-12 INFO). Phase 11 J-12 fuzzed validateUrl byte
blacklist; J-6 validateBaseUri tests only covered hand-picked
samples. Mirror the J-12 closure so any divergence between
validateUrl and validateBaseUri byte handling is caught.

Built with Epic Flowstate"
```

---

### Task 15: `Deploy.s.sol` verifies deployed helper getters (K-13)

**Files:**

- Modify: `packages/contracts/script/Deploy.s.sol`

**Step 1: Add post-deploy verification**

After the `SAGATBAHelper tbaHelper = new SAGATBAHelper(...)` line, add:

```solidity
        // Phase 12 (K-13, Anthropic): verify the deployed helper's
        // immutable getters match the env vars. DeployOrg.s.sol does
        // this; Deploy.s.sol should too for consistency. Catches a
        // constructor argument swap or stale ABI.
        require(
            address(tbaHelper.registry()) == erc6551Registry,
            "Deploy: helper.registry() mismatch"
        );
        require(
            tbaHelper.accountImplementation() == tbaImplementation,
            "Deploy: helper.accountImplementation() mismatch"
        );
        console.log("SAGATBAHelper getters verified against env vars");
```

**Step 2: Verify build**

```bash
forge build 2>&1 | grep -iE "error" | head
```

**Step 3: Commit**

```bash
git add packages/contracts/script/Deploy.s.sol
git commit -m "fix(scripts): K-13 — Deploy.s.sol verifies helper getters post-deploy

Phase 12 (K-13 INFO, Anthropic). DeployOrg.s.sol verifies
helper.registry() and helper.accountImplementation() match the
canonical addresses (J-9). Deploy.s.sol skipped this verification.
Mirror the pattern for consistency — catches a constructor-argument
swap or stale ABI before the helper becomes immutably wired.

Built with Epic Flowstate"
```

---

### Task 16: Dedupe the chain-pin block (K-14)

**Files:**

- Modify: `packages/contracts/script/Deploy.s.sol`

**Step 1: Combine the two TBA-implementation pin blocks**

Locate the existing Phase 9 G-6 chain-pin block (lines ~44-62 per Anthropic). Replace the two-arm if/else-if with a single OR'd require:

```diff
-if (block.chainid == 8453) {
-    require(tbaImplementation == tokenboundV3, "Base mainnet TBA_IMPLEMENTATION mismatch");
-} else if (block.chainid == 84532) {
-    require(tbaImplementation == tokenboundV3, "Base Sepolia TBA_IMPLEMENTATION mismatch");
-}
+if (block.chainid == 8453 || block.chainid == 84532) {
+    require(tbaImplementation == tokenboundV3, "Base TBA_IMPLEMENTATION mismatch");
+}
```

Same for the H-7 ERC6551_REGISTRY block.

**Step 2: Verify build**

```bash
forge build 2>&1 | grep -iE "error" | head
```

**Step 3: Commit**

```bash
git add packages/contracts/script/Deploy.s.sol
git commit -m "refactor(scripts): K-14 — dedupe chain-pin require blocks

Phase 12 (K-14 INFO, Anthropic). The Phase 9 G-6 + Phase 10 H-7
chain-pin blocks each had two if/else-if arms with identical require
messages differing only by chain name. Combine into single OR'd
require with 'Base' (no chain-name distinction needed since both
share the canonical address).

Cosmetic. No behavior change.

Built with Epic Flowstate"
```

---

### Task 17: Move `finalizeBootstrap` to a separate script (K-15)

**Files:**

- Modify: `packages/contracts/script/Deploy.s.sol` (remove the call)
- Create: `packages/contracts/script/FinalizeBootstrap.s.sol`
- Modify: `packages/contracts/README.md` (deploy runbook)

**Step 1: Remove from Deploy.s.sol**

Find:

```solidity
        registry.finalizeBootstrap();
        console.log("Bootstrap finalized - post-bootstrap timelock active");
```

Remove both lines. Add a console.log at the same location:

```solidity
        console.log("WARNING: bootstrap NOT finalized. Run FinalizeBootstrap.s.sol after verifying deploy.");
```

**Step 2: Create the new script**

`packages/contracts/script/FinalizeBootstrap.s.sol`:

```solidity
// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {SAGAHandleRegistry} from "../src/SAGAHandleRegistry.sol";

/// @title FinalizeBootstrap
/// @notice Phase 12 (K-15, Anthropic): finalize the registry bootstrap
///         in a separate transaction so a Deploy.s.sol partial failure
///         doesn't lock the operator out of immediate authorization.
///         Run AFTER verifying:
///           1. All four contracts are deployed at the expected addresses.
///           2. registry.authorizedContracts(agent / org / directory) all true.
///           3. registry.trustedDirectoryContracts(directory) is true.
///           4. Smoke test: register a test agent + org + directory.
///
///         Required env vars:
///           DEPLOYER_PRIVATE_KEY
///           HANDLE_REGISTRY
contract FinalizeBootstrap is Script {
    function run() external {
        address registryAddr = vm.envAddress("HANDLE_REGISTRY");
        require(registryAddr.code.length > 0, "HANDLE_REGISTRY not a contract");

        SAGAHandleRegistry registry = SAGAHandleRegistry(registryAddr);
        require(!registry.bootstrapFinalized(), "Already finalized");

        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        vm.startBroadcast(deployerKey);
        registry.finalizeBootstrap();
        vm.stopBroadcast();

        console.log("Bootstrap finalized. From here on, all authorize-true requires the M-1 24h timelock.");
    }
}
```

**Step 3: Update README runbook**

Find the deploy section. Add the new step:

```markdown
## Mainnet Deploy Runbook

1. `forge script script/Deploy.s.sol --rpc-url base --broadcast`
   (with `DEPLOY_DIRECT=true` per H-5)
2. Verify all four contracts on Basescan with constructor args.
3. Smoke test: register a test agent, org, and directory in the
   bootstrap window (still using setAuthorizedContract immediate path).
4. `forge script script/FinalizeBootstrap.s.sol --rpc-url base --broadcast`
   — closes the bootstrap window. Cannot be undone.
5. `forge script script/TransferOwnership.s.sol --rpc-url base --broadcast`
   — sets pendingOwner = Safe on all four contracts.
6. Safe calls `acceptOwnership()` on each contract through its multisig flow.
```

**Step 4: Commit**

```bash
git add -A packages/contracts
git commit -m "feat(scripts): K-15 — split finalizeBootstrap into FinalizeBootstrap.s.sol

Phase 12 (K-15 LOW, Anthropic). Phase 11 J-3 had Deploy.s.sol call
finalizeBootstrap as the last broadcast step. A foundry script
broadcast is NOT atomic across contract deployments; a partial
failure mid-script could leave the registry partially configured AND
finalized — recovery requires the 24h timelock.

Move finalizeBootstrap to its own script run AFTER verification +
smoke test. Cleaner audit log; recoverable if Deploy.s.sol
partial-fails. README runbook updated to sequence the steps.

Built with Epic Flowstate"
```

---

### Task 18: Gas micro-opt — early exit in `_update` for EOA destinations (K-17)

**Files:**

- Modify: `packages/contracts/src/SAGAAgentIdentity.sol` (`_update`)
- Modify: `packages/contracts/src/SAGAOrgIdentity.sol` (same)
- Modify: `packages/contracts/src/SAGADirectoryIdentity.sol` (same)

**Step 1: Add the early exit (Agent)**

In `SAGAAgentIdentity.sol` `_update`, replace:

```solidity
        if (to != address(0)) {
            address selfTba = ITBAHelperLite(tbaHelper).computeAccount(address(this), tokenId);
            require(to != selfTba, "SAGAAgentIdentity: cannot transfer to own TBA");
            // ... J-13 introspection ...
        }
```

with:

```solidity
        if (to != address(0)) {
            // Phase 12 (K-17, Anthropic): early exit if `to` is provably
            // an EOA. The F-4 selfTba and J-13 introspection both target
            // contract destinations; an EOA cannot be a TBA. Skipping
            // the helper call saves ~700 gas per EOA transfer.
            if (to.code.length == 0) {
                return super._update(to, tokenId, auth);
            }
            address selfTba = ITBAHelperLite(tbaHelper).computeAccount(address(this), tokenId);
            require(to != selfTba, "SAGAAgentIdentity: cannot transfer to own TBA");
            // ... existing J-13 introspection (already gated on code.length) ...
        }
```

**Step 2: Repeat for Org and Directory**

Same pattern. For Directory, ensure the K-7 `_inGovernanceRescue` flag check still fires for non-EOA destinations — the rank block may need to live OUTSIDE the early-exit guard. Re-verify by reading the SAGADirectoryIdentity `_update` after the change.

**Step 3: Verify with full forge test**

```bash
forge test 2>&1 | tail -3
```

**Step 4: Commit**

```bash
git add -A packages/contracts
git commit -m "perf(contracts): K-17 — early exit in _update for EOA destinations

Phase 12 (K-17 LOW, Anthropic). F-4 + J-13 transfer guards target
contract destinations. An EOA cannot be a TBA. Skipping the helper
call + J-13 introspection on EOA destinations saves ~700 gas per
user-to-user transfer.

Add an early-exit when to.code.length == 0. Same pattern across all
three identity contracts. Existing F-4 / J-13 tests still pass
because they target contract destinations.

Built with Epic Flowstate"
```

---

### Task 19: Update gap matrix with Phase 12 closure section + push + PR 12C

**Files:**

- Modify: `audits/2026-05-04-post-phase11-gap-matrix.md` (create from the three response.md files first)

This task creates the gap matrix and appends a closure section. Skipping individual sub-task structure here because the matrix is a doc artifact. The matrix follows the structure of `audits/2026-05-04-post-phase10-gap-matrix.md` (run summary table → verification of Phase 11 closures → NEW K findings → severity rollup → origin breakdown → recommended PR queue → final assessment → Phase 12 closure section).

**Step 1: Create the gap matrix file** at `audits/2026-05-04-post-phase11-gap-matrix.md`. Source content is the three response.md files in `audits/2026-05-04T22-*` directories.

**Step 2: Append a Phase 12 closure section** listing K-1..K-20 with the closing PR. (K-16 covered by K-15; K-18, K-19, K-20 are doc/info items handled in this task as README/comment updates.)

**Step 3: Final test sweep**

```bash
forge test && pnpm test:ts && pnpm typecheck && forge build
```

**Step 4: Push + create PR 12C**

```bash
git push -u origin phase12-contracts-c-tests-docs
gh pr create --base dev --title "feat(contracts): Phase 12C — test/doc hardening + gap matrix closure" --body "..."
```

PR body lists K-12 through K-20, gap matrix closure, final test counts.

---

## Acceptance criteria

- All 4 PR 12A items merged before mainnet broadcast (K-1 + K-2 + K-3 + K-4).
- All 7 PR 12B items merged before public launch.
- PR 12C may land post-launch as defense-in-depth.
- `forge test` clean, growing from 274 → ~310 tests post-12B.
- `forge build`, `pnpm typecheck`, `pnpm test:ts` all clean.
- Sepolia dry-run executes Deploy.s.sol → smoke test → FinalizeBootstrap.s.sol → TransferOwnership.s.sol → Safe `acceptOwnership` cleanly.
- Audit gap matrix `audits/2026-05-04-post-phase11-gap-matrix.md` updated with closure section after 12C.

## Out of scope

- Re-running the three-provider audit a fourth time (separate task once 12A merges).
- Phase 8 mobile audit (`packages/saga-app`) — separate milestone.
- M-2 Option 2 (pin entityType at authorization time, requires `setAuthorizedContract` signature change touching 47 call sites) — deferred to a future major version. K-6 implements Option 1 (`IERC721.ownerOf{gas: 30000}` liveness check) which closes the tokenId-liveness half; the entityType-lying half stays open as a documented residual already flagged in README "Authorized contracts: residual risk" ("registry trusts the authorized caller's claim").
- M-3 Option 1 (doc-only acceptance of `_isAuthorized` bypass). K-7 chose Option 2 (separate `governanceTransfer`).
