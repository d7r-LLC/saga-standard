// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import {SAGAHandleRegistry} from "../../src/SAGAHandleRegistry.sol";
import {SAGAAgentIdentity} from "../../src/SAGAAgentIdentity.sol";
import {SAGAOrgIdentity} from "../../src/SAGAOrgIdentity.sol";
import {SAGADirectoryIdentity} from "../../src/SAGADirectoryIdentity.sol";
import {RegistryConsistencyHandler} from "./RegistryConsistencyHandler.sol";

/// @dev Phase 9 (G-18): minimal TBA helper that mirrors the production
///      ERC-6551 derivation closely enough that the self-TBA universality
///      invariant exercises a deterministic, NFT-bound address space.
contract MockTBAHelper {
    function computeAccount(address tokenContract, uint256 tokenId)
        external
        pure
        returns (address)
    {
        return address(uint160(uint256(keccak256(abi.encode(tokenContract, tokenId)))));
    }
}

/// @notice Phase 9 (G-18): identity invariants beyond the Phase 8 F-7
///         supply-consistency check.
///
///         (a) Self-TBA universality: for every minted token across the
///             agent and org contracts, the token's current owner is NEVER
///             equal to the canonical TBA address derived from
///             (contract, tokenId). The Phase 8 F-4 transfer guard
///             enforces this on every transfer; the invariant pins the
///             property across all handler-driven state transitions.
///         (b) URL closure: every minted agent's homeHubUrl is non-empty
///             AND begins with `http`. SAGAValidation enforces this at
///             registration; the invariant guarantees no code path lets
///             empty / non-http URLs through.
contract IdentityInvariantsTest is Test, IERC721Receiver {
    SAGAAgentIdentity public agent;
    SAGAOrgIdentity public org;
    MockTBAHelper public tba;
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
        tba = new MockTBAHelper();
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

    /// @notice (a) Self-TBA universality. The Phase 8 F-4 transfer guard
    ///         blocks `to == computeAccount(this, tokenId)` on every
    ///         transfer. Pinning the postcondition across the full random
    ///         walk catches any future code path that bypasses _update.
    function invariant_selfTBA_universality() public view {
        uint256 agentSupply = agent.totalSupply();
        for (uint256 i = 0; i < agentSupply; i++) {
            uint256 tokenId = agent.tokenByIndex(i);
            address owner = agent.ownerOf(tokenId);
            address selfTba = tba.computeAccount(address(agent), tokenId);
            assertTrue(owner != selfTba, "agent token owner equals self-TBA");
        }

        uint256 orgSupply = org.totalSupply();
        for (uint256 i = 0; i < orgSupply; i++) {
            uint256 tokenId = org.tokenByIndex(i);
            address owner = org.ownerOf(tokenId);
            address selfTba = tba.computeAccount(address(org), tokenId);
            assertTrue(owner != selfTba, "org token owner equals self-TBA");
        }
    }

    /// @notice (b) URL closure. The handler always passes
    ///         "https://h.example/" as the hub URL. The invariant pins
    ///         that no agent ever ends up with a hub URL outside the
    ///         http(s) protocol gate enforced by SAGAValidation.validateUrl.
    function invariant_agentUrls_areClosed() public view {
        uint256 supply = agent.totalSupply();
        for (uint256 i = 0; i < supply; i++) {
            uint256 tokenId = agent.tokenByIndex(i);
            string memory url = agent.homeHubUrl(tokenId);
            bytes memory b = bytes(url);
            assertGt(b.length, 0, "agent hub url empty");
            // Pin the full http:// or https:// prefix. Just checking
            // b[0] == 'h' would let "hxxp://..." or "hex://..." through;
            // SAGAValidation.validateUrl rejects both, so the invariant
            // should reflect that closure exactly.
            assertTrue(
                _hasHttpPrefix(b),
                "agent hub url not http(s)://"
            );
        }
    }

    function _hasHttpPrefix(bytes memory b) internal pure returns (bool) {
        // "http://" = 7 bytes, "https://" = 8 bytes
        if (b.length >= 7 && b[0] == 0x68 && b[1] == 0x74 && b[2] == 0x74
                && b[3] == 0x70 && b[4] == 0x3A && b[5] == 0x2F && b[6] == 0x2F) {
            return true;
        }
        if (b.length >= 8 && b[0] == 0x68 && b[1] == 0x74 && b[2] == 0x74
                && b[3] == 0x70 && b[4] == 0x73 && b[5] == 0x3A && b[6] == 0x2F
                && b[7] == 0x2F) {
            return true;
        }
        return false;
    }
}
