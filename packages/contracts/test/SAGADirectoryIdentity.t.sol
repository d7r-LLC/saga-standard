// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {Test, Vm} from "forge-std/Test.sol";
import {SAGAHandleRegistry} from "../src/SAGAHandleRegistry.sol";
import {SAGADirectoryIdentity} from "../src/SAGADirectoryIdentity.sol";
import {SAGAAgentIdentity} from "../src/SAGAAgentIdentity.sol";
import {SAGAValidation} from "../src/SAGAValidation.sol";
import {IERC721Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";
import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";

contract MockTBAHelper {
    function computeAccount(address tokenContract, uint256 tokenId)
        external
        pure
        returns (address)
    {
        return address(uint160(uint256(keccak256(abi.encode(tokenContract, tokenId)))));
    }
}

/// @dev Phase 10 (M-7): exposes the internal _statusRank pure function as
///      a public probe so tests can pin the empty-string-as-rank-0
///      behavior without storage-slot manipulation.
contract StatusRankHarness is SAGADirectoryIdentity {
    constructor()
        SAGADirectoryIdentity(
            address(new SAGAHandleRegistry()),
            address(new MockTBAHelper())
        )
    {}

    function exposed_statusRank(string memory status) external pure returns (uint8) {
        return _statusRank(status);
    }
}

/// @dev Phase 12 (K-3): destination whose `token()` deliberately spins
///      until OOG. Pins that the bounded 30k gas budget on
///      SAGADirectoryIdentity's J-13 transfer guard prevents griefing.
contract DirectoryGasGrieferTBA {
    function token() external pure returns (uint256, address, uint256) {
        uint256 i = 1;
        while (true) {
            i = i + 1;
        }
        return (i, address(0), 0); // unreachable
    }
    function onERC721Received(address, address, uint256, bytes calldata)
        external pure returns (bytes4)
    {
        return 0x150b7a02;
    }
}

contract SAGADirectoryIdentityTest is Test, IERC721Receiver {
    /// @dev Phase 8 (F-2): test contract receives directory NFTs via _safeMint,
    ///      which now invokes onERC721Received.
    function onERC721Received(address, address, uint256, bytes calldata)
        external
        pure
        override
        returns (bytes4)
    {
        return IERC721Receiver.onERC721Received.selector;
    }

    SAGAHandleRegistry public registry;
    SAGADirectoryIdentity public directory;
    SAGAAgentIdentity public agent;
    MockTBAHelper public tbaHelper;
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
        tbaHelper = new MockTBAHelper();
        directory = new SAGADirectoryIdentity(address(registry), address(tbaHelper));
        agent = new SAGAAgentIdentity(address(registry), address(tbaHelper));

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
        vm.expectRevert(SAGAValidation.InvalidUrlLength.selector);
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
        // Phase 11 (J-5): conformance length enforced via SAGAValidation.
        vm.expectRevert(SAGAValidation.InvalidTextLength.selector);
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
        vm.expectRevert("SAGADirectoryIdentity: not authorized");
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
        vm.expectRevert("SAGADirectoryIdentity: not authorized");
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

    // === Phase 1 — operator self-rehab restriction (A-Crit#4) ===
    //
    // The token owner (operator) can only DOWNGRADE their own status:
    //   active=0 → suspended=1 → flagged=2 → revoked=3
    // Contract owner (Safe) keeps full authority and can set any status.

    function _registerDir(address operator, string memory id) internal returns (uint256) {
        vm.prank(operator);
        return directory.registerDirectory(id, "https://hub.com", operator, "full");
    }

    function test_updateDirectoryStatus_operatorCanDowngradeActiveToSuspended() public {
        uint256 tokenId = _registerDir(user1, "downgrade-1");
        vm.prank(user1);
        directory.updateDirectoryStatus(tokenId, "suspended");
        assertEq(directory.directoryStatus(tokenId), "suspended");
    }

    function test_updateDirectoryStatus_operatorCanDowngradeSuspendedToRevoked() public {
        uint256 tokenId = _registerDir(user1, "downgrade-2");
        vm.prank(deployer);
        directory.updateDirectoryStatus(tokenId, "suspended");

        vm.prank(user1);
        directory.updateDirectoryStatus(tokenId, "revoked");
        assertEq(directory.directoryStatus(tokenId), "revoked");
    }

    function test_updateDirectoryStatus_operatorCannotUpgradeFlaggedToActive() public {
        uint256 tokenId = _registerDir(user1, "no-upgrade-1");
        // Governance flags
        vm.prank(deployer);
        directory.updateDirectoryStatus(tokenId, "flagged");

        // Operator tries to self-rehab
        vm.prank(user1);
        vm.expectRevert("SAGADirectoryIdentity: nft owner can only downgrade status");
        directory.updateDirectoryStatus(tokenId, "active");
    }

    function test_updateDirectoryStatus_operatorCannotUpgradeRevokedToSuspended() public {
        uint256 tokenId = _registerDir(user1, "no-upgrade-2");
        vm.prank(deployer);
        directory.updateDirectoryStatus(tokenId, "revoked");

        vm.prank(user1);
        vm.expectRevert("SAGADirectoryIdentity: nft owner can only downgrade status");
        directory.updateDirectoryStatus(tokenId, "suspended");
    }

    function test_updateDirectoryStatus_operatorCannotUpgradeSuspendedToActive() public {
        uint256 tokenId = _registerDir(user1, "no-upgrade-3");
        // Operator first downgrades to suspended (allowed)
        vm.prank(user1);
        directory.updateDirectoryStatus(tokenId, "suspended");

        // Then tries to undo it
        vm.prank(user1);
        vm.expectRevert("SAGADirectoryIdentity: nft owner can only downgrade status");
        directory.updateDirectoryStatus(tokenId, "active");
    }

    function test_updateDirectoryStatus_operatorCanNoOpAtSameRank() public {
        uint256 tokenId = _registerDir(user1, "same-rank");
        // active → active (rank 0 → rank 0, allowed: rank >= rank)
        vm.prank(user1);
        directory.updateDirectoryStatus(tokenId, "active");
        assertEq(directory.directoryStatus(tokenId), "active");
    }

    function test_updateDirectoryStatus_governanceCanRestoreActiveFromFlagged() public {
        uint256 tokenId = _registerDir(user1, "gov-restore");
        vm.prank(deployer);
        directory.updateDirectoryStatus(tokenId, "flagged");

        // Governance (contract owner) bypasses the downgrade-only rule
        vm.prank(deployer);
        directory.updateDirectoryStatus(tokenId, "active");
        assertEq(directory.directoryStatus(tokenId), "active");
    }

    function test_updateDirectoryStatus_governanceCanSetAnyStatus() public {
        uint256 tokenId = _registerDir(user1, "gov-any");

        vm.prank(deployer);
        directory.updateDirectoryStatus(tokenId, "revoked");
        assertEq(directory.directoryStatus(tokenId), "revoked");

        // Even from revoked, governance can go back to suspended
        vm.prank(deployer);
        directory.updateDirectoryStatus(tokenId, "suspended");
        assertEq(directory.directoryStatus(tokenId), "suspended");
    }

    // === Phase 1 — URL validation (A-Med#14) ===

    function test_registerDirectory_invalidProtocolReverts() public {
        vm.prank(user1);
        vm.expectRevert(SAGAValidation.InvalidUrlProtocol.selector);
        directory.registerDirectory("bad-proto", "javascript:alert(1)", user1, "full");
    }

    function test_updateDirectoryUrl_emptyReverts() public {
        uint256 tokenId = _registerDir(user1, "url-empty");
        vm.prank(user1);
        vm.expectRevert(SAGAValidation.InvalidUrlLength.selector);
        directory.updateDirectoryUrl(tokenId, "");
    }

    function test_updateDirectoryUrl_invalidProtocolReverts() public {
        uint256 tokenId = _registerDir(user1, "url-proto");
        vm.prank(user1);
        vm.expectRevert(SAGAValidation.InvalidUrlProtocol.selector);
        directory.updateDirectoryUrl(tokenId, "data:text/html,evil");
    }

    // === Phase 8 regression tests ===

    // F-3
    function test_ownership_twoStepRequired() public {
        address pending = makeAddr("pending");
        directory.transferOwnership(pending);
        assertEq(directory.owner(), address(this));
        assertEq(directory.pendingOwner(), pending);
        vm.prank(pending);
        directory.acceptOwnership();
        assertEq(directory.owner(), pending);
    }

    function test_renounceOwnership_reverts() public {
        vm.expectRevert(bytes("SAGADirectoryIdentity: renounce disabled"));
        directory.renounceOwnership();
    }

    // F-8
    function test_constructor_revertsOnZeroRegistry() public {
        vm.expectRevert(bytes("SAGADirectoryIdentity: registry not contract"));
        new SAGADirectoryIdentity(address(0), address(tbaHelper));
    }

    function test_constructor_revertsOnEoaRegistry() public {
        vm.expectRevert(bytes("SAGADirectoryIdentity: registry not contract"));
        new SAGADirectoryIdentity(makeAddr("eoa"), address(tbaHelper));
    }

    // F-4: constructor rejects zero / EOA tbaHelper
    function test_constructor_revertsOnZeroTbaHelper() public {
        vm.expectRevert(bytes("SAGADirectoryIdentity: tba helper not contract"));
        new SAGADirectoryIdentity(address(registry), address(0));
    }

    function test_constructor_revertsOnEoaTbaHelper() public {
        vm.expectRevert(bytes("SAGADirectoryIdentity: tba helper not contract"));
        new SAGADirectoryIdentity(address(registry), makeAddr("eoa-tba"));
    }

    // F-4: self-TBA transfer guard
    function test_safeTransferToOwnTBA_reverts() public {
        vm.prank(user1);
        uint256 tokenId = directory.registerDirectory(
            "self-tba-dir", "https://dir.example/", makeAddr("op"), "basic"
        );
        address selfTba = tbaHelper.computeAccount(address(directory), tokenId);
        vm.prank(user1);
        vm.expectRevert(bytes("SAGADirectoryIdentity: cannot transfer to own TBA"));
        directory.transferFrom(user1, selfTba, tokenId);
    }

    // F-6 / G-8: setBaseURI queues; applyBaseURI emits BaseURIUpdated.
    function test_setBaseURI_emitsEvent() public {
        vm.expectEmit(false, false, false, true, address(directory));
        emit SAGADirectoryIdentity.BaseURIQueued(
            "https://x.example/", block.timestamp + 24 hours
        );
        directory.setBaseURI("https://x.example/");

        vm.warp(block.timestamp + 24 hours);
        vm.expectEmit(false, false, false, true, address(directory));
        emit SAGADirectoryIdentity.BaseURIUpdated(
            "https://saga-standard.dev/api/metadata/directory/", "https://x.example/"
        );
        directory.applyBaseURI();
    }

    function test_setBaseURI_revertsOnInvalidProtocol() public {
        vm.expectRevert(SAGAValidation.InvalidUrlProtocol.selector);
        directory.setBaseURI("javascript:alert(1)");
    }

    // G-8: queue + 24h timelock + apply
    function test_g8_setBaseURI_requiresQueueAndDelay() public {
        directory.setBaseURI("https://x.example/");
        assertEq(directory.pendingBaseURI(), "https://x.example/");
        vm.expectRevert(bytes("SAGADirectoryIdentity: base uri not yet ready"));
        directory.applyBaseURI();
        vm.warp(block.timestamp + 24 hours);
        directory.applyBaseURI();
        assertEq(directory.pendingBaseURIReadyAt(), 0);

        // Apply with no queue reverts.
        vm.expectRevert(bytes("SAGADirectoryIdentity: no pending base uri"));
        directory.applyBaseURI();
    }

    function test_g8_setBaseURI_anyoneCanApplyAfterTimelock() public {
        directory.setBaseURI("https://anyone.example/");
        vm.warp(block.timestamp + 24 hours);
        // Non-owner finalizes the queued URI.
        vm.prank(makeAddr("randomCaller"));
        directory.applyBaseURI();
        assertEq(directory.pendingBaseURIReadyAt(), 0);
    }

    function test_g8_setBaseURI_overwritesPendingValue() public {
        directory.setBaseURI("https://first.example/");
        directory.setBaseURI("https://second.example/");
        assertEq(directory.pendingBaseURI(), "https://second.example/");
        vm.warp(block.timestamp + 24 hours);
        directory.applyBaseURI();
    }

    // F-10: block transfer + URL update on flagged/revoked directories
    function test_transferFlaggedDirectoryReverts() public {
        vm.prank(user1);
        uint256 tokenId = directory.registerDirectory(
            "flag-test", "https://dir.example/", makeAddr("op"), "basic"
        );
        // Contract owner (this test contract) flags the directory
        directory.updateDirectoryStatus(tokenId, "flagged");
        vm.prank(user1);
        vm.expectRevert(bytes("SAGADirectoryIdentity: cannot transfer flagged or revoked"));
        directory.transferFrom(user1, user2, tokenId);
    }

    function test_transferRevokedDirectoryReverts() public {
        vm.prank(user1);
        uint256 tokenId = directory.registerDirectory(
            "revoke-test", "https://dir.example/", makeAddr("op"), "basic"
        );
        directory.updateDirectoryStatus(tokenId, "revoked");
        vm.prank(user1);
        vm.expectRevert(bytes("SAGADirectoryIdentity: cannot transfer flagged or revoked"));
        directory.transferFrom(user1, user2, tokenId);
    }

    function test_updateUrlOnFlaggedReverts() public {
        vm.prank(user1);
        uint256 tokenId = directory.registerDirectory(
            "url-flag", "https://dir.example/", makeAddr("op"), "basic"
        );
        directory.updateDirectoryStatus(tokenId, "flagged");
        vm.prank(user1);
        vm.expectRevert(
            bytes("SAGADirectoryIdentity: cannot update url when flagged or revoked")
        );
        directory.updateDirectoryUrl(tokenId, "https://new.example/");
    }

    function test_updateUrlOnRevokedReverts() public {
        vm.prank(user1);
        uint256 tokenId = directory.registerDirectory(
            "url-revoke", "https://dir.example/", makeAddr("op"), "basic"
        );
        directory.updateDirectoryStatus(tokenId, "revoked");
        vm.prank(user1);
        vm.expectRevert(
            bytes("SAGADirectoryIdentity: cannot update url when flagged or revoked")
        );
        directory.updateDirectoryUrl(tokenId, "https://new.example/");
    }

    // F-9: 32-byte cap on the self-claimed conformance level.
    function test_registerDirectory_conformanceLevelCappedAt32() public {
        string memory exact32 = "01234567890123456789012345678901"; // 32 bytes
        vm.prank(user1);
        uint256 tokenId = directory.registerDirectory(
            "cap-exact", "https://dir.example/", makeAddr("op"), exact32
        );
        assertEq(directory.conformanceLevel(tokenId), exact32);
    }

    function test_registerDirectory_revertsOnConformanceOverflow() public {
        string memory tooBig = "012345678901234567890123456789012"; // 33 bytes
        vm.prank(user1);
        // Phase 11 (J-5): conformance > 32 bytes via SAGAValidation.
        vm.expectRevert(SAGAValidation.InvalidTextLength.selector);
        directory.registerDirectory(
            "cap-overflow", "https://dir.example/", makeAddr("op"), tooBig
        );
    }

    // === Phase 9 regression tests ===

    // G-1: governance MUST be able to reassign a flagged or revoked
    // directory. Without the bypass, F-10's transfer block combined with
    // F-1's active-status registration gate permanently freezes the
    // directory: it cannot be transferred to a clean caretaker AND no new
    // scoped registrations can be issued under it. The contract-owner
    // (Safe multisig) escape hatch is the only way to recover.
    function test_g1_governanceCanTransferFlaggedDirectory() public {
        vm.prank(user1);
        uint256 tokenId = directory.registerDirectory(
            "g1-flag", "https://dir.example/", makeAddr("op"), "basic"
        );
        directory.updateDirectoryStatus(tokenId, "flagged");

        // The caller is `address(this)` — the contract owner from setUp.
        // This must succeed because governance is the recovery path.
        directory.transferFrom(user1, user2, tokenId);
        assertEq(directory.ownerOf(tokenId), user2);
    }

    function test_g1_governanceCanTransferRevokedDirectory() public {
        vm.prank(user1);
        uint256 tokenId = directory.registerDirectory(
            "g1-revoke", "https://dir.example/", makeAddr("op"), "basic"
        );
        directory.updateDirectoryStatus(tokenId, "revoked");

        directory.transferFrom(user1, user2, tokenId);
        assertEq(directory.ownerOf(tokenId), user2);
    }

    // G-1: non-governance callers (token owner, approved operators) must
    // still be blocked. The bypass is keyed on `auth == owner()` exactly.
    function test_g1_tokenOwnerStillBlockedOnFlagged() public {
        vm.prank(user1);
        uint256 tokenId = directory.registerDirectory(
            "g1-owner-flag", "https://dir.example/", makeAddr("op"), "basic"
        );
        directory.updateDirectoryStatus(tokenId, "flagged");

        vm.prank(user1);
        vm.expectRevert(bytes("SAGADirectoryIdentity: cannot transfer flagged or revoked"));
        directory.transferFrom(user1, user2, tokenId);
    }

    // === Phase 10 regression tests ===

    // H-1: governance is no longer authorized to spend ACTIVE or SUSPENDED
    // directory NFTs. The Phase 9 G-1 _isAuthorized override was scoped
    // too broadly; H-1 tightens it to rank >= 2 only. The existing G-1
    // governance-can-rescue tests above continue to pass because they
    // use flagged/revoked tokens.
    function test_h1_governanceCannotTransferActiveDirectory() public {
        vm.prank(user1);
        uint256 tokenId = directory.registerDirectory(
            "h1-active", "https://x.example/", makeAddr("op"), "basic"
        );
        // Status is "active" by default. address(this) is the contract
        // owner from setUp; without the H-1 fix this would succeed.
        vm.expectRevert();
        directory.transferFrom(user1, user2, tokenId);
        // user1 still owns the NFT.
        assertEq(directory.ownerOf(tokenId), user1);
    }

    function test_h1_governanceCannotTransferSuspendedDirectory() public {
        vm.prank(user1);
        uint256 tokenId = directory.registerDirectory(
            "h1-susp", "https://x.example/", makeAddr("op"), "basic"
        );
        directory.updateDirectoryStatus(tokenId, "suspended");
        vm.expectRevert();
        directory.transferFrom(user1, user2, tokenId);
        assertEq(directory.ownerOf(tokenId), user1);
    }

    // H-6: renounceOwnership now reverts with the disabled-message for
    // ALL callers, not just the owner. Previously non-owners hit OZ's
    // OwnableUnauthorizedAccount error, masking the actual intent.
    function test_h6_renounceOwnership_revertsForNonOwnerWithSameMessage() public {
        vm.prank(makeAddr("randomEoa"));
        vm.expectRevert(bytes("SAGADirectoryIdentity: renounce disabled"));
        directory.renounceOwnership();
    }

    // M-3: approved operator can call updateDirectoryUrl on an active
    // directory. Combined with H-1, governance still cannot transfer
    // active directories — this only opens metadata setters to delegates.
    function test_m3_updateDirectoryUrl_approvedOperatorSucceeds() public {
        vm.prank(user1);
        uint256 tokenId = directory.registerDirectory(
            "op-dir", "https://old.example/", makeAddr("op"), "basic"
        );

        address operator = makeAddr("operator");
        vm.prank(user1);
        directory.setApprovalForAll(operator, true);

        vm.prank(operator);
        directory.updateDirectoryUrl(tokenId, "https://new.example/");
        assertEq(directory.directoryUrl(tokenId), "https://new.example/");
    }

    // M-3 + H-1 interaction: operator approved by NFT owner can also
    // downgrade status (with the rank monotonicity rule).
    function test_m3_updateDirectoryStatus_approvedOperatorCanDowngrade() public {
        vm.prank(user1);
        uint256 tokenId = directory.registerDirectory(
            "ops-dir", "https://x.example/", makeAddr("op"), "basic"
        );

        address operator = makeAddr("operator");
        vm.prank(user1);
        directory.setApprovalForAll(operator, true);

        vm.prank(operator);
        directory.updateDirectoryStatus(tokenId, "suspended");
        assertEq(directory.directoryStatus(tokenId), "suspended");
    }

    // === Phase 10C regression tests ===

    // Phase 10B Copilot review: governance can no longer pre-set
    // _statuses[tokenId] for unminted tokens. updateDirectoryStatus now
    // calls _requireOwned first. The pre-set vector would have let a
    // future mint inherit a non-default status.
    function test_updateDirectoryStatus_revertsForUnmintedToken() public {
        // address(this) is the contract owner. Even with full governance
        // authority, the unminted-token check fires first.
        vm.expectRevert(
            abi.encodeWithSelector(IERC721Errors.ERC721NonexistentToken.selector, 9999)
        );
        directory.updateDirectoryStatus(9999, "flagged");
    }

    // M-7: empty status string is treated as rank 0 (active) instead of
    // reverting. Today _statuses[tokenId] is always initialized in
    // registerDirectory before _safeMint, so the empty case is
    // structurally unreachable through normal entry points; M-7 hardens
    // against any future migration path that calls _update on a token
    // with uninitialized status. The "default to active" semantics
    // preserve the F-10 transfer-block invariant — an uninitialized
    // token cannot be silently treated as flagged/revoked.
    //
    // Exercised via a test-only harness that exposes the internal
    // _statusRank function publicly. vm.store against the public
    // directoryStatus mapping accessor is unreliable because the
    // accessor calls _requireOwned (which the stdstore probe can't
    // round-trip cleanly).
    function test_m7_statusRank_emptyStringIsRank0() public {
        StatusRankHarness h = new StatusRankHarness();
        assertEq(h.exposed_statusRank(""), 0);
        // Spot-check the canonical statuses behave as before.
        assertEq(h.exposed_statusRank("active"), 0);
        assertEq(h.exposed_statusRank("suspended"), 1);
        assertEq(h.exposed_statusRank("flagged"), 2);
        assertEq(h.exposed_statusRank("revoked"), 3);
    }

    function test_m7_statusRank_unknownStillReverts() public {
        StatusRankHarness h = new StatusRankHarness();
        vm.expectRevert(bytes("SAGADirectoryIdentity: unknown status rank"));
        h.exposed_statusRank("limbo");
    }

    function test_m7_freshlyRegisteredDirectoryStartsActive() public {
        vm.prank(user1);
        uint256 tokenId = directory.registerDirectory(
            "m7-fresh", "https://x.example/", makeAddr("op"), "basic"
        );
        assertEq(directory.directoryStatus(tokenId), "active");
        vm.prank(user1);
        directory.transferFrom(user1, user2, tokenId);
        assertEq(directory.ownerOf(tokenId), user2);
    }

    // I-2: the 4-arg safeTransferFrom overload also hits the self-TBA
    // guard.
    function test_i2_safeTransferFrom4Arg_blocksSelfTBA() public {
        vm.prank(user1);
        uint256 tokenId = directory.registerDirectory(
            "xfer4-dir", "https://x.example/", makeAddr("op"), "basic"
        );
        address selfTba = tbaHelper.computeAccount(address(directory), tokenId);

        vm.prank(user1);
        vm.expectRevert(bytes("SAGADirectoryIdentity: cannot transfer to own TBA"));
        directory.safeTransferFrom(user1, selfTba, tokenId, "");
    }

    // === Phase 11 regression tests ===

    // J-5: registerDirectory rejects HTML metachars + control bytes in
    // the conformance level.
    function test_j5_registerDirectory_rejectsHtmlConformance() public {
        vm.prank(user1);
        vm.expectRevert(SAGAValidation.InvalidTextCharacter.selector);
        directory.registerDirectory(
            "j5-dir", "https://x.example/", makeAddr("op"), "<bad>"
        );
    }

    function test_j5_registerDirectory_rejectsControlInConformance() public {
        bytes memory bad = bytes("bad\x00");
        vm.prank(user1);
        vm.expectRevert(SAGAValidation.InvalidTextCharacter.selector);
        directory.registerDirectory(
            "j5-dir2", "https://x.example/", makeAddr("op"), string(bad)
        );
    }

    // J-6: setBaseURI requires trailing `/`.
    function test_j6_setBaseURI_requiresTrailingSlash() public {
        vm.expectRevert(SAGAValidation.InvalidBaseUriPath.selector);
        directory.setBaseURI("https://x.example/api");
    }

    function test_j6_setBaseURI_rejectsQueryString() public {
        vm.expectRevert(SAGAValidation.InvalidBaseUriPath.selector);
        directory.setBaseURI("https://x.example/api/?evil=");
    }

    // J-2: DirectoryRevoked event fires on rank>=2 transitions only.
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

    function test_j2_directoryRevoked_NOT_emittedForSuspended() public {
        vm.prank(user1);
        uint256 tokenId = directory.registerDirectory(
            "j2-susp", "https://x.example/", makeAddr("op"), "basic"
        );

        vm.recordLogs();
        directory.updateDirectoryStatus(tokenId, "suspended");
        Vm.Log[] memory logs = vm.getRecordedLogs();
        bytes32 topic = keccak256("DirectoryRevoked(uint256,string)");
        for (uint256 i = 0; i < logs.length; i++) {
            require(
                logs[i].topics[0] != topic,
                "DirectoryRevoked must not fire on suspended"
            );
        }
    }

    // K-3: bounded J-13 token() introspection — directory transfer to
    // a gas-griefing destination must not be blocked. SAGADirectoryIdentity's
    // _update differs from agent/org (status gating, governance path);
    // pin K-3 here independently (Copilot review on PR #58).
    function test_k3_j13_gasGriefingDestinationDoesNotBlockTransfer() public {
        vm.prank(user1);
        uint256 tokenId = directory.registerDirectory(
            "k3-dir-grief", "https://x.example/", makeAddr("op"), "basic"
        );

        DirectoryGasGrieferTBA grief = new DirectoryGasGrieferTBA();

        vm.prank(user1);
        directory.transferFrom(user1, address(grief), tokenId);
        assertEq(directory.ownerOf(tokenId), address(grief));
    }
}
