// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {
    ERC721Enumerable
} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {SAGAHandleRegistry} from "./SAGAHandleRegistry.sol";

/// @title SAGAOrgIdentity
/// @notice ERC-721 NFT collection for SAGA organization identities
/// @dev Shares the handle namespace with agents via SAGAHandleRegistry
contract SAGAOrgIdentity is ERC721Enumerable, Ownable {
    uint256 private _nextTokenId;

    SAGAHandleRegistry public immutable handleRegistry;

    mapping(uint256 => string) private _orgHandles;
    mapping(uint256 => string) private _orgNames;
    mapping(uint256 => uint256) private _registeredAt;

    string private _baseTokenURI;

    event OrgRegistered(
        uint256 indexed tokenId,
        string handle,
        string name,
        address indexed owner,
        uint256 registeredAt
    );

    event OrgNameUpdated(uint256 indexed tokenId, string oldName, string newName);

    constructor(address registry) ERC721("SAGA Org Identity", "SAGA-ORG") Ownable(msg.sender) {
        handleRegistry = SAGAHandleRegistry(registry);
        _baseTokenURI = "https://saga-standard.dev/api/metadata/org/";
    }

    /// @notice Register an organization and mint an identity NFT
    /// @param handle Unique handle (3-64 chars, validated by registry)
    /// @param name Display name of the organization (1-128 chars)
    /// @return tokenId The minted token ID
    function registerOrganization(string calldata handle, string calldata name)
        external
        returns (uint256)
    {
        require(
            bytes(name).length > 0 && bytes(name).length <= 128, "SAGAOrgIdentity: invalid name"
        );

        uint256 tokenId = _nextTokenId++;
        _mint(msg.sender, tokenId);

        _orgHandles[tokenId] = handle;
        _orgNames[tokenId] = name;
        _registeredAt[tokenId] = block.timestamp;

        handleRegistry.registerHandle(handle, SAGAHandleRegistry.EntityType.ORG, tokenId);

        emit OrgRegistered(tokenId, handle, name, msg.sender, block.timestamp);
        return tokenId;
    }

    /// @notice Update the organization display name (owner only)
    function updateOrgName(uint256 tokenId, string calldata name) external {
        require(ownerOf(tokenId) == msg.sender, "SAGAOrgIdentity: not owner");
        require(
            bytes(name).length > 0 && bytes(name).length <= 128, "SAGAOrgIdentity: invalid name"
        );
        string memory oldName = _orgNames[tokenId];
        _orgNames[tokenId] = name;
        emit OrgNameUpdated(tokenId, oldName, name);
    }

    // --- View functions ---

    function orgHandle(uint256 tokenId) external view returns (string memory) {
        require(_ownerOf(tokenId) != address(0), "SAGAOrgIdentity: nonexistent token");
        return _orgHandles[tokenId];
    }

    function orgName(uint256 tokenId) external view returns (string memory) {
        require(_ownerOf(tokenId) != address(0), "SAGAOrgIdentity: nonexistent token");
        return _orgNames[tokenId];
    }

    function registeredAt(uint256 tokenId) external view returns (uint256) {
        require(_ownerOf(tokenId) != address(0), "SAGAOrgIdentity: nonexistent token");
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
