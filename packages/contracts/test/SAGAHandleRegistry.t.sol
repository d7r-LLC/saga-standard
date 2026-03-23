// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {SAGAHandleRegistry} from "../src/SAGAHandleRegistry.sol";

contract SAGAHandleRegistryTest is Test {
    SAGAHandleRegistry public registry;
    address public owner;
    address public authorizedContract;
    address public unauthorizedUser;

    event HandleRegistered(
        string indexed handleIndexed,
        string handle,
        SAGAHandleRegistry.EntityType entityType,
        uint256 tokenId,
        address contractAddress
    );

    event AuthorizedContractSet(address indexed contractAddress, bool authorized);

    function setUp() public {
        owner = address(this);
        authorizedContract = address(0xA);
        unauthorizedUser = address(0xB);

        registry = new SAGAHandleRegistry();
        registry.setAuthorizedContract(authorizedContract, true);
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
        address newContract = address(0xC);
        registry.setAuthorizedContract(newContract, true);
        assertTrue(registry.authorizedContracts(newContract));

        registry.setAuthorizedContract(newContract, false);
        assertFalse(registry.authorizedContracts(newContract));
    }

    // --- Test 13: setAuthorizedContract non-owner reverts ---
    function test_setAuthorizedContract_nonOwnerReverts() public {
        vm.prank(unauthorizedUser);
        vm.expectRevert();
        registry.setAuthorizedContract(address(0xD), true);
    }

    // --- Test 14: emits HandleRegistered event ---
    function test_registerHandle_emitsEvent() public {
        vm.prank(authorizedContract);
        vm.expectEmit(false, false, false, true);
        emit HandleRegistered(
            "event-test",
            "event-test",
            SAGAHandleRegistry.EntityType.AGENT,
            42,
            authorizedContract
        );
        registry.registerHandle("event-test", SAGAHandleRegistry.EntityType.AGENT, 42);
    }
}
