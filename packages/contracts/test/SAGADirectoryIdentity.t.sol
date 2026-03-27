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
