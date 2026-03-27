// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {SAGAHandleRegistry} from "../src/SAGAHandleRegistry.sol";
import {SAGAAgentIdentity} from "../src/SAGAAgentIdentity.sol";
import {SAGAOrgIdentity} from "../src/SAGAOrgIdentity.sol";
import {SAGATBAHelper} from "../src/SAGATBAHelper.sol";
import {SAGADirectoryIdentity} from "../src/SAGADirectoryIdentity.sol";

/// @title Deploy
/// @notice Deploys all SAGA identity contracts to a target chain
contract Deploy is Script {
    function run() external {
        // ERC-6551 registry address (canonical on all EVM chains)
        address erc6551Registry =
            vm.envOr("ERC6551_REGISTRY", address(0x000000006551c19487814612e58FE06813775758));

        // Tokenbound V3 account implementation
        address tbaImplementation = vm.envAddress("TBA_IMPLEMENTATION");

        // Use DEPLOYER_PRIVATE_KEY from .env
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        vm.startBroadcast(deployerKey);

        // 1. Deploy handle registry
        SAGAHandleRegistry registry = new SAGAHandleRegistry();
        console.log("SAGAHandleRegistry:", address(registry));

        // 2. Deploy agent identity (pass registry)
        SAGAAgentIdentity agentIdentity = new SAGAAgentIdentity(address(registry));
        console.log("SAGAAgentIdentity:", address(agentIdentity));

        // 3. Deploy org identity (pass registry)
        SAGAOrgIdentity orgIdentity = new SAGAOrgIdentity(address(registry));
        console.log("SAGAOrgIdentity:", address(orgIdentity));

        // 3b. Deploy directory identity (pass registry)
        SAGADirectoryIdentity directoryIdentity = new SAGADirectoryIdentity(address(registry));
        console.log("SAGADirectoryIdentity:", address(directoryIdentity));

        // 4. Deploy TBA helper
        SAGATBAHelper tbaHelper = new SAGATBAHelper(erc6551Registry, tbaImplementation);
        console.log("SAGATBAHelper:", address(tbaHelper));

        // 5. Authorize identity contracts to register handles
        registry.setAuthorizedContract(address(agentIdentity), true);
        registry.setAuthorizedContract(address(orgIdentity), true);
        registry.setAuthorizedContract(address(directoryIdentity), true);
        console.log("Authorized agent, org, and directory contracts on registry");

        vm.stopBroadcast();

        // Log summary
        console.log("");
        console.log("=== Deployment Summary ===");
        console.log("Chain ID:", block.chainid);
        console.log("SAGAHandleRegistry:", address(registry));
        console.log("SAGAAgentIdentity:", address(agentIdentity));
        console.log("SAGAOrgIdentity:", address(orgIdentity));
        console.log("SAGADirectoryIdentity:", address(directoryIdentity));
        console.log("SAGATBAHelper:", address(tbaHelper));
        console.log("ERC6551 Registry:", erc6551Registry);
        console.log("TBA Implementation:", tbaImplementation);
    }
}
