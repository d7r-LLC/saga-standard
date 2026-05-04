// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {
    ERC721Enumerable
} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {SAGAHandleRegistry} from "./SAGAHandleRegistry.sol";
import {SAGAValidation} from "./SAGAValidation.sol";

/// @notice Minimal interface for the TBA helper used by the self-TBA transfer
///         guard added in Phase 8 (F-4). Identity contracts hold an immutable
///         reference to the helper and call computeAccount during _update.
interface ITBAHelperLite {
    function computeAccount(address tokenContract, uint256 tokenId) external view returns (address);
}

/// @notice Phase 11 (J-13): every ERC-6551 TBA implementation MUST
///         expose `token()` returning the binding tuple. Used by
///         `_update` to block transfers to ANY contract bound to this
///         NFT — closes the salt + alternative-implementation gap left
///         by the G-12 documented limitation.
interface IERC6551BoundAccount {
    function token() external view returns (uint256 chainId, address tokenContract, uint256 tokenId);
}

/// @title SAGAAgentIdentity
/// @notice ERC-721 NFT collection for SAGA agent identities
/// @dev Minting registers the handle in the SAGAHandleRegistry and stores the agent's home hub URL.
///      Phase 8: Ownable2Step (F-3), ReentrancyGuard + CEI _safeMint-last (F-2),
///      constructor address validation (F-8), self-TBA transfer guard (F-4),
///      setBaseURI validation + event (F-6).
contract SAGAAgentIdentity is ERC721Enumerable, Ownable2Step, ReentrancyGuard {
    uint256 private _nextTokenId;

    SAGAHandleRegistry public immutable handleRegistry;

    /// @notice TBA helper reference for the self-TBA transfer guard. Phase 8 (F-4).
    address public immutable tbaHelper;

    /// tokenId → handle string
    mapping(uint256 => string) private _agentHandles;
    /// tokenId → home hub URL
    mapping(uint256 => string) private _homeHubUrls;
    /// tokenId → registration timestamp
    mapping(uint256 => uint256) private _registeredAt;
    /// tokenId → directoryId (empty string for global agents)
    mapping(uint256 => string) private _directoryIds;

    /// Base URI for token metadata
    string private _baseTokenURI;

    event AgentRegistered(
        uint256 indexed tokenId,
        string handle,
        address indexed owner,
        string homeHubUrl,
        uint256 registeredAt
    );

    event HomeHubUpdated(uint256 indexed tokenId, string oldHubUrl, string newHubUrl);
    event BaseURIUpdated(string oldBaseURI, string newBaseURI);
    /// @notice Phase 9 (G-8): emitted when a new base URI is queued. The
    ///         actual update fires `BaseURIUpdated` after `applyBaseURI` is
    ///         called past the timelock.
    event BaseURIQueued(string newBaseURI, uint256 readyAt);
    /// @notice Phase 12 (K-5): emitted when a queued base URI is cancelled
    ///         by the owner before its timelock applies.
    event BaseURICancelled(string cancelledBaseURI);

    /// @notice Phase 9 (G-8): pending base URI awaiting timelock expiry.
    string private _pendingBaseURI;
    uint256 private _pendingBaseURIReadyAt;

    /// @notice Hours until a queued base URI can be applied.
    uint256 public constant BASE_URI_TIMELOCK = 24 hours;

    constructor(address registry, address _tbaHelper)
        ERC721("SAGA Agent Identity", "SAGA-AGENT")
        Ownable(msg.sender)
    {
        // Phase 8 (F-8): reject zero / EOA / non-contract registry addresses to
        // prevent a deployer typo from producing identity contracts that mint
        // NFTs but never register handles.
        require(registry.code.length > 0, "SAGAAgentIdentity: registry not contract");
        // Phase 8 (F-4): reject zero / EOA / non-contract tbaHelper. The helper
        // is used by the self-TBA transfer guard in _update; a misconfigured
        // address would either revert every transfer or fail to detect the
        // ownership-loop.
        require(_tbaHelper.code.length > 0, "SAGAAgentIdentity: tba helper not contract");
        handleRegistry = SAGAHandleRegistry(registry);
        tbaHelper = _tbaHelper;
        _baseTokenURI = "https://saga-standard.dev/api/metadata/agent/";
    }

    /// @notice Renounce is disabled. Phase 8 (F-3) + Phase 10 (H-6).
    function renounceOwnership() public override {
        // Phase 10 (H-6): drop `view` and `onlyOwner` so the disabled
        // message wins for every caller. See SAGAHandleRegistry for the
        // full rationale.
        revert("SAGAAgentIdentity: renounce disabled");
    }

    /// @notice Register an agent and mint an identity NFT
    /// @param handle Unique handle (3-64 chars, validated by registry)
    /// @param hubUrl URL of the agent's home SAGA hub
    /// @return tokenId The minted token ID
    function registerAgent(string calldata handle, string calldata hubUrl)
        external
        nonReentrant
        returns (uint256)
    {
        SAGAValidation.validateUrl(hubUrl);
        uint256 tokenId = _nextTokenId++;

        // Phase 8 (F-2): Effects FIRST. Initialize mappings + register handle
        // BEFORE the external _safeMint call invokes onERC721Received.
        // Closes the half-initialized-state observation window flagged by
        // the 2026-05-03 audit.
        _agentHandles[tokenId] = handle;
        _homeHubUrls[tokenId] = hubUrl;
        _registeredAt[tokenId] = block.timestamp;

        handleRegistry.registerHandle(handle, SAGAHandleRegistry.EntityType.AGENT, tokenId);

        // Interactions LAST. With nonReentrant on this function, a malicious
        // recipient cannot re-enter registerAgent or registerAgentInDirectory.
        _safeMint(msg.sender, tokenId);

        emit AgentRegistered(tokenId, handle, msg.sender, hubUrl, block.timestamp);
        return tokenId;
    }

    /// @notice Register an agent within a specific directory and mint an identity NFT
    /// @param handle Unique handle within the directory (3-64 chars, validated by registry)
    /// @param hubUrl URL of the agent's home SAGA hub
    /// @param directoryId The directory to register in
    /// @return tokenId The minted token ID
    function registerAgentInDirectory(
        string calldata handle,
        string calldata hubUrl,
        string calldata directoryId
    ) external nonReentrant returns (uint256) {
        SAGAValidation.validateUrl(hubUrl);
        uint256 tokenId = _nextTokenId++;

        // Phase 8 (F-2): Effects FIRST.
        _agentHandles[tokenId] = handle;
        _homeHubUrls[tokenId] = hubUrl;
        _registeredAt[tokenId] = block.timestamp;
        _directoryIds[tokenId] = directoryId;

        handleRegistry.registerScopedHandle(
            handle, SAGAHandleRegistry.EntityType.AGENT, tokenId, directoryId
        );

        // Interactions LAST.
        _safeMint(msg.sender, tokenId);

        emit AgentRegistered(tokenId, handle, msg.sender, hubUrl, block.timestamp);
        return tokenId;
    }

    /// @notice Update the home hub URL (owner only)
    /// @dev nonReentrant — Phase 8 (Copilot review on PR #45). With the F-2
    ///      CEI ordering, an ERC721Receiver callback during register* could
    ///      re-enter this mutator before AgentRegistered is emitted, making
    ///      the event payload inconsistent with the final stored state.
    function updateHomeHub(uint256 tokenId, string calldata newHubUrl) external nonReentrant {
        // Phase 10 (M-3): use OZ's _isAuthorized so smart-wallet operators
        // (ERC-4337, Safe, Delegate.xyz) approved via setApprovalForAll
        // can rotate hub URLs on behalf of the token owner. Direct
        // ownerOf() equality previously broke these standard delegation
        // flows.
        // _requireOwned reverts with the canonical ERC-721
        // ERC721NonexistentToken error for unminted tokens, preserving
        // standard tooling expectations (Copilot review on PR #54).
        address tokenOwner = _requireOwned(tokenId);
        require(
            _isAuthorized(tokenOwner, msg.sender, tokenId),
            "SAGAAgentIdentity: not authorized"
        );
        SAGAValidation.validateUrl(newHubUrl);
        string memory oldUrl = _homeHubUrls[tokenId];
        _homeHubUrls[tokenId] = newHubUrl;
        emit HomeHubUpdated(tokenId, oldUrl, newHubUrl);
    }

    // --- View functions ---

    function agentHandle(uint256 tokenId) external view returns (string memory) {
        _requireOwned(tokenId);
        return _agentHandles[tokenId];
    }

    function homeHubUrl(uint256 tokenId) external view returns (string memory) {
        _requireOwned(tokenId);
        return _homeHubUrls[tokenId];
    }

    function registeredAt(uint256 tokenId) external view returns (uint256) {
        _requireOwned(tokenId);
        return _registeredAt[tokenId];
    }

    function agentDirectoryId(uint256 tokenId) external view returns (string memory) {
        _requireOwned(tokenId);
        return _directoryIds[tokenId];
    }

    // --- Metadata ---

    /// @notice Read the queued (not-yet-applied) base URI.
    function pendingBaseURI() external view returns (string memory) {
        return _pendingBaseURI;
    }

    /// @notice Earliest timestamp at which `applyBaseURI` will accept the
    ///         queued URI.
    function pendingBaseURIReadyAt() external view returns (uint256) {
        return _pendingBaseURIReadyAt;
    }

    /// @notice Queue a new base URI for later application (owner only).
    /// @dev Phase 9 (G-8): split into queue + apply with a 24h delay. After
    ///      the Safe handoff, a single multisig transaction could otherwise
    ///      redirect every NFT's tokenURI in one block — instant phishing
    ///      on metadata. Marketplaces and indexers get a 24h window to
    ///      detect the change before it lands. Phase 8 (F-6) URL validation
    ///      runs at queue time so a bogus URI fails fast.
    function setBaseURI(string calldata newBaseURI) external onlyOwner {
        // Phase 11 (J-6): stricter validator since tokenURI concatenates
        // `_baseTokenURI + tokenId.toString()`. Rejects `?`, `#`, `&`
        // and requires trailing `/` so the appended tokenId always
        // lands in a path component, not a query/fragment.
        SAGAValidation.validateBaseUri(newBaseURI);
        _pendingBaseURI = newBaseURI;
        _pendingBaseURIReadyAt = block.timestamp + BASE_URI_TIMELOCK;
        emit BaseURIQueued(newBaseURI, _pendingBaseURIReadyAt);
    }

    /// @notice Apply a previously-queued base URI. Anyone can call this
    ///         once the timelock has elapsed; the queue is single-slot so
    ///         the most-recently-queued value wins.
    function applyBaseURI() external {
        require(_pendingBaseURIReadyAt > 0, "SAGAAgentIdentity: no pending base uri");
        require(
            block.timestamp >= _pendingBaseURIReadyAt,
            "SAGAAgentIdentity: base uri not yet ready"
        );
        // Phase 10 (M-2) + Phase 11 (J-6): re-validate the queued URL
        // at apply time using the stricter base-URI validator (which
        // also enforces J-6's trailing-slash + no-query-string rules).
        SAGAValidation.validateBaseUri(_pendingBaseURI);
        emit BaseURIUpdated(_baseTokenURI, _pendingBaseURI);
        _baseTokenURI = _pendingBaseURI;
        delete _pendingBaseURI;
        delete _pendingBaseURIReadyAt;
    }

    /// @notice Phase 12 (K-5): cancel a pending base URI before its
    ///         timelock elapses. Owner-only; matches the cancel pattern
    ///         introduced in Phase 11 (J-1) for queued contract updates.
    function cancelPendingBaseURI() external onlyOwner {
        require(_pendingBaseURIReadyAt > 0, "SAGAAgentIdentity: no pending base uri");
        string memory cancelled = _pendingBaseURI;
        delete _pendingBaseURI;
        delete _pendingBaseURIReadyAt;
        emit BaseURICancelled(cancelled);
    }

    function _baseURI() internal view override returns (string memory) {
        return _baseTokenURI;
    }

    // --- ERC-721 transfer hooks ---

    /// @dev Phase 8 (F-4): block transfers into the token's own ERC-6551 TBA.
    ///      The ownership-loop would permanently lock the NFT (TBA owns NFT,
    ///      NFT controls TBA, no signer can authorize recovery).
    function _update(address to, uint256 tokenId, address auth)
        internal
        override
        returns (address)
    {
        if (to != address(0)) {
            // F-4 (Phase 8): block the canonical salt-zero TBA derived
            // by SAGATBAHelper. Cheap path; ~700 gas.
            address selfTba = ITBAHelperLite(tbaHelper).computeAccount(address(this), tokenId);
            require(to != selfTba, "SAGAAgentIdentity: cannot transfer to own TBA");

            // J-13 (Phase 11): also block ANY contract that exposes
            // ERC-6551 `token()` introspection and reports being bound
            // to THIS NFT — closes the salt + alternative-implementation
            // gap left by the G-12 documented limitation. ~3k gas extra
            // (one staticcall + 3 SLOAD on the destination).
            if (to.code.length > 0) {
                // Phase 12 (K-3): bound the introspection gas. A
                // malicious destination whose token() spins until OOG
                // could otherwise consume all forwarded gas (EIP-150)
                // and either grief the transfer or force fall-through
                // under specific gas-state conditions. 30k is enough
                // for any honest TBA's returndata (3 SLOADs + return).
                try IERC6551BoundAccount(to).token{gas: 30000}() returns (
                    uint256 boundChainId, address boundContract, uint256 boundTokenId
                ) {
                    if (
                        boundChainId == block.chainid
                            && boundContract == address(this)
                            && boundTokenId == tokenId
                    ) {
                        revert("SAGAAgentIdentity: cannot transfer to own TBA");
                    }
                } catch {
                    // Not a TBA (or non-conforming) — proceed.
                }
            }
        }
        return super._update(to, tokenId, auth);
    }
}
