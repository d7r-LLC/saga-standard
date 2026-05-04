// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import {SAGAHandleRegistry} from "../../src/SAGAHandleRegistry.sol";
import {SAGAAgentIdentity} from "../../src/SAGAAgentIdentity.sol";
import {SAGAOrgIdentity} from "../../src/SAGAOrgIdentity.sol";
import {SAGADirectoryIdentity} from "../../src/SAGADirectoryIdentity.sol";
import {RegistryConsistencyHandler} from "./RegistryConsistencyHandler.sol";

contract MockTBAHelper {
    function computeAccount(address tokenContract, uint256 tokenId)
        external
        pure
        returns (address)
    {
        return address(uint160(uint256(keccak256(abi.encode(tokenContract, tokenId)))));
    }
}

/// @notice Phase 8 (F-7) invariant: every successful global registration
///         on the agent or org contract increments NFT totalSupply by 1
///         AND emits a HandleRegistered. The handler counts ghost
///         successes; the invariant compares to totalSupply().
///
///         If the F-2 CEI fix or registry authorization flow ever loses a
///         mint, agentMints/orgMints in the handler diverges from
///         on-chain totalSupply and the invariant breaks.
contract RegistryConsistencyInvariantTest is Test, IERC721Receiver {
    SAGAAgentIdentity public agent;
    SAGAOrgIdentity public org;
    RegistryConsistencyHandler public handler;

    function onERC721Received(address, address, uint256, bytes calldata)
        external
        pure
        override
        returns (bytes4)
    {
        return IERC721Receiver.onERC721Received.selector;
    }

    function setUp() public {
        SAGAHandleRegistry registry = new SAGAHandleRegistry();
        MockTBAHelper tba = new MockTBAHelper();
        agent = new SAGAAgentIdentity(address(registry), address(tba));
        org = new SAGAOrgIdentity(address(registry), address(tba));
        SAGADirectoryIdentity directory = new SAGADirectoryIdentity(
            address(registry), address(tba)
        );
        registry.setAuthorizedContract(address(agent), true);
        registry.setAuthorizedContract(address(org), true);
        registry.setAuthorizedContract(address(directory), true);
        registry.setTrustedDirectoryContract(address(directory), true);

        handler = new RegistryConsistencyHandler(agent, org);
        targetContract(address(handler));
    }

    function invariant_registryMatchesNftSupply() public view {
        assertEq(agent.totalSupply(), handler.agentMints());
        assertEq(org.totalSupply(), handler.orgMints());
    }
}
