> **FlowState Document:** `docu_nsDlUgxqpF`

# Phase 7A: Directory Identity Contract & Handle Scoping — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create an on-chain `SAGADirectoryIdentity` ERC-721 contract that mints directory NFTs, update the handle registry to scope handles by `(directoryId, handle)`, update agent/org identity contracts to pass `directoryId`, and export TypeScript bindings.

**Architecture:** New ERC-721 contract for directories with immutable `directoryId` strings. Handle registry gains a `DIRECTORY` entity type and a new `_scopedHandles` mapping keyed by `keccak256(directoryId, toLower(handle))`. Existing global handles remain accessible via a default `""` directoryId for backward compatibility. Agent and org registration functions gain an optional `directoryId` parameter. Deploy script is extended to deploy the directory contract and authorize it.

**Tech Stack:** Solidity 0.8.24, OpenZeppelin 5.x (ERC721Enumerable, Ownable), Foundry/forge for testing, TypeScript + viem for bindings, tsup for bundling.

**Worktree:** `.worktrees/feat-directory-nft` on branch `feat/directory-nft`

---

## File Structure

| Action | File                                                  | Responsibility                                                                                            |
| ------ | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Create | `packages/contracts/src/SAGADirectoryIdentity.sol`    | ERC-721 contract for directory NFTs                                                                       |
| Modify | `packages/contracts/src/SAGAHandleRegistry.sol`       | Add `DIRECTORY` entity type, scoped handle registration/resolution, backward-compatible global resolution |
| Modify | `packages/contracts/src/SAGAAgentIdentity.sol`        | Add `registerAgentInDirectory(handle, hubUrl, directoryId)` function                                      |
| Modify | `packages/contracts/src/SAGAOrgIdentity.sol`          | Add `registerOrgInDirectory(handle, name, directoryId)` function                                          |
| Modify | `packages/contracts/script/Deploy.s.sol`              | Deploy `SAGADirectoryIdentity`, authorize on registry                                                     |
| Create | `packages/contracts/test/SAGADirectoryIdentity.t.sol` | Forge tests for directory NFT contract                                                                    |
| Modify | `packages/contracts/test/SAGAHandleRegistry.t.sol`    | Tests for scoped handle registration/resolution                                                           |
| Modify | `packages/contracts/test/SAGAAgentIdentity.t.sol`     | Tests for `registerAgentInDirectory`                                                                      |
| Modify | `packages/contracts/test/SAGAOrgIdentity.t.sol`       | Tests for `registerOrgInDirectory`                                                                        |
| Modify | `packages/contracts/src/ts/types.ts`                  | Add `DIRECTORY` entity type, `DirectoryIdentity` interface                                                |
| Modify | `packages/contracts/src/ts/addresses.ts`              | Add `SAGADirectoryIdentity` to `ContractName` and address maps                                            |
| Modify | `packages/contracts/src/ts/clients.ts`                | Add `getDirectoryIdentityConfig()` helper                                                                 |
| Modify | `packages/contracts/src/ts/index.ts`                  | Re-export new ABI, config, and types                                                                      |

---

### Task 1: Add `DIRECTORY` Entity Type to Handle Registry

**Files:**

- Modify: `packages/contracts/src/SAGAHandleRegistry.sol:10-14` (EntityType enum)
- Modify: `packages/contracts/test/SAGAHandleRegistry.t.sol`

This task adds the `DIRECTORY` entity type to the existing enum so the registry can track directory handles alongside agents and orgs. No scoped-handle logic yet — just the enum addition and a test confirming it works.

- [ ] **Step 1: Write the failing test**

Add to `packages/contracts/test/SAGAHandleRegistry.t.sol` after the existing tests:

```solidity
// --- Test 16: register DIRECTORY entity type ---
function test_registerHandle_directoryType() public {
    vm.prank(authorizedContract);
    registry.registerHandle("epic-hub", SAGAHandleRegistry.EntityType.DIRECTORY, 0);

    (SAGAHandleRegistry.EntityType entityType, uint256 tokenId, address contractAddr) =
        registry.resolveHandle("epic-hub");

    assertEq(uint256(entityType), uint256(SAGAHandleRegistry.EntityType.DIRECTORY));
    assertEq(tokenId, 0);
    assertEq(contractAddr, authorizedContract);
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/contracts && forge test --match-test test_registerHandle_directoryType -vvv`
Expected: Compilation error — `DIRECTORY` is not a member of `EntityType`

- [ ] **Step 3: Add DIRECTORY to the EntityType enum**

In `packages/contracts/src/SAGAHandleRegistry.sol`, change lines 10-14 from:

```solidity
enum EntityType {
    NONE,
    AGENT,
    ORG
}
```

to:

```solidity
enum EntityType {
    NONE,
    AGENT,
    ORG,
    DIRECTORY
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/contracts && forge test --match-test test_registerHandle_directoryType -vvv`
Expected: PASS

- [ ] **Step 5: Run full test suite to verify no regressions**

Run: `cd packages/contracts && forge test -vvv`
Expected: All existing tests + new test pass

- [ ] **Step 6: Commit**

```bash
git add packages/contracts/src/SAGAHandleRegistry.sol packages/contracts/test/SAGAHandleRegistry.t.sol
git commit -m "feat(contracts): add DIRECTORY entity type to SAGAHandleRegistry"
```

---

### Task 2: Add Scoped Handle Registration to Handle Registry

**Files:**

- Modify: `packages/contracts/src/SAGAHandleRegistry.sol` (new mapping, new functions)
- Modify: `packages/contracts/test/SAGAHandleRegistry.t.sol`

This task adds `registerScopedHandle(handle, entityType, tokenId, directoryId)` and `resolveScopedHandle(handle, directoryId)` functions. The existing `registerHandle` and `resolveHandle` functions remain untouched for backward compatibility — they operate on the global (empty-string directoryId) namespace.

**Design decision:** Scoped handles use a separate mapping `_scopedHandles` keyed by `keccak256(abi.encodePacked(directoryId, _toLower(handle)))`. This keeps the existing `_handles` mapping intact for backward compatibility while enabling same handles in different directories.

- [ ] **Step 1: Write failing tests for scoped handle registration**

Add to `packages/contracts/test/SAGAHandleRegistry.t.sol`:

```solidity
// --- Test 17: registerScopedHandle success ---
function test_registerScopedHandle_success() public {
    vm.prank(authorizedContract);
    registry.registerScopedHandle("marcus", SAGAHandleRegistry.EntityType.AGENT, 0, "epic-hub");

    (SAGAHandleRegistry.EntityType entityType, uint256 tokenId, address contractAddr) =
        registry.resolveScopedHandle("marcus", "epic-hub");

    assertEq(uint256(entityType), uint256(SAGAHandleRegistry.EntityType.AGENT));
    assertEq(tokenId, 0);
    assertEq(contractAddr, authorizedContract);
}

// --- Test 18: same handle in different directories succeeds ---
function test_registerScopedHandle_sameHandleDifferentDirs() public {
    vm.prank(authorizedContract);
    registry.registerScopedHandle("marcus", SAGAHandleRegistry.EntityType.AGENT, 0, "dir-a");

    vm.prank(authorizedContract);
    registry.registerScopedHandle("marcus", SAGAHandleRegistry.EntityType.AGENT, 1, "dir-b");

    (SAGAHandleRegistry.EntityType etA, uint256 tidA,) =
        registry.resolveScopedHandle("marcus", "dir-a");
    (SAGAHandleRegistry.EntityType etB, uint256 tidB,) =
        registry.resolveScopedHandle("marcus", "dir-b");

    assertEq(tidA, 0);
    assertEq(tidB, 1);
    assertEq(uint256(etA), uint256(SAGAHandleRegistry.EntityType.AGENT));
    assertEq(uint256(etB), uint256(SAGAHandleRegistry.EntityType.AGENT));
}

// --- Test 19: duplicate scoped handle in same directory reverts ---
function test_registerScopedHandle_duplicateReverts() public {
    vm.prank(authorizedContract);
    registry.registerScopedHandle("taken", SAGAHandleRegistry.EntityType.AGENT, 0, "dir-a");

    vm.prank(authorizedContract);
    vm.expectRevert("SAGAHandleRegistry: handle taken in directory");
    registry.registerScopedHandle("taken", SAGAHandleRegistry.EntityType.ORG, 1, "dir-a");
}

// --- Test 20: scoped handle case insensitive ---
function test_registerScopedHandle_caseInsensitive() public {
    vm.prank(authorizedContract);
    registry.registerScopedHandle("Marcus", SAGAHandleRegistry.EntityType.AGENT, 0, "dir-a");

    vm.prank(authorizedContract);
    vm.expectRevert("SAGAHandleRegistry: handle taken in directory");
    registry.registerScopedHandle("marcus", SAGAHandleRegistry.EntityType.AGENT, 1, "dir-a");
}

// --- Test 21: resolveScopedHandle not found reverts ---
function test_resolveScopedHandle_notFoundReverts() public {
    vm.expectRevert("SAGAHandleRegistry: not found in directory");
    registry.resolveScopedHandle("nonexistent", "dir-a");
}

// --- Test 22: scopedHandleExists true/false ---
function test_scopedHandleExists() public {
    assertFalse(registry.scopedHandleExists("test-handle", "dir-a"));

    vm.prank(authorizedContract);
    registry.registerScopedHandle("test-handle", SAGAHandleRegistry.EntityType.AGENT, 0, "dir-a");

    assertTrue(registry.scopedHandleExists("test-handle", "dir-a"));
    assertFalse(registry.scopedHandleExists("test-handle", "dir-b"));
}

// --- Test 23: scoped registration emits event ---
function test_registerScopedHandle_emitsEvent() public {
    vm.prank(authorizedContract);
    vm.expectEmit(true, false, false, true);
    emit ScopedHandleRegistered(
        keccak256(abi.encodePacked("dir-a", "event-scoped")),
        "event-scoped",
        "dir-a",
        SAGAHandleRegistry.EntityType.AGENT,
        42,
        authorizedContract
    );
    registry.registerScopedHandle(
        "event-scoped", SAGAHandleRegistry.EntityType.AGENT, 42, "dir-a"
    );
}

// --- Test 24: unauthorized caller on scoped registration reverts ---
function test_registerScopedHandle_unauthorizedReverts() public {
    vm.prank(unauthorizedUser);
    vm.expectRevert("SAGAHandleRegistry: unauthorized");
    registry.registerScopedHandle("test", SAGAHandleRegistry.EntityType.AGENT, 0, "dir-a");
}

// --- Test 25: global and scoped handles are independent ---
function test_globalAndScopedIndependent() public {
    // Register globally
    vm.prank(authorizedContract);
    registry.registerHandle("shared", SAGAHandleRegistry.EntityType.AGENT, 0);

    // Register same handle in a directory — should succeed
    vm.prank(authorizedContract);
    registry.registerScopedHandle("shared", SAGAHandleRegistry.EntityType.AGENT, 1, "dir-a");

    (, uint256 globalTid,) = registry.resolveHandle("shared");
    (, uint256 scopedTid,) = registry.resolveScopedHandle("shared", "dir-a");

    assertEq(globalTid, 0);
    assertEq(scopedTid, 1);
}
```

Also add the event declaration at the top of the test contract (after the existing event declarations):

```solidity
event ScopedHandleRegistered(
    bytes32 indexed scopedKey,
    string handle,
    string directoryId,
    SAGAHandleRegistry.EntityType entityType,
    uint256 tokenId,
    address contractAddress
);
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/contracts && forge test --match-contract SAGAHandleRegistryTest -vvv`
Expected: Compilation errors — `registerScopedHandle`, `resolveScopedHandle`, `scopedHandleExists` do not exist

- [ ] **Step 3: Implement scoped handle functions**

In `packages/contracts/src/SAGAHandleRegistry.sol`, add the following:

After the `_handles` mapping (line 24), add:

```solidity
/// @notice scoped handle key (directoryId + handle hash) → record
mapping(bytes32 => HandleRecord) internal _scopedHandles;
```

After the `HandleRegistered` event (line 35), add:

```solidity
event ScopedHandleRegistered(
    bytes32 indexed scopedKey,
    string handle,
    string directoryId,
    EntityType entityType,
    uint256 tokenId,
    address contractAddress
);
```

After the existing `registerHandle` function (after line 76), add:

```solidity
/// @notice Register a handle scoped to a specific directory. Only authorized contracts can call this.
/// @param handle The handle string (3-64 chars, validated)
/// @param entityType The type of entity (AGENT, ORG, or DIRECTORY)
/// @param tokenId The token ID in the calling contract
/// @param directoryId The directory this handle belongs to
function registerScopedHandle(
    string calldata handle,
    EntityType entityType,
    uint256 tokenId,
    string calldata directoryId
) external {
    require(authorizedContracts[msg.sender], "SAGAHandleRegistry: unauthorized");
    require(entityType != EntityType.NONE, "SAGAHandleRegistry: invalid entity type");
    _validateHandle(handle);

    bytes32 key = _scopedHandleKey(handle, directoryId);
    require(
        _scopedHandles[key].entityType == EntityType.NONE,
        "SAGAHandleRegistry: handle taken in directory"
    );

    _scopedHandles[key] = HandleRecord({
        entityType: entityType,
        tokenId: tokenId,
        contractAddress: msg.sender,
        registeredAt: block.timestamp
    });

    emit ScopedHandleRegistered(key, handle, directoryId, entityType, tokenId, msg.sender);
}
```

After the existing `handleExists` function (after line 95), add:

```solidity
/// @notice Resolve a handle within a specific directory
function resolveScopedHandle(string calldata handle, string calldata directoryId)
    external
    view
    returns (EntityType entityType, uint256 tokenId, address contractAddress)
{
    bytes32 key = _scopedHandleKey(handle, directoryId);
    HandleRecord memory record = _scopedHandles[key];
    require(record.entityType != EntityType.NONE, "SAGAHandleRegistry: not found in directory");
    return (record.entityType, record.tokenId, record.contractAddress);
}

/// @notice Check if a handle exists within a specific directory
function scopedHandleExists(string calldata handle, string calldata directoryId)
    external
    view
    returns (bool)
{
    return _scopedHandles[_scopedHandleKey(handle, directoryId)].entityType != EntityType.NONE;
}
```

In the Internal section, after `_handleKey` (after line 102), add:

```solidity
/// @dev Compute scoped handle key: keccak256(directoryId + toLower(handle))
function _scopedHandleKey(string calldata handle, string calldata directoryId)
    internal
    pure
    returns (bytes32)
{
    return keccak256(abi.encodePacked(directoryId, _toLower(handle)));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/contracts && forge test --match-contract SAGAHandleRegistryTest -vvv`
Expected: All 25 tests pass

- [ ] **Step 5: Run full suite to verify no regressions**

Run: `cd packages/contracts && forge test -vvv`
Expected: All tests pass across all contracts

- [ ] **Step 6: Commit**

```bash
git add packages/contracts/src/SAGAHandleRegistry.sol packages/contracts/test/SAGAHandleRegistry.t.sol
git commit -m "feat(contracts): add scoped handle registration to SAGAHandleRegistry"
```

---

### Task 3: Create SAGADirectoryIdentity ERC-721 Contract

**Files:**

- Create: `packages/contracts/src/SAGADirectoryIdentity.sol`
- Create: `packages/contracts/test/SAGADirectoryIdentity.t.sol`

This task creates the new ERC-721 contract. Each minted NFT represents a SAGA directory. The `directoryId` is a short human-readable string (3-32 chars, alphanumeric + hyphens), globally unique on-chain. Stores URL, operator wallet, conformance level, and status. Uses the handle registry to register the directoryId as a `DIRECTORY` entity type in the global namespace.

- [ ] **Step 1: Write the test file**

Create `packages/contracts/test/SAGADirectoryIdentity.t.sol`:

```solidity
// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {SAGAHandleRegistry} from "../src/SAGAHandleRegistry.sol";
import {SAGADirectoryIdentity} from "../src/SAGADirectoryIdentity.sol";
import {SAGAAgentIdentity} from "../src/SAGAAgentIdentity.sol";
import {IERC721Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";

contract SAGADirectoryIdentityTest is Test {
    SAGAHandleRegistry public registry;
    SAGADirectoryIdentity public directory;
    SAGAAgentIdentity public agent;
    address public deployer;
    address public user1;
    address public user2;

    event DirectoryRegistered(
        uint256 indexed tokenId,
        string directoryId,
        address indexed operator,
        string url,
        string conformanceLevel,
        uint256 registeredAt
    );

    event DirectoryUrlUpdated(uint256 indexed tokenId, string oldUrl, string newUrl);
    event DirectoryStatusUpdated(uint256 indexed tokenId, string oldStatus, string newStatus);

    function setUp() public {
        deployer = address(this);
        user1 = address(0x1);
        user2 = address(0x2);

        registry = new SAGAHandleRegistry();
        directory = new SAGADirectoryIdentity(address(registry));
        agent = new SAGAAgentIdentity(address(registry));

        registry.setAuthorizedContract(address(directory), true);
        registry.setAuthorizedContract(address(agent), true);
    }

    // --- Test 1: registerDirectory success ---
    function test_registerDirectory_success() public {
        vm.prank(user1);
        uint256 tokenId = directory.registerDirectory(
            "epic-hub", "https://hub.epic.com", user1, "full"
        );

        assertEq(tokenId, 0);
        assertEq(directory.ownerOf(tokenId), user1);
        assertEq(directory.directoryId(tokenId), "epic-hub");
        assertEq(directory.directoryUrl(tokenId), "https://hub.epic.com");
        assertEq(directory.operatorWallet(tokenId), user1);
        assertEq(directory.conformanceLevel(tokenId), "full");
        assertEq(directory.directoryStatus(tokenId), "active");
    }

    // --- Test 2: directory registered in global handle namespace ---
    function test_registerDirectory_registersInHandleRegistry() public {
        vm.prank(user1);
        directory.registerDirectory("epic-hub", "https://hub.epic.com", user1, "full");

        (SAGAHandleRegistry.EntityType entityType, uint256 tokenId, address contractAddr) =
            registry.resolveHandle("epic-hub");

        assertEq(uint256(entityType), uint256(SAGAHandleRegistry.EntityType.DIRECTORY));
        assertEq(tokenId, 0);
        assertEq(contractAddr, address(directory));
    }

    // --- Test 3: duplicate directoryId reverts ---
    function test_registerDirectory_duplicateReverts() public {
        vm.prank(user1);
        directory.registerDirectory("taken-dir", "https://hub1.com", user1, "full");

        vm.prank(user2);
        vm.expectRevert("SAGAHandleRegistry: handle taken");
        directory.registerDirectory("taken-dir", "https://hub2.com", user2, "full");
    }

    // --- Test 4: directoryId conflicts with agent handle ---
    function test_registerDirectory_conflictsWithAgent() public {
        vm.prank(user1);
        agent.registerAgent("shared-name", "https://hub.com");

        vm.prank(user2);
        vm.expectRevert("SAGAHandleRegistry: handle taken");
        directory.registerDirectory("shared-name", "https://dir.com", user2, "full");
    }

    // --- Test 5: token ID increments ---
    function test_registerDirectory_tokenIdIncremental() public {
        vm.prank(user1);
        uint256 id0 = directory.registerDirectory("dir-0", "https://hub0.com", user1, "full");

        vm.prank(user2);
        uint256 id1 = directory.registerDirectory("dir-1", "https://hub1.com", user2, "basic");

        assertEq(id0, 0);
        assertEq(id1, 1);
    }

    // --- Test 6: emits DirectoryRegistered event ---
    function test_registerDirectory_emitsEvent() public {
        vm.prank(user1);
        vm.expectEmit(true, true, false, true);
        emit DirectoryRegistered(0, "event-dir", user1, "https://hub.com", "full", block.timestamp);
        directory.registerDirectory("event-dir", "https://hub.com", user1, "full");
    }

    // --- Test 7: empty URL reverts ---
    function test_registerDirectory_emptyUrlReverts() public {
        vm.prank(user1);
        vm.expectRevert("SAGADirectoryIdentity: invalid url");
        directory.registerDirectory("no-url", "", user1, "full");
    }

    // --- Test 8: zero operator reverts ---
    function test_registerDirectory_zeroOperatorReverts() public {
        vm.prank(user1);
        vm.expectRevert("SAGADirectoryIdentity: invalid operator");
        directory.registerDirectory("no-op", "https://hub.com", address(0), "full");
    }

    // --- Test 9: empty conformance level reverts ---
    function test_registerDirectory_emptyConformanceReverts() public {
        vm.prank(user1);
        vm.expectRevert("SAGADirectoryIdentity: invalid conformance");
        directory.registerDirectory("no-conf", "https://hub.com", user1, "");
    }

    // --- Test 10: updateDirectoryUrl success ---
    function test_updateDirectoryUrl_success() public {
        vm.prank(user1);
        uint256 tokenId = directory.registerDirectory(
            "url-update", "https://old.com", user1, "full"
        );

        vm.prank(user1);
        directory.updateDirectoryUrl(tokenId, "https://new.com");

        assertEq(directory.directoryUrl(tokenId), "https://new.com");
    }

    // --- Test 11: updateDirectoryUrl non-owner reverts ---
    function test_updateDirectoryUrl_nonOwnerReverts() public {
        vm.prank(user1);
        uint256 tokenId = directory.registerDirectory(
            "no-update", "https://hub.com", user1, "full"
        );

        vm.prank(user2);
        vm.expectRevert("SAGADirectoryIdentity: not owner");
        directory.updateDirectoryUrl(tokenId, "https://hacked.com");
    }

    // --- Test 12: updateDirectoryStatus by owner ---
    function test_updateDirectoryStatus_success() public {
        vm.prank(user1);
        uint256 tokenId = directory.registerDirectory(
            "status-test", "https://hub.com", user1, "full"
        );

        vm.prank(user1);
        directory.updateDirectoryStatus(tokenId, "suspended");

        assertEq(directory.directoryStatus(tokenId), "suspended");
    }

    // --- Test 13: updateDirectoryStatus contract owner can also update ---
    function test_updateDirectoryStatus_contractOwnerCanUpdate() public {
        vm.prank(user1);
        uint256 tokenId = directory.registerDirectory(
            "gov-status", "https://hub.com", user1, "full"
        );

        // deployer is the contract owner (governance stub)
        directory.updateDirectoryStatus(tokenId, "flagged");
        assertEq(directory.directoryStatus(tokenId), "flagged");
    }

    // --- Test 14: updateDirectoryStatus random user reverts ---
    function test_updateDirectoryStatus_unauthorizedReverts() public {
        vm.prank(user1);
        uint256 tokenId = directory.registerDirectory(
            "no-status", "https://hub.com", user1, "full"
        );

        vm.prank(user2);
        vm.expectRevert("SAGADirectoryIdentity: not owner or governance");
        directory.updateDirectoryStatus(tokenId, "hacked");
    }

    // --- Test 15: directoryId for nonexistent token reverts ---
    function test_directoryId_nonexistentReverts() public {
        vm.expectRevert(
            abi.encodeWithSelector(IERC721Errors.ERC721NonexistentToken.selector, 999)
        );
        directory.directoryId(999);
    }

    // --- Test 16: totalSupply increments ---
    function test_totalSupply_increments() public {
        assertEq(directory.totalSupply(), 0);

        vm.prank(user1);
        directory.registerDirectory("supply-1", "https://hub1.com", user1, "full");
        assertEq(directory.totalSupply(), 1);

        vm.prank(user2);
        directory.registerDirectory("supply-2", "https://hub2.com", user2, "basic");
        assertEq(directory.totalSupply(), 2);
    }

    // --- Test 17: registeredAt returns block.timestamp ---
    function test_registeredAt_returnsTimestamp() public {
        vm.warp(1_700_000_000);

        vm.prank(user1);
        uint256 tokenId = directory.registerDirectory(
            "timestamp-dir", "https://hub.com", user1, "full"
        );

        assertEq(directory.registeredAt(tokenId), 1_700_000_000);
    }

    // --- Test 18: tokenURI returns baseURI + id ---
    function test_tokenURI_returnsBaseURIPlusId() public {
        vm.prank(user1);
        uint256 tokenId = directory.registerDirectory(
            "uri-test", "https://hub.com", user1, "full"
        );

        assertEq(
            directory.tokenURI(tokenId),
            "https://saga-standard.dev/api/metadata/directory/0"
        );
    }

    // --- Test 19: transfer changes owner, new owner can update URL ---
    function test_transfer_newOwnerCanUpdate() public {
        vm.prank(user1);
        uint256 tokenId = directory.registerDirectory(
            "transfer-dir", "https://hub.com", user1, "full"
        );

        vm.prank(user1);
        directory.transferFrom(user1, user2, tokenId);

        vm.prank(user2);
        directory.updateDirectoryUrl(tokenId, "https://new-owner.com");
        assertEq(directory.directoryUrl(tokenId), "https://new-owner.com");
    }

    // --- Test 20: directoryId is immutable (same across transfers) ---
    function test_directoryId_immutableAcrossTransfer() public {
        vm.prank(user1);
        uint256 tokenId = directory.registerDirectory(
            "immutable-id", "https://hub.com", user1, "full"
        );

        vm.prank(user1);
        directory.transferFrom(user1, user2, tokenId);

        assertEq(directory.directoryId(tokenId), "immutable-id");
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/contracts && forge test --match-contract SAGADirectoryIdentityTest -vvv`
Expected: Compilation error — `SAGADirectoryIdentity` does not exist

- [ ] **Step 3: Create SAGADirectoryIdentity.sol**

Create `packages/contracts/src/SAGADirectoryIdentity.sol`:

```solidity
// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {
    ERC721Enumerable
} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {SAGAHandleRegistry} from "./SAGAHandleRegistry.sol";

/// @title SAGADirectoryIdentity
/// @notice ERC-721 NFT collection for SAGA directory identities.
///         Each token represents a directory that can host agents and organizations.
/// @dev Minting registers the directoryId as a DIRECTORY handle in SAGAHandleRegistry.
///      The directoryId is immutable once minted.
contract SAGADirectoryIdentity is ERC721Enumerable, Ownable {
    uint256 private _nextTokenId;

    SAGAHandleRegistry public immutable handleRegistry;

    /// tokenId → directoryId string
    mapping(uint256 => string) private _directoryIds;
    /// tokenId → directory URL
    mapping(uint256 => string) private _directoryUrls;
    /// tokenId → operator wallet address
    mapping(uint256 => address) private _operatorWallets;
    /// tokenId → conformance level string
    mapping(uint256 => string) private _conformanceLevels;
    /// tokenId → status string (active, suspended, flagged, revoked)
    mapping(uint256 => string) private _statuses;
    /// tokenId → registration timestamp
    mapping(uint256 => uint256) private _registeredAt;

    string private _baseTokenURI;

    event DirectoryRegistered(
        uint256 indexed tokenId,
        string directoryId,
        address indexed operator,
        string url,
        string conformanceLevel,
        uint256 registeredAt
    );

    event DirectoryUrlUpdated(uint256 indexed tokenId, string oldUrl, string newUrl);
    event DirectoryStatusUpdated(uint256 indexed tokenId, string oldStatus, string newStatus);

    constructor(address registry)
        ERC721("SAGA Directory Identity", "SAGA-DIR")
        Ownable(msg.sender)
    {
        handleRegistry = SAGAHandleRegistry(registry);
        _baseTokenURI = "https://saga-standard.dev/api/metadata/directory/";
    }

    /// @notice Register a directory and mint an identity NFT
    /// @param _directoryId Unique directory identifier (3-64 chars, validated by registry)
    /// @param url URL of the directory's hub endpoint
    /// @param operator Operator wallet address for the directory
    /// @param conformanceLevel The SAGA conformance level (e.g. "full", "basic")
    /// @return tokenId The minted token ID
    function registerDirectory(
        string calldata _directoryId,
        string calldata url,
        address operator,
        string calldata conformanceLevel
    ) external returns (uint256) {
        require(bytes(url).length > 0, "SAGADirectoryIdentity: invalid url");
        require(operator != address(0), "SAGADirectoryIdentity: invalid operator");
        require(bytes(conformanceLevel).length > 0, "SAGADirectoryIdentity: invalid conformance");

        uint256 tokenId = _nextTokenId++;
        _safeMint(msg.sender, tokenId);

        _directoryIds[tokenId] = _directoryId;
        _directoryUrls[tokenId] = url;
        _operatorWallets[tokenId] = operator;
        _conformanceLevels[tokenId] = conformanceLevel;
        _statuses[tokenId] = "active";
        _registeredAt[tokenId] = block.timestamp;

        // Register directoryId as a DIRECTORY handle in the global namespace
        handleRegistry.registerHandle(
            _directoryId, SAGAHandleRegistry.EntityType.DIRECTORY, tokenId
        );

        emit DirectoryRegistered(
            tokenId, _directoryId, operator, url, conformanceLevel, block.timestamp
        );
        return tokenId;
    }

    /// @notice Update the directory URL (token owner only)
    function updateDirectoryUrl(uint256 tokenId, string calldata newUrl) external {
        require(ownerOf(tokenId) == msg.sender, "SAGADirectoryIdentity: not owner");
        require(bytes(newUrl).length > 0, "SAGADirectoryIdentity: invalid url");
        string memory oldUrl = _directoryUrls[tokenId];
        _directoryUrls[tokenId] = newUrl;
        emit DirectoryUrlUpdated(tokenId, oldUrl, newUrl);
    }

    /// @notice Update directory status (token owner or contract owner for governance)
    function updateDirectoryStatus(uint256 tokenId, string calldata newStatus) external {
        require(
            ownerOf(tokenId) == msg.sender || owner() == msg.sender,
            "SAGADirectoryIdentity: not owner or governance"
        );
        string memory oldStatus = _statuses[tokenId];
        _statuses[tokenId] = newStatus;
        emit DirectoryStatusUpdated(tokenId, oldStatus, newStatus);
    }

    // --- View functions ---

    function directoryId(uint256 tokenId) external view returns (string memory) {
        _requireOwned(tokenId);
        return _directoryIds[tokenId];
    }

    function directoryUrl(uint256 tokenId) external view returns (string memory) {
        _requireOwned(tokenId);
        return _directoryUrls[tokenId];
    }

    function operatorWallet(uint256 tokenId) external view returns (address) {
        _requireOwned(tokenId);
        return _operatorWallets[tokenId];
    }

    function conformanceLevel(uint256 tokenId) external view returns (string memory) {
        _requireOwned(tokenId);
        return _conformanceLevels[tokenId];
    }

    function directoryStatus(uint256 tokenId) external view returns (string memory) {
        _requireOwned(tokenId);
        return _statuses[tokenId];
    }

    function registeredAt(uint256 tokenId) external view returns (uint256) {
        _requireOwned(tokenId);
        return _registeredAt[tokenId];
    }

    // --- Metadata ---

    function setBaseURI(string calldata newBaseURI) external onlyOwner {
        _baseTokenURI = newBaseURI;
    }

    function _baseURI() internal view override returns (string memory) {
        return _baseTokenURI;
    }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/contracts && forge test --match-contract SAGADirectoryIdentityTest -vvv`
Expected: All 20 tests pass

- [ ] **Step 5: Run full suite to verify no regressions**

Run: `cd packages/contracts && forge test -vvv`
Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add packages/contracts/src/SAGADirectoryIdentity.sol packages/contracts/test/SAGADirectoryIdentity.t.sol
git commit -m "feat(contracts): add SAGADirectoryIdentity ERC-721 contract"
```

---

### Task 4: Add Directory-Scoped Registration to Agent and Org Contracts

**Files:**

- Modify: `packages/contracts/src/SAGAAgentIdentity.sol`
- Modify: `packages/contracts/src/SAGAOrgIdentity.sol`
- Modify: `packages/contracts/test/SAGAAgentIdentity.t.sol`
- Modify: `packages/contracts/test/SAGAOrgIdentity.t.sol`

This task adds `registerAgentInDirectory(handle, hubUrl, directoryId)` and `registerOrgInDirectory(handle, name, directoryId)` functions. These call `registerScopedHandle` instead of `registerHandle`. The existing `registerAgent` / `registerOrganization` remain unchanged for backward compatibility.

- [ ] **Step 1: Write failing tests for agent**

Add to `packages/contracts/test/SAGAAgentIdentity.t.sol`:

```solidity
// --- Test 19: registerAgentInDirectory success ---
function test_registerAgentInDirectory_success() public {
    vm.prank(user1);
    uint256 tokenId = agent.registerAgentInDirectory(
        "marcus", "https://hub.example.com", "epic-hub"
    );

    assertEq(tokenId, 0);
    assertEq(agent.ownerOf(tokenId), user1);
    assertEq(agent.agentHandle(tokenId), "marcus");
    assertEq(agent.homeHubUrl(tokenId), "https://hub.example.com");
    assertEq(agent.agentDirectoryId(tokenId), "epic-hub");

    // Verify in scoped registry
    (SAGAHandleRegistry.EntityType entityType, uint256 regTokenId, address contractAddr) =
        registry.resolveScopedHandle("marcus", "epic-hub");
    assertEq(uint256(entityType), uint256(SAGAHandleRegistry.EntityType.AGENT));
    assertEq(regTokenId, 0);
    assertEq(contractAddr, address(agent));
}

// --- Test 20: same handle in different directories ---
function test_registerAgentInDirectory_sameHandleDifferentDirs() public {
    vm.prank(user1);
    agent.registerAgentInDirectory("marcus", "https://hub-a.com", "dir-a");

    vm.prank(user2);
    agent.registerAgentInDirectory("marcus", "https://hub-b.com", "dir-b");

    (, uint256 tidA,) = registry.resolveScopedHandle("marcus", "dir-a");
    (, uint256 tidB,) = registry.resolveScopedHandle("marcus", "dir-b");

    assertEq(tidA, 0);
    assertEq(tidB, 1);
}

// --- Test 21: directory-scoped agent doesn't block global agent ---
function test_registerAgentInDirectory_doesNotBlockGlobal() public {
    vm.prank(user1);
    agent.registerAgentInDirectory("unique-name", "https://hub-a.com", "dir-a");

    // Global registration of same handle should succeed
    vm.prank(user2);
    agent.registerAgent("unique-name", "https://hub-b.com");

    (, uint256 globalTid,) = registry.resolveHandle("unique-name");
    (, uint256 scopedTid,) = registry.resolveScopedHandle("unique-name", "dir-a");

    assertEq(globalTid, 1);
    assertEq(scopedTid, 0);
}

// --- Test 22: agentDirectoryId for global agent returns empty string ---
function test_agentDirectoryId_globalReturnsEmpty() public {
    vm.prank(user1);
    uint256 tokenId = agent.registerAgent("global-agent", "https://hub.com");

    assertEq(agent.agentDirectoryId(tokenId), "");
}
```

- [ ] **Step 2: Write failing tests for org**

Add to `packages/contracts/test/SAGAOrgIdentity.t.sol`:

```solidity
// --- Test 16: registerOrgInDirectory success ---
function test_registerOrgInDirectory_success() public {
    vm.prank(user1);
    uint256 tokenId = org.registerOrgInDirectory(
        "d7r", "d7r LLC", "epic-hub"
    );

    assertEq(tokenId, 0);
    assertEq(org.ownerOf(tokenId), user1);
    assertEq(org.orgHandle(tokenId), "d7r");
    assertEq(org.orgName(tokenId), "d7r LLC");
    assertEq(org.orgDirectoryId(tokenId), "epic-hub");

    (SAGAHandleRegistry.EntityType entityType, uint256 regTokenId, address contractAddr) =
        registry.resolveScopedHandle("d7r", "epic-hub");
    assertEq(uint256(entityType), uint256(SAGAHandleRegistry.EntityType.ORG));
    assertEq(regTokenId, 0);
    assertEq(contractAddr, address(org));
}

// --- Test 17: same org handle in different directories ---
function test_registerOrgInDirectory_sameHandleDifferentDirs() public {
    vm.prank(user1);
    org.registerOrgInDirectory("d7r", "Epic A", "dir-a");

    vm.prank(user2);
    org.registerOrgInDirectory("d7r", "Epic B", "dir-b");

    (, uint256 tidA,) = registry.resolveScopedHandle("d7r", "dir-a");
    (, uint256 tidB,) = registry.resolveScopedHandle("d7r", "dir-b");

    assertEq(tidA, 0);
    assertEq(tidB, 1);
}

// --- Test 18: orgDirectoryId for global org returns empty string ---
function test_orgDirectoryId_globalReturnsEmpty() public {
    vm.prank(user1);
    uint256 tokenId = org.registerOrganization("global-org", "Global Org");

    assertEq(org.orgDirectoryId(tokenId), "");
}
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd packages/contracts && forge test --match-test "registerAgentInDirectory|registerOrgInDirectory|agentDirectoryId|orgDirectoryId" -vvv`
Expected: Compilation errors

- [ ] **Step 4: Implement registerAgentInDirectory in SAGAAgentIdentity.sol**

In `packages/contracts/src/SAGAAgentIdentity.sol`, add a new mapping after line 24:

```solidity
/// tokenId → directoryId (empty string for global agents)
mapping(uint256 => string) private _directoryIds;
```

After the `registerAgent` function (after line 64), add:

```solidity
/// @notice Register an agent within a specific directory and mint an identity NFT
/// @param handle Unique handle within the directory (3-64 chars, validated by registry)
/// @param hubUrl URL of the agent's home SAGA hub
/// @param directoryId The directory to register in
/// @return tokenId The minted token ID
function registerAgentInDirectory(
    string calldata handle,
    string calldata hubUrl,
    string calldata directoryId
) external returns (uint256) {
    uint256 tokenId = _nextTokenId++;
    _safeMint(msg.sender, tokenId);

    _agentHandles[tokenId] = handle;
    _homeHubUrls[tokenId] = hubUrl;
    _registeredAt[tokenId] = block.timestamp;
    _directoryIds[tokenId] = directoryId;

    // Register handle in the scoped registry
    handleRegistry.registerScopedHandle(
        handle, SAGAHandleRegistry.EntityType.AGENT, tokenId, directoryId
    );

    emit AgentRegistered(tokenId, handle, msg.sender, hubUrl, block.timestamp);
    return tokenId;
}
```

After the `registeredAt` view function (after line 89), add:

```solidity
function agentDirectoryId(uint256 tokenId) external view returns (string memory) {
    _requireOwned(tokenId);
    return _directoryIds[tokenId];
}
```

- [ ] **Step 5: Implement registerOrgInDirectory in SAGAOrgIdentity.sol**

In `packages/contracts/src/SAGAOrgIdentity.sol`, add a new mapping after line 21:

```solidity
/// tokenId → directoryId (empty string for global orgs)
mapping(uint256 => string) private _directoryIds;
```

After the `registerOrganization` function (after line 63), add:

```solidity
/// @notice Register an organization within a specific directory and mint an identity NFT
/// @param handle Unique handle within the directory (3-64 chars, validated by registry)
/// @param name Display name of the organization (1-128 chars)
/// @param directoryId The directory to register in
/// @return tokenId The minted token ID
function registerOrgInDirectory(
    string calldata handle,
    string calldata name,
    string calldata directoryId
) external returns (uint256) {
    require(
        bytes(name).length > 0 && bytes(name).length <= 128, "SAGAOrgIdentity: invalid name"
    );

    uint256 tokenId = _nextTokenId++;
    _safeMint(msg.sender, tokenId);

    _orgHandles[tokenId] = handle;
    _orgNames[tokenId] = name;
    _registeredAt[tokenId] = block.timestamp;
    _directoryIds[tokenId] = directoryId;

    handleRegistry.registerScopedHandle(
        handle, SAGAHandleRegistry.EntityType.ORG, tokenId, directoryId
    );

    emit OrgRegistered(tokenId, handle, name, msg.sender, block.timestamp);
    return tokenId;
}
```

After the `registeredAt` view function (after line 91), add:

```solidity
function orgDirectoryId(uint256 tokenId) external view returns (string memory) {
    _requireOwned(tokenId);
    return _directoryIds[tokenId];
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd packages/contracts && forge test -vvv`
Expected: All tests pass across all contracts

- [ ] **Step 7: Commit**

```bash
git add packages/contracts/src/SAGAAgentIdentity.sol packages/contracts/src/SAGAOrgIdentity.sol packages/contracts/test/SAGAAgentIdentity.t.sol packages/contracts/test/SAGAOrgIdentity.t.sol
git commit -m "feat(contracts): add directory-scoped registration to Agent and Org contracts"
```

---

### Task 5: Update Deploy Script

**Files:**

- Modify: `packages/contracts/script/Deploy.s.sol`

This task adds deployment of `SAGADirectoryIdentity` and authorizes it on the handle registry.

- [ ] **Step 1: Update Deploy.s.sol**

In `packages/contracts/script/Deploy.s.sol`, add the import after line 8:

```solidity
import {SAGADirectoryIdentity} from "../src/SAGADirectoryIdentity.sol";
```

After the org identity deployment (after line 36), add:

```solidity
// 3b. Deploy directory identity (pass registry)
SAGADirectoryIdentity directoryIdentity = new SAGADirectoryIdentity(address(registry));
console.log("SAGADirectoryIdentity:", address(directoryIdentity));
```

Update the authorization section (line 43-44) to include directory:

```solidity
// 5. Authorize identity contracts to register handles
registry.setAuthorizedContract(address(agentIdentity), true);
registry.setAuthorizedContract(address(orgIdentity), true);
registry.setAuthorizedContract(address(directoryIdentity), true);
console.log("Authorized agent, org, and directory contracts on registry");
```

Update the summary section to include directory:

```solidity
console.log("SAGADirectoryIdentity:", address(directoryIdentity));
```

- [ ] **Step 2: Verify deployment script compiles**

Run: `cd packages/contracts && forge build`
Expected: Compiles without errors

- [ ] **Step 3: Commit**

```bash
git add packages/contracts/script/Deploy.s.sol
git commit -m "feat(contracts): add SAGADirectoryIdentity to deploy script"
```

---

### Task 6: Update TypeScript Bindings

**Files:**

- Modify: `packages/contracts/src/ts/types.ts`
- Modify: `packages/contracts/src/ts/addresses.ts`
- Modify: `packages/contracts/src/ts/clients.ts`
- Modify: `packages/contracts/src/ts/index.ts`

This task updates the TypeScript bindings to include the new `DIRECTORY` entity type, `DirectoryIdentity` interface, `SAGADirectoryIdentity` address entry, and config helper. The ABI will be generated by forge build and read from `out/` — we need to create an export for it.

- [ ] **Step 1: Check how ABIs are currently exported**

The existing ABIs are imported in `index.ts` from `./abis`. Let's find where that file lives.

Run: `ls packages/contracts/src/ts/abis*` or check the out directory after forge build.

The ABIs module likely reads from `packages/contracts/out/` or is auto-generated. We need to create the ABI export for `SAGADirectoryIdentity` following the same pattern.

First, determine the ABI generation pattern by checking `packages/contracts/out/` after the forge build from Task 5. The ABI JSON is at `packages/contracts/out/SAGADirectoryIdentity.sol/SAGADirectoryIdentity.json`. Extract the `abi` array from that JSON.

For now, we'll create the ABI export by reading from the forge output. The pattern used by the existing code is an `abis.ts` file (or similar) that re-exports the ABI arrays. Since no `abis.ts` was found in the TS source, the ABIs might be auto-generated during build. Check `tsup.config.ts` — it only bundles `src/ts/index.ts`.

**Resolution:** After `forge build`, create the ABI constant from the generated JSON. The existing `index.ts` imports from `./abis` so there must be an `abis.ts` (or `.js`) that was previously built. We need to create/update it.

- [ ] **Step 2: Update types.ts**

In `packages/contracts/src/ts/types.ts`, change the `EntityType` type (line 5):

From:

```typescript
export type EntityType = 'NONE' | 'AGENT' | 'ORG'
```

To:

```typescript
export type EntityType = 'NONE' | 'AGENT' | 'ORG' | 'DIRECTORY'
```

Update `ENTITY_TYPE_VALUES` (lines 8-12):

From:

```typescript
export const ENTITY_TYPE_VALUES = {
  NONE: 0,
  AGENT: 1,
  ORG: 2,
} as const
```

To:

```typescript
export const ENTITY_TYPE_VALUES = {
  NONE: 0,
  AGENT: 1,
  ORG: 2,
  DIRECTORY: 3,
} as const
```

Update `entityTypeFromNumber` (lines 40-51):

From:

```typescript
export function entityTypeFromNumber(n: number): EntityType {
  switch (n) {
    case 0:
      return 'NONE'
    case 1:
      return 'AGENT'
    case 2:
      return 'ORG'
    default:
      return 'NONE'
  }
}
```

To:

```typescript
export function entityTypeFromNumber(n: number): EntityType {
  switch (n) {
    case 0:
      return 'NONE'
    case 1:
      return 'AGENT'
    case 2:
      return 'ORG'
    case 3:
      return 'DIRECTORY'
    default:
      return 'NONE'
  }
}
```

Add `DirectoryIdentity` interface after `OrgIdentity` (after line 37):

```typescript
/** Directory identity data from SAGADirectoryIdentity */
export interface DirectoryIdentity {
  tokenId: bigint
  directoryId: string
  url: string
  operatorWallet: `0x${string}`
  conformanceLevel: string
  status: string
  registeredAt: bigint
}
```

- [ ] **Step 3: Update addresses.ts**

In `packages/contracts/src/ts/addresses.ts`, update the `ContractName` type (lines 8-12):

From:

```typescript
export type ContractName =
  | 'SAGAHandleRegistry'
  | 'SAGAAgentIdentity'
  | 'SAGAOrgIdentity'
  | 'SAGATBAHelper'
```

To:

```typescript
export type ContractName =
  | 'SAGAHandleRegistry'
  | 'SAGAAgentIdentity'
  | 'SAGAOrgIdentity'
  | 'SAGADirectoryIdentity'
  | 'SAGATBAHelper'
```

Update the `ADDRESSES` record (lines 16-29) to include the new contract. For base-sepolia, use ZERO since it hasn't been deployed yet:

From:

```typescript
const ADDRESSES: Record<SupportedChain, Record<ContractName, Address>> = {
  'base-sepolia': {
    SAGAHandleRegistry: '0xec2f53f2cfa24553c4ad6e585965490f839b28f0',
    SAGAAgentIdentity: '0x1a706cc37ea90af568dce0f637aeb60884c9fadb',
    SAGAOrgIdentity: '0x4f297f7b3439d1bdd548ba897d3b82b5fc2bdd26',
    SAGATBAHelper: '0xcbd2a8193901eb838439dd2bb3303ce177989dbe',
  },
  base: {
    SAGAHandleRegistry: ZERO,
    SAGAAgentIdentity: ZERO,
    SAGAOrgIdentity: ZERO,
    SAGATBAHelper: ZERO,
  },
}
```

To:

```typescript
const ADDRESSES: Record<SupportedChain, Record<ContractName, Address>> = {
  'base-sepolia': {
    SAGAHandleRegistry: '0xec2f53f2cfa24553c4ad6e585965490f839b28f0',
    SAGAAgentIdentity: '0x1a706cc37ea90af568dce0f637aeb60884c9fadb',
    SAGAOrgIdentity: '0x4f297f7b3439d1bdd548ba897d3b82b5fc2bdd26',
    SAGADirectoryIdentity: ZERO,
    SAGATBAHelper: '0xcbd2a8193901eb838439dd2bb3303ce177989dbe',
  },
  base: {
    SAGAHandleRegistry: ZERO,
    SAGAAgentIdentity: ZERO,
    SAGAOrgIdentity: ZERO,
    SAGADirectoryIdentity: ZERO,
    SAGATBAHelper: ZERO,
  },
}
```

- [ ] **Step 4: Create the ABI export**

After running `forge build` (done in Task 5), the ABI JSON is at `packages/contracts/out/SAGADirectoryIdentity.sol/SAGADirectoryIdentity.json`.

Determine how ABIs are currently exported. The `index.ts` imports `{ SAGAHandleRegistryAbi, SAGAAgentIdentityAbi, SAGAOrgIdentityAbi }` from `./abis`. Find or create this file.

If `src/ts/abis.ts` does not exist, check if it's auto-generated during build (e.g., by a script that reads from `out/`). If it IS auto-generated, just run the build again and the new ABI will appear.

If `src/ts/abis.ts` needs manual creation/update:

- Read the ABI from `out/SAGADirectoryIdentity.sol/SAGADirectoryIdentity.json` (the `abi` field)
- Export it as `SAGADirectoryIdentityAbi`

The implementer should check the build output and follow the existing pattern.

- [ ] **Step 5: Update clients.ts**

In `packages/contracts/src/ts/clients.ts`, add the import for the new ABI (update line 4 or wherever ABIs are imported):

Add `SAGADirectoryIdentityAbi` to the ABI import.

Add after `getOrgIdentityConfig` (after line 53):

````typescript
/**
 * Get address + ABI config for SAGADirectoryIdentity.
 *
 * Usage with viem:
 * ```ts
 * import { getContract } from 'viem'
 * const contract = getContract({ ...getDirectoryIdentityConfig('base-sepolia'), client })
 * ```
 */
export function getDirectoryIdentityConfig(chain: SupportedChain) {
  return {
    address: getDeployedAddress('SAGADirectoryIdentity', chain),
    abi: SAGADirectoryIdentityAbi,
  } as const
}
````

- [ ] **Step 6: Update index.ts**

In `packages/contracts/src/ts/index.ts`, update the ABIs export (line 5):

From:

```typescript
export { SAGAHandleRegistryAbi, SAGAAgentIdentityAbi, SAGAOrgIdentityAbi } from './abis'
```

To:

```typescript
export {
  SAGAHandleRegistryAbi,
  SAGAAgentIdentityAbi,
  SAGAOrgIdentityAbi,
  SAGADirectoryIdentityAbi,
} from './abis'
```

Update the clients export (line 17):

From:

```typescript
export { getHandleRegistryConfig, getAgentIdentityConfig, getOrgIdentityConfig } from './clients'
```

To:

```typescript
export {
  getHandleRegistryConfig,
  getAgentIdentityConfig,
  getOrgIdentityConfig,
  getDirectoryIdentityConfig,
} from './clients'
```

Update the types export to include `DirectoryIdentity` (after `OrgIdentity`):

From:

```typescript
export {
  ENTITY_TYPE_VALUES,
  entityTypeFromNumber,
  type EntityType,
  type HandleRecord,
  type AgentIdentity,
  type OrgIdentity,
} from './types'
```

To:

```typescript
export {
  ENTITY_TYPE_VALUES,
  entityTypeFromNumber,
  type EntityType,
  type HandleRecord,
  type AgentIdentity,
  type OrgIdentity,
  type DirectoryIdentity,
} from './types'
```

- [ ] **Step 7: Verify TypeScript compiles**

Run: `cd packages/contracts && pnpm build:ts`
Expected: Builds without errors (if ABIs are properly exported)

If ABI generation is needed first: `cd packages/contracts && forge build && pnpm build:ts`

- [ ] **Step 8: Commit**

```bash
git add packages/contracts/src/ts/types.ts packages/contracts/src/ts/addresses.ts packages/contracts/src/ts/clients.ts packages/contracts/src/ts/index.ts
git commit -m "feat(contracts): add DirectoryIdentity TypeScript bindings"
```

If the ABI file was also updated:

```bash
git add packages/contracts/src/ts/
git commit -m "feat(contracts): add DirectoryIdentity TypeScript bindings"
```

---

### Task 7: TypeScript Binding Tests

**Files:**

- Create: `packages/contracts/src/ts/types.test.ts`

This task adds TypeScript-side unit tests for the new `DIRECTORY` entity type mapping and `DirectoryIdentity` type. The contracts package already has vitest configured (`vitest.config.ts` includes `src/ts/**/*.test.ts`).

- [ ] **Step 1: Write the test file**

Create `packages/contracts/src/ts/types.test.ts`:

```typescript
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { describe, it, expect } from 'vitest'
import {
  entityTypeFromNumber,
  ENTITY_TYPE_VALUES,
  type EntityType,
  type DirectoryIdentity,
} from './types'

describe('entityTypeFromNumber', () => {
  it('maps 0 to NONE', () => {
    expect(entityTypeFromNumber(0)).toBe('NONE')
  })

  it('maps 1 to AGENT', () => {
    expect(entityTypeFromNumber(1)).toBe('AGENT')
  })

  it('maps 2 to ORG', () => {
    expect(entityTypeFromNumber(2)).toBe('ORG')
  })

  it('maps 3 to DIRECTORY', () => {
    expect(entityTypeFromNumber(3)).toBe('DIRECTORY')
  })

  it('maps unknown numbers to NONE', () => {
    expect(entityTypeFromNumber(99)).toBe('NONE')
  })
})

describe('ENTITY_TYPE_VALUES', () => {
  it('includes DIRECTORY with value 3', () => {
    expect(ENTITY_TYPE_VALUES.DIRECTORY).toBe(3)
  })

  it('preserves existing values', () => {
    expect(ENTITY_TYPE_VALUES.NONE).toBe(0)
    expect(ENTITY_TYPE_VALUES.AGENT).toBe(1)
    expect(ENTITY_TYPE_VALUES.ORG).toBe(2)
  })
})

describe('DirectoryIdentity type', () => {
  it('is assignable with correct shape', () => {
    const dir: DirectoryIdentity = {
      tokenId: 0n,
      directoryId: 'epic-hub',
      url: 'https://hub.epic.com',
      operatorWallet: '0x1234567890abcdef1234567890abcdef12345678',
      conformanceLevel: 'full',
      status: 'active',
      registeredAt: 1700000000n,
    }
    expect(dir.directoryId).toBe('epic-hub')
    expect(dir.status).toBe('active')
  })
})
```

- [ ] **Step 2: Run the test**

Run: `cd packages/contracts && pnpm test:ts`
Expected: All tests pass

- [ ] **Step 3: Commit**

```bash
git add packages/contracts/src/ts/types.test.ts
git commit -m "test(contracts): add TypeScript tests for DIRECTORY entity type"
```

---

## Self-Review Checklist

### Spec Coverage

| Spec Requirement                                                           | Task                                                                                                             |
| -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `SAGADirectoryIdentity.sol` ERC-721 contract                               | Task 3                                                                                                           |
| `registerDirectory(directoryId, url, operatorWallet, conformanceLevel)`    | Task 3                                                                                                           |
| `directoryId` globally unique on-chain                                     | Task 3 (uses handle registry)                                                                                    |
| Immutable once minted                                                      | Task 3 (no setter for directoryId)                                                                               |
| ERC-6551 TBA holds directory's signing key                                 | Covered by existing `SAGATBAHelper` — computes TBA for any NFT contract including directory. No new code needed. |
| On-chain storage: directoryId → URL, operator, conformance level, status   | Task 3                                                                                                           |
| Governance: directory can be flagged/revoked (stub)                        | Task 3 (`updateDirectoryStatus` — contract owner or token owner)                                                 |
| Update `SAGAHandleRegistry.sol` — scope handles by `(directoryId, handle)` | Task 1 (enum) + Task 2 (scoped functions)                                                                        |
| Handles unique within a directory, not globally                            | Task 2 (tests 18, 25)                                                                                            |
| `resolve(handle, directoryId)` → entity type, token ID, contract address   | Task 2 (`resolveScopedHandle`)                                                                                   |
| Backward-compatible: existing handles treated as default directory         | Task 2 (global `registerHandle`/`resolveHandle` unchanged)                                                       |
| Update `SAGAAgentIdentity.sol` — pass `directoryId` on registration        | Task 4                                                                                                           |
| Update `SAGAOrgIdentity.sol` — pass `directoryId` on registration          | Task 4                                                                                                           |
| Deployment script updates                                                  | Task 5                                                                                                           |
| TypeScript binding exports for new contract                                | Task 6 + Task 7                                                                                                  |

### Placeholder Scan

No TBDs, TODOs, or "implement later" found. All steps contain actual code.

### Type Consistency

- `EntityType.DIRECTORY` — consistent across Solidity enum (Task 1), TypeScript type (Task 6), and numeric value 3
- `registerScopedHandle` — name consistent between registry (Task 2), agent (Task 4), and org (Task 4)
- `resolveScopedHandle` — name consistent across Task 2 tests and Task 4 tests
- `directoryId` parameter name — consistent across all contracts and TypeScript types
- `DirectoryIdentity` interface fields match contract view function names
