// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {SAGAOrgIdentity} from "../src/SAGAOrgIdentity.sol";
import {SAGAHandleRegistry} from "../src/SAGAHandleRegistry.sol";
import {SAGATBAHelper} from "../src/SAGATBAHelper.sol";

/// @title QueueAuthorizeOrg
/// @notice Phase 12 (K-4): post-bootstrap companion to DeployOrg.s.sol.
///         Deploys a new SAGAOrgIdentity from the deployer EOA, then
///         **prints calldata** for the Safe to execute the
///         `queueAuthorizedContract` and (24h later)
///         `applyAuthorizedContract` transactions. The deployer EOA
///         does NOT broadcast the queue/apply itself — post-handoff
///         the registry owner is the Safe, so any deployer-broadcast
///         queue call would revert with `OwnableUnauthorizedAccount`.
///
/// @dev    Why this script doesn't broadcast the queue:
///         - Phase 11 J-3 finalizes the bootstrap window inside
///           Deploy.s.sol; from then on, queueAuthorizedContract is
///           gated by `onlyOwner`.
///         - Phase 11 + Phase 9 hand off ownership to the Safe via
///           TransferOwnership.s.sol + Safe acceptOwnership.
///         - Phase 12 K-1 also makes applyAuthorizedContract onlyOwner.
///         The operator runs this script only to deploy + verify the
///         new SAGAOrgIdentity address; the Safe schedules the queue
///         + apply transactions through its multisig tx-builder using
///         the calldata blobs this script logs.
///
///         Required env vars:
///           DEPLOYER_PRIVATE_KEY - the EOA deploying SAGAOrgIdentity.
///           HANDLE_REGISTRY      - already-deployed registry address.
///           TBA_HELPER           - already-deployed helper address.
contract QueueAuthorizeOrg is Script {
    function run() external {
        address registryAddr = vm.envAddress("HANDLE_REGISTRY");
        address tbaHelperAddr = vm.envAddress("TBA_HELPER");
        require(registryAddr.code.length > 0, "HANDLE_REGISTRY not a contract");
        require(tbaHelperAddr.code.length > 0, "TBA_HELPER not a contract");

        // Phase 11 (J-9) helper allowlist: same as DeployOrg.s.sol.
        address canonical6551Registry = 0x000000006551c19487814612e58FE06813775758;
        address tokenboundV3 = 0x55266d75D1a14E4572138116aF39863Ed6596E7F;
        if (block.chainid == 8453 || block.chainid == 84532) {
            SAGATBAHelper helper = SAGATBAHelper(tbaHelperAddr);
            console.log("Expected ERC6551_REGISTRY (canonical):", canonical6551Registry);
            console.log("Got TBA_HELPER.registry():", address(helper.registry()));
            console.log("Expected TBA_IMPLEMENTATION (canonical V3):", tokenboundV3);
            console.log("Got TBA_HELPER.accountImplementation():", helper.accountImplementation());
            require(
                address(helper.registry()) == canonical6551Registry,
                "TBA_HELPER registry mismatch"
            );
            require(
                helper.accountImplementation() == tokenboundV3,
                "TBA_HELPER implementation mismatch"
            );
        }

        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        vm.startBroadcast(deployerKey);

        // Only the deploy is broadcast from the deployer EOA. The
        // registry queue + apply transactions go through the Safe.
        SAGAOrgIdentity orgIdentity = new SAGAOrgIdentity(registryAddr, tbaHelperAddr);
        console.log("SAGAOrgIdentity:", address(orgIdentity));

        vm.stopBroadcast();

        // Print Safe calldata. The Safe (registry owner post-handoff)
        // schedules these transactions through its tx-builder.
        bytes memory queueCalldata = abi.encodeWithSignature(
            "queueAuthorizedContract(address)",
            address(orgIdentity)
        );
        bytes memory applyCalldata = abi.encodeWithSignature(
            "applyAuthorizedContract(address)",
            address(orgIdentity)
        );

        console.log("");
        console.log("=== Safe execution payload ===");
        console.log("Target (registry):", registryAddr);
        console.log("Step 1 - queue calldata (submit now):");
        console.logBytes(queueCalldata);
        console.log("Step 2 - apply calldata (submit after 24h timelock):");
        console.logBytes(applyCalldata);
    }
}
