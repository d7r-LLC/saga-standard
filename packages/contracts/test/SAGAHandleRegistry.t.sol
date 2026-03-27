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
        bytes32 indexed handleKey,
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
        vm.prank(authorizedContract);
        registry.registerHandle("epic-hub", SAGAHandleRegistry.EntityType.DIRECTORY, 0);

        (SAGAHandleRegistry.EntityType entityType, uint256 tokenId, address contractAddr) =
            registry.resolveHandle("epic-hub");

        assertEq(uint256(entityType), uint256(SAGAHandleRegistry.EntityType.DIRECTORY));
        assertEq(tokenId, 0);
        assertEq(contractAddr, authorizedContract);
    }
}
