// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {SAGAOrgIdentity} from "../src/SAGAOrgIdentity.sol";
import {SAGAHandleRegistry} from "../src/SAGAHandleRegistry.sol";

/// @title DeployOrg
/// @notice Deploy only SAGAOrgIdentity and authorize it on an existing registry.
///
/// @dev Phase 8 (F-4): SAGAOrgIdentity constructor now takes (registry, tbaHelper).
///      Reads TBA_HELPER from env so partial redeploys reuse the existing helper.
///
/// @dev Phase 8 post-Safe-transfer note: after ownership of the registry has
///      been transferred to the project Safe (Ownable2Step + acceptOwnership),
///      the deployer EOA can no longer call setAuthorizedContract. To run
///      this script post-transfer, either:
///        a) revert ownership temporarily back to the deployer; or
///        b) wrap the setAuthorizedContract call as a Safe transaction
///           batched with the deploy. Recommended path is (b) — see the
///           README's "Re-deploying contracts post-Safe-transfer" section.
///
/// Required env vars:
///   DEPLOYER_PRIVATE_KEY
///   HANDLE_REGISTRY
///   TBA_HELPER
contract DeployOrg is Script {
    function run() external {
        address registryAddr = vm.envAddress("HANDLE_REGISTRY");
        address tbaHelperAddr = vm.envAddress("TBA_HELPER");
        require(registryAddr.code.length > 0, "HANDLE_REGISTRY not a contract");
        require(tbaHelperAddr.code.length > 0, "TBA_HELPER not a contract");

        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");

        vm.startBroadcast(deployerKey);

        SAGAOrgIdentity orgIdentity = new SAGAOrgIdentity(registryAddr, tbaHelperAddr);
        console.log("SAGAOrgIdentity:", address(orgIdentity));

        SAGAHandleRegistry registry = SAGAHandleRegistry(registryAddr);
        registry.setAuthorizedContract(address(orgIdentity), true);
        console.log("Authorized on registry");

        vm.stopBroadcast();
    }
}
