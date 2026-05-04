// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {SAGAOrgIdentity} from "../src/SAGAOrgIdentity.sol";
import {SAGAHandleRegistry} from "../src/SAGAHandleRegistry.sol";
import {SAGATBAHelper} from "../src/SAGATBAHelper.sol";

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

        // Phase 12 (K-4): preflight against bootstrapFinalized. The
        // Phase 11 J-3 gate makes setAuthorizedContract(addr, true)
        // revert post-Deploy.s.sol; this script's tail call would
        // otherwise brick at the auth step, leaving an orphaned org
        // contract on-chain. Refuse to run; point operators at the
        // companion QueueAuthorizeOrg.s.sol post-bootstrap script.
        // (OpenAI + Gemini consensus.)
        require(
            !SAGAHandleRegistry(registryAddr).bootstrapFinalized(),
            "DeployOrg: registry already finalized; use script/QueueAuthorizeOrg.s.sol (deploys + prints Safe calldata for queue/apply; 24h timelock applies)"
        );

        // Phase 11 (J-9): chain-pinned helper-immutable allowlist on
        // production chains. Phase 10 H-7 pinned ERC6551_REGISTRY +
        // TBA_IMPLEMENTATION in Deploy.s.sol; DeployOrg.s.sol previously
        // relied only on `code.length`. A typo'd or compromised TBA_HELPER
        // env var would permanently wire a new org identity contract to
        // a wrong helper (the helper's refs are immutable). Pin the
        // helper's `registry()` and `accountImplementation()` getters
        // match the canonical Tokenbound V3 set on Base mainnet/Sepolia;
        // staging/local can still supply their own helper.
        address canonical6551Registry = 0x000000006551c19487814612e58FE06813775758;
        address tokenboundV3 = 0x55266d75D1a14E4572138116aF39863Ed6596E7F;
        if (block.chainid == 8453 || block.chainid == 84532) {
            SAGATBAHelper helper = SAGATBAHelper(tbaHelperAddr);
            // Phase 11 (Copilot review on PR #57): log expected vs got
            // so a deploy operator hitting either require below sees
            // the diff immediately instead of grepping the script.
            // Mirrors the L-2 pattern in Deploy.s.sol.
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

        SAGAOrgIdentity orgIdentity = new SAGAOrgIdentity(registryAddr, tbaHelperAddr);
        console.log("SAGAOrgIdentity:", address(orgIdentity));

        SAGAHandleRegistry registry = SAGAHandleRegistry(registryAddr);
        registry.setAuthorizedContract(address(orgIdentity), true);
        console.log("Authorized on registry");

        vm.stopBroadcast();
    }
}
