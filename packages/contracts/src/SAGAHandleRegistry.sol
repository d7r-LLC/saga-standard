// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title SAGAHandleRegistry
/// @notice On-chain DNS for the SAGA ecosystem. Maps handle strings to entity types and token IDs.
/// @dev Only contracts authorized by the owner (the identity NFT contracts) can register handles.
contract SAGAHandleRegistry is Ownable {
    enum EntityType {
        NONE,
        AGENT,
        ORG,
        DIRECTORY
    }

    struct HandleRecord {
        EntityType entityType;
        uint256 tokenId;
        address contractAddress;
        uint256 registeredAt;
    }

    /// @notice handle hash → record
    mapping(bytes32 => HandleRecord) internal _handles;

    /// @notice Contracts authorized to register handles
    mapping(address => bool) public authorizedContracts;

    event HandleRegistered(
        bytes32 indexed handleKey,
        string handle,
        EntityType entityType,
        uint256 tokenId,
        address contractAddress
    );

    event AuthorizedContractSet(address indexed contractAddress, bool authorized);

    constructor() Ownable(msg.sender) {}

    // --- Admin ---

    /// @notice Authorize or deauthorize a contract to register handles
    function setAuthorizedContract(address addr, bool authorized) external onlyOwner {
        authorizedContracts[addr] = authorized;
        emit AuthorizedContractSet(addr, authorized);
    }

    // --- Registration (callable only by authorized contracts) ---

    /// @notice Register a handle for an entity. Only authorized contracts can call this.
    /// @param handle The handle string (3-64 chars, alphanumeric with dots/hyphens/underscores)
    /// @param entityType The type of entity (AGENT or ORG)
    /// @param tokenId The token ID in the calling contract
    function registerHandle(string calldata handle, EntityType entityType, uint256 tokenId)
        external
    {
        require(authorizedContracts[msg.sender], "SAGAHandleRegistry: unauthorized");
        require(entityType != EntityType.NONE, "SAGAHandleRegistry: invalid entity type");

        // Validate handle length and characters before computing the key
        // to prevent unbounded _toLower loop on oversized input
        _validateHandle(handle);

        bytes32 key = _handleKey(handle);
        require(_handles[key].entityType == EntityType.NONE, "SAGAHandleRegistry: handle taken");

        _handles[key] = HandleRecord({
            entityType: entityType,
            tokenId: tokenId,
            contractAddress: msg.sender,
            registeredAt: block.timestamp
        });

        emit HandleRegistered(key, handle, entityType, tokenId, msg.sender);
    }

    // --- Resolution (public view) ---

    /// @notice Resolve a handle to its entity type, token ID, and contract address
    function resolveHandle(string calldata handle)
        external
        view
        returns (EntityType entityType, uint256 tokenId, address contractAddress)
    {
        bytes32 key = _handleKey(handle);
        HandleRecord memory record = _handles[key];
        require(record.entityType != EntityType.NONE, "SAGAHandleRegistry: not found");
        return (record.entityType, record.tokenId, record.contractAddress);
    }

    /// @notice Check if a handle is already registered
    function handleExists(string calldata handle) external view returns (bool) {
        return _handles[_handleKey(handle)].entityType != EntityType.NONE;
    }

    // --- Internal ---

    /// @dev Normalize handle to lowercase bytes32 hash for storage efficiency
    function _handleKey(string calldata handle) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(_toLower(handle)));
    }

    /// @dev Validate handle: 3-64 chars, alphanumeric + dots/hyphens/underscores,
    ///      must start and end with alphanumeric
    function _validateHandle(string calldata handle) internal pure {
        bytes memory b = bytes(handle);
        require(b.length >= 3 && b.length <= 64, "SAGAHandleRegistry: invalid length");

        // First char must be alphanumeric
        require(_isAlphanumeric(b[0]), "SAGAHandleRegistry: must start with alphanumeric");
        // Last char must be alphanumeric
        require(_isAlphanumeric(b[b.length - 1]), "SAGAHandleRegistry: must end with alphanumeric");

        for (uint256 i = 0; i < b.length; i++) {
            bytes1 c = b[i];
            require(
                _isAlphanumeric(c) || c == 0x2E || c == 0x2D || c == 0x5F,
                "SAGAHandleRegistry: invalid character"
            );
        }
    }

    function _isAlphanumeric(bytes1 c) internal pure returns (bool) {
        return (c >= 0x30 && c <= 0x39) // 0-9
            || (c >= 0x41 && c <= 0x5A) // A-Z
            || (c >= 0x61 && c <= 0x7A); // a-z
    }

    function _toLower(string calldata s) internal pure returns (string memory) {
        bytes memory b = bytes(s);
        bytes memory lower = new bytes(b.length);
        for (uint256 i = 0; i < b.length; i++) {
            if (b[i] >= 0x41 && b[i] <= 0x5A) {
                lower[i] = bytes1(uint8(b[i]) + 32);
            } else {
                lower[i] = b[i];
            }
        }
        return string(lower);
    }
}
