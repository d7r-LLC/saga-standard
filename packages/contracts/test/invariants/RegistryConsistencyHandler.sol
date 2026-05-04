// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {SAGAAgentIdentity} from "../../src/SAGAAgentIdentity.sol";
import {SAGAOrgIdentity} from "../../src/SAGAOrgIdentity.sol";

/// @notice Phase 8 (F-7) handler for the registry-NFT consistency invariant.
///         Drives the two permissionless mint paths (registerAgent,
///         registerOrganization) with fuzzed handle seeds. Tracks ghost
///         counters of successful mints; the invariant compares them to the
///         on-chain totalSupply().
contract RegistryConsistencyHandler {
    SAGAAgentIdentity public immutable agent;
    SAGAOrgIdentity public immutable org;

    uint256 public agentMints;
    uint256 public orgMints;

    constructor(SAGAAgentIdentity _agent, SAGAOrgIdentity _org) {
        agent = _agent;
        org = _org;
    }

    function registerAgent(uint256 seed) external {
        string memory handle = string(abi.encodePacked("a", _toBase36(seed)));
        try agent.registerAgent(handle, "https://h.example/") {
            agentMints++;
        } catch {
            // Validation, duplicate, or registry-side revert. Either way no
            // mint occurred — leave ghost unchanged.
        }
    }

    function registerOrg(uint256 seed) external {
        string memory handle = string(abi.encodePacked("o", _toBase36(seed)));
        try org.registerOrganization(handle, "Org Name") {
            orgMints++;
        } catch {
            // see above
        }
    }

    /// @dev Encode `n` in base-36 (0-9, a-z). Produces handles like "a3z7"
    ///      that pass the registry's alphanumeric validation. Length stays
    ///      well under 64 bytes for any uint256.
    function _toBase36(uint256 n) internal pure returns (string memory) {
        if (n == 0) return "0";
        bytes memory buf = new bytes(64);
        uint256 i = 64;
        while (n != 0 && i > 0) {
            i--;
            uint8 digit = uint8(n % 36);
            buf[i] = digit < 10
                ? bytes1(uint8(0x30 + digit))
                : bytes1(uint8(0x61 + digit - 10));
            n /= 36;
        }
        bytes memory out = new bytes(64 - i);
        for (uint256 j = 0; j < out.length; j++) out[j] = buf[i + j];
        return string(out);
    }
}
