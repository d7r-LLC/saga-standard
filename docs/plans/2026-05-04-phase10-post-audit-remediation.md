# Phase 10 — Post-Phase-9 Audit Remediation Implementation Plan

**Goal:** Close the 7 HIGH and 5 strongly-recommended MEDIUM findings from the post-Phase-9 three-provider re-audit (`audits/2026-05-04-post-phase9-gap-matrix.md`). Tighten three Phase 9 over/under-scoped closures (G-1, G-5+G-11, G-6) plus surface 4 pre-existing items that finally got flagged.

**Architecture:** Three PRs against `dev`:

- **PR 10A (mainnet-blocking):** H-1, H-2, H-3, H-4, H-5, H-6, H-7 — 7 items, ~80 LOC + tests
- **PR 10B (recommended):** M-1, M-2, M-3, M-4, M-8 — 5 items
- **PR 10C (test/doc):** M-5, M-6, M-7, L-1..L-3, I-1..I-4 — deferred to post-launch

**Tech Stack:** Solidity 0.8.24 (Cancun), OZ v5.6.1, Foundry. TS bindings via tsup + vitest.

---

## PR 10A — Mainnet-blocking remediations (7 findings)

### Task 1: Scope `_isAuthorized` governance bypass to flagged/revoked only (H-1)

**Files:**

- Modify: `packages/contracts/src/SAGADirectoryIdentity.sol:356-369`
- Test: `packages/contracts/test/SAGADirectoryIdentity.t.sol`

**Step 1: Failing test**

```solidity
function test_h1_governanceCannotTransferActiveDirectory() public {
    vm.prank(user1);
    uint256 tokenId = directory.registerDirectory(
        "active-h1", "https://x.example/", makeAddr("op"), "basic"
    );
    // Status is "active" by default
    // address(this) is the contract owner from setUp
    vm.expectRevert(); // ERC721InsufficientApproval — owner has no special spender rights here
    directory.transferFrom(user1, user2, tokenId);
}

function test_h1_governanceCannotTransferSuspendedDirectory() public {
    vm.prank(user1);
    uint256 tokenId = directory.registerDirectory(
        "susp-h1", "https://x.example/", makeAddr("op"), "basic"
    );
    directory.updateDirectoryStatus(tokenId, "suspended");
    vm.expectRevert();
    directory.transferFrom(user1, user2, tokenId);
}
```

**Step 2: Tighten the override**

```solidity
function _isAuthorized(address tokenOwner, address spender, uint256 tokenId)
    internal
    view
    override
    returns (bool)
{
    if (spender == owner() && spender != address(0)) {
        // Phase 10 (H-1): scope governance bypass to rank >= 2 only.
        // Active and suspended directories require normal owner-or-approved
        // authorization. The bypass exists for governance recovery on
        // flagged/revoked tokens (G-1); previously over-scoped to ALL.
        if (_statusRank(_statuses[tokenId]) >= 2) {
            return true;
        }
    }
    return super._isAuthorized(tokenOwner, spender, tokenId);
}
```

**Step 3: Verify existing G-1 tests still pass.** `test_g1_governanceCanTransferFlaggedDirectory` and `test_g1_governanceCanTransferRevokedDirectory` rely on rank-2/3 status which still bypasses. `test_g1_tokenOwnerStillBlockedOnFlagged` is unchanged.

---

### Task 2: Add `trustedDirectoryContracts` check to `resolveActiveScopedHandle` (H-2)

**Files:**

- Modify: `packages/contracts/src/SAGAHandleRegistry.sol:224-246`
- Test: `packages/contracts/test/SAGAHandleRegistry.t.sol`

**Step 1: Failing test**

```solidity
function test_h2_resolveActiveScopedHandle_revertsWhenContractDetrusted() public {
    StatusMutableMock mut = new StatusMutableMock();
    mut.setStatus("active");
    registry.setAuthorizedContract(address(mut), true);
    registry.setTrustedDirectoryContract(address(mut), true);

    vm.prank(address(mut));
    registry.registerHandle("h2-dir", SAGAHandleRegistry.EntityType.DIRECTORY, 300);
    vm.prank(authorizedContract);
    registry.registerScopedHandle(
        "alice", SAGAHandleRegistry.EntityType.AGENT, 0, "h2-dir"
    );

    // Sanity: succeeds while trusted
    registry.resolveActiveScopedHandle("alice", "h2-dir");

    // Detrust the directory contract
    registry.setTrustedDirectoryContract(address(mut), false);

    // resolveActiveScopedHandle MUST now reject (mut still returns "active"
    // but it's no longer trustworthy).
    vm.expectRevert(bytes("SAGAHandleRegistry: untrusted directory contract"));
    registry.resolveActiveScopedHandle("alice", "h2-dir");
}
```

**Step 2: Add the check**

In `resolveActiveScopedHandle` (after the `dir not found` require, before the status keccak):

```solidity
require(
    trustedDirectoryContracts[dirRecord.contractAddress],
    "SAGAHandleRegistry: untrusted directory contract"
);
```

Mirrors the gate in `registerScopedHandle:158-162`.

---

### Task 3: Honest G-2 docstring (H-3)

**Files:**

- Modify: `packages/contracts/src/SAGAHandleRegistry.sol:265-285` (`_validateHandle` natspec)

**Step 1: Rewrite the docstring** to honestly describe what was shipped. The fix is anti-spam (no `..` `--` `__`), NOT anti-homoglyph. Update the @notice/@dev to say so explicitly. No code change.

**Step 2: README** — add a paragraph to `packages/contracts/README.md` Security Notes section explicitly stating handle similarity is an off-chain UX concern, not on-chain enforced.

---

### Task 4: Reject control bytes / HTML metacharacters in `validateUrl` (H-4)

**Files:**

- Modify: `packages/contracts/src/SAGAValidation.sol`
- Test: `packages/contracts/test/SAGAValidation.t.sol`

**Step 1: Failing fuzz**

```solidity
function test_h4_validateUrl_rejectsControlBytes() public {
    bytes[6] memory bad = [
        bytes("https://\x00example.com"),
        bytes("https:// example.com"),
        bytes("https://\nexample.com"),
        bytes("https://\texample.com"),
        bytes("https://\\example.com"),
        bytes('https://"example.com')
    ];
    for (uint256 i = 0; i < bad.length; i++) {
        vm.expectRevert();
        SAGAValidation.validateUrl(string(bad[i]));
    }
}
```

**Step 2: Add byte scan**

In `validateUrl`, after the prefix check + length check, walk every byte:

```solidity
for (uint256 i = 0; i < len; i++) {
    bytes1 c = b[i];
    // Phase 10 (H-4): reject control bytes (<=0x20, 0x7F), backslash,
    // and HTML metacharacters that confuse off-chain consumers
    // rendering URLs into HTML/JSON. Multi-byte UTF-8 (>=0x80) is
    // permitted because RFC 3987 IDN domains rely on it.
    if (
        c <= 0x20 || c == 0x7F || c == 0x5C
            || c == 0x22 || c == 0x27 || c == 0x3C || c == 0x3E
    ) {
        revert InvalidUrlCharacter();
    }
}
```

Add `error InvalidUrlCharacter();` near the other custom errors.

**Step 3: Verify** existing valid URLs still pass — `https://example.com/path?query=1#frag` etc. The set of rejected bytes is `{0x00..0x20, 0x22, 0x27, 0x3C, 0x3E, 0x5C, 0x7F}`. RFC 3986 reserved chars `: / ? # [ ] @ ! $ & ( ) * + , ; =` and unreserved `- . _ ~` plus alphanumerics all stay valid.

---

### Task 5: Allow `DEPLOY_DIRECT=true` in deploy entrypoint (H-5)

**Files:**

- Modify: `packages/contracts/scripts/deploy-entrypoint.sh`

**Step 1: Read existing script** to find the Safe-routing branch (around line 111-144 per Gemini finding).

**Step 2:** Add an early bypass:

```bash
# Phase 10 (H-5): allow factory deploys to broadcast directly from the
# deployer EOA even when SAFE_THRESHOLD > 1. The Safe accepts ownership
# afterward via TransferOwnership.s.sol; the initial Deploy.s.sol uses
# `new Contract()` (raw CREATE) which Safe MultiSend cannot execute.
if [ "${DEPLOY_DIRECT:-false}" = "true" ]; then
    echo "DEPLOY_DIRECT=true — bypassing Safe-routing for initial CREATE deploy"
    SAFE_THRESHOLD_EFFECTIVE=1
else
    SAFE_THRESHOLD_EFFECTIVE="${SAFE_THRESHOLD:-1}"
fi
```

Then use `SAFE_THRESHOLD_EFFECTIVE` in the routing decision. **Step 3: README** — document the flag in the Deploy section.

---

### Task 6: Fix `renounceOwnership` overrides (H-6)

**Files:**

- Modify: `packages/contracts/src/SAGAHandleRegistry.sol:75`, `SAGAAgentIdentity.sol:87`, `SAGAOrgIdentity.sol:71`, `SAGADirectoryIdentity.sol:83`
- Test: regression in each `*.t.sol`

**Step 1: Failing test (each contract)**

```solidity
function test_h6_renounceOwnership_revertsForNonOwnerWithSameMessage() public {
    vm.prank(makeAddr("randomEoa"));
    vm.expectRevert(bytes("SAGAHandleRegistry: renounce disabled"));
    registry.renounceOwnership();
}
```

The current code FAILS this test — non-owner gets `OwnableUnauthorizedAccount`.

**Step 2: Drop `view` and `onlyOwner`**

```solidity
function renounceOwnership() public override {
    revert("SAGAHandleRegistry: renounce disabled");
}
```

(×4 contracts, with each contract's own message.)

---

### Task 7: Pin canonical ERC-6551 registry on Base mainnet/Sepolia (H-7)

**Files:**

- Modify: `packages/contracts/script/Deploy.s.sol`

**Step 1: Add pin** after the existing TBA implementation pin block:

```solidity
// Phase 10 (H-7): G-6 hard-pinned the Tokenbound implementation on
// Base mainnet/Sepolia, but left ERC6551_REGISTRY unpinned — same
// misconfiguration class on the other half of the helper's immutable
// references. Pin both.
address canonical6551Registry = 0x000000006551c19487814612e58FE06813775758;
if (block.chainid == 8453) {
    require(
        erc6551Registry == canonical6551Registry,
        "Base mainnet ERC6551_REGISTRY mismatch"
    );
} else if (block.chainid == 84532) {
    require(
        erc6551Registry == canonical6551Registry,
        "Base Sepolia ERC6551_REGISTRY mismatch"
    );
}
```

The `vm.envOr` default already uses the canonical address, so this only fires if someone explicitly sets `ERC6551_REGISTRY` to a wrong value.

---

### Task 8: Run full forge + TS suites, push, create PR 10A

```bash
forge test
pnpm test:ts
forge build
git push -u origin phase10-contracts-a-blockers
gh pr create --base dev --title "feat(contracts): Phase 10A — post-Phase-9 audit blockers" --body "..."
```

Expected post-fix counts: 202 → ~210 forge tests, 33 → 33 TS tests (no TS surface change).

---

## PR 10B — Strongly recommended hardening (5 findings)

### Task 9: Timelock on `setAuthorizedContract` and `setTrustedDirectoryContract` (M-1)

Mirror the G-8 pattern: rename current setters to `queue*`, add `apply*` after 24h timelock, emit `*Queued` event. This is the largest single piece (~60 LOC).

### Task 10: Re-validate URL inside `applyBaseURI` (M-2)

3-line addition × 3 contracts. Re-run `SAGAValidation.validateUrl(_pendingBaseURI)` immediately before `_baseTokenURI = _pendingBaseURI`.

### Task 11: Use `_isAuthorized` for metadata setters (M-3)

Replace `require(ownerOf(tokenId) == msg.sender)` with `require(_isAuthorized(_ownerOf(tokenId), msg.sender, tokenId))` in:

- `SAGAAgentIdentity.updateHomeHub`
- `SAGAOrgIdentity.updateOrgName`
- `SAGADirectoryIdentity.updateDirectoryUrl`
- `SAGADirectoryIdentity.updateDirectoryStatus` (NFT-owner branch only)

Add operator-workflow tests using `setApprovalForAll`. Interacts with H-1: confirm scoped governance bypass still works for status updates on rank>=2 directories.

### Task 12: `setAuthorizedContract` requires contract (M-4)

```solidity
function setAuthorizedContract(address addr, bool authorized) external onlyOwner {
    if (authorized) {
        require(addr.code.length > 0, "SAGAHandleRegistry: authorized must be contract");
    }
    authorizedContracts[addr] = authorized;
    emit AuthorizedContractSet(addr, authorized);
}
```

### Task 13: Export `SAGATBAHelper` from TS bindings (M-8)

Add to `scripts/generate-abis.mjs` TARGETS list, regenerate, add `getTBAHelperConfig()` in `clients.ts`, add ABI freshness assertions in `abis.test.ts`.

### Task 14: Run suites + push + PR 10B

---

## PR 10C — Test/doc hardening (deferred)

Single PR after 10A+10B merge:

- M-5: independent self-TBA computation in invariant test
- M-6: defense-in-depth status check OR doc trust chain
- M-7: empty-status handling in `_statusRank`
- L-1, L-2, L-3, I-1, I-2, I-3 per gap matrix
- Final regen of audit gap matrix marking H-1..H-7 + M-1..M-8 closed; M-5..M-7, L-_, I-_ per their decisions

---

## Acceptance criteria

- All 7 PR 10A items merged before mainnet broadcast
- All 5 PR 10B items merged before public launch
- 202 → ~210 forge tests post-10A; ~215 post-10B
- `forge build` clean; `pnpm test:ts` clean; `pnpm typecheck` clean
- Sepolia dry-run reproduces deploy + ownership transfer with the new H-5 / H-7 deploy script
- Audit gap matrix `audits/2026-05-04-post-phase9-gap-matrix.md` updated with closure section after 10C

## Out of scope

- Re-running the three-provider audit a fourth time
- Phase 8 mobile audit (`packages/saga-app`)
- Full RFC 3986/3987 URL parser on-chain (H-4 fix is byte-blacklist only)
