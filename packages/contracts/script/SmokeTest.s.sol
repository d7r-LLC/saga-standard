// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {SAGAHandleRegistry} from "../src/SAGAHandleRegistry.sol";
import {SAGAAgentIdentity} from "../src/SAGAAgentIdentity.sol";
import {SAGAOrgIdentity} from "../src/SAGAOrgIdentity.sol";
import {SAGADirectoryIdentity} from "../src/SAGADirectoryIdentity.sol";

/// @title SmokeTest
/// @notice End-to-end smoke test against the deployed identity contracts.
///         Registers one each of agent / org / directory plus one
///         scoped agent under that directory, then resolves all four
///         handles through the registry to confirm the round trip
///         works on the live deploy.
///
///         Designed to be run AFTER `Deploy.s.sol` and BEFORE
///         `FinalizeBootstrap.s.sol`. Uses uniqueness suffixes so it
///         can be re-run as long as the deployer keeps gas.
///
/// Required env vars:
///   DEPLOYER_PRIVATE_KEY   - signer that pays gas
///   HANDLE_REGISTRY        - SAGAHandleRegistry address
///   AGENT_IDENTITY         - SAGAAgentIdentity address
///   ORG_IDENTITY           - SAGAOrgIdentity address
///   DIRECTORY_IDENTITY     - SAGADirectoryIdentity address
///
/// Optional:
///   SMOKE_SUFFIX           - appended to handles to avoid collisions
contract SmokeTest is Script {
    struct Handles {
        string dir;
        string org;
        string agentGlobal;
        string agentScoped;
    }

    struct Tokens {
        uint256 dir;
        uint256 org;
        uint256 agentGlobal;
        uint256 agentScoped;
    }

    function run() external {
        Handles memory h = _buildHandles();
        Tokens memory t = _broadcastMints(h);
        _verifyResolutions(h, t);

        console.log("");
        console.log("=== SMOKE TEST PASSED ===");
        console.log("4 mints (1 directory, 1 org, 2 agents) + 4 registry resolutions");
    }

    function _buildHandles() internal view returns (Handles memory) {
        string memory suffix = vm.envOr("SMOKE_SUFFIX", _toString(block.timestamp));
        console.log("Suffix:", suffix);
        return Handles({
            dir: string.concat("smoke-dir-", suffix),
            org: string.concat("smoke-org-", suffix),
            agentGlobal: string.concat("smoke-agent-", suffix),
            agentScoped: string.concat("scoped-", suffix)
        });
    }

    function _broadcastMints(Handles memory h) internal returns (Tokens memory t) {
        SAGAAgentIdentity agent = SAGAAgentIdentity(vm.envAddress("AGENT_IDENTITY"));
        SAGAOrgIdentity org = SAGAOrgIdentity(vm.envAddress("ORG_IDENTITY"));
        SAGADirectoryIdentity dir = SAGADirectoryIdentity(vm.envAddress("DIRECTORY_IDENTITY"));

        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);
        console.log("Smoke test signer:", deployer);

        vm.startBroadcast(deployerKey);

        // 1. Directory mint — needed first so the scoped agent can attach.
        t.dir = dir.registerDirectory(h.dir, "https://smoke.example/", deployer, "full");
        console.log("Directory tokenId:", t.dir);

        // 2. Org mint
        t.org = org.registerOrganization(h.org, "Smoke Test Org");
        console.log("Org tokenId:", t.org);

        // 3. Agent mint (global)
        t.agentGlobal = agent.registerAgent(h.agentGlobal, "https://smoke.example/agent/");
        console.log("Agent (global) tokenId:", t.agentGlobal);

        // 4. Agent mint (scoped under the directory just created) —
        //    exercises Phase 9 G-11 / Phase 10 H-2 trust + active gates.
        t.agentScoped =
            agent.registerAgentInDirectory(h.agentScoped, "https://smoke.example/scoped/", h.dir);
        console.log("Agent (scoped) tokenId:", t.agentScoped);

        vm.stopBroadcast();
    }

    function _verifyResolutions(Handles memory h, Tokens memory t) internal view {
        SAGAHandleRegistry registry = SAGAHandleRegistry(vm.envAddress("HANDLE_REGISTRY"));
        address agentAddr = vm.envAddress("AGENT_IDENTITY");
        address orgAddr = vm.envAddress("ORG_IDENTITY");
        address dirAddr = vm.envAddress("DIRECTORY_IDENTITY");

        _assertGlobal(registry, h.dir, dirAddr, t.dir);
        _assertGlobal(registry, h.org, orgAddr, t.org);
        _assertGlobal(registry, h.agentGlobal, agentAddr, t.agentGlobal);

        // Scoped: under the just-minted directory.
        (
            SAGAHandleRegistry.EntityType etScoped,
            uint256 tidScoped,
            address caScoped
        ) = registry.resolveScopedHandle(h.agentScoped, h.dir);
        require(etScoped == SAGAHandleRegistry.EntityType.AGENT, "scoped: wrong entity type");
        require(tidScoped == t.agentScoped, "scoped: wrong tokenId");
        require(caScoped == agentAddr, "scoped: wrong contract");
        console.log("Scoped handle resolves correctly");

        // Active-scoped: also confirms the directory is in 'active' status
        // (Phase 9 G-5 + Phase 10 H-2).
        (, , address caActive) =
            registry.resolveActiveScopedHandle(h.agentScoped, h.dir);
        require(caActive == agentAddr, "active scoped: wrong contract");
        console.log("Active scoped resolution works");
    }

    function _assertGlobal(
        SAGAHandleRegistry registry,
        string memory handle,
        address expectedContract,
        uint256 expectedTokenId
    ) internal view {
        (
            SAGAHandleRegistry.EntityType et,
            uint256 tid,
            address ca
        ) = registry.resolveHandle(handle);
        require(et != SAGAHandleRegistry.EntityType.NONE, string.concat(handle, ": not found"));
        require(tid == expectedTokenId, string.concat(handle, ": tokenId mismatch"));
        require(ca == expectedContract, string.concat(handle, ": contract mismatch"));
    }

    function _toString(uint256 v) internal pure returns (string memory) {
        if (v == 0) return "0";
        uint256 t = v;
        uint256 digits;
        while (t != 0) {
            digits++;
            t /= 10;
        }
        bytes memory buf = new bytes(digits);
        while (v != 0) {
            digits--;
            buf[digits] = bytes1(uint8(48 + (v % 10)));
            v /= 10;
        }
        return string(buf);
    }
}
