// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {SAGAOrgIdentity} from "../src/SAGAOrgIdentity.sol";
import {SAGAHandleRegistry} from "../src/SAGAHandleRegistry.sol";

/// @title DeployOrg
/// @notice Deploy only SAGAOrgIdentity and authorize it on existing registry
contract DeployOrg is Script {
    function run() external {
        address registryAddr = vm.envAddress("HANDLE_REGISTRY");
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");

        vm.startBroadcast(deployerKey);

        SAGAOrgIdentity orgIdentity = new SAGAOrgIdentity(registryAddr);
        console.log("SAGAOrgIdentity:", address(orgIdentity));

        SAGAHandleRegistry registry = SAGAHandleRegistry(registryAddr);
        registry.setAuthorizedContract(address(orgIdentity), true);
        console.log("Authorized on registry");

        vm.stopBroadcast();
    }
}
