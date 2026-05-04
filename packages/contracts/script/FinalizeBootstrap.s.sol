// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {SAGAHandleRegistry} from "../src/SAGAHandleRegistry.sol";

/// @title FinalizeBootstrap
/// @notice Phase 12 (K-15, Anthropic): finalize the registry bootstrap in
///         a separate transaction so that a partial failure inside
///         Deploy.s.sol cannot leave the registry both partially
///         configured AND already finalized (which would force every
///         fix-up authorize through the M-1 24h timelock).
///
///         Run AFTER:
///           1. All four contracts are deployed at the expected addresses.
///           2. registry.authorizedContracts(agent / org / directory) all true.
///           3. registry.trustedDirectoryContracts(directory) is true.
///           4. Smoke test: register a test agent + org + directory.
///
///         Cannot be undone. From this point on, every new authorize-true
///         requires the M-1 24h queue+apply timelock, even from the
///         deployer EOA. Eliminates the bootstrap-window attack where a
///         compromised deployer key could authorize a malicious contract
///         immediately between deploy and the Safe's `acceptOwnership`.
///
/// Required env vars:
///   DEPLOYER_PRIVATE_KEY   - the EOA that ran Deploy.s.sol; still owns
///                            the registry until TransferOwnership.s.sol
///                            queues the Safe handoff
///   HANDLE_REGISTRY        - deployed SAGAHandleRegistry address
contract FinalizeBootstrap is Script {
    function run() external {
        address registryAddr = vm.envAddress("HANDLE_REGISTRY");
        require(registryAddr.code.length > 0, "HANDLE_REGISTRY not a contract");

        SAGAHandleRegistry registry = SAGAHandleRegistry(registryAddr);
        require(!registry.bootstrapFinalized(), "Already finalized");

        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        vm.startBroadcast(deployerKey);
        registry.finalizeBootstrap();
        vm.stopBroadcast();

        console.log(
            "Bootstrap finalized. Every authorize-true now requires the M-1 24h timelock."
        );
    }
}
