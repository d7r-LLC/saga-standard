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

        // Phase 9 (G-6): chain-pinned allowlist of audited Tokenbound
        // implementation addresses. Phase 8 F-5 only confirmed "some
        // contract is at the address" — a typo'd env var, compromised CI
        // secret, or malicious deploy config could still point the helper
        // at any code-bearing contract (delegatecall escape, drain logic,
        // signature-validation flaws). Because SAGATBAHelper.accountImplementation
        // is immutable, this is unrecoverable post-deploy. Hard-pin the
        // canonical Tokenbound V3 address per known production chain;
        // staging/local/new-chain deploys skip the pin.
        // Canonical Tokenbound V3 implementation:
        //   docs/identity-nfts.md:114
        //   docs/superpowers/plans/2026-03-27-phase3-on-chain-identity.md:271
        address tokenboundV3 = 0x55266d75D1a14E4572138116aF39863Ed6596E7F;
        if (block.chainid == 8453) {
            // Base mainnet
            require(
                tbaImplementation == tokenboundV3,
                "Base mainnet TBA_IMPLEMENTATION mismatch"
            );
        } else if (block.chainid == 84532) {
            // Base Sepolia
            require(
                tbaImplementation == tokenboundV3,
                "Base Sepolia TBA_IMPLEMENTATION mismatch"
            );
        }
        // Other chains: skip the check — staging/local/new-chain deploys
        // can supply their own implementation address.

        // Phase 10 (H-7): Phase 9 G-6 hard-pinned the Tokenbound
        // implementation but left ERC6551_REGISTRY unpinned — same
        // misconfiguration class on the other half of SAGATBAHelper's
        // immutable references. A compromised CI env or operator typo
        // setting ERC6551_REGISTRY to a malicious code-bearing contract
        // would silently deploy a helper that returns wrong TBA addresses
        // forever (immutable). Pin the canonical address per production
        // chain; staging/local can still override.
        address canonical6551Registry = 0x000000006551c19487814612e58FE06813775758;
        if (block.chainid == 8453) {
            require(
                erc6551Registry == canonical6551Registry,
                "Base mainnet ERC6551_REGISTRY mismatch"
            );
        } else if (block.chainid == 84532) {
            require(
                erc6551Registry == canonical6551Registry,
                "Base Sepolia ERC6551_REGISTRY mismatch"
            );
        }

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
