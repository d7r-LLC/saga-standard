// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {
    ERC721Enumerable
} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {SAGAHandleRegistry} from "./SAGAHandleRegistry.sol";

/// @title SAGAAgentIdentity
/// @notice ERC-721 NFT collection for SAGA agent identities
/// @dev Minting registers the handle in the SAGAHandleRegistry and stores the agent's home hub URL
contract SAGAAgentIdentity is ERC721Enumerable, Ownable {
    uint256 private _nextTokenId;

    SAGAHandleRegistry public immutable handleRegistry;

    /// tokenId → handle string
    mapping(uint256 => string) private _agentHandles;
    /// tokenId → home hub URL
    mapping(uint256 => string) private _homeHubUrls;
    /// tokenId → registration timestamp
    mapping(uint256 => uint256) private _registeredAt;

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

    constructor(address registry) ERC721("SAGA Agent Identity", "SAGA-AGENT") Ownable(msg.sender) {
        handleRegistry = SAGAHandleRegistry(registry);
        _baseTokenURI = "https://saga-standard.dev/api/metadata/agent/";
    }

    /// @notice Register an agent and mint an identity NFT
    /// @param handle Unique handle (3-64 chars, validated by registry)
    /// @param hubUrl URL of the agent's home SAGA hub
    /// @return tokenId The minted token ID
    function registerAgent(string calldata handle, string calldata hubUrl)
        external
        returns (uint256)
    {
        uint256 tokenId = _nextTokenId++;
        _mint(msg.sender, tokenId);

        _agentHandles[tokenId] = handle;
        _homeHubUrls[tokenId] = hubUrl;
        _registeredAt[tokenId] = block.timestamp;

        // Register handle in the global registry
        handleRegistry.registerHandle(handle, SAGAHandleRegistry.EntityType.AGENT, tokenId);

        emit AgentRegistered(tokenId, handle, msg.sender, hubUrl, block.timestamp);
        return tokenId;
    }

    /// @notice Update the home hub URL (owner only)
    function updateHomeHub(uint256 tokenId, string calldata newHubUrl) external {
        require(ownerOf(tokenId) == msg.sender, "SAGAAgentIdentity: not owner");
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

    // --- Metadata ---

    function setBaseURI(string calldata newBaseURI) external onlyOwner {
        _baseTokenURI = newBaseURI;
    }

    function _baseURI() internal view override returns (string memory) {
        return _baseTokenURI;
    }
}
