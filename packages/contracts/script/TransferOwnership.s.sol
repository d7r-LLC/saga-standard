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
/// Required env vars:
///   DEPLOYER_PRIVATE_KEY         — current owner (EOA that ran Deploy.s.sol)
///   NEW_OWNER                    — target Safe multisig address
///   HANDLE_REGISTRY              — deployed SAGAHandleRegistry address
///   AGENT_IDENTITY               — deployed SAGAAgentIdentity address
///   ORG_IDENTITY                 — deployed SAGAOrgIdentity address
///   DIRECTORY_IDENTITY           — deployed SAGADirectoryIdentity address
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

        // Pre-check: deployer must currently own each contract
        require(Ownable(handleRegistry).owner() == deployer, "deployer not handleRegistry owner");
        require(Ownable(agentIdentity).owner() == deployer, "deployer not agentIdentity owner");
        require(Ownable(orgIdentity).owner() == deployer, "deployer not orgIdentity owner");
        require(
            Ownable(directoryIdentity).owner() == deployer, "deployer not directoryIdentity owner"
        );

        vm.startBroadcast(deployerKey);

        // Phase 8 (F-3): Ownable2Step.transferOwnership() sets pendingOwner;
        // the Safe must follow up with acceptOwnership() to finalize.
        Ownable2Step(handleRegistry).transferOwnership(newOwner);
        console.log("HandleRegistry pendingOwner -> Safe");

        Ownable2Step(agentIdentity).transferOwnership(newOwner);
        console.log("AgentIdentity pendingOwner -> Safe");

        Ownable2Step(orgIdentity).transferOwnership(newOwner);
        console.log("OrgIdentity pendingOwner -> Safe");

        Ownable2Step(directoryIdentity).transferOwnership(newOwner);
        console.log("DirectoryIdentity pendingOwner -> Safe");

        vm.stopBroadcast();

        // Post-check: pendingOwner is the Safe; owner is still deployer until Safe accepts.
        require(
            Ownable2Step(handleRegistry).pendingOwner() == newOwner,
            "handleRegistry pendingOwner mismatch"
        );
        require(
            Ownable2Step(agentIdentity).pendingOwner() == newOwner,
            "agentIdentity pendingOwner mismatch"
        );
        require(
            Ownable2Step(orgIdentity).pendingOwner() == newOwner,
            "orgIdentity pendingOwner mismatch"
        );
        require(
            Ownable2Step(directoryIdentity).pendingOwner() == newOwner,
            "directoryIdentity pendingOwner mismatch"
        );

        console.log("");
        console.log("=== Pending Ownership Transfer Complete ===");
        console.log("All four contracts have pendingOwner =", newOwner);
        console.log("Safe must call acceptOwnership() on each contract to finalize.");
        console.log(
            "Note: SAGATBAHelper is not Ownable (immutable refs only). No transfer required."
        );
    }
}
