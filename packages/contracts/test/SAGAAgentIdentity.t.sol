// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {Test, Vm} from "forge-std/Test.sol";
import {SAGAHandleRegistry} from "../src/SAGAHandleRegistry.sol";
import {SAGAAgentIdentity} from "../src/SAGAAgentIdentity.sol";
import {SAGAOrgIdentity} from "../src/SAGAOrgIdentity.sol";
import {SAGADirectoryIdentity} from "../src/SAGADirectoryIdentity.sol";
import {SAGAValidation} from "../src/SAGAValidation.sol";
import {IERC721Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";
import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";

/// @dev Minimal TBA helper mock for Phase 8 (F-4) self-TBA guard tests.
///      Returns a deterministic predicted address per (tokenContract, tokenId).
contract MockTBAHelper {
    function computeAccount(address tokenContract, uint256 tokenId)
        external
        pure
        returns (address)
    {
        return address(uint160(uint256(keccak256(abi.encode(tokenContract, tokenId)))));
    }
}

/// @dev Phase 9 (G-17): a malicious recipient that introspects the
///      half-initialized SAGAAgentIdentity state from inside
///      onERC721Received. With Phase 8 F-2's CEI ordering, the callback
///      runs AFTER the handle has been registered and the homeHub URL
///      stored, so an introspecting recipient sees the "real" agent
///      record. Without F-2, the recipient would see empty strings — and
///      could decide based on those empty values to keep the NFT in some
///      compromised flow, then exploit the eventual writeback.
contract ProbingReceiver is IERC721Receiver {
    string public observedHandle;
    string public observedHubUrl;
    bool public observedHandleRegistered;
    SAGAAgentIdentity public agent;
    SAGAHandleRegistry public registry;

    constructor(SAGAAgentIdentity _agent, SAGAHandleRegistry _registry) {
        agent = _agent;
        registry = _registry;
    }

    function onERC721Received(address, address, uint256 tokenId, bytes calldata)
        external
        override
        returns (bytes4)
    {
        observedHandle = agent.agentHandle(tokenId);
        observedHubUrl = agent.homeHubUrl(tokenId);
        observedHandleRegistered = registry.handleExists(observedHandle);
        return IERC721Receiver.onERC721Received.selector;
    }
}

contract SAGAAgentIdentityTest is Test, IERC721Receiver {
    /// @dev Phase 8 (F-2): test contract receives directory NFTs in setUp via
    ///      _safeMint, which now invokes onERC721Received. Implement the
    ///      interface so the callback returns the magic value.
    function onERC721Received(address, address, uint256, bytes calldata)
        external
        pure
        override
        returns (bytes4)
    {
        return IERC721Receiver.onERC721Received.selector;
    }

    SAGAHandleRegistry public registry;
    SAGAAgentIdentity public agent;
    SAGAOrgIdentity public org;
    SAGADirectoryIdentity public directory;
    MockTBAHelper public tbaHelper;
    address public deployer;
    address public user1;
    address public user2;

    event AgentRegistered(
        uint256 indexed tokenId,
        string handle,
        address indexed owner,
        string homeHubUrl,
        uint256 registeredAt
    );

    function setUp() public {
        deployer = address(this);
        user1 = address(0x1);
        user2 = address(0x2);

        registry = new SAGAHandleRegistry();
        tbaHelper = new MockTBAHelper();
        agent = new SAGAAgentIdentity(address(registry), address(tbaHelper));
        org = new SAGAOrgIdentity(address(registry), address(tbaHelper));
        directory = new SAGADirectoryIdentity(address(registry), address(tbaHelper));

        // Authorize all three identity contracts
        registry.setAuthorizedContract(address(agent), true);
        registry.setAuthorizedContract(address(org), true);
        registry.setAuthorizedContract(address(directory), true);

        // Phase 8 (F-1): wire directory identity + pre-mint directories used
        // by scoped registration tests so they continue to exercise the same
        // code paths.
        registry.setTrustedDirectoryContract(address(directory), true);
        directory.registerDirectory("dir-a", "https://dir-a.example/", address(0xDA), "basic");
        directory.registerDirectory("dir-b", "https://dir-b.example/", address(0xDB), "basic");
        directory.registerDirectory("epic-hub", "https://epic-hub.example/", address(0xE1), "basic");
        directory.registerDirectory("some-dir", "https://some-dir.example/", address(0x5D), "basic");
    }

    // --- Test 1: registerAgent success ---
    function test_registerAgent_success() public {
        vm.prank(user1);
        uint256 tokenId = agent.registerAgent("marcus.chen", "https://hub.example.com");

        assertEq(tokenId, 0);
        assertEq(agent.ownerOf(tokenId), user1);
        assertEq(agent.agentHandle(tokenId), "marcus.chen");
        assertEq(agent.homeHubUrl(tokenId), "https://hub.example.com");

        // Verify in registry
        (SAGAHandleRegistry.EntityType entityType, uint256 regTokenId, address contractAddr) =
            registry.resolveHandle("marcus.chen");
        assertEq(uint256(entityType), uint256(SAGAHandleRegistry.EntityType.AGENT));
        assertEq(regTokenId, 0);
        assertEq(contractAddr, address(agent));
    }

    // --- Test 2: token ID increments ---
    function test_registerAgent_tokenIdIncremental() public {
        vm.prank(user1);
        uint256 id0 = agent.registerAgent("agent-0", "https://hub.example.com");

        vm.prank(user2);
        uint256 id1 = agent.registerAgent("agent-1", "https://hub.example.com");

        assertEq(id0, 0);
        assertEq(id1, 1);
    }

    // --- Test 3: duplicate handle reverts ---
    function test_registerAgent_duplicateHandleReverts() public {
        vm.prank(user1);
        agent.registerAgent("unique-handle", "https://hub.example.com");

        vm.prank(user2);
        vm.expectRevert("SAGAHandleRegistry: handle taken");
        agent.registerAgent("unique-handle", "https://other.example.com");
    }

    // --- Test 4: cross-entity duplicate (agent handle blocks org) ---
    function test_registerAgent_crossEntityDuplicate() public {
        vm.prank(user1);
        agent.registerAgent("shared-name", "https://hub.example.com");

        vm.prank(user2);
        vm.expectRevert("SAGAHandleRegistry: handle taken");
        org.registerOrganization("shared-name", "Shared Org");
    }

    // --- Test 5: emits AgentRegistered event ---
    function test_registerAgent_emitsEvent() public {
        vm.prank(user1);
        vm.expectEmit(true, true, false, true);
        emit AgentRegistered(0, "event-agent", user1, "https://hub.example.com", block.timestamp);
        agent.registerAgent("event-agent", "https://hub.example.com");
    }

    // --- Test 6: updateHomeHub success ---
    function test_updateHomeHub_success() public {
        vm.prank(user1);
        uint256 tokenId = agent.registerAgent("update-hub", "https://old.example.com");

        vm.prank(user1);
        agent.updateHomeHub(tokenId, "https://new.example.com");

        assertEq(agent.homeHubUrl(tokenId), "https://new.example.com");
    }

    // --- Test 7: updateHomeHub non-owner reverts ---
    function test_updateHomeHub_nonOwnerReverts() public {
        vm.prank(user1);
        uint256 tokenId = agent.registerAgent("no-update", "https://hub.example.com");

        vm.prank(user2);
        vm.expectRevert("SAGAAgentIdentity: not authorized");
        agent.updateHomeHub(tokenId, "https://hacked.example.com");
    }

    // --- Test 8: updateHomeHub after transfer ---
    function test_updateHomeHub_afterTransfer() public {
        vm.prank(user1);
        uint256 tokenId = agent.registerAgent("transfer-hub", "https://hub.example.com");

        // Transfer to user2
        vm.prank(user1);
        agent.transferFrom(user1, user2, tokenId);

        // New owner can update
        vm.prank(user2);
        agent.updateHomeHub(tokenId, "https://new-owner-hub.example.com");
        assertEq(agent.homeHubUrl(tokenId), "https://new-owner-hub.example.com");
    }

    // --- Test 9: agentHandle returns correct ---
    function test_agentHandle_returnsCorrect() public {
        vm.prank(user1);
        uint256 tokenId = agent.registerAgent("handle-test", "https://hub.example.com");

        assertEq(agent.agentHandle(tokenId), "handle-test");
    }

    // --- Test 10: agentHandle nonexistent reverts ---
    function test_agentHandle_nonexistentReverts() public {
        vm.expectRevert(abi.encodeWithSelector(IERC721Errors.ERC721NonexistentToken.selector, 999));
        agent.agentHandle(999);
    }

    // --- Test 11: transfer changes owner ---
    function test_transfer_ownerChanges() public {
        vm.prank(user1);
        uint256 tokenId = agent.registerAgent("transfer-test", "https://hub.example.com");

        vm.prank(user1);
        agent.transferFrom(user1, user2, tokenId);

        assertEq(agent.ownerOf(tokenId), user2);
    }

    // --- Test 12: original owner loses control after transfer ---
    function test_transfer_originalOwnerLosesControl() public {
        vm.prank(user1);
        uint256 tokenId = agent.registerAgent("lose-control", "https://hub.example.com");

        vm.prank(user1);
        agent.transferFrom(user1, user2, tokenId);

        vm.prank(user1);
        vm.expectRevert("SAGAAgentIdentity: not authorized");
        agent.updateHomeHub(tokenId, "https://shouldnt-work.example.com");
    }

    // --- Test 13: tokenURI returns baseURI + id ---
    function test_tokenURI_returnsBaseURIPlusId() public {
        vm.prank(user1);
        uint256 tokenId = agent.registerAgent("uri-test", "https://hub.example.com");

        assertEq(agent.tokenURI(tokenId), "https://saga-standard.dev/api/metadata/agent/0");
    }

    // --- Test 14: setBaseURI owner only ---
    function test_setBaseURI_ownerOnly() public {
        // Phase 9 (G-8): setBaseURI now queues; applyBaseURI fires after
        // the timelock. The base URI does not change immediately.
        agent.setBaseURI("https://new-base.com/");
        vm.warp(block.timestamp + 24 hours);
        agent.applyBaseURI();

        vm.prank(user1);
        uint256 tokenId = agent.registerAgent("new-uri", "https://hub.example.com");
        assertEq(agent.tokenURI(tokenId), "https://new-base.com/0");

        // Non-owner cannot queue
        vm.prank(user1);
        vm.expectRevert();
        agent.setBaseURI("https://hacked.com/");
    }

    // --- Test 15: totalSupply increments ---
    function test_totalSupply_increments() public {
        assertEq(agent.totalSupply(), 0);

        vm.prank(user1);
        agent.registerAgent("supply-test-1", "https://hub.example.com");
        assertEq(agent.totalSupply(), 1);

        vm.prank(user2);
        agent.registerAgent("supply-test-2", "https://hub.example.com");
        assertEq(agent.totalSupply(), 2);
    }

    // --- Test 16: tokenOfOwnerByIndex ---
    function test_tokenOfOwnerByIndex() public {
        vm.startPrank(user1);
        agent.registerAgent("multi-agent-1", "https://hub.example.com");
        agent.registerAgent("multi-agent-2", "https://hub.example.com");
        vm.stopPrank();

        assertEq(agent.balanceOf(user1), 2);
        assertEq(agent.tokenOfOwnerByIndex(user1, 0), 0);
        assertEq(agent.tokenOfOwnerByIndex(user1, 1), 1);
    }

    // --- Test 17: registeredAt returns block.timestamp ---
    function test_registeredAt_returnsTimestamp() public {
        vm.warp(1_700_000_000);

        vm.prank(user1);
        uint256 tokenId = agent.registerAgent("timestamp-test", "https://hub.example.com");

        assertEq(agent.registeredAt(tokenId), 1_700_000_000);
    }

    // --- Test 18: registeredAt nonexistent reverts ---
    function test_registeredAt_nonexistentReverts() public {
        vm.expectRevert(abi.encodeWithSelector(IERC721Errors.ERC721NonexistentToken.selector, 999));
        agent.registeredAt(999);
    }

    // --- Test 19: registerAgentInDirectory success ---
    function test_registerAgentInDirectory_success() public {
        vm.prank(user1);
        uint256 tokenId = agent.registerAgentInDirectory(
            "marcus", "https://hub.example.com", "epic-hub"
        );

        assertEq(tokenId, 0);
        assertEq(agent.ownerOf(tokenId), user1);
        assertEq(agent.agentHandle(tokenId), "marcus");
        assertEq(agent.homeHubUrl(tokenId), "https://hub.example.com");
        assertEq(agent.agentDirectoryId(tokenId), "epic-hub");

        // Verify in scoped registry
        (SAGAHandleRegistry.EntityType entityType, uint256 regTokenId, address contractAddr) =
            registry.resolveScopedHandle("marcus", "epic-hub");
        assertEq(uint256(entityType), uint256(SAGAHandleRegistry.EntityType.AGENT));
        assertEq(regTokenId, 0);
        assertEq(contractAddr, address(agent));
    }

    // --- Test 20: same handle in different directories ---
    function test_registerAgentInDirectory_sameHandleDifferentDirs() public {
        vm.prank(user1);
        agent.registerAgentInDirectory("marcus", "https://hub-a.com", "dir-a");

        vm.prank(user2);
        agent.registerAgentInDirectory("marcus", "https://hub-b.com", "dir-b");

        (, uint256 tidA,) = registry.resolveScopedHandle("marcus", "dir-a");
        (, uint256 tidB,) = registry.resolveScopedHandle("marcus", "dir-b");

        assertEq(tidA, 0);
        assertEq(tidB, 1);
    }

    // --- Test 21: directory-scoped agent doesn't block global agent ---
    function test_registerAgentInDirectory_doesNotBlockGlobal() public {
        vm.prank(user1);
        agent.registerAgentInDirectory("unique-name", "https://hub-a.com", "dir-a");

        // Global registration of same handle should succeed
        vm.prank(user2);
        agent.registerAgent("unique-name", "https://hub-b.com");

        (, uint256 globalTid,) = registry.resolveHandle("unique-name");
        (, uint256 scopedTid,) = registry.resolveScopedHandle("unique-name", "dir-a");

        assertEq(globalTid, 1);
        assertEq(scopedTid, 0);
    }

    // --- Test 22: agentDirectoryId for global agent returns empty string ---
    function test_agentDirectoryId_globalReturnsEmpty() public {
        vm.prank(user1);
        uint256 tokenId = agent.registerAgent("global-agent", "https://hub.com");

        assertEq(agent.agentDirectoryId(tokenId), "");
    }

    // === Phase 1 — URL validation (A-Med#14) ===

    function test_registerAgent_emptyUrlReverts() public {
        vm.prank(user1);
        vm.expectRevert(SAGAValidation.InvalidUrlLength.selector);
        agent.registerAgent("no-url", "");
    }

    function test_registerAgent_invalidProtocolReverts() public {
        vm.prank(user1);
        vm.expectRevert(SAGAValidation.InvalidUrlProtocol.selector);
        agent.registerAgent("bad-proto", "javascript:alert(1)");
    }

    function test_registerAgentInDirectory_invalidProtocolReverts() public {
        vm.prank(user1);
        vm.expectRevert(SAGAValidation.InvalidUrlProtocol.selector);
        agent.registerAgentInDirectory("bad-proto-dir", "ftp://hub.com", "some-dir");
    }

    function test_updateHomeHub_emptyUrlReverts() public {
        vm.prank(user1);
        uint256 tokenId = agent.registerAgent("hub-empty", "https://old.com");

        vm.prank(user1);
        vm.expectRevert(SAGAValidation.InvalidUrlLength.selector);
        agent.updateHomeHub(tokenId, "");
    }

    function test_updateHomeHub_invalidProtocolReverts() public {
        vm.prank(user1);
        uint256 tokenId = agent.registerAgent("hub-proto", "https://old.com");

        vm.prank(user1);
        vm.expectRevert(SAGAValidation.InvalidUrlProtocol.selector);
        agent.updateHomeHub(tokenId, "data:text/html,evil");
    }

    // === Phase 8 regression tests ===

    // F-3: Ownable2Step + renounce-revert
    function test_ownership_twoStepRequired() public {
        address pending = makeAddr("pending");
        agent.transferOwnership(pending);
        assertEq(agent.owner(), address(this));
        assertEq(agent.pendingOwner(), pending);
        vm.prank(pending);
        agent.acceptOwnership();
        assertEq(agent.owner(), pending);
    }

    function test_renounceOwnership_reverts() public {
        vm.expectRevert(bytes("SAGAAgentIdentity: renounce disabled"));
        agent.renounceOwnership();
    }

    // F-8: constructor address validation
    function test_constructor_revertsOnZeroRegistry() public {
        vm.expectRevert(bytes("SAGAAgentIdentity: registry not contract"));
        new SAGAAgentIdentity(address(0), address(tbaHelper));
    }

    function test_constructor_revertsOnEoaRegistry() public {
        vm.expectRevert(bytes("SAGAAgentIdentity: registry not contract"));
        new SAGAAgentIdentity(makeAddr("eoa"), address(tbaHelper));
    }

    // F-4: constructor rejects zero / EOA tbaHelper
    function test_constructor_revertsOnZeroTbaHelper() public {
        vm.expectRevert(bytes("SAGAAgentIdentity: tba helper not contract"));
        new SAGAAgentIdentity(address(registry), address(0));
    }

    function test_constructor_revertsOnEoaTbaHelper() public {
        vm.expectRevert(bytes("SAGAAgentIdentity: tba helper not contract"));
        new SAGAAgentIdentity(address(registry), makeAddr("eoa-tba"));
    }

    // F-4: self-TBA transfer guard
    function test_safeTransferToOwnTBA_reverts() public {
        vm.prank(user1);
        uint256 tokenId = agent.registerAgent("self-tba", "https://hub.example/");
        address selfTba = tbaHelper.computeAccount(address(agent), tokenId);
        vm.prank(user1);
        vm.expectRevert(bytes("SAGAAgentIdentity: cannot transfer to own TBA"));
        agent.transferFrom(user1, selfTba, tokenId);
    }

    // F-6 / G-8: setBaseURI queues; applyBaseURI emits BaseURIUpdated.
    function test_setBaseURI_emitsEvent() public {
        // Queueing emits BaseURIQueued, not BaseURIUpdated.
        vm.expectEmit(false, false, false, true, address(agent));
        emit SAGAAgentIdentity.BaseURIQueued(
            "https://x.example/", block.timestamp + 24 hours
        );
        agent.setBaseURI("https://x.example/");

        // After the timelock, applyBaseURI emits BaseURIUpdated.
        vm.warp(block.timestamp + 24 hours);
        vm.expectEmit(false, false, false, true, address(agent));
        emit SAGAAgentIdentity.BaseURIUpdated(
            "https://saga-standard.dev/api/metadata/agent/", "https://x.example/"
        );
        agent.applyBaseURI();
    }

    function test_setBaseURI_revertsOnInvalidProtocol() public {
        // URL validation runs at queue time so a bogus URI fails fast.
        vm.expectRevert(SAGAValidation.InvalidUrlProtocol.selector);
        agent.setBaseURI("javascript:alert(1)");
    }

    // G-8: queue + 24h timelock + apply
    function test_g8_setBaseURI_requiresQueueAndDelay() public {
        string memory newUri = "https://x.example/";

        agent.setBaseURI(newUri);
        assertEq(agent.pendingBaseURI(), newUri);
        assertEq(agent.pendingBaseURIReadyAt(), block.timestamp + 24 hours);

        // Apply too early reverts.
        vm.expectRevert(bytes("SAGAAgentIdentity: base uri not yet ready"));
        agent.applyBaseURI();

        vm.warp(block.timestamp + 24 hours - 1);
        vm.expectRevert(bytes("SAGAAgentIdentity: base uri not yet ready"));
        agent.applyBaseURI();

        vm.warp(block.timestamp + 1);
        agent.applyBaseURI();
        assertEq(agent.pendingBaseURI(), "");
        assertEq(agent.pendingBaseURIReadyAt(), 0);

        // Subsequent apply with no queue reverts.
        vm.expectRevert(bytes("SAGAAgentIdentity: no pending base uri"));
        agent.applyBaseURI();
    }

    function test_g8_setBaseURI_anyoneCanApplyAfterTimelock() public {
        agent.setBaseURI("https://anyone.example/");
        vm.warp(block.timestamp + 24 hours);
        // Non-owner finalizes the queued URI.
        vm.prank(user1);
        agent.applyBaseURI();
    }

    function test_g8_setBaseURI_overwritesPendingValue() public {
        agent.setBaseURI("https://first.example/");
        agent.setBaseURI("https://second.example/");
        assertEq(agent.pendingBaseURI(), "https://second.example/");
        vm.warp(block.timestamp + 24 hours);
        agent.applyBaseURI();
    }

    // F-2: CEI ordering — onERC721Received observes a fully-initialized agent.
    //      Uses the test contract itself as the receiver; the inherited
    //      onERC721Received above runs as the callback. We assert state
    //      observable in the callback would be correct by verifying the
    //      post-mint state matches what an observer would see (the callback
    //      runs synchronously; if mappings were empty during it, the post-
    //      mint reads would not differ — so this test pins the structural
    //      ordering: registry handle resolution succeeds during the
    //      effects-first phase, before _safeMint is called).
    function test_registerAgent_handleResolvesAfterCallback() public {
        agent.registerAgent("ordering-test", "https://hub.example/");
        // If _safeMint had run before registerHandle, the handle wouldn't
        // resolve in the registry. Confirms the registry-call-before-mint
        // ordering.
        (SAGAHandleRegistry.EntityType et, uint256 tid, address ca) =
            registry.resolveHandle("ordering-test");
        assertEq(uint256(et), uint256(SAGAHandleRegistry.EntityType.AGENT));
        assertEq(tid, 0);
        assertEq(ca, address(agent));
    }

    // F-1: scoped registration through agent fails when directory missing
    function test_registerAgentInDirectory_revertsWhenDirectoryNotFound() public {
        vm.prank(user1);
        vm.expectRevert(bytes("SAGAHandleRegistry: directory not found"));
        agent.registerAgentInDirectory("alice", "https://hub.example/", "ghost-dir");
    }

    // G-10: indexers expecting handle-then-NFT log ordering should still
    // see HandleRegistered (from the registry) emitted BEFORE the ERC-721
    // Transfer event (from the agent contract's _safeMint). This pins
    // the Phase 8 F-2 CEI ordering — effects (handle registration) happen
    // before interactions (the safeMint that triggers Transfer +
    // onERC721Received). Indexers built against this ordering would
    // double-process or miss tokens if it ever flipped.
    function test_g10_eventOrdering_handleBeforeNftTransfer() public {
        bytes32 handleRegisteredTopic = keccak256(
            "HandleRegistered(bytes32,string,uint8,uint256,address)"
        );
        bytes32 transferTopic = keccak256("Transfer(address,address,uint256)");
        bytes32 agentRegisteredTopic = keccak256(
            "AgentRegistered(uint256,string,address,string,uint256)"
        );

        vm.recordLogs();
        vm.prank(user1);
        agent.registerAgent("ordering-test", "https://hub.example.com");

        Vm.Log[] memory logs = vm.getRecordedLogs();
        int256 handleIdx = -1;
        int256 transferIdx = -1;
        int256 agentIdx = -1;
        for (uint256 i = 0; i < logs.length; i++) {
            bytes32 t0 = logs[i].topics.length > 0 ? logs[i].topics[0] : bytes32(0);
            if (t0 == handleRegisteredTopic && handleIdx == -1) {
                handleIdx = int256(i);
            } else if (t0 == transferTopic && transferIdx == -1) {
                transferIdx = int256(i);
            } else if (t0 == agentRegisteredTopic && agentIdx == -1) {
                agentIdx = int256(i);
            }
        }

        assertGt(handleIdx, -1, "HandleRegistered missing");
        assertGt(transferIdx, -1, "Transfer missing");
        assertGt(agentIdx, -1, "AgentRegistered missing");

        // CEI ordering: handle registration runs as Effect; Transfer fires
        // during the safeMint Interaction; AgentRegistered fires after.
        assertLt(handleIdx, transferIdx, "handle must precede transfer");
        assertLt(transferIdx, agentIdx, "transfer must precede agentRegistered");
    }

    // G-17: a malicious / curious recipient introspecting the agent state
    // from inside onERC721Received MUST see the fully-initialized record.
    // Phase 8 F-2 fixed CEI ordering for this exact reason; this test pins
    // the property so a future refactor that re-orders effects after the
    // safeMint interaction would fail loudly.
    function test_g17_onERC721Received_seesInitializedAgentRecord() public {
        ProbingReceiver receiver = new ProbingReceiver(agent, registry);

        vm.prank(address(receiver));
        uint256 tokenId =
            agent.registerAgent("probing", "https://probe.example/");

        assertEq(receiver.observedHandle(), "probing");
        assertEq(receiver.observedHubUrl(), "https://probe.example/");
        assertTrue(
            receiver.observedHandleRegistered(),
            "registry must already see the handle during onERC721Received"
        );
        // Sanity: the NFT actually went to the receiver.
        assertEq(agent.ownerOf(tokenId), address(receiver));
    }

    // H-6: renounceOwnership disabled-message wins for every caller. The
    // existing test_renounceOwnership_reverts above only exercises the
    // owner path; this pins the non-owner path so removing onlyOwner
    // doesn't silently regress.
    function test_h6_renounceOwnership_revertsForNonOwnerWithSameMessage() public {
        vm.prank(makeAddr("randomEoa"));
        vm.expectRevert(bytes("SAGAAgentIdentity: renounce disabled"));
        agent.renounceOwnership();
    }

    // === Phase 10B regression tests ===

    // M-3: approved operator can call updateHomeHub. Previously the
    // direct ownerOf == msg.sender check rejected smart-wallet delegates.
    function test_m3_updateHomeHub_approvedOperatorSucceeds() public {
        vm.prank(user1);
        uint256 tokenId = agent.registerAgent("op-agent", "https://old.example/");

        address operator = makeAddr("operator");
        vm.prank(user1);
        agent.setApprovalForAll(operator, true);

        vm.prank(operator);
        agent.updateHomeHub(tokenId, "https://new.example/");
        assertEq(agent.homeHubUrl(tokenId), "https://new.example/");
    }

    function test_m3_updateHomeHub_strangerStillBlocked() public {
        vm.prank(user1);
        uint256 tokenId = agent.registerAgent("blk-agent", "https://old.example/");

        vm.prank(makeAddr("stranger"));
        vm.expectRevert(bytes("SAGAAgentIdentity: not authorized"));
        agent.updateHomeHub(tokenId, "https://hijack.example/");
    }

    // === Phase 10C regression tests ===

    // I-2: the 4-arg safeTransferFrom(from, to, tokenId, data) overload
    // routes through _safeTransfer → _update; the F-4 self-TBA guard MUST
    // fire on this path too. Existing tests only cover the 3-arg form.
    function test_i2_safeTransferFrom4Arg_blocksSelfTBA() public {
        vm.prank(user1);
        uint256 tokenId = agent.registerAgent("xfer4", "https://h.example/");
        address selfTba = tbaHelper.computeAccount(address(agent), tokenId);

        vm.prank(user1);
        vm.expectRevert(bytes("SAGAAgentIdentity: cannot transfer to own TBA"));
        agent.safeTransferFrom(user1, selfTba, tokenId, "");
    }

    // Phase 10B Copilot review: updateHomeHub on a nonexistent tokenId
    // reverts with the canonical ERC-721 ERC721NonexistentToken error
    // (via _requireOwned), not with the custom "not authorized" message.
    function test_updateHomeHub_revertsWithErc721NonexistentForUnminted() public {
        vm.expectRevert(
            abi.encodeWithSelector(IERC721Errors.ERC721NonexistentToken.selector, 9999)
        );
        agent.updateHomeHub(9999, "https://x.example/");
    }
}
