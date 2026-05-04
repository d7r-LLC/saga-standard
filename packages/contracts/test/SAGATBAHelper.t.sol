// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {SAGATBAHelper} from "../src/SAGATBAHelper.sol";
import {SAGAHandleRegistry} from "../src/SAGAHandleRegistry.sol";
import {SAGAAgentIdentity} from "../src/SAGAAgentIdentity.sol";
import {IERC6551Registry} from "../src/interfaces/IERC6551Registry.sol";

/// @dev Minimal mock ERC-6551 registry for local testing.
///      Uses _created mapping for idempotence (real registry uses CREATE2 code deployment).
contract MockERC6551Registry is IERC6551Registry {
    mapping(address => bool) public _created;

    /// @notice Compute a deterministic address from the inputs (matches CREATE2 pattern)
    function account(
        address implementation,
        bytes32 salt,
        uint256 chainId,
        address tokenContract,
        uint256 tokenId
    ) external pure override returns (address) {
        return address(
            uint160(
                uint256(
                    keccak256(
                        abi.encodePacked(implementation, salt, chainId, tokenContract, tokenId)
                    )
                )
            )
        );
    }

    /// @notice Create an account (idempotent via _created tracking)
    function createAccount(
        address implementation,
        bytes32 salt,
        uint256 chainId,
        address tokenContract,
        uint256 tokenId
    ) external override returns (address) {
        address computed = this.account(implementation, salt, chainId, tokenContract, tokenId);

        // Idempotent: return existing account if already created
        if (_created[computed]) {
            return computed;
        }

        _created[computed] = true;

        emit ERC6551AccountCreated(computed, implementation, salt, chainId, tokenContract, tokenId);

        return computed;
    }
}

contract SAGATBAHelperTest is Test {
    MockERC6551Registry public mockRegistry;
    SAGATBAHelper public tbaHelper;
    SAGAHandleRegistry public handleRegistry;
    SAGAAgentIdentity public agentIdentity;

    address public mockImplementation;
    address public user1;

    function setUp() public {
        user1 = address(0x1);

        mockRegistry = new MockERC6551Registry();
        // Phase 8 (F-8): implementation must be a contract — etch dummy
        // bytecode at the mockImplementation address so the SAGATBAHelper
        // constructor's `code.length > 0` check passes.
        mockImplementation = address(0xBEEF);
        vm.etch(mockImplementation, hex"6080604052"); // arbitrary non-empty bytecode
        tbaHelper = new SAGATBAHelper(address(mockRegistry), mockImplementation);

        // ---- F-8 constructor validation regression tests ----
        // (executed below via separate test functions, not in setUp)

        handleRegistry = new SAGAHandleRegistry();
        // Phase 8 (F-4): agent constructor now takes a tbaHelper. Reuse the
        // tbaHelper deployed above.
        agentIdentity = new SAGAAgentIdentity(address(handleRegistry), address(tbaHelper));
        handleRegistry.setAuthorizedContract(address(agentIdentity), true);

        // Mint an agent for testing
        vm.prank(user1);
        agentIdentity.registerAgent("tba-test-agent", "https://hub.example.com");
    }

    // --- Test 1: computeAccount is deterministic ---
    function test_computeAccount_deterministic() public view {
        address addr1 = tbaHelper.computeAccount(address(agentIdentity), 0);
        address addr2 = tbaHelper.computeAccount(address(agentIdentity), 0);

        assertEq(addr1, addr2);
        assertTrue(addr1 != address(0));
    }

    // --- Test 2: different token IDs give different addresses ---
    function test_computeAccount_differentTokens() public {
        // Mint a second agent
        vm.prank(user1);
        agentIdentity.registerAgent("tba-test-agent-2", "https://hub.example.com");

        address addr0 = tbaHelper.computeAccount(address(agentIdentity), 0);
        address addr1 = tbaHelper.computeAccount(address(agentIdentity), 1);

        assertTrue(addr0 != addr1);
    }

    // --- Test 3: different contracts give different addresses ---
    function test_computeAccount_differentContracts() public view {
        address addr1 = tbaHelper.computeAccount(address(agentIdentity), 0);
        address addr2 = tbaHelper.computeAccount(address(0xDEAD), 0);

        assertTrue(addr1 != addr2);
    }

    // --- Test 4: createAccount returns non-zero address ---
    function test_createAccount_returnsAddress() public {
        address tba = tbaHelper.createAccount(address(agentIdentity), 0);

        assertTrue(tba != address(0));
    }

    // --- Test 5: created TBA matches pre-computed address ---
    function test_createAccount_matchesComputed() public {
        address computed = tbaHelper.computeAccount(address(agentIdentity), 0);
        address created = tbaHelper.createAccount(address(agentIdentity), 0);

        assertEq(computed, created);
    }

    // --- Test 6: createAccount is idempotent (returns same address, no re-emit) ---
    function test_createAccount_idempotent() public {
        address first = tbaHelper.createAccount(address(agentIdentity), 0);
        address second = tbaHelper.createAccount(address(agentIdentity), 0);

        assertEq(first, second);
        // Verify the mock tracked creation
        assertTrue(mockRegistry._created(first));
    }

    // --- Test 7: TBA address can hold ETH (any address can, verifying non-zero) ---
    function test_tbaAddress_canHoldETH() public {
        address tba = tbaHelper.createAccount(address(agentIdentity), 0);

        // Fund the test contract
        vm.deal(address(this), 1 ether);

        // Send ETH to the TBA address (verifies address is valid, not a contract test)
        (bool success,) = tba.call{value: 0.1 ether}("");
        assertTrue(success);
        assertEq(tba.balance, 0.1 ether);
    }

    // --- Test 8: computeAccountForChain returns different address for different chains ---
    function test_computeAccountForChain_differentChains() public view {
        address localAddr = tbaHelper.computeAccount(address(agentIdentity), 0);
        address otherChainAddr =
            tbaHelper.computeAccountForChain(address(agentIdentity), 0, 999_999);

        assertTrue(localAddr != otherChainAddr);
    }

    // --- Test 9: computeAccountForChain with current chain matches computeAccount ---
    function test_computeAccountForChain_sameChainMatchesCompute() public view {
        address computed = tbaHelper.computeAccount(address(agentIdentity), 0);
        address forChain =
            tbaHelper.computeAccountForChain(address(agentIdentity), 0, block.chainid);

        assertEq(computed, forChain);
    }

    // --- Test 10: computeAccountForChain is deterministic ---
    function test_computeAccountForChain_deterministic() public view {
        address addr1 = tbaHelper.computeAccountForChain(address(agentIdentity), 0, 8453);
        address addr2 = tbaHelper.computeAccountForChain(address(agentIdentity), 0, 8453);

        assertEq(addr1, addr2);
        assertTrue(addr1 != address(0));
    }

    // === Phase 8 regression tests ===

    // F-8: TBA helper rejects zero/EOA registry or implementation.
    function test_constructor_revertsOnZeroRegistry() public {
        vm.expectRevert(bytes("SAGATBAHelper: registry not contract"));
        new SAGATBAHelper(address(0), mockImplementation);
    }

    function test_constructor_revertsOnEoaRegistry() public {
        vm.expectRevert(bytes("SAGATBAHelper: registry not contract"));
        new SAGATBAHelper(makeAddr("eoa-registry"), mockImplementation);
    }

    function test_constructor_revertsOnZeroImplementation() public {
        vm.expectRevert(bytes("SAGATBAHelper: implementation not contract"));
        new SAGATBAHelper(address(mockRegistry), address(0));
    }

    function test_constructor_revertsOnEoaImplementation() public {
        vm.expectRevert(bytes("SAGATBAHelper: implementation not contract"));
        new SAGATBAHelper(address(mockRegistry), makeAddr("eoa-impl"));
    }

    // === Phase 8 (F-7) — TBA determinism + collision-resistance fuzz ===

    function testFuzz_computeAccount_isDeterministic(uint256 tokenId) public view {
        address a = tbaHelper.computeAccount(address(0xCafe), tokenId);
        address b = tbaHelper.computeAccount(address(0xCafe), tokenId);
        assertEq(a, b);
    }

    function testFuzz_computeAccount_collisionResistant(uint256 idA, uint256 idB) public view {
        vm.assume(idA != idB);
        address a = tbaHelper.computeAccount(address(0xCafe), idA);
        address b = tbaHelper.computeAccount(address(0xCafe), idB);
        assertTrue(a != b);
    }
}
