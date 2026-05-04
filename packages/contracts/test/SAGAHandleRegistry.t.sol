// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {SAGAHandleRegistry} from "../src/SAGAHandleRegistry.sol";

/// @dev Phase 9 (G-11): registerScopedHandle consults this interface on
///      contracts marked trusted via setTrustedDirectoryContract. Tests use
///      this minimal mock to simulate "active" directories so scoped
///      registrations succeed.
contract MockDirectoryIdentity {
    function directoryStatus(uint256) external pure returns (string memory) {
        return "active";
    }
}

/// @dev Phase 9 (G-5): mock with mutable status so a single test can flip a
///      directory between active and revoked to exercise the active-only
///      resolver.
contract StatusMutableMock {
    string private _status;

    function setStatus(string memory s) external {
        _status = s;
    }

    function directoryStatus(uint256) external view returns (string memory) {
        return _status;
    }
}

contract SAGAHandleRegistryTest is Test {
    SAGAHandleRegistry public registry;
    MockDirectoryIdentity public mockDirectoryIdentity;
    address public owner;
    address public authorizedContract;
    address public unauthorizedUser;

    event HandleRegistered(
        bytes32 indexed handleKey,
        string handle,
        SAGAHandleRegistry.EntityType entityType,
        uint256 tokenId,
        address contractAddress
    );

    event AuthorizedContractSet(address indexed contractAddress, bool authorized);

    event ScopedHandleRegistered(
        bytes32 indexed scopedKey,
        string handle,
        string directoryId,
        SAGAHandleRegistry.EntityType entityType,
        uint256 tokenId,
        address contractAddress
    );

    function setUp() public {
        owner = address(this);
        // Phase 10 (M-4): setAuthorizedContract now requires the address
        // to be a contract. Use a derived-address fixture so we land
        // outside the 0x01..0x0a precompile range that `vm.etch` refuses
        // to overwrite (those slots are reserved for ECRECOVER, SHA256,
        // RIPEMD160, IDENTITY, MODEXP, ECADD, ECMUL, ECPAIRING, BLAKE2F,
        // and POINT_EVALUATION).
        authorizedContract = makeAddr("authorizedContract");
        unauthorizedUser = address(0xB);

        registry = new SAGAHandleRegistry();
        vm.etch(authorizedContract, hex"60006000fd");
        registry.setAuthorizedContract(authorizedContract, true);

        // Phase 9 (G-11): wire the directory-identity mock and pre-register
        // every directoryId the existing scoped tests use so they continue
        // to exercise the same code paths. The mock must be an authorized
        // contract AND must be the seeder of the directory handles, because
        // registerScopedHandle requires `dirRecord.contractAddress` to be in
        // `trustedDirectoryContracts`. Replaces the Phase 8 singleton-pointer
        // gate so a future V2 directory implementation can be added without
        // bricking V1 directories.
        mockDirectoryIdentity = new MockDirectoryIdentity();
        registry.setAuthorizedContract(address(mockDirectoryIdentity), true);
        registry.setTrustedDirectoryContract(address(mockDirectoryIdentity), true);
        _seedDirectory("epic-hub", 0);
        _seedDirectory("dir-a", 1);
        _seedDirectory("dir-b", 2);
        _seedDirectory("some-dir", 3);
    }

    function _seedDirectory(string memory dirId, uint256 tokenId) internal {
        // Seed AS a trusted directory contract — only its handles will pass
        // the trustedDirectoryContracts gate (Phase 9 G-11).
        vm.prank(address(mockDirectoryIdentity));
        registry.registerHandle(dirId, SAGAHandleRegistry.EntityType.DIRECTORY, tokenId);
    }

    // === Phase 8 regression tests ===

    // F-3: Ownable2Step migration on the registry
    function test_ownership_twoStepRequired() public {
        address pending = makeAddr("pending");
        registry.transferOwnership(pending);
        assertEq(registry.owner(), address(this));
        assertEq(registry.pendingOwner(), pending);
        vm.prank(pending);
        registry.acceptOwnership();
        assertEq(registry.owner(), pending);
        assertEq(registry.pendingOwner(), address(0));
    }

    function test_renounceOwnership_reverts() public {
        vm.expectRevert(bytes("SAGAHandleRegistry: renounce disabled"));
        registry.renounceOwnership();
    }

    // F-1: directory existence + active-status check on scoped registration
    function test_registerScopedHandle_revertsWhenDirectoryNotFound() public {
        vm.prank(authorizedContract);
        vm.expectRevert(bytes("SAGAHandleRegistry: directory not found"));
        registry.registerScopedHandle(
            "alice", SAGAHandleRegistry.EntityType.AGENT, 0, "ghost-dir"
        );
    }

    function test_setTrustedDirectoryContract_revertsOnEoa() public {
        vm.expectRevert(bytes("SAGAHandleRegistry: trusted directory must be contract"));
        registry.setTrustedDirectoryContract(makeAddr("eoa"), true);
    }

    function test_setTrustedDirectoryContract_revertsForNonOwner() public {
        vm.prank(unauthorizedUser);
        vm.expectRevert(); // OZ Ownable: caller is not the owner
        registry.setTrustedDirectoryContract(address(mockDirectoryIdentity), true);
    }

    // --- Test 1: registerHandle success ---
    function test_registerHandle_success() public {
        vm.prank(authorizedContract);
        registry.registerHandle("marcus.chen", SAGAHandleRegistry.EntityType.AGENT, 0);

        (SAGAHandleRegistry.EntityType entityType, uint256 tokenId, address contractAddr) =
            registry.resolveHandle("marcus.chen");

        assertEq(uint256(entityType), uint256(SAGAHandleRegistry.EntityType.AGENT));
        assertEq(tokenId, 0);
        assertEq(contractAddr, authorizedContract);
    }

    // --- Test 2: duplicate handle reverts ---
    function test_registerHandle_duplicateReverts() public {
        vm.prank(authorizedContract);
        registry.registerHandle("taken-handle", SAGAHandleRegistry.EntityType.AGENT, 0);

        vm.prank(authorizedContract);
        vm.expectRevert("SAGAHandleRegistry: handle taken");
        registry.registerHandle("taken-handle", SAGAHandleRegistry.EntityType.ORG, 1);
    }

    // --- Test 3: case insensitive ---
    function test_registerHandle_caseInsensitive() public {
        vm.prank(authorizedContract);
        registry.registerHandle("Marcus", SAGAHandleRegistry.EntityType.AGENT, 0);

        vm.prank(authorizedContract);
        vm.expectRevert("SAGAHandleRegistry: handle taken");
        registry.registerHandle("marcus", SAGAHandleRegistry.EntityType.AGENT, 1);
    }

    // --- Test 4: unauthorized reverts ---
    function test_registerHandle_unauthorizedReverts() public {
        vm.prank(unauthorizedUser);
        vm.expectRevert("SAGAHandleRegistry: unauthorized");
        registry.registerHandle("test-handle", SAGAHandleRegistry.EntityType.AGENT, 0);
    }

    // --- Test 5: invalid length reverts (too short) ---
    function test_registerHandle_tooShortReverts() public {
        vm.prank(authorizedContract);
        vm.expectRevert("SAGAHandleRegistry: invalid length");
        registry.registerHandle("ab", SAGAHandleRegistry.EntityType.AGENT, 0);
    }

    // --- Test 5b: invalid length reverts (too long) ---
    function test_registerHandle_tooLongReverts() public {
        // 65 chars
        string memory longHandle =
            "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
        assertEq(bytes(longHandle).length, 65);

        vm.prank(authorizedContract);
        vm.expectRevert("SAGAHandleRegistry: invalid length");
        registry.registerHandle(longHandle, SAGAHandleRegistry.EntityType.AGENT, 0);
    }

    // --- Test 6: invalid start reverts ---
    function test_registerHandle_invalidStartReverts() public {
        vm.prank(authorizedContract);
        vm.expectRevert("SAGAHandleRegistry: must start with alphanumeric");
        registry.registerHandle(".test", SAGAHandleRegistry.EntityType.AGENT, 0);
    }

    // --- Test 7: invalid end reverts ---
    function test_registerHandle_invalidEndReverts() public {
        vm.prank(authorizedContract);
        vm.expectRevert("SAGAHandleRegistry: must end with alphanumeric");
        registry.registerHandle("test-", SAGAHandleRegistry.EntityType.AGENT, 0);
    }

    // --- Test 8: invalid character reverts ---
    function test_registerHandle_invalidCharReverts() public {
        vm.prank(authorizedContract);
        vm.expectRevert("SAGAHandleRegistry: invalid character");
        registry.registerHandle("test handle", SAGAHandleRegistry.EntityType.AGENT, 0);
    }

    // --- Test 9: handleExists true ---
    function test_handleExists_true() public {
        vm.prank(authorizedContract);
        registry.registerHandle("exists-test", SAGAHandleRegistry.EntityType.AGENT, 0);

        assertTrue(registry.handleExists("exists-test"));
    }

    // --- Test 10: handleExists false ---
    function test_handleExists_false() public view {
        assertFalse(registry.handleExists("nonexistent"));
    }

    // --- Test 11: resolveHandle not found reverts ---
    function test_resolveHandle_notFoundReverts() public {
        vm.expectRevert("SAGAHandleRegistry: not found");
        registry.resolveHandle("nonexistent");
    }

    // --- Test 12: setAuthorizedContract ---
    function test_setAuthorizedContract() public {
        address newContract = makeAddr("newContract");
        // Phase 10 (M-4) requires the authorize target to be a contract.
        vm.etch(newContract, hex"60006000fd");
        registry.setAuthorizedContract(newContract, true);
        assertTrue(registry.authorizedContracts(newContract));

        // Deauthorize is always immediate and accepts EOAs (it's a safety
        // action — slowing it down would be wrong).
        registry.setAuthorizedContract(newContract, false);
        assertFalse(registry.authorizedContracts(newContract));
    }

    // --- Test 13: setAuthorizedContract non-owner reverts ---
    function test_setAuthorizedContract_nonOwnerReverts() public {
        vm.prank(unauthorizedUser);
        vm.expectRevert();
        registry.setAuthorizedContract(address(0xD), true);
    }

    // --- Test 14: emits HandleRegistered event with bytes32 key ---
    function test_registerHandle_emitsEvent() public {
        vm.prank(authorizedContract);
        // The indexed key is keccak256 of the lowercased handle
        vm.expectEmit(true, false, false, true);
        emit HandleRegistered(
            keccak256(abi.encodePacked("event-test")),
            "event-test",
            SAGAHandleRegistry.EntityType.AGENT,
            42,
            authorizedContract
        );
        registry.registerHandle("event-test", SAGAHandleRegistry.EntityType.AGENT, 42);
    }

    // --- Test 15: validation runs before key computation (no DoS on long input) ---
    function test_registerHandle_validatesBeforeKeyComputation() public {
        // A 200-char string should be rejected by _validateHandle before _toLower runs
        bytes memory longInput = new bytes(200);
        for (uint256 i = 0; i < 200; i++) {
            longInput[i] = "a";
        }

        vm.prank(authorizedContract);
        vm.expectRevert("SAGAHandleRegistry: invalid length");
        registry.registerHandle(string(longInput), SAGAHandleRegistry.EntityType.AGENT, 0);
    }

    // --- Test 16: register DIRECTORY entity type ---
    function test_registerHandle_directoryType() public {
        // Phase 8 (F-1): pre-seeded directory handles ("epic-hub" etc.) are
        // claimed by setUp; use a fresh handle here.
        vm.prank(authorizedContract);
        registry.registerHandle("fresh-dir", SAGAHandleRegistry.EntityType.DIRECTORY, 100);

        (SAGAHandleRegistry.EntityType entityType, uint256 tokenId, address contractAddr) =
            registry.resolveHandle("fresh-dir");

        assertEq(uint256(entityType), uint256(SAGAHandleRegistry.EntityType.DIRECTORY));
        assertEq(tokenId, 100);
        assertEq(contractAddr, authorizedContract);
    }

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
            keccak256(abi.encode("dir-a", "event-scoped")),
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

    // === Phase 8 (F-7) — handle validation fuzz ===

    /// @notice Fuzz: any input the registry accepts must be 3-64 bytes,
    ///         start+end alphanumeric, contain only ASCII alphanumeric
    ///         plus '.', '-', '_', AND have no consecutive separators
    ///         (Phase 9 G-2). Conversely, any input violating those rules
    ///         must revert. The test predicate (in pure Solidity) tracks
    ///         the contract's rules verbatim.
    function testFuzz_validateHandle_acceptOnlyValidAscii(string memory raw) public {
        bytes memory b = bytes(raw);

        bool invalid = b.length < 3 || b.length > 64;
        if (!invalid && !_isAlnum(b[0])) invalid = true;
        if (!invalid && !_isAlnum(b[b.length - 1])) invalid = true;
        if (!invalid) {
            bool prevWasSeparator = false;
            for (uint256 i = 0; i < b.length; i++) {
                bytes1 c = b[i];
                bool isSep = (c == 0x2E || c == 0x2D || c == 0x5F);
                if (!_isAlnum(c) && !isSep) {
                    invalid = true;
                    break;
                }
                // Phase 9 (G-2): consecutive separators are rejected.
                if (isSep && prevWasSeparator) {
                    invalid = true;
                    break;
                }
                prevWasSeparator = isSep;
            }
        }

        vm.prank(authorizedContract);
        if (invalid) {
            vm.expectRevert();
            registry.registerHandle(raw, SAGAHandleRegistry.EntityType.AGENT, 0);
        } else {
            // Valid: either succeeds, or reverts with "handle taken" if the
            // same input has already been registered earlier in the run.
            try registry.registerHandle(raw, SAGAHandleRegistry.EntityType.AGENT, 0) {
                // accepted
            } catch Error(string memory reason) {
                assertEq(reason, "SAGAHandleRegistry: handle taken");
            }
        }
    }

    function _isAlnum(bytes1 c) internal pure returns (bool) {
        return (c >= 0x30 && c <= 0x39) || (c >= 0x41 && c <= 0x5A)
            || (c >= 0x61 && c <= 0x7A);
    }

    // === Phase 9 regression tests ===

    // G-4: scoped namespace must be case-insensitive on directoryId. Before
    // the fix, _scopedHandleKey hashed directoryId verbatim, letting an
    // attacker register `alice` under `epic-hub` AND `Epic-Hub` AND
    // `EPIC-HUB` even though those resolve to the same directory in the
    // global namespace.
    function test_g4_scopedHandle_directoryIdCasingCollapses() public {
        vm.prank(authorizedContract);
        registry.registerScopedHandle(
            "alice", SAGAHandleRegistry.EntityType.AGENT, 1, "epic-hub"
        );

        // Same scoped handle in a case-variant directoryId must now be
        // rejected as a duplicate.
        vm.prank(authorizedContract);
        vm.expectRevert(bytes("SAGAHandleRegistry: handle taken in directory"));
        registry.registerScopedHandle(
            "alice", SAGAHandleRegistry.EntityType.AGENT, 2, "Epic-Hub"
        );

        vm.prank(authorizedContract);
        vm.expectRevert(bytes("SAGAHandleRegistry: handle taken in directory"));
        registry.registerScopedHandle(
            "alice", SAGAHandleRegistry.EntityType.AGENT, 3, "EPIC-HUB"
        );

        // And resolution under the case-variant directoryId returns the
        // original record.
        (SAGAHandleRegistry.EntityType t, uint256 tid,) =
            registry.resolveScopedHandle("alice", "EPIC-HUB");
        assertEq(uint256(t), uint256(SAGAHandleRegistry.EntityType.AGENT));
        assertEq(tid, 1);
    }

    // G-2: a handle with consecutive separators must be rejected. This
    // closes the ENS-style homoglyph attack class — `m..arcus`, `m--arcus`,
    // `m__arcus`, `m._arcus` etc all revert. Single separators between
    // alphanumerics remain valid.
    function test_g2_validateHandle_rejectsConsecutiveSeparators() public {
        string[7] memory bad = [
            "m..arcus",
            "m--arcus",
            "m__arcus",
            "m._arcus",
            "m.-arcus",
            "m_-arcus",
            "a.._b"
        ];
        for (uint256 i = 0; i < bad.length; i++) {
            vm.prank(authorizedContract);
            vm.expectRevert(bytes("SAGAHandleRegistry: consecutive separator"));
            registry.registerHandle(bad[i], SAGAHandleRegistry.EntityType.AGENT, i);
        }

        // Single separators still pass.
        vm.prank(authorizedContract);
        registry.registerHandle("m.arcus", SAGAHandleRegistry.EntityType.AGENT, 100);
        vm.prank(authorizedContract);
        registry.registerHandle("m-arcus", SAGAHandleRegistry.EntityType.AGENT, 101);
        vm.prank(authorizedContract);
        registry.registerHandle("m_arcus", SAGAHandleRegistry.EntityType.AGENT, 102);
    }

    // G-11: trustedDirectoryContracts mapping replaces the singleton
    // directoryIdentity pointer. A V2 directory contract can be added
    // without bricking V1; a deauthorized contract no longer accepts new
    // scoped registrations.
    function test_g11_trustedDirectoryContracts_supportsMultiple() public {
        // Stand up a second mock as if it were a V2 directory.
        MockDirectoryIdentity mockV2 = new MockDirectoryIdentity();
        registry.setAuthorizedContract(address(mockV2), true);
        registry.setTrustedDirectoryContract(address(mockV2), true);

        // Seed a directory under V2 (different from V1's seed list).
        vm.prank(address(mockV2));
        registry.registerHandle("v2-dir", SAGAHandleRegistry.EntityType.DIRECTORY, 99);

        // Scoped registration against V1's directory still works.
        vm.prank(authorizedContract);
        registry.registerScopedHandle(
            "alice", SAGAHandleRegistry.EntityType.AGENT, 1, "epic-hub"
        );
        // And against V2's directory works.
        vm.prank(authorizedContract);
        registry.registerScopedHandle(
            "alice", SAGAHandleRegistry.EntityType.AGENT, 2, "v2-dir"
        );

        // Both records resolve in their respective scopes.
        (, uint256 tidV1,) = registry.resolveScopedHandle("alice", "epic-hub");
        (, uint256 tidV2,) = registry.resolveScopedHandle("alice", "v2-dir");
        assertEq(tidV1, 1);
        assertEq(tidV2, 2);
    }

    function test_g11_trustedDirectoryContracts_deauthorizationBlocksNewScoped() public {
        // Deauthorize the V1 directory mock for new scoped registrations.
        registry.setTrustedDirectoryContract(address(mockDirectoryIdentity), false);

        // New scoped registration against V1's directory is blocked.
        vm.prank(authorizedContract);
        vm.expectRevert(bytes("SAGAHandleRegistry: untrusted directory contract"));
        registry.registerScopedHandle(
            "alice", SAGAHandleRegistry.EntityType.AGENT, 1, "epic-hub"
        );

        // Re-trust and registration succeeds again.
        registry.setTrustedDirectoryContract(address(mockDirectoryIdentity), true);
        vm.prank(authorizedContract);
        registry.registerScopedHandle(
            "alice", SAGAHandleRegistry.EntityType.AGENT, 1, "epic-hub"
        );
    }

    // G-5: resolveActiveScopedHandle filters revoked directories.

    function test_g5_resolveActiveScopedHandle_succeedsOnActive() public {
        vm.prank(authorizedContract);
        registry.registerScopedHandle(
            "alice", SAGAHandleRegistry.EntityType.AGENT, 0, "epic-hub"
        );

        (SAGAHandleRegistry.EntityType et, uint256 tid, address ca) =
            registry.resolveActiveScopedHandle("alice", "epic-hub");
        assertEq(uint256(et), uint256(SAGAHandleRegistry.EntityType.AGENT));
        assertEq(tid, 0);
        assertEq(ca, authorizedContract);
    }

    function test_g5_resolveActiveScopedHandle_revertsAfterDirectoryRevoked() public {
        // Stand up a directory whose status is mutable so we can simulate
        // the revocation event after registrations have already landed.
        StatusMutableMock mut = new StatusMutableMock();
        mut.setStatus("active");
        registry.setAuthorizedContract(address(mut), true);
        registry.setTrustedDirectoryContract(address(mut), true);

        vm.prank(address(mut));
        registry.registerHandle(
            "mut-dir", SAGAHandleRegistry.EntityType.DIRECTORY, 200
        );
        vm.prank(authorizedContract);
        registry.registerScopedHandle(
            "user1", SAGAHandleRegistry.EntityType.AGENT, 0, "mut-dir"
        );

        // Raw resolver returns the record while the directory is active.
        (SAGAHandleRegistry.EntityType et,,) =
            registry.resolveScopedHandle("user1", "mut-dir");
        assertEq(uint256(et), uint256(SAGAHandleRegistry.EntityType.AGENT));

        // Mutate status to revoked.
        mut.setStatus("revoked");

        // Raw resolver still returns the record (forensic indexers).
        (SAGAHandleRegistry.EntityType et2,,) =
            registry.resolveScopedHandle("user1", "mut-dir");
        assertEq(uint256(et2), uint256(SAGAHandleRegistry.EntityType.AGENT));

        // Active-only view rejects.
        vm.expectRevert(bytes("SAGAHandleRegistry: directory not active"));
        registry.resolveActiveScopedHandle("user1", "mut-dir");
    }

    function test_g5_resolveActiveScopedHandle_revertsWhenDirectoryNotFound() public {
        vm.expectRevert(bytes("SAGAHandleRegistry: directory not found"));
        registry.resolveActiveScopedHandle("alice", "ghost-dir");
    }

    // G-9: global and scoped namespaces must be hash-disjoint. The global
    // key is `keccak256(abi.encodePacked(_toLower(handle)))`; the scoped
    // key is `keccak256(abi.encode(_toLower(directoryId), _toLower(handle)))`.
    // `abi.encode` for dynamic-type tuples emits offsets, then for each
    // operand its length followed by its bytes — a layout that CANNOT
    // collide with the packed single-string encoding for any non-empty
    // inputs. Production code lowercases both operands first, so this
    // fuzz uses the registry's own `handleExists` for collision skips
    // instead of byte-equality (the namespace is case-insensitive).
    // Property: a global registration with handle X under any directoryId
    // Y must NEVER produce a key that collides with a scoped registration
    // under (Y, X) such that one record overwrites the other.
    function testFuzz_g9_handleAndScopedKeyDisjoint(
        string calldata globalHandle,
        string calldata scopedHandle,
        string calldata directoryId
    ) public {
        // Bound inputs to valid handle shape so registerHandle accepts.
        // We mirror _validateHandle's rules instead of catching reverts so
        // the fuzz exercises the real success path.
        if (!_isValidHandle(globalHandle)) return;
        if (!_isValidHandle(scopedHandle)) return;
        if (!_isValidHandle(directoryId)) return;

        // Skip directoryIds that already exist in the global namespace
        // (fixture seeds from setUp). `handleExists` uses the registry's
        // case-insensitive key, so a fuzz input like "EPIC-HUB" is
        // correctly recognized as colliding with the "epic-hub" seed.
        if (registry.handleExists(directoryId)) return;
        // Skip globalHandle if it collides with directoryId or any
        // already-registered handle. Same case-insensitive reasoning.
        if (registry.handleExists(globalHandle)) return;
        if (
            keccak256(bytes(_lowerCopy(globalHandle)))
                == keccak256(bytes(_lowerCopy(directoryId)))
        ) {
            return;
        }

        vm.prank(address(mockDirectoryIdentity));
        registry.registerHandle(
            directoryId, SAGAHandleRegistry.EntityType.DIRECTORY, 1000
        );

        vm.prank(authorizedContract);
        registry.registerHandle(globalHandle, SAGAHandleRegistry.EntityType.AGENT, 1);

        vm.prank(authorizedContract);
        registry.registerScopedHandle(
            scopedHandle, SAGAHandleRegistry.EntityType.AGENT, 2, directoryId
        );

        // The global record is intact: it still resolves to (AGENT, 1, ac).
        (SAGAHandleRegistry.EntityType etG, uint256 tidG,) =
            registry.resolveHandle(globalHandle);
        assertEq(uint256(etG), uint256(SAGAHandleRegistry.EntityType.AGENT));
        assertEq(tidG, 1);

        // The scoped record resolves to (AGENT, 2, ac) — disjoint storage.
        (SAGAHandleRegistry.EntityType etS, uint256 tidS,) =
            registry.resolveScopedHandle(scopedHandle, directoryId);
        assertEq(uint256(etS), uint256(SAGAHandleRegistry.EntityType.AGENT));
        assertEq(tidS, 2);
    }

    function _lowerCopy(string memory s) internal pure returns (string memory) {
        bytes memory b = bytes(s);
        bytes memory out = new bytes(b.length);
        for (uint256 i = 0; i < b.length; i++) {
            out[i] = (b[i] >= 0x41 && b[i] <= 0x5A) ? bytes1(uint8(b[i]) + 32) : b[i];
        }
        return string(out);
    }

    function _isValidHandle(string memory raw) internal pure returns (bool) {
        bytes memory b = bytes(raw);
        if (b.length < 3 || b.length > 64) return false;
        if (!_isAlnum(b[0]) || !_isAlnum(b[b.length - 1])) return false;
        bool prevSep = false;
        for (uint256 i = 0; i < b.length; i++) {
            bytes1 c = b[i];
            bool sep = (c == 0x2E || c == 0x2D || c == 0x5F);
            if (!_isAlnum(c) && !sep) return false;
            if (sep && prevSep) return false;
            prevSep = sep;
        }
        return true;
    }

    // === Phase 10 regression tests ===

    // H-2: resolveActiveScopedHandle MUST honor trustedDirectoryContracts.
    // Without this gate, a directory contract that governance has
    // detrusted (compromised or upgraded out) can keep returning "active"
    // and let scoped handles resolve as if nothing changed. The write
    // path (registerScopedHandle) already enforces the gate; the read
    // path was missing it after the Phase 9 G-5 view was added.
    function test_h2_resolveActiveScopedHandle_revertsWhenContractDetrusted() public {
        StatusMutableMock mut = new StatusMutableMock();
        mut.setStatus("active");
        registry.setAuthorizedContract(address(mut), true);
        registry.setTrustedDirectoryContract(address(mut), true);

        vm.prank(address(mut));
        registry.registerHandle(
            "h2-dir", SAGAHandleRegistry.EntityType.DIRECTORY, 300
        );
        vm.prank(authorizedContract);
        registry.registerScopedHandle(
            "alice", SAGAHandleRegistry.EntityType.AGENT, 0, "h2-dir"
        );

        // Sanity: succeeds while trusted.
        registry.resolveActiveScopedHandle("alice", "h2-dir");

        // Detrust the directory contract. The mock still returns "active"
        // but the registry must reject.
        registry.setTrustedDirectoryContract(address(mut), false);

        vm.expectRevert(bytes("SAGAHandleRegistry: untrusted directory contract"));
        registry.resolveActiveScopedHandle("alice", "h2-dir");

        // Raw resolveScopedHandle still returns the record (forensic path,
        // unchanged by H-2).
        (SAGAHandleRegistry.EntityType et,,) =
            registry.resolveScopedHandle("alice", "h2-dir");
        assertEq(uint256(et), uint256(SAGAHandleRegistry.EntityType.AGENT));
    }

    // H-6: renounceOwnership disabled-message wins for every caller.
    function test_h6_renounceOwnership_revertsForNonOwnerWithSameMessage() public {
        vm.prank(makeAddr("randomEoa"));
        vm.expectRevert(bytes("SAGAHandleRegistry: renounce disabled"));
        registry.renounceOwnership();
    }

    // === Phase 10B regression tests ===

    // M-4: setAuthorizedContract(addr, true) requires `addr` to be a
    // contract. EOA targets revert. Deauthorization (false) accepts any
    // address — it's a safety action.
    function test_m4_setAuthorizedContract_rejectsEoa() public {
        address eoa = makeAddr("randomEoa");
        vm.expectRevert(bytes("SAGAHandleRegistry: authorized must be contract"));
        registry.setAuthorizedContract(eoa, true);

        // Deauthorize accepts EOAs (no-op since not authorized, but doesn't revert).
        registry.setAuthorizedContract(eoa, false);
    }

    // M-1: post-handoff authorize-true reverts and must use the queue;
    // deauthorize-false stays immediate; bootstrap (initial owner)
    // path still allows immediate authorize-true so Deploy.s.sol works.
    function test_m1_setAuthorizedContract_postHandoffRevertsOnAuthorize() public {
        address newContract = makeAddr("newContract");
        vm.etch(newContract, hex"60006000fd");

        // Phase 11 (J-3): close the bootstrap window. The post-bootstrap
        // gate replaces Phase 10's `_initialOwner == owner()` check;
        // the bootstrap-finalized flag is set explicitly inside Deploy.s.sol
        // (or in tests, via this direct call) regardless of whether an
        // ownership handoff has completed.
        registry.finalizeBootstrap();

        // Post-bootstrap: authorize-true via setAuthorizedContract reverts.
        vm.expectRevert(
            bytes("SAGAHandleRegistry: post-bootstrap: use queueAuthorizedContract")
        );
        registry.setAuthorizedContract(newContract, true);

        // Post-bootstrap: deauthorize-false is immediate (safety action).
        registry.setAuthorizedContract(newContract, false);
    }

    function test_m1_queueAndApply_authorizedContract() public {
        address newContract = makeAddr("newContract");
        vm.etch(newContract, hex"60006000fd");

        // Hand off to Safe.
        address safe = makeAddr("safe");
        registry.transferOwnership(safe);
        vm.prank(safe);
        registry.acceptOwnership();

        // Queue from Safe.
        vm.prank(safe);
        registry.queueAuthorizedContract(newContract);
        assertEq(registry.pendingAuthorizedContract(), newContract);
        assertEq(registry.pendingAuthorizedContractReadyAt(), block.timestamp + 24 hours);

        // Apply too early reverts.
        vm.prank(safe);
        vm.expectRevert(bytes("SAGAHandleRegistry: authorize not yet ready"));
        registry.applyAuthorizedContract(newContract);

        vm.warp(block.timestamp + 24 hours);

        // Phase 12 (K-1): apply is now onlyOwner. The Safe queues AND
        // applies; eliminates the cancel/apply front-running race.
        vm.prank(safe);
        registry.applyAuthorizedContract(newContract);
        assertTrue(registry.authorizedContracts(newContract));
        assertEq(registry.pendingAuthorizedContract(), address(0));
    }

    function test_m1_queueAuthorizedContract_rejectsEoa() public {
        address safe = makeAddr("safe");
        registry.transferOwnership(safe);
        vm.prank(safe);
        registry.acceptOwnership();

        vm.prank(safe);
        vm.expectRevert(bytes("SAGAHandleRegistry: authorized must be contract"));
        registry.queueAuthorizedContract(makeAddr("randomEoa"));
    }

    function test_m1_setTrustedDirectoryContract_postHandoffRevertsOnTrust() public {
        MockDirectoryIdentity v2 = new MockDirectoryIdentity();

        // Phase 11 (J-3): bootstrap-finalized gate (see preceding test).
        registry.finalizeBootstrap();

        vm.expectRevert(
            bytes("SAGAHandleRegistry: post-bootstrap: use queueTrustedDirectoryContract")
        );
        registry.setTrustedDirectoryContract(address(v2), true);

        // Detrust still immediate.
        registry.setTrustedDirectoryContract(address(v2), false);
    }

    function test_m1_queueAndApply_trustedDirectoryContract() public {
        MockDirectoryIdentity v2 = new MockDirectoryIdentity();

        address safe = makeAddr("safe");
        registry.transferOwnership(safe);
        vm.prank(safe);
        registry.acceptOwnership();

        vm.prank(safe);
        registry.queueTrustedDirectoryContract(address(v2));
        assertEq(registry.pendingTrustedDirectoryContract(), address(v2));

        vm.prank(safe);
        vm.expectRevert(bytes("SAGAHandleRegistry: trust not yet ready"));
        registry.applyTrustedDirectoryContract(address(v2));

        vm.warp(block.timestamp + 24 hours);
        // Phase 12 (K-1): apply is onlyOwner.
        vm.prank(safe);
        registry.applyTrustedDirectoryContract(address(v2));
        assertTrue(registry.trustedDirectoryContracts(address(v2)));
    }

    // === Phase 11 regression tests ===

    // J-1: cancelPendingAuthorizedContract clears the queue cleanly so
    // the Safe can back out of a mistake without overwrite-and-restart.
    function test_j1_cancelPendingAuthorizedContract_clearsSlot() public {
        address newContract = makeAddr("newContract-j1a");
        vm.etch(newContract, hex"60006000fd");

        registry.queueAuthorizedContract(newContract);
        assertEq(registry.pendingAuthorizedContract(), newContract);

        registry.cancelPendingAuthorizedContract();
        assertEq(registry.pendingAuthorizedContract(), address(0));
        assertEq(registry.pendingAuthorizedContractReadyAt(), 0);

        vm.warp(block.timestamp + 24 hours);
        vm.expectRevert(bytes("SAGAHandleRegistry: no pending authorize"));
        registry.applyAuthorizedContract(newContract);
    }

    function test_j1_cancelPendingAuthorizedContract_onlyOwner() public {
        vm.prank(makeAddr("randomEoa"));
        vm.expectRevert();
        registry.cancelPendingAuthorizedContract();
    }

    // J-1 Copilot review fix: reverts when nothing is queued so callers
    // don't accidentally emit a misleading no-op cancellation event.
    function test_j1_cancelPendingAuthorizedContract_revertsWhenEmpty() public {
        vm.expectRevert(bytes("SAGAHandleRegistry: no pending authorize"));
        registry.cancelPendingAuthorizedContract();
    }

    function test_j1_cancelPendingTrustedDirectoryContract_clearsSlot() public {
        MockDirectoryIdentity v2 = new MockDirectoryIdentity();

        registry.queueTrustedDirectoryContract(address(v2));
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

    // J-1 Copilot review fix: reverts when nothing is queued.
    function test_j1_cancelPendingTrustedDirectoryContract_revertsWhenEmpty() public {
        vm.expectRevert(bytes("SAGAHandleRegistry: no pending trust"));
        registry.cancelPendingTrustedDirectoryContract();
    }

    // J-3: bootstrapFinalized flag closes the immediate-authorize window.
    function test_j3_finalizeBootstrap_disablesImmediateAuthorize() public {
        // Pre-finalize: deployer can authorize immediately.
        address contractA = makeAddr("contractA-j3");
        vm.etch(contractA, hex"60006000fd");
        registry.setAuthorizedContract(contractA, true);
        assertTrue(registry.authorizedContracts(contractA));

        // Finalize bootstrap.
        registry.finalizeBootstrap();
        assertTrue(registry.bootstrapFinalized());

        // Post-finalize: even the deployer must use the queue path.
        address contractB = makeAddr("contractB-j3");
        vm.etch(contractB, hex"60006000fd");
        vm.expectRevert(
            bytes("SAGAHandleRegistry: post-bootstrap: use queueAuthorizedContract")
        );
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

    // J-7: structural pin that the registry inherits ReentrancyGuard.
    // Real re-entrancy would require a malicious authorized contract; this
    // test confirms registerHandle still works through the new guard path.
    function test_j7_registry_registerHandle_withGuardActive() public {
        vm.prank(authorizedContract);
        registry.registerHandle("j7-pin", SAGAHandleRegistry.EntityType.AGENT, 9999);
        (SAGAHandleRegistry.EntityType et,,) = registry.resolveHandle("j7-pin");
        assertEq(uint256(et), uint256(SAGAHandleRegistry.EntityType.AGENT));
    }

    // === Phase 12 regression tests ===

    // K-1: applyAuthorizedContract / applyTrustedDirectoryContract are
    // now onlyOwner. A non-owner cannot front-run a Safe cancel-tx
    // with their own apply-tx the moment the timelock ripens.
    function test_k1_applyAuthorizedContract_onlyOwner() public {
        address newContract = makeAddr("k1-nc");
        vm.etch(newContract, hex"60006000fd");
        registry.queueAuthorizedContract(newContract);
        vm.warp(block.timestamp + 24 hours);

        vm.prank(makeAddr("rando"));
        vm.expectRevert();
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

    // K-2: codehash snapshot at queue time, compared at apply time.
    // Catches CREATE2 metamorphism, proxy implementation flips, and
    // any other code-mutation between queue and apply.
    function test_k2_applyAuthorizedContract_revertsOnCodehashChange() public {
        address target = makeAddr("k2-target");
        vm.etch(target, hex"60006000fd");
        registry.queueAuthorizedContract(target);
        vm.warp(block.timestamp + 24 hours);

        // Mutate the bytecode (simulates CREATE2 redeploy or proxy flip).
        vm.etch(target, hex"60016001");

        vm.expectRevert(bytes("SAGAHandleRegistry: code changed during timelock"));
        registry.applyAuthorizedContract(target);
    }

    function test_k2_applyTrustedDirectoryContract_revertsOnCodehashChange() public {
        MockDirectoryIdentity v2 = new MockDirectoryIdentity();
        registry.queueTrustedDirectoryContract(address(v2));
        vm.warp(block.timestamp + 24 hours);

        // Replace code at v2's address with arbitrary bytes.
        vm.etch(address(v2), hex"60016001");

        vm.expectRevert(bytes("SAGAHandleRegistry: code changed during timelock"));
        registry.applyTrustedDirectoryContract(address(v2));
    }

    // K-2: cancel paths clear the codehash slot too.
    function test_k2_cancel_clearsCodehashSlot() public {
        address target = makeAddr("k2-cancel");
        vm.etch(target, hex"60006000fd");
        registry.queueAuthorizedContract(target);
        registry.cancelPendingAuthorizedContract();

        // Re-queue with same address but rotated code. Should succeed
        // because the cancel cleared the prior codehash. Apply with
        // current code should pass.
        vm.etch(target, hex"60016001");
        registry.queueAuthorizedContract(target);
        vm.warp(block.timestamp + 24 hours);
        registry.applyAuthorizedContract(target);
        assertTrue(registry.authorizedContracts(target));
    }
}
