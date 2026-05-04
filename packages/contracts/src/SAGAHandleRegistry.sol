// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";

/// @notice Minimal interface used by SAGAHandleRegistry to validate that a
///         scoped registration's directoryId resolves to a directory that is
///         on-chain "active". Phase 8 (F-1).
interface IDirectoryStatus {
    function directoryStatus(uint256 tokenId) external view returns (string memory);
}

/// @title SAGAHandleRegistry
/// @notice On-chain DNS for the SAGA ecosystem. Maps handle strings to entity types and token IDs.
/// @dev Only contracts authorized by the owner (the identity NFT contracts) can register handles.
///      Phase 8 (F-3): uses Ownable2Step so the deployer-to-Safe handoff is two-step;
///      renounceOwnership is overridden to revert.
contract SAGAHandleRegistry is Ownable2Step {
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

    /// @notice scoped handle key (directoryId + handle hash) → record
    mapping(bytes32 => HandleRecord) internal _scopedHandles;

    /// @notice Contracts authorized to register handles
    mapping(address => bool) public authorizedContracts;

    /// @notice Phase 9 (G-11): trusted directory NFT contracts. Used by
    ///         scoped registration to verify the target directory was
    ///         minted by an audited directory implementation. Replaces
    ///         the singleton `directoryIdentity` from Phase 8A so a V2
    ///         SAGADirectoryIdentity can be added (or V1 deauthorized for
    ///         new registrations) without bricking existing V1 directories.
    mapping(address => bool) public trustedDirectoryContracts;

    event HandleRegistered(
        bytes32 indexed handleKey,
        string handle,
        EntityType entityType,
        uint256 tokenId,
        address contractAddress
    );

    event ScopedHandleRegistered(
        bytes32 indexed scopedKey,
        string handle,
        string directoryId,
        EntityType entityType,
        uint256 tokenId,
        address contractAddress
    );

    event AuthorizedContractSet(address indexed contractAddress, bool authorized);
    event TrustedDirectoryContractSet(address indexed addr, bool trusted);

    constructor() Ownable(msg.sender) {}

    /// @notice Renounce is disabled. Phase 8 (F-3) — losing the registry owner
    ///         permanently removes the ability to authorize future identity contracts
    ///         and to wire the directoryIdentity reference (F-1).
    function renounceOwnership() public view override onlyOwner {
        revert("SAGAHandleRegistry: renounce disabled");
    }

    // --- Admin ---

    /// @notice Authorize or deauthorize a contract to register handles
    function setAuthorizedContract(address addr, bool authorized) external onlyOwner {
        authorizedContracts[addr] = authorized;
        emit AuthorizedContractSet(addr, authorized);
    }

    /// @notice Add or remove a trusted directory NFT contract used by
    ///         registerScopedHandle to verify directory existence + active
    ///         status. Phase 9 (G-11) — replaces the singleton
    ///         setDirectoryIdentity setter from Phase 8A.
    /// @dev Removing trust does NOT invalidate already-registered scoped
    ///      handles; it only blocks NEW scoped registrations from
    ///      resolving directory handles minted by the deauthorized
    ///      contract. The deployer/governance is expected to verify that
    ///      `addr` exposes `directoryStatus(uint256) returns (string)`
    ///      before marking it trusted; on-chain ABI probes are
    ///      unreliable across Solidity versions and a misconfigured
    ///      contract is caught at the next registerScopedHandle call.
    function setTrustedDirectoryContract(address addr, bool trusted) external onlyOwner {
        require(addr.code.length > 0, "SAGAHandleRegistry: trusted directory must be contract");
        trustedDirectoryContracts[addr] = trusted;
        emit TrustedDirectoryContractSet(addr, trusted);
    }

    // --- Registration (callable only by authorized contracts) ---

    /// @notice Register a handle for an entity. Only authorized contracts can call this.
    /// @param handle The handle string (3-64 chars, alphanumeric with dots/hyphens/underscores)
    /// @param entityType The type of entity (AGENT, ORG, or DIRECTORY)
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

    /// @notice Register a handle scoped to a specific directory. Only authorized contracts can call this.
    function registerScopedHandle(
        string calldata handle,
        EntityType entityType,
        uint256 tokenId,
        string calldata directoryId
    ) external {
        require(authorizedContracts[msg.sender], "SAGAHandleRegistry: unauthorized");
        require(entityType != EntityType.NONE, "SAGAHandleRegistry: invalid entity type");
        require(bytes(directoryId).length > 0, "SAGAHandleRegistry: empty directoryId");
        _validateHandle(handle);

        // Phase 9 (G-11): scoped registrations must target a directory
        // minted by ANY trusted directory contract. The
        // `dirRecord.contractAddress` is the contract that registered the
        // directory handle in the global namespace — it must currently be
        // marked trusted. The active-status check then runs against THAT
        // contract (so V1 and V2 each verify their own status), preserving
        // the F-1 anti-spoofing guarantee while permitting upgrade paths.
        bytes32 globalKey = _handleKey(directoryId);
        HandleRecord memory dirRecord = _handles[globalKey];
        require(
            dirRecord.entityType == EntityType.DIRECTORY,
            "SAGAHandleRegistry: directory not found"
        );
        require(
            trustedDirectoryContracts[dirRecord.contractAddress],
            "SAGAHandleRegistry: untrusted directory contract"
        );
        require(
            keccak256(
                bytes(IDirectoryStatus(dirRecord.contractAddress).directoryStatus(dirRecord.tokenId))
            ) == keccak256("active"),
            "SAGAHandleRegistry: directory not active"
        );

        bytes32 key = _scopedHandleKey(handle, directoryId);
        require(
            _scopedHandles[key].entityType == EntityType.NONE,
            "SAGAHandleRegistry: handle taken in directory"
        );

        _scopedHandles[key] = HandleRecord({
            entityType: entityType,
            tokenId: tokenId,
            contractAddress: msg.sender,
            registeredAt: block.timestamp
        });

        emit ScopedHandleRegistered(key, handle, directoryId, entityType, tokenId, msg.sender);
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

    /// @notice Resolve a handle within a specific directory
    function resolveScopedHandle(string calldata handle, string calldata directoryId)
        external
        view
        returns (EntityType entityType, uint256 tokenId, address contractAddress)
    {
        bytes32 key = _scopedHandleKey(handle, directoryId);
        HandleRecord memory record = _scopedHandles[key];
        require(record.entityType != EntityType.NONE, "SAGAHandleRegistry: not found in directory");
        return (record.entityType, record.tokenId, record.contractAddress);
    }

    /// @notice Check if a handle exists within a specific directory
    function scopedHandleExists(string calldata handle, string calldata directoryId)
        external
        view
        returns (bool)
    {
        return _scopedHandles[_scopedHandleKey(handle, directoryId)].entityType != EntityType.NONE;
    }

    // --- Internal ---

    /// @dev Normalize handle to lowercase bytes32 hash for storage efficiency
    function _handleKey(string calldata handle) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(_toLower(handle)));
    }

    /// @dev Compute scoped handle key. Both handle AND directoryId are
    ///      lowercased so the scoped namespace inherits the same
    ///      case-insensitivity guarantee as the global namespace
    ///      (`_handleKey`). Phase 9 (G-4): closed the casing bypass that
    ///      let attackers register duplicate scoped handles by varying
    ///      directoryId case.
    function _scopedHandleKey(string calldata handle, string calldata directoryId)
        internal
        pure
        returns (bytes32)
    {
        return keccak256(abi.encode(_toLower(directoryId), _toLower(handle)));
    }

    /// @dev Validate handle: 3-64 chars, alphanumeric + dots/hyphens/underscores,
    ///      must start and end with alphanumeric, no consecutive separators.
    ///      Phase 9 (G-2): consecutive-separator rejection closes the
    ///      ENS-style homoglyph attack class — a malicious actor cannot
    ///      register `m.arcus`, `m..arcus`, `m-arcus`, `m_arcus` etc as
    ///      visually-similar variants of `marcus`. Single separators
    ///      between alphanumeric characters remain valid.
    function _validateHandle(string calldata handle) internal pure {
        bytes memory b = bytes(handle);
        require(b.length >= 3 && b.length <= 64, "SAGAHandleRegistry: invalid length");

        require(_isAlphanumeric(b[0]), "SAGAHandleRegistry: must start with alphanumeric");
        require(_isAlphanumeric(b[b.length - 1]), "SAGAHandleRegistry: must end with alphanumeric");

        bool prevWasSeparator = false;
        for (uint256 i = 0; i < b.length; i++) {
            bytes1 c = b[i];
            bool isSeparator = (c == 0x2E || c == 0x2D || c == 0x5F);
            require(
                _isAlphanumeric(c) || isSeparator,
                "SAGAHandleRegistry: invalid character"
            );
            if (isSeparator && prevWasSeparator) {
                revert("SAGAHandleRegistry: consecutive separator");
            }
            prevWasSeparator = isSeparator;
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
