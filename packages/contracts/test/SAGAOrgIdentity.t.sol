// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {SAGAHandleRegistry} from "../src/SAGAHandleRegistry.sol";
import {SAGAAgentIdentity} from "../src/SAGAAgentIdentity.sol";
import {SAGAOrgIdentity} from "../src/SAGAOrgIdentity.sol";
import {IERC721Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";

contract SAGAOrgIdentityTest is Test {
    SAGAHandleRegistry public registry;
    SAGAAgentIdentity public agent;
    SAGAOrgIdentity public org;
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
        agent = new SAGAAgentIdentity(address(registry));
        org = new SAGAOrgIdentity(address(registry));

        registry.setAuthorizedContract(address(agent), true);
        registry.setAuthorizedContract(address(org), true);
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
        vm.expectRevert("SAGAOrgIdentity: invalid name");
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
        vm.expectRevert("SAGAOrgIdentity: invalid name");
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
        vm.expectRevert("SAGAOrgIdentity: not owner");
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
}
