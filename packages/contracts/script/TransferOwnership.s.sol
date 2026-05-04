// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";

/// @title TransferOwnership
/// @notice Initiates the two-step ownership handoff of all SAGA Ownable2Step
///         contracts from the deployer EOA to the project Safe multisig.
///         Run after Deploy.s.sol on mainnet.
///
/// @dev Phase 8 (F-3): contracts use Ownable2Step. transferOwnership() sets
///      pendingOwner. The Safe must subsequently call acceptOwnership() from
///      the multisig UI to finalize. Post-checks here verify
///      pendingOwner == newOwner; owner() remains the deployer until the
///      Safe accepts.
///
/// Phase 12 (K-9, OpenAI): the prior implementation gated the entire run
/// on a single deployer-is-still-owner pre-check across all four
/// contracts. If the Safe accepted ownership of two contracts but not
/// the other two (a partial accept window during a multi-sig review),
/// every subsequent retry of this script bricked. Per-contract
/// idempotent logic now skips contracts that already settled and
/// queues only the ones that still need a transfer.
///
/// Required env vars:
///   DEPLOYER_PRIVATE_KEY         - current owner (EOA that ran Deploy.s.sol)
///   NEW_OWNER                    - target Safe multisig address
///   HANDLE_REGISTRY              - deployed SAGAHandleRegistry address
///   AGENT_IDENTITY               - deployed SAGAAgentIdentity address
///   ORG_IDENTITY                 - deployed SAGAOrgIdentity address
///   DIRECTORY_IDENTITY           - deployed SAGADirectoryIdentity address
contract TransferOwnership is Script {
    function run() external {
        address newOwner = vm.envAddress("NEW_OWNER");
        require(newOwner != address(0), "NEW_OWNER required");
        // Phase 9 (G-3): the Safe target must be a contract. A typo'd EOA
        // would set pendingOwner on all four contracts but no entity at
        // that address could call acceptOwnership(), forcing the deployer
        // to re-run the entire handoff. Mirrors Deploy.s.sol's
        // TBA_IMPLEMENTATION code-length check.
        require(newOwner.code.length > 0, "NEW_OWNER must be a contract (Safe)");

        address handleRegistry = vm.envAddress("HANDLE_REGISTRY");
        address agentIdentity = vm.envAddress("AGENT_IDENTITY");
        address orgIdentity = vm.envAddress("ORG_IDENTITY");
        address directoryIdentity = vm.envAddress("DIRECTORY_IDENTITY");

        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        console.log("Current deployer:", deployer);
        console.log("New owner (Safe):", newOwner);
        console.log("");

        vm.startBroadcast(deployerKey);

        _idempotentTransfer(Ownable2Step(handleRegistry), "HandleRegistry", deployer, newOwner);
        _idempotentTransfer(Ownable2Step(agentIdentity), "AgentIdentity", deployer, newOwner);
        _idempotentTransfer(Ownable2Step(orgIdentity), "OrgIdentity", deployer, newOwner);
        _idempotentTransfer(
            Ownable2Step(directoryIdentity), "DirectoryIdentity", deployer, newOwner
        );

        vm.stopBroadcast();

        console.log("");
        console.log("=== TransferOwnership run complete ===");
        console.log("Safe must call acceptOwnership() on any contract still showing pendingOwner.");
        console.log(
            "Note: SAGATBAHelper is not Ownable (immutable refs only). No transfer required."
        );
    }

    /// @dev Phase 12 (K-9): per-contract idempotent transfer. Three terminal
    ///      states are recognized:
    ///        1. Safe already owns -> log + skip.
    ///        2. Deployer owns + pendingOwner already Safe -> log + skip
    ///           (the prior queue is still valid; Safe just hasn't accepted
    ///           yet).
    ///        3. Deployer owns + pendingOwner not yet Safe -> issue
    ///           transferOwnership.
    ///      Anything else (third party owns, pendingOwner is some other
    ///      address, etc.) reverts with a per-contract error so the
    ///      operator gets actionable diagnostics instead of a vague run-wide
    ///      failure.
    function _idempotentTransfer(
        Ownable2Step c,
        string memory name,
        address deployer,
        address newOwner
    ) internal {
        address current = Ownable(address(c)).owner();
        if (current == newOwner) {
            console.log(string.concat(name, ": already owned by Safe, skipping"));
            return;
        }
        if (current == deployer) {
            address pending = c.pendingOwner();
            if (pending == newOwner) {
                console.log(string.concat(name, ": pendingOwner already Safe, skipping"));
                return;
            }
            // Phase 12 (K-9 review fix): if pendingOwner is set to a
            // non-zero, non-Safe address, that's an unexpected state —
            // someone else has been queued as owner. Refuse to silently
            // overwrite it; the operator should investigate. Aligns
            // the implementation with the docstring's stated contract.
            require(
                pending == address(0),
                string.concat(name, ": pendingOwner set to unexpected address")
            );
            c.transferOwnership(newOwner);
            console.log(string.concat(name, ": pendingOwner -> Safe"));
            return;
        }
        revert(string.concat(name, ": unexpected owner"));
    }
}
