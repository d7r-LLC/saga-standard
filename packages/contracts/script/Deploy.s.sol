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

        // Tokenbound V3 account implementation. Required — must be set in env.
        // Phase 8 (F-5): vm.envAddress reverts hard on unset; we additionally
        // require a non-zero, code-bearing address so a typo'd env var no
        // longer deploys a permanently broken SAGATBAHelper.
        address tbaImplementation = vm.envAddress("TBA_IMPLEMENTATION");
        require(tbaImplementation != address(0), "TBA_IMPLEMENTATION required");
        require(tbaImplementation.code.length > 0, "TBA_IMPLEMENTATION not a contract");

        // Use DEPLOYER_PRIVATE_KEY from .env
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        vm.startBroadcast(deployerKey);

        // 1. Deploy handle registry (no dependencies)
        SAGAHandleRegistry registry = new SAGAHandleRegistry();
        console.log("SAGAHandleRegistry:", address(registry));

        // 2. Deploy TBA helper (Phase 8 F-4: identity contracts now reference
        //    the helper for the self-TBA transfer guard, so it must exist
        //    BEFORE identity contract construction).
        SAGATBAHelper tbaHelper = new SAGATBAHelper(erc6551Registry, tbaImplementation);
        console.log("SAGATBAHelper:", address(tbaHelper));

        // 3. Deploy agent identity (pass registry + tbaHelper)
        SAGAAgentIdentity agentIdentity =
            new SAGAAgentIdentity(address(registry), address(tbaHelper));
        console.log("SAGAAgentIdentity:", address(agentIdentity));

        // 4. Deploy org identity (pass registry + tbaHelper)
        SAGAOrgIdentity orgIdentity = new SAGAOrgIdentity(address(registry), address(tbaHelper));
        console.log("SAGAOrgIdentity:", address(orgIdentity));

        // 5. Deploy directory identity (pass registry + tbaHelper)
        SAGADirectoryIdentity directoryIdentity =
            new SAGADirectoryIdentity(address(registry), address(tbaHelper));
        console.log("SAGADirectoryIdentity:", address(directoryIdentity));

        // 6. Authorize identity contracts to register handles
        registry.setAuthorizedContract(address(agentIdentity), true);
        registry.setAuthorizedContract(address(orgIdentity), true);
        registry.setAuthorizedContract(address(directoryIdentity), true);
        console.log("Authorized agent, org, and directory contracts on registry");

        // 7. Phase 9 (G-11): mark the just-deployed directory contract as
        //    trusted. Future deploys of a V2 directory contract can be
        //    added via setTrustedDirectoryContract; V1 directories continue
        //    to accept new scoped registrations.
        registry.setTrustedDirectoryContract(address(directoryIdentity), true);
        console.log("Marked directoryIdentity as trusted for scoped-handle validation");

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
