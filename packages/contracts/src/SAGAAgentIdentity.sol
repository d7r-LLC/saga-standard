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

    /// @notice Renounce is disabled. Phase 8 (F-3).
    function renounceOwnership() public view override onlyOwner {
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
        require(ownerOf(tokenId) == msg.sender, "SAGAAgentIdentity: not owner");
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

    /// @notice Update the base URI for token metadata (owner only).
    /// @dev Phase 8 (F-6): pipe through SAGAValidation.validateUrl (1024 byte
    ///      cap, http(s)-only) and emit BaseURIUpdated so indexers can detect
    ///      the change without polling storage.
    function setBaseURI(string calldata newBaseURI) external onlyOwner {
        SAGAValidation.validateUrl(newBaseURI);
        emit BaseURIUpdated(_baseTokenURI, newBaseURI);
        _baseTokenURI = newBaseURI;
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
            address selfTba = ITBAHelperLite(tbaHelper).computeAccount(address(this), tokenId);
            require(to != selfTba, "SAGAAgentIdentity: cannot transfer to own TBA");
        }
        return super._update(to, tokenId, auth);
    }
}
