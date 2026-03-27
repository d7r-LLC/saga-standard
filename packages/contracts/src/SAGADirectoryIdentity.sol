// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {
    ERC721Enumerable
} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {SAGAHandleRegistry} from "./SAGAHandleRegistry.sol";

/// @title SAGADirectoryIdentity
/// @notice ERC-721 NFT collection for SAGA directory identities.
///         Each token represents a directory that can host agents and organizations.
/// @dev Minting registers the directoryId as a DIRECTORY handle in SAGAHandleRegistry.
///      The directoryId is immutable once minted.
contract SAGADirectoryIdentity is ERC721Enumerable, Ownable {
    uint256 private _nextTokenId;

    SAGAHandleRegistry public immutable handleRegistry;

    /// tokenId → directoryId string
    mapping(uint256 => string) private _directoryIds;
    /// tokenId → directory URL
    mapping(uint256 => string) private _directoryUrls;
    /// tokenId → operator wallet address
    mapping(uint256 => address) private _operatorWallets;
    /// tokenId → conformance level string
    mapping(uint256 => string) private _conformanceLevels;
    /// tokenId → status string (active, suspended, flagged, revoked)
    mapping(uint256 => string) private _statuses;
    /// tokenId → registration timestamp
    mapping(uint256 => uint256) private _registeredAt;

    string private _baseTokenURI;

    event DirectoryRegistered(
        uint256 indexed tokenId,
        string directoryId,
        address indexed operator,
        string url,
        string conformanceLevel,
        uint256 registeredAt
    );

    event DirectoryUrlUpdated(uint256 indexed tokenId, string oldUrl, string newUrl);
    event DirectoryStatusUpdated(uint256 indexed tokenId, string oldStatus, string newStatus);

    constructor(address registry)
        ERC721("SAGA Directory Identity", "SAGA-DIR")
        Ownable(msg.sender)
    {
        handleRegistry = SAGAHandleRegistry(registry);
        _baseTokenURI = "https://saga-standard.dev/api/metadata/directory/";
    }

    /// @notice Register a directory and mint an identity NFT
    /// @param _directoryId Unique directory identifier (3-64 chars, validated by registry)
    /// @param url URL of the directory's hub endpoint
    /// @param operator Operator wallet address for the directory
    /// @param conformanceLevel The SAGA conformance level (e.g. "full", "basic")
    /// @return tokenId The minted token ID
    function registerDirectory(
        string calldata _directoryId,
        string calldata url,
        address operator,
        string calldata conformanceLevel
    ) external returns (uint256) {
        require(bytes(url).length > 0, "SAGADirectoryIdentity: invalid url");
        require(operator != address(0), "SAGADirectoryIdentity: invalid operator");
        require(bytes(conformanceLevel).length > 0, "SAGADirectoryIdentity: invalid conformance");

        uint256 tokenId = _nextTokenId++;
        _safeMint(msg.sender, tokenId);

        _directoryIds[tokenId] = _directoryId;
        _directoryUrls[tokenId] = url;
        _operatorWallets[tokenId] = operator;
        _conformanceLevels[tokenId] = conformanceLevel;
        _statuses[tokenId] = "active";
        _registeredAt[tokenId] = block.timestamp;

        // Register directoryId as a DIRECTORY handle in the global namespace
        handleRegistry.registerHandle(
            _directoryId, SAGAHandleRegistry.EntityType.DIRECTORY, tokenId
        );

        emit DirectoryRegistered(
            tokenId, _directoryId, operator, url, conformanceLevel, block.timestamp
        );
        return tokenId;
    }

    /// @notice Update the directory URL (token owner only)
    function updateDirectoryUrl(uint256 tokenId, string calldata newUrl) external {
        require(ownerOf(tokenId) == msg.sender, "SAGADirectoryIdentity: not owner");
        require(bytes(newUrl).length > 0, "SAGADirectoryIdentity: invalid url");
        string memory oldUrl = _directoryUrls[tokenId];
        _directoryUrls[tokenId] = newUrl;
        emit DirectoryUrlUpdated(tokenId, oldUrl, newUrl);
    }

    /// @notice Update directory status (token owner or contract owner for governance)
    /// @param newStatus Must be one of: "active", "suspended", "flagged", "revoked"
    function updateDirectoryStatus(uint256 tokenId, string calldata newStatus) external {
        require(
            ownerOf(tokenId) == msg.sender || owner() == msg.sender,
            "SAGADirectoryIdentity: not owner or governance"
        );
        require(_isValidStatus(newStatus), "SAGADirectoryIdentity: invalid status");
        string memory oldStatus = _statuses[tokenId];
        _statuses[tokenId] = newStatus;
        emit DirectoryStatusUpdated(tokenId, oldStatus, newStatus);
    }

    // --- Internal ---

    function _isValidStatus(string memory status) internal pure returns (bool) {
        bytes32 h = keccak256(bytes(status));
        return h == keccak256("active") || h == keccak256("suspended")
            || h == keccak256("flagged") || h == keccak256("revoked");
    }

    // --- View functions ---

    function directoryId(uint256 tokenId) external view returns (string memory) {
        _requireOwned(tokenId);
        return _directoryIds[tokenId];
    }

    function directoryUrl(uint256 tokenId) external view returns (string memory) {
        _requireOwned(tokenId);
        return _directoryUrls[tokenId];
    }

    function operatorWallet(uint256 tokenId) external view returns (address) {
        _requireOwned(tokenId);
        return _operatorWallets[tokenId];
    }

    function conformanceLevel(uint256 tokenId) external view returns (string memory) {
        _requireOwned(tokenId);
        return _conformanceLevels[tokenId];
    }

    function directoryStatus(uint256 tokenId) external view returns (string memory) {
        _requireOwned(tokenId);
        return _statuses[tokenId];
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
