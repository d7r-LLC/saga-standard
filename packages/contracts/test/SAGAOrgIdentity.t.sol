// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {SAGAHandleRegistry} from "../src/SAGAHandleRegistry.sol";
import {SAGAAgentIdentity} from "../src/SAGAAgentIdentity.sol";
import {SAGAOrgIdentity} from "../src/SAGAOrgIdentity.sol";
import {SAGADirectoryIdentity} from "../src/SAGADirectoryIdentity.sol";
import {SAGAValidation} from "../src/SAGAValidation.sol";
import {IERC721Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";
import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract MockTBAHelper {
    function computeAccount(address tokenContract, uint256 tokenId)
        external
        pure
        returns (address)
    {
        return address(uint160(uint256(keccak256(abi.encode(tokenContract, tokenId)))));
    }
}

/// @dev Phase 12 (K-3): destination whose `token()` deliberately spins
///      until OOG. Used to pin that the bounded 30k gas budget on the
///      J-13 transfer guard prevents a malicious destination from
///      blocking legitimate org transfers via gas griefing.
contract OrgGasGrieferTBA {
    function token() external pure returns (uint256, address, uint256) {
        uint256 i = 1;
        while (true) {
            i = i + 1;
        }
        return (i, address(0), 0); // unreachable
    }
}

contract SAGAOrgIdentityTest is Test, IERC721Receiver {
    /// @dev Phase 8 (F-2): test contract receives directory NFTs in setUp via
    ///      _safeMint, which now invokes onERC721Received.
    function onERC721Received(address, address, uint256, bytes calldata)
        external
        pure
        override
        returns (bytes4)
    {
        return IERC721Receiver.onERC721Received.selector;
    }

    SAGAHandleRegistry public registry;
    SAGAAgentIdentity public agent;
    SAGAOrgIdentity public org;
    SAGADirectoryIdentity public directory;
    MockTBAHelper public tbaHelper;
    address public deployer;
    address public user1;
    address public user2;

    event OrgRegistered(
        uint256 indexed tokenId,
        string handle,
        string name,
        address indexed owner,
        uint256 registeredAt
    );

    function setUp() public {
        deployer = address(this);
        user1 = address(0x1);
        user2 = address(0x2);

        registry = new SAGAHandleRegistry();
        tbaHelper = new MockTBAHelper();
        agent = new SAGAAgentIdentity(address(registry), address(tbaHelper));
        org = new SAGAOrgIdentity(address(registry), address(tbaHelper));
        directory = new SAGADirectoryIdentity(address(registry), address(tbaHelper));

        registry.setAuthorizedContract(address(agent), true);
        registry.setAuthorizedContract(address(org), true);
        registry.setAuthorizedContract(address(directory), true);

        // Phase 8 (F-1): wire directory identity + pre-mint scoped-test directories.
        registry.setTrustedDirectoryContract(address(directory), true);
        directory.registerDirectory("dir-a", "https://dir-a.example/", address(0xDA), "basic");
        directory.registerDirectory("dir-b", "https://dir-b.example/", address(0xDB), "basic");
        directory.registerDirectory("epic-hub", "https://epic-hub.example/", address(0xE1), "basic");
    }

    // --- Test 1: registerOrg success ---
    function test_registerOrg_success() public {
        vm.prank(user1);
        uint256 tokenId = org.registerOrganization("d7r-llc", "d7r LLC");

        assertEq(tokenId, 0);
        assertEq(org.ownerOf(tokenId), user1);
        assertEq(org.orgHandle(tokenId), "d7r-llc");
        assertEq(org.orgName(tokenId), "d7r LLC");

        (SAGAHandleRegistry.EntityType entityType, uint256 regTokenId, address contractAddr) =
            registry.resolveHandle("d7r-llc");
        assertEq(uint256(entityType), uint256(SAGAHandleRegistry.EntityType.ORG));
        assertEq(regTokenId, 0);
        assertEq(contractAddr, address(org));
    }

    // --- Test 2: shared namespace (org handle blocked if agent took it) ---
    function test_registerOrg_sharedNamespace() public {
        vm.prank(user1);
        agent.registerAgent("taken-by-agent", "https://hub.example.com");

        vm.prank(user2);
        vm.expectRevert("SAGAHandleRegistry: handle taken");
        org.registerOrganization("taken-by-agent", "Blocked Org");
    }

    // --- Test 3: agent blocked by org ---
    function test_registerOrg_agentBlockedByOrg() public {
        vm.prank(user1);
        org.registerOrganization("taken-by-org", "First Org");

        vm.prank(user2);
        vm.expectRevert("SAGAHandleRegistry: handle taken");
        agent.registerAgent("taken-by-org", "https://hub.example.com");
    }

    // --- Test 4: empty name reverts ---
    function test_registerOrg_emptyNameReverts() public {
        vm.prank(user1);
        // Phase 11 (J-5): name length is enforced via SAGAValidation.
        vm.expectRevert(SAGAValidation.InvalidTextLength.selector);
        org.registerOrganization("valid-handle", "");
    }

    // --- Test 5: long name reverts ---
    function test_registerOrg_longNameReverts() public {
        // 129 chars
        bytes memory longName = new bytes(129);
        for (uint256 i = 0; i < 129; i++) {
            longName[i] = "a";
        }

        vm.prank(user1);
        // Phase 11 (J-5): same validator enforces the 128-byte cap.
        vm.expectRevert(SAGAValidation.InvalidTextLength.selector);
        org.registerOrganization("long-name-org", string(longName));
    }

    // --- Test 6: emits OrgRegistered event ---
    function test_registerOrg_emitsEvent() public {
        vm.prank(user1);
        vm.expectEmit(true, true, false, true);
        emit OrgRegistered(0, "event-org", "Event Org Inc", user1, block.timestamp);
        org.registerOrganization("event-org", "Event Org Inc");
    }

    // --- Test 7: updateOrgName success ---
    function test_updateOrgName_success() public {
        vm.prank(user1);
        uint256 tokenId = org.registerOrganization("name-update", "Old Name");

        vm.prank(user1);
        org.updateOrgName(tokenId, "New Name");

        assertEq(org.orgName(tokenId), "New Name");
    }

    // --- Test 8: updateOrgName non-owner reverts ---
    function test_updateOrgName_nonOwnerReverts() public {
        vm.prank(user1);
        uint256 tokenId = org.registerOrganization("no-rename", "Original");

        vm.prank(user2);
        vm.expectRevert("SAGAOrgIdentity: not authorized");
        org.updateOrgName(tokenId, "Hacked Name");
    }

    // --- Test 9: updateOrgName after transfer ---
    function test_updateOrgName_afterTransfer() public {
        vm.prank(user1);
        uint256 tokenId = org.registerOrganization("transfer-org", "Before Transfer");

        vm.prank(user1);
        org.transferFrom(user1, user2, tokenId);

        vm.prank(user2);
        org.updateOrgName(tokenId, "After Transfer");
        assertEq(org.orgName(tokenId), "After Transfer");
    }

    // --- Test 10: orgHandle returns correct ---
    function test_orgHandle_returnsCorrect() public {
        vm.prank(user1);
        uint256 tokenId = org.registerOrganization("handle-check", "Handle Check Org");

        assertEq(org.orgHandle(tokenId), "handle-check");
    }

    // --- Test 11: transfer changes owner ---
    function test_transfer_ownerChanges() public {
        vm.prank(user1);
        uint256 tokenId = org.registerOrganization("transfer-test", "Transfer Org");

        vm.prank(user1);
        org.transferFrom(user1, user2, tokenId);

        assertEq(org.ownerOf(tokenId), user2);
    }

    // --- Test 12: totalSupply increments ---
    function test_totalSupply_increments() public {
        assertEq(org.totalSupply(), 0);

        vm.prank(user1);
        org.registerOrganization("supply-1", "Org One");
        assertEq(org.totalSupply(), 1);

        vm.prank(user2);
        org.registerOrganization("supply-2", "Org Two");
        assertEq(org.totalSupply(), 2);
    }

    // --- Test 13: registeredAt returns block.timestamp ---
    function test_registeredAt_returnsTimestamp() public {
        vm.warp(1_700_000_000);

        vm.prank(user1);
        uint256 tokenId = org.registerOrganization("timestamp-org", "Timestamp Org");

        assertEq(org.registeredAt(tokenId), 1_700_000_000);
    }

    // --- Test 14: orgHandle nonexistent reverts with OZ custom error ---
    function test_orgHandle_nonexistentReverts() public {
        vm.expectRevert(abi.encodeWithSelector(IERC721Errors.ERC721NonexistentToken.selector, 999));
        org.orgHandle(999);
    }

    // --- Test 15: registeredAt nonexistent reverts ---
    function test_registeredAt_nonexistentReverts() public {
        vm.expectRevert(abi.encodeWithSelector(IERC721Errors.ERC721NonexistentToken.selector, 999));
        org.registeredAt(999);
    }

    // --- Test 16: registerOrgInDirectory success ---
    function test_registerOrgInDirectory_success() public {
        vm.prank(user1);
        uint256 tokenId = org.registerOrgInDirectory(
            "d7r-llc", "d7r LLC", "epic-hub"
        );

        assertEq(tokenId, 0);
        assertEq(org.ownerOf(tokenId), user1);
        assertEq(org.orgHandle(tokenId), "d7r-llc");
        assertEq(org.orgName(tokenId), "d7r LLC");
        assertEq(org.orgDirectoryId(tokenId), "epic-hub");

        (SAGAHandleRegistry.EntityType entityType, uint256 regTokenId, address contractAddr) =
            registry.resolveScopedHandle("d7r-llc", "epic-hub");
        assertEq(uint256(entityType), uint256(SAGAHandleRegistry.EntityType.ORG));
        assertEq(regTokenId, 0);
        assertEq(contractAddr, address(org));
    }

    // --- Test 17: same org handle in different directories ---
    function test_registerOrgInDirectory_sameHandleDifferentDirs() public {
        vm.prank(user1);
        org.registerOrgInDirectory("d7r-llc", "Epic A", "dir-a");

        vm.prank(user2);
        org.registerOrgInDirectory("d7r-llc", "Epic B", "dir-b");

        (, uint256 tidA,) = registry.resolveScopedHandle("d7r-llc", "dir-a");
        (, uint256 tidB,) = registry.resolveScopedHandle("d7r-llc", "dir-b");

        assertEq(tidA, 0);
        assertEq(tidB, 1);
    }

    // --- Test 18: orgDirectoryId for global org returns empty string ---
    function test_orgDirectoryId_globalReturnsEmpty() public {
        vm.prank(user1);
        uint256 tokenId = org.registerOrganization("global-org", "Global Org");

        assertEq(org.orgDirectoryId(tokenId), "");
    }

    // === Phase 8 regression tests ===

    // F-3
    function test_ownership_twoStepRequired() public {
        address pending = makeAddr("pending");
        org.transferOwnership(pending);
        assertEq(org.owner(), address(this));
        assertEq(org.pendingOwner(), pending);
        vm.prank(pending);
        org.acceptOwnership();
        assertEq(org.owner(), pending);
    }

    function test_renounceOwnership_reverts() public {
        vm.expectRevert(bytes("SAGAOrgIdentity: renounce disabled"));
        org.renounceOwnership();
    }

    // F-8
    function test_constructor_revertsOnZeroRegistry() public {
        vm.expectRevert(bytes("SAGAOrgIdentity: registry not contract"));
        new SAGAOrgIdentity(address(0), address(tbaHelper));
    }

    function test_constructor_revertsOnEoaRegistry() public {
        vm.expectRevert(bytes("SAGAOrgIdentity: registry not contract"));
        new SAGAOrgIdentity(makeAddr("eoa"), address(tbaHelper));
    }

    // F-4: constructor rejects zero / EOA tbaHelper
    function test_constructor_revertsOnZeroTbaHelper() public {
        vm.expectRevert(bytes("SAGAOrgIdentity: tba helper not contract"));
        new SAGAOrgIdentity(address(registry), address(0));
    }

    function test_constructor_revertsOnEoaTbaHelper() public {
        vm.expectRevert(bytes("SAGAOrgIdentity: tba helper not contract"));
        new SAGAOrgIdentity(address(registry), makeAddr("eoa-tba"));
    }

    // F-4: self-TBA transfer guard
    function test_safeTransferToOwnTBA_reverts() public {
        vm.prank(user1);
        uint256 tokenId = org.registerOrganization("self-tba", "Self TBA Org");
        address selfTba = tbaHelper.computeAccount(address(org), tokenId);
        vm.prank(user1);
        vm.expectRevert(bytes("SAGAOrgIdentity: cannot transfer to own TBA"));
        org.transferFrom(user1, selfTba, tokenId);
    }

    // F-6 / G-8: setBaseURI queues; applyBaseURI emits BaseURIUpdated.
    function test_setBaseURI_emitsEvent() public {
        vm.expectEmit(false, false, false, true, address(org));
        emit SAGAOrgIdentity.BaseURIQueued(
            "https://x.example/", block.timestamp + 24 hours
        );
        org.setBaseURI("https://x.example/");

        vm.warp(block.timestamp + 24 hours);
        vm.expectEmit(false, false, false, true, address(org));
        emit SAGAOrgIdentity.BaseURIUpdated(
            "https://saga-standard.dev/api/metadata/org/", "https://x.example/"
        );
        org.applyBaseURI();
    }

    function test_setBaseURI_revertsOnInvalidProtocol() public {
        vm.expectRevert(SAGAValidation.InvalidUrlProtocol.selector);
        org.setBaseURI("javascript:alert(1)");
    }

    // G-8: queue + 24h timelock + apply
    function test_g8_setBaseURI_requiresQueueAndDelay() public {
        org.setBaseURI("https://x.example/");
        assertEq(org.pendingBaseURI(), "https://x.example/");
        vm.expectRevert(bytes("SAGAOrgIdentity: base uri not yet ready"));
        org.applyBaseURI();
        vm.warp(block.timestamp + 24 hours);
        org.applyBaseURI();
        assertEq(org.pendingBaseURIReadyAt(), 0);

        // Apply with no queue reverts.
        vm.expectRevert(bytes("SAGAOrgIdentity: no pending base uri"));
        org.applyBaseURI();
    }

    function test_g8_setBaseURI_anyoneCanApplyAfterTimelock() public {
        org.setBaseURI("https://anyone.example/");
        vm.warp(block.timestamp + 24 hours);
        // Non-owner finalizes the queued URI.
        vm.prank(makeAddr("randomCaller"));
        org.applyBaseURI();
        assertEq(org.pendingBaseURIReadyAt(), 0);
    }

    function test_g8_setBaseURI_overwritesPendingValue() public {
        org.setBaseURI("https://first.example/");
        org.setBaseURI("https://second.example/");
        assertEq(org.pendingBaseURI(), "https://second.example/");
        vm.warp(block.timestamp + 24 hours);
        org.applyBaseURI();
    }

    // K-5: cancelPendingBaseURI clears the queued slot, emits, owner-only.
    function test_k5_cancelPendingBaseURI_clearsAndEmits() public {
        org.setBaseURI("https://x.example/");
        assertEq(org.pendingBaseURI(), "https://x.example/");

        vm.expectEmit(false, false, false, true, address(org));
        emit SAGAOrgIdentity.BaseURICancelled("https://x.example/");
        org.cancelPendingBaseURI();

        assertEq(org.pendingBaseURIReadyAt(), 0);
        assertEq(org.pendingBaseURI(), "");
    }

    function test_k5_cancelPendingBaseURI_revertsWhenNoPending() public {
        vm.expectRevert(bytes("SAGAOrgIdentity: no pending base uri"));
        org.cancelPendingBaseURI();
    }

    function test_k5_cancelPendingBaseURI_onlyOwner() public {
        org.setBaseURI("https://x.example/");
        vm.prank(address(0xBEEF));
        vm.expectRevert(
            abi.encodeWithSelector(
                Ownable.OwnableUnauthorizedAccount.selector, address(0xBEEF)
            )
        );
        org.cancelPendingBaseURI();
    }

    // H-6: renounceOwnership disabled-message wins for every caller. The
    // existing test_renounceOwnership_reverts above only exercises the
    // owner path; this pins the non-owner path so removing onlyOwner
    // doesn't silently regress.
    function test_h6_renounceOwnership_revertsForNonOwnerWithSameMessage() public {
        vm.prank(makeAddr("randomEoa"));
        vm.expectRevert(bytes("SAGAOrgIdentity: renounce disabled"));
        org.renounceOwnership();
    }

    // M-3: approved operator can call updateOrgName.
    function test_m3_updateOrgName_approvedOperatorSucceeds() public {
        vm.prank(user1);
        uint256 tokenId = org.registerOrganization("op-org", "Old Name");

        address operator = makeAddr("operator");
        vm.prank(user1);
        org.setApprovalForAll(operator, true);

        vm.prank(operator);
        org.updateOrgName(tokenId, "New Name");
        assertEq(org.orgName(tokenId), "New Name");
    }

    // === Phase 11 regression tests ===

    // J-5: registerOrganization rejects HTML metacharacters.
    function test_j5_registerOrg_rejectsHtmlMetacharacters() public {
        vm.prank(user1);
        vm.expectRevert(SAGAValidation.InvalidTextCharacter.selector);
        org.registerOrganization("good-handle", "<script>alert(1)</script>");
    }

    // J-5: updateOrgName rejects control bytes.
    function test_j5_updateOrgName_rejectsControlByte() public {
        vm.prank(user1);
        uint256 tokenId = org.registerOrganization("legit-org", "Legit Name");

        bytes memory bad = bytes("Bad\x00Name");
        vm.prank(user1);
        vm.expectRevert(SAGAValidation.InvalidTextCharacter.selector);
        org.updateOrgName(tokenId, string(bad));
    }

    // J-6: setBaseURI requires trailing `/`.
    function test_j6_setBaseURI_requiresTrailingSlash() public {
        vm.expectRevert(SAGAValidation.InvalidBaseUriPath.selector);
        org.setBaseURI("https://x.example/api");
    }

    // J-6: setBaseURI rejects query strings.
    function test_j6_setBaseURI_rejectsQueryString() public {
        vm.expectRevert(SAGAValidation.InvalidBaseUriPath.selector);
        org.setBaseURI("https://x.example/api/?evil=");
    }

    // K-3: bounded J-13 token() introspection — a destination whose
    // token() consumes all forwarded gas must NOT block the transfer.
    // SAGAOrgIdentity has its own _update implementation; pin K-3 here
    // independently of the agent suite (Copilot review on PR #58).
    function test_k3_j13_gasGriefingDestinationDoesNotBlockTransfer() public {
        vm.prank(user1);
        uint256 tokenId = org.registerOrganization("k3-org-grief", "Org");

        OrgGasGrieferTBA grief = new OrgGasGrieferTBA();

        // The grief destination is NOT actually self-bound. With the
        // 30k gas budget, the staticcall OOGs inside the budget and
        // falls cleanly into the catch block; transfer succeeds.
        vm.prank(user1);
        org.transferFrom(user1, address(grief), tokenId);
        assertEq(org.ownerOf(tokenId), address(grief));
    }
}
