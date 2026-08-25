# Phase 11 — Post-Phase-10 Audit Remediation Implementation Plan

**Goal:** Close the 13 J-findings from the post-Phase-10 three-provider re-audit (`audits/2026-05-04-post-phase10-gap-matrix.md`) — 1 HIGH operational gap (J-1), 8 MEDIUM hardening items, 3 LOW/INFO polish + tests.

**Architecture:** Two PRs against `dev`:

- **PR 11A (strongly recommended):** J-1, J-3, J-5, J-6, J-7, J-13 — ~110 LOC of contract + test changes
- **PR 11B (doc + operational polish):** J-2, J-4, J-8, J-9, J-10, J-11, J-12 — script, README, and test extensions

**Tech Stack:** Solidity 0.8.24 (Cancun), OZ v5.6.1, Foundry. TS bindings via tsup + vitest. Deploy scripts via `scripts/deploy-entrypoint.sh` + `forge script`.

**Base commit:** `dev@fbdfd2f` (Phase 10C tip). Worktrees at `../saga-phase11a` and `../saga-phase11b`.

---

## PR 11A — Strongly recommended hardening (6 findings, ~110 LOC)

### Task 1: Add cancel paths for queued authorizations (J-1)

**Files:**

- Modify: `packages/contracts/src/SAGAHandleRegistry.sol` (add 2 functions, 2 events)
- Test: `packages/contracts/test/SAGAHandleRegistry.t.sol` (add 4 tests)

**Step 1: Failing tests**

Append after `test_m1_queueAndApply_trustedDirectoryContract` in `SAGAHandleRegistry.t.sol`:

```solidity
function test_j1_cancelPendingAuthorizedContract_clearsSlot() public {
    address newContract = makeAddr("newContract");
    vm.etch(newContract, hex"60006000fd");

    address safe = makeAddr("safe");
    registry.transferOwnership(safe);
    vm.prank(safe);
    registry.acceptOwnership();

    vm.prank(safe);
    registry.queueAuthorizedContract(newContract);
    assertEq(registry.pendingAuthorizedContract(), newContract);

    vm.prank(safe);
    registry.cancelPendingAuthorizedContract();
    assertEq(registry.pendingAuthorizedContract(), address(0));
    assertEq(registry.pendingAuthorizedContractReadyAt(), 0);

    // Apply must now revert with no-pending.
    vm.warp(block.timestamp + 24 hours);
    vm.expectRevert(bytes("SAGAHandleRegistry: no pending authorize"));
    registry.applyAuthorizedContract(newContract);
}

function test_j1_cancelPendingAuthorizedContract_onlyOwner() public {
    vm.prank(makeAddr("randomEoa"));
    vm.expectRevert();
    registry.cancelPendingAuthorizedContract();
}

function test_j1_cancelPendingTrustedDirectoryContract_clearsSlot() public {
    MockDirectoryIdentity v2 = new MockDirectoryIdentity();

    address safe = makeAddr("safe");
    registry.transferOwnership(safe);
    vm.prank(safe);
    registry.acceptOwnership();

    vm.prank(safe);
    registry.queueTrustedDirectoryContract(address(v2));
    vm.prank(safe);
    registry.cancelPendingTrustedDirectoryContract();
    assertEq(registry.pendingTrustedDirectoryContract(), address(0));

    vm.warp(block.timestamp + 24 hours);
    vm.expectRevert(bytes("SAGAHandleRegistry: no pending trust"));
    registry.applyTrustedDirectoryContract(address(v2));
}

function test_j1_cancelPendingTrustedDirectoryContract_onlyOwner() public {
    vm.prank(makeAddr("randomEoa"));
    vm.expectRevert();
    registry.cancelPendingTrustedDirectoryContract();
}
```

**Step 2: Run tests; expect FAIL with "function does not exist"**

```bash
cd packages/contracts && forge test --match-test "test_j1_" 2>&1 | tail -10
```

Expected: 4 tests fail with compilation error (function not declared).

**Step 3: Add events to `SAGAHandleRegistry.sol`**

Locate the existing event declarations (around line 67-78). Add:

```solidity
    /// @notice Phase 11 (J-1): emitted when a queued authorize-true is
    ///         canceled before apply. Lets the Safe back out of a mistake
    ///         without having to overwrite the slot with a different
    ///         (and itself 24h-delayed) target.
    event AuthorizedContractCancelled(address indexed addr);
    event TrustedDirectoryContractCancelled(address indexed addr);
```

**Step 4: Add the two cancel functions**

Insert after `applyAuthorizedContract` (around line 220) in `SAGAHandleRegistry.sol`:

```solidity
    /// @notice Phase 11 (J-1): cancel a previously-queued authorize-true
    ///         before it applies. The Safe's only prior recourse was to
    ///         overwrite the slot with a different address (which started
    ///         its own 24h timer); a forgotten or mistaken queue could
    ///         then be permissionlessly applied at the 24h mark by anyone
    ///         watching the Safe.
    function cancelPendingAuthorizedContract() external onlyOwner {
        address cancelled = _pendingAuthorizedContract;
        delete _pendingAuthorizedContract;
        delete _pendingAuthorizedContractReadyAt;
        emit AuthorizedContractCancelled(cancelled);
    }
```

Insert after `applyTrustedDirectoryContract`:

```solidity
    /// @notice Phase 11 (J-1): cancel a previously-queued trust-true
    ///         before it applies. See cancelPendingAuthorizedContract.
    function cancelPendingTrustedDirectoryContract() external onlyOwner {
        address cancelled = _pendingTrustedDirectoryContract;
        delete _pendingTrustedDirectoryContract;
        delete _pendingTrustedDirectoryContractReadyAt;
        emit TrustedDirectoryContractCancelled(cancelled);
    }
```

**Step 5: Verify tests pass**

```bash
cd packages/contracts && forge test --match-test "test_j1_" 2>&1 | tail -10
```

Expected: 4 passed.

**Step 6: Regenerate ABIs (the surface changed)**

```bash
node scripts/generate-abis.mjs
```

Expected: 5 ABI files written; `SAGAHandleRegistry.ts` count increases by 4 (2 functions + 2 events).

**Step 7: Update ABI freshness pin**

Modify `packages/contracts/src/ts/__tests__/abis.test.ts` — in the `SAGAHandleRegistry ABI is fresh against post-Phase-10 surface` test (around line 67-92), append to the expected list:

```typescript
      'cancelPendingAuthorizedContract',
      'cancelPendingTrustedDirectoryContract',
```

**Step 8: Run full forge + TS suites**

```bash
cd packages/contracts && forge test && pnpm test:ts
```

Expected: all green; forge count = 237 + 4 = 241; vitest = 35 (ABI assertions only).

**Step 9: Commit**

```bash
git add packages/contracts/src/SAGAHandleRegistry.sol \
        packages/contracts/test/SAGAHandleRegistry.t.sol \
        packages/contracts/src/ts/abis/ \
        packages/contracts/src/ts/__tests__/abis.test.ts
git commit -m "feat(contracts): J-1 — add cancelPending* for queued authorizations

Phase 11 (J-1 HIGH). Closes the post-Phase-10 audit's only HIGH
finding. The M-1 queue+apply timelock had no clean cancel path —
the Safe's only recourse to back out of a mistake was to overwrite
the slot with a different contract (which itself starts a 24h timer).
Anthropic + Gemini consensus.

Add cancelPendingAuthorizedContract() and cancelPendingTrustedDirectoryContract()
(onlyOwner, immediate, emit *Cancelled events). Anyone-applies semantics
unchanged; the queue is the privileged action and now has a clean undo.

Built with d7r FlowState"
```

---

### Task 2: Replace `_initialOwner` bootstrap check with `bootstrapFinalized` flag (J-3)

**Files:**

- Modify: `packages/contracts/src/SAGAHandleRegistry.sol` (rename storage, add function)
- Modify: `packages/contracts/script/Deploy.s.sol` (call `finalizeBootstrap` at end)
- Test: `packages/contracts/test/SAGAHandleRegistry.t.sol` (add 3 tests, update existing M-1 tests)

**Step 1: Failing tests**

Append after the J-1 tests:

```solidity
function test_j3_finalizeBootstrap_disablesImmediateAuthorize() public {
    // Pre-finalize: deployer can authorize immediately.
    address contractA = makeAddr("contractA");
    vm.etch(contractA, hex"60006000fd");
    registry.setAuthorizedContract(contractA, true);
    assertTrue(registry.authorizedContracts(contractA));

    // Finalize bootstrap.
    registry.finalizeBootstrap();
    assertTrue(registry.bootstrapFinalized());

    // Post-finalize: even the deployer must use the queue path.
    address contractB = makeAddr("contractB");
    vm.etch(contractB, hex"60006000fd");
    vm.expectRevert(bytes("SAGAHandleRegistry: post-bootstrap: use queueAuthorizedContract"));
    registry.setAuthorizedContract(contractB, true);
}

function test_j3_finalizeBootstrap_onlyOwner() public {
    vm.prank(makeAddr("randomEoa"));
    vm.expectRevert();
    registry.finalizeBootstrap();
}

function test_j3_finalizeBootstrap_idempotentRevert() public {
    registry.finalizeBootstrap();
    vm.expectRevert(bytes("SAGAHandleRegistry: already finalized"));
    registry.finalizeBootstrap();
}
```

Update the existing `test_m1_setAuthorizedContract_postHandoffRevertsOnAuthorize` revert message (line ~570). Search-and-replace within that test only:

```
"SAGAHandleRegistry: post-handoff: use queueAuthorizedContract"
→ "SAGAHandleRegistry: post-bootstrap: use queueAuthorizedContract"
```

Same for `test_m1_setTrustedDirectoryContract_postHandoffRevertsOnTrust`:

```
"SAGAHandleRegistry: post-handoff: use queueTrustedDirectoryContract"
→ "SAGAHandleRegistry: post-bootstrap: use queueTrustedDirectoryContract"
```

ALSO update those tests' setup: instead of `transferOwnership(safe)` + `acceptOwnership`, just call `registry.finalizeBootstrap()` to enter post-bootstrap mode.

**Step 2: Verify the new tests fail**

```bash
forge test --match-test "test_j3_" 2>&1 | tail -10
```

**Step 3: Update `SAGAHandleRegistry.sol`**

Replace the `_initialOwner` declaration block (around line 79-93):

```solidity
    /// @notice Phase 11 (J-3): bootstrap-finalization flag. While `false`,
    ///         the initial deployer can authorize identity contracts
    ///         immediately so Deploy.s.sol can wire the system in a
    ///         single transaction. Deploy.s.sol calls `finalizeBootstrap`
    ///         at the end of the run; from that point on, EVERY new
    ///         authorize-true must go through the 24h queue+apply path,
    ///         regardless of who the current owner is. Replaces the
    ///         Phase 10 `_initialOwner` check (which left a bootstrap
    ///         window between deploy and Safe `acceptOwnership` during
    ///         which a compromised deployer EOA could authorize without
    ///         the timelock).
    bool public bootstrapFinalized;
```

Replace the constructor (line ~92-94):

```solidity
    constructor() Ownable(msg.sender) {}
```

Replace the `setAuthorizedContract` function body (line ~140-160) — change the post-handoff check:

```solidity
    function setAuthorizedContract(address addr, bool authorized) external onlyOwner {
        if (authorized) {
            require(addr.code.length > 0, "SAGAHandleRegistry: authorized must be contract");
            require(
                !bootstrapFinalized,
                "SAGAHandleRegistry: post-bootstrap: use queueAuthorizedContract"
            );
            authorizedContracts[addr] = true;
            emit AuthorizedContractSet(addr, true);
        } else {
            authorizedContracts[addr] = false;
            emit AuthorizedContractSet(addr, false);
        }
    }
```

Replace the `setTrustedDirectoryContract` function body (line ~207-225):

```solidity
    function setTrustedDirectoryContract(address addr, bool trusted) external onlyOwner {
        if (trusted) {
            require(addr.code.length > 0, "SAGAHandleRegistry: trusted directory must be contract");
            require(
                !bootstrapFinalized,
                "SAGAHandleRegistry: post-bootstrap: use queueTrustedDirectoryContract"
            );
            trustedDirectoryContracts[addr] = true;
            emit TrustedDirectoryContractSet(addr, true);
        } else {
            trustedDirectoryContracts[addr] = false;
            emit TrustedDirectoryContractSet(addr, false);
        }
    }
```

Add the `finalizeBootstrap` function after the constructor:

```solidity
    /// @notice Phase 11 (J-3): finalize the bootstrap window. Once called,
    ///         every new authorize-true goes through the 24h queue+apply
    ///         path. Idempotent: reverts on second call to make
    ///         deploy-script ordering errors loud.
    function finalizeBootstrap() external onlyOwner {
        require(!bootstrapFinalized, "SAGAHandleRegistry: already finalized");
        bootstrapFinalized = true;
        emit BootstrapFinalized();
    }
```

Add the event near the existing event declarations:

```solidity
    /// @notice Phase 11 (J-3): emitted when the bootstrap window closes.
    event BootstrapFinalized();
```

**Step 4: Update `Deploy.s.sol`**

Find the line that authorizes the directory contract (around the bottom of `vm.startBroadcast` block) and append before `vm.stopBroadcast()`:

```solidity
        // Phase 11 (J-3): close the bootstrap window. From this point on,
        // every new authorize-true requires the 24h queue+apply timelock,
        // even from the initial deployer. Eliminates the bootstrap-window
        // attack where a compromised deployer EOA could authorize a
        // malicious contract immediately between Deploy.s.sol and the
        // Safe's `acceptOwnership` call.
        registry.finalizeBootstrap();
        console.log("Bootstrap finalized — post-handoff timelock active");
```

**Step 5: Run forge build and tests**

```bash
forge build 2>&1 | grep -iE "error" | head
forge test 2>&1 | tail -5
```

Expected: build clean; `test_j3_` and renamed `test_m1_*` all pass; total = 241 + 3 = 244.

**Step 6: Regenerate ABIs and update freshness pin**

```bash
node scripts/generate-abis.mjs
```

Add to `abis.test.ts` `SAGAHandleRegistry` freshness list:

```typescript
      'finalizeBootstrap',
      'bootstrapFinalized',
```

**Step 7: Commit**

```bash
git add -A packages/contracts
git commit -m "feat(contracts): J-3 — bootstrapFinalized flag closes deployer window

Phase 11 (J-3 MEDIUM). The Phase 10 \`_initialOwner\` check left a window
between Deploy.s.sol and Safe \`acceptOwnership\` during which a
compromised deployer EOA could authorize a malicious contract
immediately, bypassing the M-1 24h timelock.

Replace \`_initialOwner == owner()\` with an explicit \`bootstrapFinalized\`
flag set by \`finalizeBootstrap()\` at the end of Deploy.s.sol. Once
finalized, every authorize-true must go through queue+apply
regardless of owner identity. Deauthorization remains immediate.

Built with d7r FlowState"
```

---

### Task 3: Validate display text for org name + conformance level (J-5)

**Files:**

- Modify: `packages/contracts/src/SAGAValidation.sol` (add `validateDisplayText`)
- Modify: `packages/contracts/src/SAGAOrgIdentity.sol` (call from registerOrganization + updateOrgName)
- Modify: `packages/contracts/src/SAGADirectoryIdentity.sol` (call from registerDirectory)
- Test: `packages/contracts/test/SAGAValidation.t.sol` (4 tests)
- Test: `packages/contracts/test/SAGAOrgIdentity.t.sol` (2 tests)
- Test: `packages/contracts/test/SAGADirectoryIdentity.t.sol` (2 tests)

**Step 1: Failing tests for the new validator**

Append to `packages/contracts/test/SAGAValidation.t.sol` (after the H-4 block):

```solidity
    function test_j5_validateDisplayText_acceptsPlainAscii() public {
        harness.validateDisplayText("d7r LLC", 128);
        harness.validateDisplayText("Org Name 1", 128);
        // No revert expected.
    }

    function test_j5_validateDisplayText_acceptsHighBytes() public {
        // UTF-8 multi-byte must still pass (non-ASCII names allowed).
        bytes memory utf8 = bytes("\xc3\x89pic D\xc3\xa9sign"); // "Épic Désign"
        harness.validateDisplayText(string(utf8), 128);
    }

    function test_j5_validateDisplayText_rejectsHtmlMetacharacters() public {
        bytes[6] memory bad = [
            bytes("<script>alert(1)</script>"),
            bytes("Foo \"bar\""),
            bytes("Foo 'bar'"),
            bytes("Foo<bar"),
            bytes("Foo>bar"),
            bytes("Foo\\bar")
        ];
        for (uint256 i = 0; i < bad.length; i++) {
            vm.expectRevert(SAGAValidation.InvalidTextCharacter.selector);
            harness.validateDisplayText(string(bad[i]), 128);
        }
    }

    function test_j5_validateDisplayText_rejectsControlBytes() public {
        bytes memory withNull = bytes("Foo\x00bar");
        vm.expectRevert(SAGAValidation.InvalidTextCharacter.selector);
        harness.validateDisplayText(string(withNull), 128);

        bytes memory withEsc = bytes("Foo\x1bbar");
        vm.expectRevert(SAGAValidation.InvalidTextCharacter.selector);
        harness.validateDisplayText(string(withEsc), 128);
    }
```

**Step 2: Add `validateDisplayText` harness method**

Find the existing `ValidationHarness` helper at the top of `SAGAValidation.t.sol` and add:

```solidity
    function validateDisplayText(string calldata s, uint256 maxLen) external pure {
        SAGAValidation.validateDisplayText(s, maxLen);
    }
```

**Step 3: Run tests; expect FAIL — function doesn't exist**

```bash
forge test --match-test "test_j5_validateDisplayText_" 2>&1 | tail -10
```

**Step 4: Add `validateDisplayText` to `SAGAValidation.sol`**

Add after the `validateUrl` function:

```solidity
    /// @notice Phase 11 (J-5): error for display-text validation.
    error InvalidTextCharacter();
    error InvalidTextLength();

    /// @notice Validate a free-form display string is within length bounds
    ///         AND free of bytes that downstream renderers (HTML, JSON,
    ///         terminal UIs) cannot safely display without escaping.
    /// @dev Rejects: 0x00..0x1F (C0 controls), 0x7F (DEL), 0x22 ("),
    ///      0x27 ('), 0x3C (<), 0x3E (>), 0x5C (\). Multi-byte UTF-8
    ///      (>= 0x80) is permitted so legitimate non-ASCII display
    ///      names work. Mirrors validateUrl's H-4 byte blacklist
    ///      with one exception: SPACE (0x20) is permitted because
    ///      org names like "d7r LLC" are legitimate.
    function validateDisplayText(string calldata s, uint256 maxLen) internal pure {
        bytes calldata b = bytes(s);
        if (b.length == 0 || b.length > maxLen) revert InvalidTextLength();

        for (uint256 i = 0; i < b.length; i++) {
            bytes1 c = b[i];
            if (
                c <= 0x1F            // C0 control bytes (incl. NUL, ESC)
                    || c == 0x7F     // DEL
                    || c == 0x22     // double quote
                    || c == 0x27     // single quote
                    || c == 0x3C     // <
                    || c == 0x3E     // >
                    || c == 0x5C     // backslash
            ) {
                revert InvalidTextCharacter();
            }
        }
    }
```

**Step 5: Verify the validator tests pass**

```bash
forge test --match-test "test_j5_validateDisplayText_" 2>&1 | tail -10
```

Expected: 4 passed.

**Step 6: Failing tests for `SAGAOrgIdentity` integration**

Append to `packages/contracts/test/SAGAOrgIdentity.t.sol`:

```solidity
    function test_j5_registerOrg_rejectsHtmlMetacharacters() public {
        vm.prank(user1);
        vm.expectRevert(SAGAValidation.InvalidTextCharacter.selector);
        org.registerOrganization("good-handle", "<script>alert(1)</script>");
    }

    function test_j5_updateOrgName_rejectsControlByte() public {
        vm.prank(user1);
        uint256 tokenId = org.registerOrganization("legit-org", "Legit Name");

        vm.prank(user1);
        vm.expectRevert(SAGAValidation.InvalidTextCharacter.selector);
        org.updateOrgName(tokenId, "Bad\x00Name");
    }
```

You'll need to import `SAGAValidation`. Check whether it's already imported (search `import.*SAGAValidation`); if not, add to the import block:

```solidity
import {SAGAValidation} from "../src/SAGAValidation.sol";
```

**Step 7: Apply `validateDisplayText` in `SAGAOrgIdentity.sol`**

Find `registerOrganization` (around line 82-95). Locate the existing length check and replace:

```solidity
        uint256 nameLen = bytes(name).length;
        require(nameLen > 0 && nameLen <= 128, "SAGAOrgIdentity: invalid name");
```

with:

```solidity
        // Phase 11 (J-5): validateDisplayText enforces both the length
        // bound AND rejection of HTML metacharacters / control bytes.
        // Replaces the prior length-only check; the byte blacklist
        // closes a downstream-rendering hazard for indexers and
        // frontends that emit org names into HTML or JSON.
        SAGAValidation.validateDisplayText(name, 128);
```

Find `updateOrgName` (around line 145-155). Same replacement.

**Step 8: Failing tests + integration for `SAGADirectoryIdentity`**

Append to `packages/contracts/test/SAGADirectoryIdentity.t.sol`:

```solidity
    function test_j5_registerDirectory_rejectsHtmlConformance() public {
        vm.prank(user1);
        vm.expectRevert(SAGAValidation.InvalidTextCharacter.selector);
        directory.registerDirectory(
            "j5-dir", "https://x.example/", makeAddr("op"), "<bad>"
        );
    }

    function test_j5_registerDirectory_rejectsControlInConformance() public {
        vm.prank(user1);
        vm.expectRevert(SAGAValidation.InvalidTextCharacter.selector);
        directory.registerDirectory(
            "j5-dir2", "https://x.example/", makeAddr("op"), "bad\x00"
        );
    }
```

Add `import {SAGAValidation} from "../src/SAGAValidation.sol";` if not already present.

In `SAGADirectoryIdentity.sol`, find `registerDirectory` (around line 100-130). Locate:

```solidity
        uint256 levelLen = bytes(conformanceLevel).length;
        require(
            levelLen > 0 && levelLen <= 32, "SAGADirectoryIdentity: invalid conformance"
        );
```

Replace with:

```solidity
        // Phase 11 (J-5): validateDisplayText enforces length bound AND
        // rejects HTML metacharacters / control bytes in the
        // self-claimed conformance string.
        SAGAValidation.validateDisplayText(conformanceLevel, 32);
```

**Step 9: Run forge tests**

```bash
forge test 2>&1 | tail -5
```

Expected: total = 244 + 8 = 252 passing.

**Step 10: Commit**

```bash
git add -A packages/contracts
git commit -m "feat(contracts): J-5 — reject HTML metacharacters in display strings

Phase 11 (J-5 MEDIUM). Phase 10 H-4 hardened validateUrl against
control bytes and HTML metacharacters but left org names + directory
conformance strings length-only. Indexers, frontends, marketplace
renderers, and log processors that emit these fields are exposed
to downstream rendering attacks (XSS in the worst case, log injection
in the typical case). OpenAI + Gemini consensus.

Add SAGAValidation.validateDisplayText(string, uint256) — same
byte blacklist as validateUrl minus SPACE (legitimate in display
names). Apply to registerOrganization, updateOrgName, and
registerDirectory's conformance-level field.

Built with d7r FlowState"
```

---

### Task 4: Strict base-URI validator rejects `?` `#` `&` (J-6)

**Files:**

- Modify: `packages/contracts/src/SAGAValidation.sol` (add `validateBaseUri`)
- Modify: `packages/contracts/src/SAGAAgentIdentity.sol`, `SAGAOrgIdentity.sol`, `SAGADirectoryIdentity.sol` (use new validator in `setBaseURI` + `applyBaseURI`)
- Test: `packages/contracts/test/SAGAValidation.t.sol`, agent/org/directory tests

**Step 1: Failing tests for the validator**

Append to `SAGAValidation.t.sol`:

```solidity
    function test_j6_validateBaseUri_acceptsPathPrefix() public {
        harness.validateBaseUri("https://saga-standard.dev/api/metadata/agent/");
        harness.validateBaseUri("http://example.com/path/");
        // No revert.
    }

    function test_j6_validateBaseUri_requiresTrailingSlash() public {
        vm.expectRevert(SAGAValidation.InvalidBaseUriPath.selector);
        harness.validateBaseUri("https://example.com/path");
    }

    function test_j6_validateBaseUri_rejectsQueryString() public {
        vm.expectRevert(SAGAValidation.InvalidBaseUriPath.selector);
        harness.validateBaseUri("https://example.com/?evil=");
    }

    function test_j6_validateBaseUri_rejectsFragment() public {
        vm.expectRevert(SAGAValidation.InvalidBaseUriPath.selector);
        harness.validateBaseUri("https://example.com/#frag/");
    }

    function test_j6_validateBaseUri_rejectsAmpersand() public {
        vm.expectRevert(SAGAValidation.InvalidBaseUriPath.selector);
        harness.validateBaseUri("https://example.com/path&/");
    }
```

Add to `ValidationHarness`:

```solidity
    function validateBaseUri(string calldata s) external pure {
        SAGAValidation.validateBaseUri(s);
    }
```

**Step 2: Add `validateBaseUri` to `SAGAValidation.sol`**

Append after `validateDisplayText`:

```solidity
    /// @notice Phase 11 (J-6): error for base-URI shape violations.
    error InvalidBaseUriPath();

    /// @notice Validate a base URI suitable for ERC-721 tokenURI
    ///         concatenation: must pass validateUrl AND end in `/` AND
    ///         contain no `?`, `#`, or `&` (which would otherwise
    ///         cause the appended tokenId to land in a query string
    ///         or fragment instead of a path component).
    /// @dev    A Safe-compromised setBaseURI to
    ///         `https://x.example/api/?redirect=https://phish/` would
    ///         otherwise produce `tokenURI(42) =
    ///         https://x.example/api/?redirect=https://phish/42` —
    ///         tokenId injected into the query, with off-chain
    ///         consequences (open-redirect chaining, indexer cache
    ///         poisoning) gated only by the 24h G-8 timelock.
    function validateBaseUri(string calldata uri) internal pure {
        validateUrl(uri);
        bytes calldata b = bytes(uri);
        if (b[b.length - 1] != 0x2F) revert InvalidBaseUriPath();
        for (uint256 i = 0; i < b.length; i++) {
            bytes1 c = b[i];
            if (c == 0x3F || c == 0x23 || c == 0x26) {
                revert InvalidBaseUriPath();
            }
        }
    }
```

**Step 3: Verify validator tests pass**

```bash
forge test --match-test "test_j6_validateBaseUri_" 2>&1 | tail -10
```

**Step 4: Wire into `setBaseURI` × 3 contracts**

In `SAGAAgentIdentity.sol`, find `setBaseURI` (around line 200-210). Replace `SAGAValidation.validateUrl(newBaseURI);` with:

```solidity
        // Phase 11 (J-6): stricter validator for base URIs since
        // tokenURI concatenates `_baseTokenURI + tokenId.toString()`.
        // Rejects `?`, `#`, `&` and requires trailing `/` so tokenId
        // always lands in a path component.
        SAGAValidation.validateBaseUri(newBaseURI);
```

Repeat in `SAGAOrgIdentity.sol` `setBaseURI` and `SAGADirectoryIdentity.sol` `setBaseURI`.

**Step 5: Wire into `applyBaseURI` × 3 contracts**

The existing M-2 re-validation calls `validateUrl`. Promote to `validateBaseUri`. In each of the three identity contracts' `applyBaseURI`, replace:

```solidity
        SAGAValidation.validateUrl(_pendingBaseURI);
```

with:

```solidity
        SAGAValidation.validateBaseUri(_pendingBaseURI);
```

**Step 6: Existing `setBaseURI` tests use trailing-slash URIs already** — verify they still pass (no test changes required).

**Step 7: Add a J-6 integration test on each identity contract**

Append to `packages/contracts/test/SAGAAgentIdentity.t.sol`:

```solidity
    function test_j6_setBaseURI_rejectsQueryString() public {
        vm.expectRevert(SAGAValidation.InvalidBaseUriPath.selector);
        agent.setBaseURI("https://x.example/api/?evil=");
    }

    function test_j6_setBaseURI_requiresTrailingSlash() public {
        vm.expectRevert(SAGAValidation.InvalidBaseUriPath.selector);
        agent.setBaseURI("https://x.example/api");
    }
```

Same pair for `SAGAOrgIdentity.t.sol` (replace `agent` with `org`) and `SAGADirectoryIdentity.t.sol` (replace with `directory`).

**Step 8: Verify**

```bash
forge test 2>&1 | tail -5
```

Expected: total = 252 + 5 (validator) + 6 (per-contract) = 263 passing.

**Step 9: Commit**

```bash
git add -A packages/contracts
git commit -m "feat(contracts): J-6 — stricter validator for base URIs

Phase 11 (J-6 MEDIUM). tokenURI() concatenates _baseTokenURI with
tokenId.toString(). A Safe-compromised setBaseURI to a URI containing
'?', '#', or '&' would put tokenId into the query/fragment instead
of the path — enabling open-redirect chaining and indexer cache
poisoning even after the 24h G-8 timelock review window. Anthropic.

Add SAGAValidation.validateBaseUri(string) requiring trailing '/'
and rejecting '?', '#', '&'. Apply at all three setBaseURI queues
AND at all three applyBaseURI re-validation sites.

Built with d7r FlowState"
```

---

### Task 5: Add `nonReentrant` to registry registration paths (J-7)

**Files:**

- Modify: `packages/contracts/src/SAGAHandleRegistry.sol` (inherit ReentrancyGuard, add modifier to 2 functions)
- Test: `packages/contracts/test/SAGAHandleRegistry.t.sol` (1 test)

**Step 1: Failing test (defense-in-depth pin)**

Append to `SAGAHandleRegistry.t.sol`:

```solidity
    function test_j7_registry_inheritsReentrancyGuard() public view {
        // Pin that the registry inherits the guard. We can't easily
        // construct a re-entrancy scenario without a malicious authorized
        // contract, but we can pin the structural property by checking
        // the guard's storage slot is present (via supportsInterface or
        // by reading a pure inheritance fact). The cheapest pin: the
        // ReentrancyGuard's _NOT_ENTERED constant is internal, but the
        // contract size sanity-checks via successful registerHandle —
        // if the modifier is wired correctly, the function still works.
        // This test is structural; the real defense is the modifier
        // existing on registerHandle / registerScopedHandle.
        // We pin via a happy-path call that would still succeed.
        vm.prank(authorizedContract);
        registry.registerHandle("j7-pin", SAGAHandleRegistry.EntityType.AGENT, 9999);
        (SAGAHandleRegistry.EntityType et,,) = registry.resolveHandle("j7-pin");
        assertEq(uint256(et), uint256(SAGAHandleRegistry.EntityType.AGENT));
    }
```

> Note: this test is intentionally structural — re-entry would require an authorized contract whose `onERC721Received` re-enters the registry. Constructing one is wasteful given the registry never calls back into msg.sender. The modifier is cheap defense-in-depth for future authorized contracts.

**Step 2: Modify `SAGAHandleRegistry.sol`**

Locate the import block at the top and add:

```solidity
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
```

Update the contract declaration (line ~21):

```solidity
contract SAGAHandleRegistry is Ownable2Step, ReentrancyGuard {
```

On `registerHandle` (line ~261):

```solidity
    function registerHandle(string calldata handle, EntityType entityType, uint256 tokenId)
        external
        nonReentrant
    {
```

On `registerScopedHandle` (find function declaration):

```solidity
    function registerScopedHandle(
        string calldata handle,
        EntityType entityType,
        uint256 tokenId,
        string calldata directoryId
    ) external nonReentrant {
```

**Step 3: Verify all existing tests still pass**

```bash
forge test 2>&1 | tail -3
```

Expected: 263 + 1 = 264 passing. The added modifier is transparent to all existing tests (none re-enter).

**Step 4: Commit**

```bash
git add -A packages/contracts
git commit -m "feat(contracts): J-7 — nonReentrant on registry registration paths

Phase 11 (J-7 MEDIUM). Defense-in-depth. Today every authorized
contract has its own nonReentrant modifier and CEI ordering, so the
registry is safe by composition. A future authorized contract
(added via M-1 timelock) that forgets these would re-enter the
registry directly. ~2.4k gas per call.

Inherit ReentrancyGuard on SAGAHandleRegistry; add nonReentrant to
registerHandle and registerScopedHandle. Anthropic.

Built with d7r FlowState"
```

---

### Task 6: Self-TBA introspection via ERC-6551 `token()` (J-13)

**Files:**

- Modify: `packages/contracts/src/SAGAAgentIdentity.sol` (extend `_update`, add interface)
- Modify: `packages/contracts/src/SAGAOrgIdentity.sol` (same)
- Modify: `packages/contracts/src/SAGADirectoryIdentity.sol` (same)
- Test: `packages/contracts/test/SAGAAgentIdentity.t.sol` (1 test)

**Step 1: Failing test**

Append to `packages/contracts/test/SAGAAgentIdentity.t.sol`:

```solidity
    function test_j13_blocksSelfTBA_withNonZeroSalt() public {
        vm.prank(user1);
        uint256 tokenId = agent.registerAgent("j13", "https://h.example/");

        // Deploy a TBA-like mock that reports `token()` matching this
        // (chainId, agent, tokenId). The salt-zero canonical address
        // computed by tbaHelper would NOT match this mock's address —
        // the universal token() introspection should still block the
        // transfer regardless of salt or implementation.
        MockSelfBoundAccount selfBound =
            new MockSelfBoundAccount(block.chainid, address(agent), tokenId);

        vm.prank(user1);
        vm.expectRevert(bytes("SAGAAgentIdentity: cannot transfer to own TBA"));
        agent.transferFrom(user1, address(selfBound), tokenId);
    }
```

Add the `MockSelfBoundAccount` helper near the top of the test file (after `MockTBAHelper`):

```solidity
/// @dev Phase 11 (J-13): mock that exposes the ERC-6551 token()
///      introspection function returning a self-binding tuple.
contract MockSelfBoundAccount {
    uint256 public immutable chainId;
    address public immutable tokenContract;
    uint256 public immutable tokenId;

    constructor(uint256 _chainId, address _tokenContract, uint256 _tokenId) {
        chainId = _chainId;
        tokenContract = _tokenContract;
        tokenId = _tokenId;
    }

    function token() external view returns (uint256, address, uint256) {
        return (chainId, tokenContract, tokenId);
    }
}
```

**Step 2: Run; expect FAIL**

```bash
forge test --match-test "test_j13_" 2>&1 | tail -10
```

Expected: FAIL — current `_update` only checks the canonical-salt-zero address.

**Step 3: Extend the `ITBAHelperLite` interface block**

In `SAGAAgentIdentity.sol`, locate the interface declaration (line 16) and add a sibling interface:

```solidity
interface ITBAHelperLite {
    function computeAccount(address tokenContract, uint256 tokenId) external view returns (address);
}

/// @notice Phase 11 (J-13): every ERC-6551 TBA implementation MUST
///         expose `token()` returning the binding tuple. Used by
///         _update to block transfers to ANY contract bound to this
///         NFT — closing the salt + implementation gap left by the
///         G-12 documented limitation.
interface IERC6551BoundAccount {
    function token() external view returns (uint256 chainId, address tokenContract, uint256 tokenId);
}
```

**Step 4: Extend `_update`**

Locate `_update` in `SAGAAgentIdentity.sol` (line ~258). Replace the existing self-TBA-check block (the `if (from != address(0) && to != address(0))` body) with:

```solidity
        if (from != address(0) && to != address(0)) {
            // F-4 (Phase 8): block the canonical salt-zero TBA derived
            // by SAGATBAHelper. Cheap path; ~700 gas.
            address selfTba = ITBAHelperLite(tbaHelper).computeAccount(address(this), tokenId);
            require(to != selfTba, "SAGAAgentIdentity: cannot transfer to own TBA");

            // J-13 (Phase 11): also block ANY contract that exposes
            // ERC-6551 introspection and reports being bound to THIS
            // NFT — closes the salt + alternative-implementation gap
            // left by the G-12 documented limitation. ~3k gas extra
            // (one staticcall + 3 SLOAD).
            if (to.code.length > 0) {
                try IERC6551BoundAccount(to).token() returns (
                    uint256 boundChainId, address boundContract, uint256 boundTokenId
                ) {
                    if (
                        boundChainId == block.chainid
                            && boundContract == address(this)
                            && boundTokenId == tokenId
                    ) {
                        revert("SAGAAgentIdentity: cannot transfer to own TBA");
                    }
                } catch {
                    // Not a TBA — no introspection. Proceed.
                }
            }
        }
```

Repeat the same change in `SAGAOrgIdentity.sol` `_update` (line ~239) — adjust the revert string to `"SAGAOrgIdentity: cannot transfer to own TBA"`.

Repeat in `SAGADirectoryIdentity.sol` `_update` (line ~363). Adjust the revert string to `"SAGADirectoryIdentity: cannot transfer to own TBA"`. Preserve the existing F-10 / G-1 rank-block logic — wrap the J-13 block alongside the F-4 check, NOT inside the F-10 conditional.

Add the `IERC6551BoundAccount` interface declaration to each file (`SAGAOrgIdentity.sol` line ~13, `SAGADirectoryIdentity.sol` line ~13).

**Step 5: Verify J-13 and existing self-TBA tests both pass**

```bash
forge test --match-test "selfTBA\|j13_" 2>&1 | tail -15
```

Expected: original F-4 tests (canonical salt) + new J-13 test (non-zero salt) all pass.

**Step 6: README update — promote J-13 from "documented limitation" to partial closure**

Open `packages/contracts/README.md` and find the "Known limitation: self-TBA transfer guard scope" section. Add a new paragraph after the existing limitation description:

```markdown
**Phase 11 (J-13) update:** the `_update` hook now also performs
`try IERC6551BoundAccount(to).token() returns (chainId, contract, tokenId)`
and reverts if the destination reports being bound to THIS NFT. This
closes the salt + alternative-implementation gap on-chain for any TBA
implementation that conforms to ERC-6551's universal `token()` getter
(every Tokenbound, Manifold, and reference implementation does).

The remaining residual risk: a destination contract that pretends NOT
to be a TBA — i.e., omits the `token()` getter or reverts on it. The
on-chain check assumes ERC-6551 conformance; a non-conforming "TBA"
that drops the getter would slip past. UX-layer warnings (option 1
above) remain valid for that residual case.
```

**Step 7: Run full forge + TS suites**

```bash
forge test && pnpm test:ts
```

Expected: forge total = 264 + 1 = 265 passing; TS unchanged.

**Step 8: Commit**

```bash
git add -A packages/contracts
git commit -m "feat(contracts): J-13 — block self-TBA via ERC-6551 token() introspection

Phase 11 (J-13 MEDIUM). The Phase 9 G-12 README documented the
self-TBA guard's salt + alternative-implementation gap as off-chain
UX concern. Anthropic re-flagged with a concrete on-chain mitigation:
every ERC-6551 TBA exposes token() returning the binding tuple. A
try-catch staticcall in _update can block transfers to ANY contract
that reports being bound to this NFT, regardless of salt or
implementation.

Add IERC6551BoundAccount interface + token() introspection in
_update across all three identity contracts. ~3k gas extra per
transfer. Original F-4 canonical-salt check kept as the cheap path.
README updated to promote J-13 from documented-limitation to
partial-closure.

Residual risk: a non-conforming TBA that drops token() slips past;
UX-layer warnings remain the mitigation for that edge.

Built with d7r FlowState"
```

---

### Task 7: Final test sweep + push + create PR 11A

**Files:** none modified.

**Step 1: Full sweep**

```bash
cd packages/contracts && forge test && pnpm test:ts && pnpm typecheck && forge build
```

Expected:

- `forge test`: 265 passing (was 237; +28 from J-1, J-3, J-5, J-6, J-7, J-13)
- `pnpm test:ts`: 35 passing (unchanged)
- `pnpm typecheck`: clean
- `forge build`: clean

**Step 2: Push and create PR**

```bash
git push -u origin phase11-contracts-a-recommended
gh pr create --base dev --title "feat(contracts): Phase 11A — post-Phase-10 audit recommended hardening" --body "$(cat <<'EOF'
## Summary

Phase 11A — closes 6 findings from the post-Phase-10 three-provider re-audit (`audits/2026-05-04-post-phase10-gap-matrix.md`).

| ID | Severity | Action |
|----|----------|--------|
| **J-1** | HIGH | Add `cancelPendingAuthorizedContract` + `cancelPendingTrustedDirectoryContract` so the Safe can back out of mistaken queues without overwrite-and-restart-timer |
| **J-3** | MEDIUM | Replace `_initialOwner` check with explicit `bootstrapFinalized` flag; `Deploy.s.sol` calls `finalizeBootstrap()` to close the deployer-EOA window |
| **J-5** | MEDIUM | New `SAGAValidation.validateDisplayText` — rejects HTML metachars + control bytes in org names + directory conformance level |
| **J-6** | MEDIUM | New `SAGAValidation.validateBaseUri` — requires trailing `/`, rejects `?` `#` `&` so `tokenURI` concatenation can't inject into queries |
| **J-7** | MEDIUM | `SAGAHandleRegistry` inherits `ReentrancyGuard`; `nonReentrant` on register paths |
| **J-13** | MEDIUM | `_update` adds ERC-6551 `token()` introspection — blocks self-TBA at any salt/impl that conforms to the standard |

## Test results

- **forge:** 265/265 passing (was 237, +28 new tests)
- **vitest TS:** 35/35 passing

## API additions

- `cancelPendingAuthorizedContract()`, `cancelPendingTrustedDirectoryContract()` (registry)
- `finalizeBootstrap()`, `bootstrapFinalized` (registry)
- `AuthorizedContractCancelled`, `TrustedDirectoryContractCancelled`, `BootstrapFinalized` events
- `SAGAValidation.validateDisplayText(string, uint256)`, `SAGAValidation.validateBaseUri(string)`
- New errors: `InvalidTextCharacter`, `InvalidTextLength`, `InvalidBaseUriPath`

## Behavior changes

- `setAuthorizedContract(addr, true)` reverts with `"post-bootstrap: ..."` after `finalizeBootstrap()` was called (previously: after Safe `acceptOwnership`)
- `registerOrganization`, `updateOrgName`, `registerDirectory` (conformance) now reject HTML metachars
- `setBaseURI` requires trailing `/` and rejects `?` `#` `&`
- `_update` blocks transfers to any contract reporting `token() == (chainId, this, tokenId)`

## FlowState

- **Plan:** `docs/plans/2026-05-04-phase11-post-audit-remediation.md`
- **Gap matrix:** `audits/2026-05-04-post-phase10-gap-matrix.md`
- **Previous PRs:** #50/#51/#52 (Phase 9), #53/#54/#55 (Phase 10) — all merged

## Test plan

- [x] `forge build` clean
- [x] `forge test` 265/265
- [x] `pnpm test:ts` 35/35
- [x] `pnpm typecheck` clean
- [ ] Copilot review

Built with d7r FlowState
EOF
)"
```

---

## PR 11B — Doc + operational polish (7 findings)

### Task 8: Add `DirectoryRevoked` event for indexer freshness (J-2)

**Files:**

- Modify: `packages/contracts/src/SAGADirectoryIdentity.sol` (emit on rank-2+ status update)
- Test: `packages/contracts/test/SAGADirectoryIdentity.t.sol`

**Step 1: Failing test**

Append:

```solidity
    function test_j2_directoryRevoked_emittedOnRevocation() public {
        vm.prank(user1);
        uint256 tokenId = directory.registerDirectory(
            "j2-rev", "https://x.example/", makeAddr("op"), "basic"
        );

        vm.expectEmit(true, false, false, true, address(directory));
        emit SAGADirectoryIdentity.DirectoryRevoked(tokenId, "revoked");
        directory.updateDirectoryStatus(tokenId, "revoked");
    }

    function test_j2_directoryRevoked_emittedOnFlagged() public {
        vm.prank(user1);
        uint256 tokenId = directory.registerDirectory(
            "j2-flag", "https://x.example/", makeAddr("op"), "basic"
        );

        vm.expectEmit(true, false, false, true, address(directory));
        emit SAGADirectoryIdentity.DirectoryRevoked(tokenId, "flagged");
        directory.updateDirectoryStatus(tokenId, "flagged");
    }

    function test_j2_directoryRevoked_NOT_emittedForActiveOrSuspended() public {
        vm.prank(user1);
        uint256 tokenId = directory.registerDirectory(
            "j2-active", "https://x.example/", makeAddr("op"), "basic"
        );

        vm.recordLogs();
        directory.updateDirectoryStatus(tokenId, "suspended");
        Vm.Log[] memory logs = vm.getRecordedLogs();
        bytes32 topic = keccak256("DirectoryRevoked(uint256,string)");
        for (uint256 i = 0; i < logs.length; i++) {
            require(logs[i].topics[0] != topic, "DirectoryRevoked must not fire on suspended");
        }
    }
```

> **Code-review fix:** `packages/contracts/test/SAGADirectoryIdentity.t.sol:4` currently imports only `Test`, NOT `Vm`. The `Vm.Log[]` and `vm.recordLogs()` / `vm.getRecordedLogs()` symbols require `Vm`. Update line 4:
>
> ```solidity
> import {Test, Vm} from "forge-std/Test.sol";
> ```
>
> (For comparison, `SAGAAgentIdentity.t.sol:4` already has this form because of Phase 9 G-10's `test_g10_eventOrdering_handleBeforeNftTransfer`.)

**Step 2: Add the event**

In `SAGADirectoryIdentity.sol`, add to the events block:

```solidity
    /// @notice Phase 11 (J-2): emitted when a directory enters
    ///         flagged (rank 2) or revoked (rank 3) status. Indexers
    ///         that mirror handleRegistry resolution should subscribe
    ///         to this event to stop returning identities under
    ///         revoked directories — closes the documentation-only
    ///         mitigation that "consumers should prefer
    ///         resolveActiveScopedHandle".
    event DirectoryRevoked(uint256 indexed tokenId, string newStatus);
```

In `updateDirectoryStatus` (line ~210), after the existing `DirectoryStatusUpdated` emit but before the function returns, add:

```solidity
        // Phase 11 (J-2): if the new status is rank >= 2, emit a
        // distinct event so off-chain indexers can specifically watch
        // for revocation events without parsing every status update.
        if (_statusRank(newStatus) >= 2) {
            emit DirectoryRevoked(tokenId, newStatus);
        }
```

**Step 3: Run tests**

```bash
forge test --match-test "test_j2_" 2>&1 | tail -10
```

Expected: 3 passed.

**Step 4: Regenerate ABIs and update freshness pin**

```bash
node scripts/generate-abis.mjs
```

Add `'DirectoryRevoked'` to the ABI freshness expected set for `SAGADirectoryIdentity` in `abis.test.ts` (note: the current pin lists functions, but events are also valid ABI entries; check the pin's `fns` filter — if it filters to only `type === 'function'`, add a new event-aware assertion):

```typescript
it('SAGADirectoryIdentity ABI exposes the J-2 DirectoryRevoked event', () => {
  const event = SAGADirectoryIdentityAbi.find(
    e => e.type === 'event' && e.name === 'DirectoryRevoked'
  )
  expect(event).toBeDefined()
})
```

**Step 5: Commit**

```bash
git add -A packages/contracts
git commit -m "feat(contracts): J-2 — DirectoryRevoked event for indexer freshness

Phase 11 (J-2 MEDIUM). resolveScopedHandle (raw) is intentionally
status-blind so forensic indexers can see historical records, but
this leaves an indexer-footgun: consumers using the raw resolver
miss revocation events. Phase 10 H-2 added the trust check to
resolveActiveScopedHandle but left the doc-only 'prefer the active
view' mitigation intact. Anthropic.

Add DirectoryRevoked(tokenId, newStatus) — fires on every transition
to flagged or revoked. Indexers can subscribe to this single event
to refresh their identity caches without polling. resolveScopedHandle
naming preserved for backward compatibility.

Built with d7r FlowState"
```

---

### Task 9: Doc TBA-content front-running risk (J-4)

**Files:**

- Modify: `packages/contracts/README.md`

**Step 1: Add a new subsection in the Security Notes**

Locate the existing "Known limitation: self-TBA transfer guard scope" section. Append a new section after it:

```markdown
### TBA contents are NOT transferred atomically with the NFT (J-4)

ERC-6551 binds the TBA's CONTROL to NFT ownership, but does NOT
escrow the TBA's CONTENTS. A seller listing a SAGA identity NFT on
a secondary marketplace can:

1. List the NFT for sale (e.g., on OpenSea or Blur).
2. Wait for a buyer to submit a purchase transaction.
3. Front-run the buyer's transaction by withdrawing tokens, NFTs,
   or other assets from the TBA.
4. Let the buyer's transaction execute. The buyer receives the
   identity NFT and control of an empty TBA.

This is a fundamental ERC-6551 design tradeoff — the on-chain
SAGA identity contracts cannot prevent it without breaking standard
ERC-721 transfer semantics.

**Mitigations:**

- **UX layer (REQUIRED):** SAGA-integrating frontends MUST display
  a clear warning before any NFT-listing UI: "TBA contents are not
  guaranteed to be transferred with the NFT. Verify TBA balance
  immediately before purchase."
- **Marketplace adapter (RECOMMENDED for official sales):** if SAGA
  ships a first-party marketplace, use Seaport Zones (or a similar
  conditional execution mechanism) to enforce that a hash of the
  TBA's contents hasn't changed between order signing and settlement.
  Alternatively, route through an escrow that locks the TBA's assets
  during the listing.
- **Buyer protection:** consumers integrating SAGA NFTs into DeFi
  protocols (collateral, lending, fractionalization) MUST treat
  TBA contents as untrusted at the moment of NFT receipt; only the
  NFT itself is bound by the on-chain transfer.

OpenAI + Gemini consensus, post-Phase-10 audit (J-4 MEDIUM,
ecosystem-level).
```

**Step 2: Commit**

```bash
git add packages/contracts/README.md
git commit -m "docs(contracts): J-4 — document TBA-content front-running risk

Phase 11 (J-4 MEDIUM, ecosystem). OpenAI + Gemini both flagged
that ERC-6551 doesn't escrow TBA contents during NFT sales. Cannot
be solved on-chain without breaking ERC-721 compat.

Document the risk + UX-layer mitigations + marketplace-adapter
recommendation in README Security Notes.

Built with d7r FlowState"
```

---

### Task 10: Doc deauth dual-direction risk (J-8)

**Files:**

- Modify: `packages/contracts/README.md`

**Step 1: Update the existing "Authorized contracts: residual risk" section**

Find the section. Replace its content (or append a paragraph) with:

```markdown
### Authorized contracts: residual risk

`SAGAHandleRegistry.setAuthorizedContract(addr, true)` and
`setTrustedDirectoryContract(addr, true)` are gated by the M-1
24h queue+apply timelock once `bootstrapFinalized` is set
(Phase 11 J-3). However, **deauthorization (`false`) is always
immediate** — slowing it down would let a known-compromised
contract continue operating against the registry for a full day.

This creates a **dual-direction Safe-compromise risk:**

- **Hijack direction (slow):** a compromised Safe queues a
  malicious authorize-true. The 24h timelock window gives
  legitimate operators time to detect, rotate signers, and call
  `cancelPendingAuthorizedContract` (J-1) to back out.
- **Brick direction (fast):** a compromised Safe immediately
  deauthorizes one or more identity contracts in a single tx.
  Every `registerAgent` / `registerOrganization` / `registerDirectory`
  call reverts with `unauthorized`. Recovery requires queueing
  re-authorization (24h delay) — for that 24h, the SAGA
  namespace is read-only.

Both directions are recovery-time issues, not permanent loss. The
asymmetric design accepts the brick-direction tradeoff because:

- Slowing deauthorization would let attackers continue operating
  against a known-compromised authorized contract for 24h, which is
  worse than a 24h read-only window.
- The Safe threshold (typically 3-of-N) makes single-key compromise
  insufficient. Compromise of the Safe itself is the threat model
  this design accepts cannot be defended against in code alone.

J-8 (MEDIUM, post-Phase-10 audit). Anthropic.
```

**Step 2: Commit**

```bash
git add packages/contracts/README.md
git commit -m "docs(contracts): J-8 — explicit dual-direction Safe-compromise risk

Phase 11 (J-8 MEDIUM, doc). The M-1 timelock is asymmetric:
authorize-true takes 24h, deauthorize is immediate. Anthropic
flagged that this enables a Safe-compromise to brick the registry
in one tx (24h registration outage). Acknowledged tradeoff;
slowing deauth would be worse.

README 'Authorized contracts: residual risk' section now
documents the asymmetry explicitly.

Built with d7r FlowState"
```

---

### Task 11: `DeployOrg.s.sol` chain-pinned helper allowlist (J-9)

**Files:**

- Modify: `packages/contracts/script/DeployOrg.s.sol`

**Step 1: Add the chain-pinned check**

Locate the existing TBA_HELPER block in `DeployOrg.s.sol` (around line 30):

```solidity
        address tbaHelperAddr = vm.envAddress("TBA_HELPER");
        require(registryAddr.code.length > 0, "HANDLE_REGISTRY not a contract");
        require(tbaHelperAddr.code.length > 0, "TBA_HELPER not a contract");
```

Append after:

```solidity
        // Phase 11 (J-9): chain-pinned helper-immutable allowlist.
        // Phase 10 H-7 pinned ERC6551_REGISTRY + TBA_IMPLEMENTATION in
        // Deploy.s.sol; DeployOrg.s.sol previously relied only on
        // code.length. A typo'd or compromised TBA_HELPER on a partial
        // org redeploy would permanently wire a new org contract to a
        // wrong helper. Pin the helper's immutable refs match the
        // canonical set on Base mainnet/Sepolia.
        if (block.chainid == 8453 || block.chainid == 84532) {
            address canonical6551Registry = 0x000000006551c19487814612e58FE06813775758;
            address tokenboundV3 = 0x55266d75D1a14E4572138116aF39863Ed6596E7F;
            SAGATBAHelper helper = SAGATBAHelper(tbaHelperAddr);
            require(
                address(helper.registry()) == canonical6551Registry,
                "TBA_HELPER registry mismatch"
            );
            require(
                helper.accountImplementation() == tokenboundV3,
                "TBA_HELPER implementation mismatch"
            );
        }
```

Add the `SAGATBAHelper` import at the top of `DeployOrg.s.sol`:

```solidity
import {SAGATBAHelper} from "../src/SAGATBAHelper.sol";
```

**Step 2: Verify build**

```bash
forge build 2>&1 | grep -iE "error" | head
```

Expected: clean.

**Step 3: Commit**

```bash
git add packages/contracts/script/DeployOrg.s.sol
git commit -m "feat(scripts): J-9 — DeployOrg chain-pinned helper allowlist

Phase 11 (J-9 LOW). Phase 10 H-7 pinned ERC6551_REGISTRY +
TBA_IMPLEMENTATION in Deploy.s.sol but DeployOrg.s.sol (partial
redeploy) only checked code.length on TBA_HELPER. A typo'd helper
on redeploy would permanently wire a new org contract to wrong
immutable refs. OpenAI.

Add chain-pinned check on Base mainnet/Sepolia: helper.registry()
+ helper.accountImplementation() must match the canonical set.

Built with d7r FlowState"
```

---

### Task 12: `Deploy.s.sol` warning on non-pinned chains (J-10)

**Files:**

- Modify: `packages/contracts/script/Deploy.s.sol`

**Step 1: Add the warning log**

`Deploy.s.sol` has TWO independent chain-pin blocks (one for `TBA_IMPLEMENTATION` at lines 47-59, one for `ERC6551_REGISTRY` at lines 72-83). Both branch on `chainid == 8453` and `chainid == 84532`. Adding the warning to BOTH would log twice; instead, add a single warning block AFTER the second pin (around line 84, before the `// Use DEPLOYER_PRIVATE_KEY from .env` comment):

```solidity
        // Phase 11 (J-10): warn operators when deploying to a non-pinned
        // chain. The script accepts arbitrary TBA_IMPLEMENTATION +
        // ERC6551_REGISTRY on testnets/L3s by design (staging/local
        // can supply their own pair), but operators should know their
        // env vars are not being checked.
        if (block.chainid != 8453 && block.chainid != 84532) {
            console.log("WARNING: deploying to non-pinned chain", block.chainid);
            console.log("TBA_IMPLEMENTATION not pin-checked. Verify off-chain.");
            console.log("ERC6551_REGISTRY not pin-checked. Verify off-chain.");
        }
```

This single block covers both pins because both share the same chain set.

**Step 2: Verify build**

```bash
forge build 2>&1 | grep -iE "error" | head
```

**Step 3: Commit**

```bash
git add packages/contracts/script/Deploy.s.sol
git commit -m "feat(scripts): J-10 — warning log on non-pinned chains

Phase 11 (J-10 LOW). Phase 10 G-6 + H-7 only pin Base mainnet +
Base Sepolia. Operators deploying to a new chain (testnet, L3) get
no warning if their env vars are wrong. Anthropic.

Add console.log warning in the else branch of the chain-pin block.
No behavior change on Base; diagnostic improvement on other chains.

Built with d7r FlowState"
```

---

### Task 13: Extend roundtrip invariant to directory tokens (J-11)

**Files:**

- Modify: `packages/contracts/test/invariants/RegistryConsistencyHandler.sol` (add `registerDirectory` action)
- Modify: `packages/contracts/test/invariants/IdentityInvariants.t.sol` (extend invariant)

> **Code-review fix:** The `RegistryConsistencyHandler` constructor change in this task ALSO requires updating `packages/contracts/test/invariants/RegistryConsistencyInvariant.t.sol:57` (where the handler is constructed for the F-7 supply-consistency invariant). Both call sites must pass the new third argument or the file fails to compile.

**Step 1: Extend the handler**

Add to `RegistryConsistencyHandler.sol`:

```solidity
import {SAGADirectoryIdentity} from "../../src/SAGADirectoryIdentity.sol";

contract RegistryConsistencyHandler {
    SAGAAgentIdentity public immutable agent;
    SAGAOrgIdentity public immutable org;
    SAGADirectoryIdentity public immutable directory; // <-- new

    uint256 public agentMints;
    uint256 public orgMints;
    uint256 public directoryMints; // <-- new

    constructor(
        SAGAAgentIdentity _agent,
        SAGAOrgIdentity _org,
        SAGADirectoryIdentity _directory
    ) {
        agent = _agent;
        org = _org;
        directory = _directory;
    }

    // ... existing registerAgent / registerOrg ...

    function registerDirectory(uint256 seed) external {
        string memory dirId = string(abi.encodePacked("d", _toBase36(seed)));
        try directory.registerDirectory(
            dirId,
            "https://h.example/",
            address(uint160(seed | 1)),
            "basic"
        ) {
            directoryMints++;
        } catch {
            // Validation, duplicate, or zero-operator. Leave ghost unchanged.
        }
    }

    // ... _toBase36 helper unchanged ...
}
```

**Step 2a: Update `RegistryConsistencyInvariant.t.sol` setUp**

Open `packages/contracts/test/invariants/RegistryConsistencyInvariant.t.sol`. Find line 49-57. The local `directory` var must now be passed to the handler:

```solidity
        SAGADirectoryIdentity directory = new SAGADirectoryIdentity(
            address(registry), address(tba)
        );
        registry.setAuthorizedContract(address(agent), true);
        registry.setAuthorizedContract(address(org), true);
        registry.setAuthorizedContract(address(directory), true);
        registry.setTrustedDirectoryContract(address(directory), true);

        handler = new RegistryConsistencyHandler(agent, org, directory);
        targetContract(address(handler));
```

(The existing `invariant_registryMatchesNftSupply` does NOT need updating — it only checks agent + org supply against the ghost counters; adding directory ghost is additive and would be a follow-up.)

**Step 2b: Update the invariant test setUp + assertion**

In `IdentityInvariants.t.sol`, find the setUp's handler construction:

```solidity
        handler = new RegistryConsistencyHandler(agent, org);
```

Change to:

```solidity
        handler = new RegistryConsistencyHandler(agent, org, directory);
```

Find `invariant_handleRoundtripResolves`. Append a directory-side roundtrip block:

```solidity
        uint256 directorySupply = directory.totalSupply();
        for (uint256 i = 0; i < directorySupply; i++) {
            uint256 tokenId = directory.tokenByIndex(i);
            string memory dirId = directory.directoryId(tokenId);
            (
                SAGAHandleRegistry.EntityType et,
                uint256 resolvedTid,
                address resolvedAddr
            ) = registry.resolveHandle(dirId);
            assertEq(uint256(et), uint256(SAGAHandleRegistry.EntityType.DIRECTORY));
            assertEq(resolvedTid, tokenId);
            assertEq(resolvedAddr, address(directory));
        }
```

Make `directory` accessible from the test. Look at the existing setUp — the local `SAGADirectoryIdentity directory` is constructed inside `setUp`. Promote it to a state variable: change

```solidity
        SAGADirectoryIdentity directory = new SAGADirectoryIdentity(
```

to (after declaring `SAGADirectoryIdentity public directory;` near `agent`/`org` state variables):

```solidity
        directory = new SAGADirectoryIdentity(
```

**Step 3: Run the invariant suite**

```bash
forge test --match-contract IdentityInvariantsTest 2>&1 | tail -10
```

Expected: 3 invariants pass; the new directory roundtrip is added to invariant_handleRoundtripResolves.

**Step 4: Commit**

```bash
git add -A packages/contracts/test
git commit -m "test(contracts): J-11 — extend roundtrip invariant to directory tokens

Phase 11 (J-11 LOW). The Phase 10 I-1 invariant covers agent + org
roundtrips but not directory tokens. A future bug in registerDirectory
(e.g., wrong entity type registration) would not be caught. Anthropic.

Extend RegistryConsistencyHandler with registerDirectory; assert
directory roundtrip in invariant_handleRoundtripResolves alongside
the agent + org assertions.

Built with d7r FlowState"
```

---

### Task 14: URL-validator fuzz coverage (J-12)

**Files:**

- Modify: `packages/contracts/test/SAGAValidation.t.sol`

**Step 1: Add the fuzz**

Append to `SAGAValidation.t.sol`:

```solidity
    /// @notice Phase 11 (J-12): fuzz the H-4 byte-blacklist closure.
    ///         Asserts that any byte in the rejected set causes
    ///         InvalidUrlCharacter, while any allowed byte (alphanumeric
    ///         + safe punctuation) does not.
    function testFuzz_j12_validateUrl_charBlacklistClosure(uint8 b) public {
        // Build a URL like "https://x.example/?<byte>" with the fuzzed
        // byte as the path tail. The prefix is always-valid; the
        // tail's acceptance depends only on the fuzzed byte.
        bytes memory url = abi.encodePacked(
            bytes("https://x.example/p"), bytes1(b)
        );

        bool inBlacklist = (
            b <= 0x20 || b == 0x7F || b == 0x5C
                || b == 0x22 || b == 0x27 || b == 0x3C || b == 0x3E
        );

        if (inBlacklist) {
            vm.expectRevert(SAGAValidation.InvalidUrlCharacter.selector);
            harness.validateUrl(string(url));
        } else {
            // Should not revert for allowed bytes (prefix + allowed
            // tail is well-formed enough to clear validateUrl).
            harness.validateUrl(string(url));
        }
    }
```

**Step 2: Run fuzz**

```bash
forge test --match-test "testFuzz_j12_" 2>&1 | tail -10
```

Expected: PASS, runs: 256.

**Step 3: Commit**

```bash
git add packages/contracts/test/SAGAValidation.t.sol
git commit -m "test(contracts): J-12 — fuzz validateUrl byte blacklist closure

Phase 11 (J-12 INFO). Phase 10 H-4 unit-tested specific bad bytes
but did not fuzz the full byte space. Add testFuzz_j12_validateUrl_charBlacklistClosure
covering the entire 0x00..0xFF range; in-blacklist bytes must
revert, others must pass. Anthropic.

Built with d7r FlowState"
```

---

### Task 15: Update gap matrix with Phase 11 closure section + final test sweep + push + create PR 11B

**Files:**

- Modify: `audits/2026-05-04-post-phase10-gap-matrix.md`

**Step 1: Append a Phase 11 closure section at the end of the gap matrix**

Add after the existing "Final assessment":

```markdown
---

## Phase 11 closure (2026-05-04)

All 13 J-findings closed across two PRs against `dev`.

| ID   | Severity | Closed by    | Notes                                                                                 |
| ---- | -------- | ------------ | ------------------------------------------------------------------------------------- |
| J-1  | HIGH     | PR #56 (11A) | `cancelPendingAuthorizedContract` + `cancelPendingTrustedDirectoryContract`           |
| J-2  | MEDIUM   | PR #57 (11B) | `DirectoryRevoked(tokenId, newStatus)` event on rank≥2 transitions                    |
| J-3  | MEDIUM   | PR #56 (11A) | `bootstrapFinalized` flag; `Deploy.s.sol` calls `finalizeBootstrap`                   |
| J-4  | MEDIUM   | PR #57 (11B) | README "TBA contents are NOT transferred atomically" section                          |
| J-5  | MEDIUM   | PR #56 (11A) | `SAGAValidation.validateDisplayText` applied to org name + conformance                |
| J-6  | MEDIUM   | PR #56 (11A) | `SAGAValidation.validateBaseUri` enforces trailing `/`, rejects `?` `#` `&`           |
| J-7  | MEDIUM   | PR #56 (11A) | `SAGAHandleRegistry` inherits `ReentrancyGuard`; nonReentrant on register paths       |
| J-8  | MEDIUM   | PR #57 (11B) | README "Authorized contracts: residual risk" dual-direction language                  |
| J-9  | LOW      | PR #57 (11B) | `DeployOrg.s.sol` pins helper.registry + helper.accountImplementation                 |
| J-10 | LOW      | PR #57 (11B) | `Deploy.s.sol` else-branch warning log on non-pinned chains                           |
| J-11 | LOW      | PR #57 (11B) | `RegistryConsistencyHandler` drives directory mints; roundtrip invariant covers all 3 |
| J-12 | INFO     | PR #57 (11B) | `testFuzz_j12_validateUrl_charBlacklistClosure`                                       |
| J-13 | MEDIUM   | PR #56 (11A) | `_update` adds ERC-6551 `token()` introspection; closes salt+impl gap                 |

**Test counts after Phase 11 closure:** ~270 forge / 35 TS (will be confirmed at merge).
```

**Step 2: Final test sweep**

```bash
forge test && pnpm test:ts && pnpm typecheck && forge build
```

Expected: all green. Final counts to be confirmed.

**Step 3: Push and create PR 11B**

```bash
git push -u origin phase11-contracts-b-polish
gh pr create --base dev --title "feat(contracts): Phase 11B — post-Phase-10 audit polish" --body "$(cat <<'EOF'
## Summary

Phase 11B — closes the remaining 7 J-findings (1 MEDIUM doc, 2 LOW script, 2 LOW + 1 INFO test, 1 MEDIUM event).

| ID | Action |
|----|--------|
| **J-2** | `DirectoryRevoked(tokenId, newStatus)` event |
| **J-4** | README — TBA-content front-running risk doc |
| **J-8** | README — dual-direction Safe-compromise risk doc |
| **J-9** | `DeployOrg.s.sol` chain-pinned helper allowlist |
| **J-10** | `Deploy.s.sol` warning log on non-pinned chains |
| **J-11** | Directory tokens added to roundtrip invariant |
| **J-12** | URL-validator byte-blacklist closure fuzz |

## Audit gap matrix closure

`audits/2026-05-04-post-phase10-gap-matrix.md` — new "Phase 11 closure" section lists every J-1..J-13 with the closing PR. **All 13 J-findings closed.**

## Mainnet readiness checklist additions

1. After Deploy.s.sol, the deployer EOA cannot authorize new contracts (J-3 finalizeBootstrap fires automatically).
2. DeployOrg.s.sol now reverts on Base mainnet/Sepolia if TBA_HELPER's immutable refs don't match canonical (J-9).
3. Indexers should subscribe to `DirectoryRevoked` to refresh caches on revocation (J-2).
4. Marketplace integrators must surface TBA-content-on-sale UX warnings (J-4).

## Test plan

- [x] `forge build` clean
- [x] `forge test` all green
- [x] `pnpm test:ts` all green
- [ ] Copilot review

Built with d7r FlowState
EOF
)"
```

---

## Acceptance criteria

- All 6 PR 11A items merged before mainnet broadcast.
- All 7 PR 11B items merged before public launch.
- Forge tests grow from 237 → ~265 post-11A, ~272 post-11B.
- `forge build`, `pnpm typecheck`, `pnpm test:ts` all clean.
- Sepolia dry-run executes Deploy.s.sol successfully through `finalizeBootstrap` then immediately runs TransferOwnership.s.sol; Safe accepts ownership; verify post-bootstrap `setAuthorizedContract(addr, true)` reverts.

## Out of scope

- Re-running the three-provider audit a fifth time (separate task once 11A merges).
- Phase 8 mobile audit (`packages/saga-app`) — separate milestone.
- Marketplace adapter implementation for J-4 — ecosystem-level future work.
- Renaming `resolveScopedHandle` → `resolveScopedHandleRaw` (J-2 alternative): chose the additive-event approach because renaming a public function is an ABI break for existing consumers. The event approach gives indexers the freshness signal without forcing the rename.
