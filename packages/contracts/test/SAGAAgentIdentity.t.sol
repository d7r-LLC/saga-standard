// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {SAGAHandleRegistry} from "../src/SAGAHandleRegistry.sol";
import {SAGAAgentIdentity} from "../src/SAGAAgentIdentity.sol";
import {SAGAOrgIdentity} from "../src/SAGAOrgIdentity.sol";
import {IERC721Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";

contract SAGAAgentIdentityTest is Test {
    SAGAHandleRegistry public registry;
    SAGAAgentIdentity public agent;
    SAGAOrgIdentity public org;
    address public deployer;
    address public user1;
    address public user2;

    event AgentRegistered(
        uint256 indexed tokenId,
        string handle,
        address indexed owner,
        string homeHubUrl,
        uint256 registeredAt
    );

    function setUp() public {
        deployer = address(this);
        user1 = address(0x1);
        user2 = address(0x2);

        registry = new SAGAHandleRegistry();
        agent = new SAGAAgentIdentity(address(registry));
        org = new SAGAOrgIdentity(address(registry));

        // Authorize both identity contracts
        registry.setAuthorizedContract(address(agent), true);
        registry.setAuthorizedContract(address(org), true);
    }

    // --- Test 1: registerAgent success ---
    function test_registerAgent_success() public {
        vm.prank(user1);
        uint256 tokenId = agent.registerAgent("marcus.chen", "https://hub.example.com");

        assertEq(tokenId, 0);
        assertEq(agent.ownerOf(tokenId), user1);
        assertEq(agent.agentHandle(tokenId), "marcus.chen");
        assertEq(agent.homeHubUrl(tokenId), "https://hub.example.com");

        // Verify in registry
        (SAGAHandleRegistry.EntityType entityType, uint256 regTokenId, address contractAddr) =
            registry.resolveHandle("marcus.chen");
        assertEq(uint256(entityType), uint256(SAGAHandleRegistry.EntityType.AGENT));
        assertEq(regTokenId, 0);
        assertEq(contractAddr, address(agent));
    }

    // --- Test 2: token ID increments ---
    function test_registerAgent_tokenIdIncremental() public {
        vm.prank(user1);
        uint256 id0 = agent.registerAgent("agent-0", "https://hub.example.com");

        vm.prank(user2);
        uint256 id1 = agent.registerAgent("agent-1", "https://hub.example.com");

        assertEq(id0, 0);
        assertEq(id1, 1);
    }

    // --- Test 3: duplicate handle reverts ---
    function test_registerAgent_duplicateHandleReverts() public {
        vm.prank(user1);
        agent.registerAgent("unique-handle", "https://hub.example.com");

        vm.prank(user2);
        vm.expectRevert("SAGAHandleRegistry: handle taken");
        agent.registerAgent("unique-handle", "https://other.example.com");
    }

    // --- Test 4: cross-entity duplicate (agent handle blocks org) ---
    function test_registerAgent_crossEntityDuplicate() public {
        vm.prank(user1);
        agent.registerAgent("shared-name", "https://hub.example.com");

        vm.prank(user2);
        vm.expectRevert("SAGAHandleRegistry: handle taken");
        org.registerOrganization("shared-name", "Shared Org");
    }

    // --- Test 5: emits AgentRegistered event ---
    function test_registerAgent_emitsEvent() public {
        vm.prank(user1);
        vm.expectEmit(true, true, false, true);
        emit AgentRegistered(0, "event-agent", user1, "https://hub.example.com", block.timestamp);
        agent.registerAgent("event-agent", "https://hub.example.com");
    }

    // --- Test 6: updateHomeHub success ---
    function test_updateHomeHub_success() public {
        vm.prank(user1);
        uint256 tokenId = agent.registerAgent("update-hub", "https://old.example.com");

        vm.prank(user1);
        agent.updateHomeHub(tokenId, "https://new.example.com");

        assertEq(agent.homeHubUrl(tokenId), "https://new.example.com");
    }

    // --- Test 7: updateHomeHub non-owner reverts ---
    function test_updateHomeHub_nonOwnerReverts() public {
        vm.prank(user1);
        uint256 tokenId = agent.registerAgent("no-update", "https://hub.example.com");

        vm.prank(user2);
        vm.expectRevert("SAGAAgentIdentity: not owner");
        agent.updateHomeHub(tokenId, "https://hacked.example.com");
    }

    // --- Test 8: updateHomeHub after transfer ---
    function test_updateHomeHub_afterTransfer() public {
        vm.prank(user1);
        uint256 tokenId = agent.registerAgent("transfer-hub", "https://hub.example.com");

        // Transfer to user2
        vm.prank(user1);
        agent.transferFrom(user1, user2, tokenId);

        // New owner can update
        vm.prank(user2);
        agent.updateHomeHub(tokenId, "https://new-owner-hub.example.com");
        assertEq(agent.homeHubUrl(tokenId), "https://new-owner-hub.example.com");
    }

    // --- Test 9: agentHandle returns correct ---
    function test_agentHandle_returnsCorrect() public {
        vm.prank(user1);
        uint256 tokenId = agent.registerAgent("handle-test", "https://hub.example.com");

        assertEq(agent.agentHandle(tokenId), "handle-test");
    }

    // --- Test 10: agentHandle nonexistent reverts ---
    function test_agentHandle_nonexistentReverts() public {
        vm.expectRevert(abi.encodeWithSelector(IERC721Errors.ERC721NonexistentToken.selector, 999));
        agent.agentHandle(999);
    }

    // --- Test 11: transfer changes owner ---
    function test_transfer_ownerChanges() public {
        vm.prank(user1);
        uint256 tokenId = agent.registerAgent("transfer-test", "https://hub.example.com");

        vm.prank(user1);
        agent.transferFrom(user1, user2, tokenId);

        assertEq(agent.ownerOf(tokenId), user2);
    }

    // --- Test 12: original owner loses control after transfer ---
    function test_transfer_originalOwnerLosesControl() public {
        vm.prank(user1);
        uint256 tokenId = agent.registerAgent("lose-control", "https://hub.example.com");

        vm.prank(user1);
        agent.transferFrom(user1, user2, tokenId);

        vm.prank(user1);
        vm.expectRevert("SAGAAgentIdentity: not owner");
        agent.updateHomeHub(tokenId, "https://shouldnt-work.example.com");
    }

    // --- Test 13: tokenURI returns baseURI + id ---
    function test_tokenURI_returnsBaseURIPlusId() public {
        vm.prank(user1);
        uint256 tokenId = agent.registerAgent("uri-test", "https://hub.example.com");

        assertEq(agent.tokenURI(tokenId), "https://saga-standard.dev/api/metadata/agent/0");
    }

    // --- Test 14: setBaseURI owner only ---
    function test_setBaseURI_ownerOnly() public {
        agent.setBaseURI("https://new-base.com/");

        vm.prank(user1);
        uint256 tokenId = agent.registerAgent("new-uri", "https://hub.example.com");
        assertEq(agent.tokenURI(tokenId), "https://new-base.com/0");

        // Non-owner cannot set
        vm.prank(user1);
        vm.expectRevert();
        agent.setBaseURI("https://hacked.com/");
    }

    // --- Test 15: totalSupply increments ---
    function test_totalSupply_increments() public {
        assertEq(agent.totalSupply(), 0);

        vm.prank(user1);
        agent.registerAgent("supply-test-1", "https://hub.example.com");
        assertEq(agent.totalSupply(), 1);

        vm.prank(user2);
        agent.registerAgent("supply-test-2", "https://hub.example.com");
        assertEq(agent.totalSupply(), 2);
    }

    // --- Test 16: tokenOfOwnerByIndex ---
    function test_tokenOfOwnerByIndex() public {
        vm.startPrank(user1);
        agent.registerAgent("multi-agent-1", "https://hub.example.com");
        agent.registerAgent("multi-agent-2", "https://hub.example.com");
        vm.stopPrank();

        assertEq(agent.balanceOf(user1), 2);
        assertEq(agent.tokenOfOwnerByIndex(user1, 0), 0);
        assertEq(agent.tokenOfOwnerByIndex(user1, 1), 1);
    }

    // --- Test 17: registeredAt returns block.timestamp ---
    function test_registeredAt_returnsTimestamp() public {
        vm.warp(1_700_000_000);

        vm.prank(user1);
        uint256 tokenId = agent.registerAgent("timestamp-test", "https://hub.example.com");

        assertEq(agent.registeredAt(tokenId), 1_700_000_000);
    }

    // --- Test 18: registeredAt nonexistent reverts ---
    function test_registeredAt_nonexistentReverts() public {
        vm.expectRevert(abi.encodeWithSelector(IERC721Errors.ERC721NonexistentToken.selector, 999));
        agent.registeredAt(999);
    }
}
