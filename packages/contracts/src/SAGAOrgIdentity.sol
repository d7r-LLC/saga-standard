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

interface ITBAHelperLite {
    function computeAccount(address tokenContract, uint256 tokenId) external view returns (address);
}

/// @title SAGAOrgIdentity
/// @notice ERC-721 NFT collection for SAGA organization identities
/// @dev Shares the handle namespace with agents via SAGAHandleRegistry.
///      Phase 8: Ownable2Step (F-3), ReentrancyGuard + CEI _safeMint-last (F-2),
///      constructor address validation (F-8), self-TBA transfer guard (F-4),
///      setBaseURI validation + event (F-6).
contract SAGAOrgIdentity is ERC721Enumerable, Ownable2Step, ReentrancyGuard {
    uint256 private _nextTokenId;

    SAGAHandleRegistry public immutable handleRegistry;
    address public immutable tbaHelper;

    mapping(uint256 => string) private _orgHandles;
    mapping(uint256 => string) private _orgNames;
    mapping(uint256 => uint256) private _registeredAt;
    /// tokenId → directoryId (empty string for global orgs)
    mapping(uint256 => string) private _directoryIds;

    string private _baseTokenURI;

    event OrgRegistered(
        uint256 indexed tokenId,
        string handle,
        string name,
        address indexed owner,
        uint256 registeredAt
    );

    event OrgNameUpdated(uint256 indexed tokenId, string oldName, string newName);
    event BaseURIUpdated(string oldBaseURI, string newBaseURI);
    /// @notice Phase 9 (G-8): emitted when a new base URI is queued.
    event BaseURIQueued(string newBaseURI, uint256 readyAt);

    /// @notice Phase 9 (G-8): pending base URI awaiting timelock expiry.
    string private _pendingBaseURI;
    uint256 private _pendingBaseURIReadyAt;

    /// @notice Hours until a queued base URI can be applied.
    uint256 public constant BASE_URI_TIMELOCK = 24 hours;

    constructor(address registry, address _tbaHelper)
        ERC721("SAGA Org Identity", "SAGA-ORG")
        Ownable(msg.sender)
    {
        // Phase 8 (F-8).
        require(registry.code.length > 0, "SAGAOrgIdentity: registry not contract");
        // Phase 8 (F-4).
        require(_tbaHelper.code.length > 0, "SAGAOrgIdentity: tba helper not contract");
        handleRegistry = SAGAHandleRegistry(registry);
        tbaHelper = _tbaHelper;
        _baseTokenURI = "https://saga-standard.dev/api/metadata/org/";
    }

    /// @notice Renounce is disabled. Phase 8 (F-3) + Phase 10 (H-6).
    function renounceOwnership() public override {
        // Phase 10 (H-6): drop `view` and `onlyOwner` so the disabled
        // message wins for every caller. See SAGAHandleRegistry for the
        // full rationale.
        revert("SAGAOrgIdentity: renounce disabled");
    }

    /// @notice Register an organization and mint an identity NFT
    /// @param handle Unique handle (3-64 chars, validated by registry)
    /// @param name Display name of the organization (1-128 chars)
    /// @return tokenId The minted token ID
    function registerOrganization(string calldata handle, string calldata name)
        external
        nonReentrant
        returns (uint256)
    {
        require(
            bytes(name).length > 0 && bytes(name).length <= 128, "SAGAOrgIdentity: invalid name"
        );

        uint256 tokenId = _nextTokenId++;

        // Phase 8 (F-2): Effects FIRST.
        _orgHandles[tokenId] = handle;
        _orgNames[tokenId] = name;
        _registeredAt[tokenId] = block.timestamp;

        handleRegistry.registerHandle(handle, SAGAHandleRegistry.EntityType.ORG, tokenId);

        // Interactions LAST.
        _safeMint(msg.sender, tokenId);

        emit OrgRegistered(tokenId, handle, name, msg.sender, block.timestamp);
        return tokenId;
    }

    /// @notice Register an organization within a specific directory and mint an identity NFT
    /// @param handle Unique handle within the directory (3-64 chars, validated by registry)
    /// @param name Display name of the organization (1-128 chars)
    /// @param directoryId The directory to register in
    /// @return tokenId The minted token ID
    function registerOrgInDirectory(
        string calldata handle,
        string calldata name,
        string calldata directoryId
    ) external nonReentrant returns (uint256) {
        require(
            bytes(name).length > 0 && bytes(name).length <= 128, "SAGAOrgIdentity: invalid name"
        );

        uint256 tokenId = _nextTokenId++;

        // Phase 8 (F-2): Effects FIRST.
        _orgHandles[tokenId] = handle;
        _orgNames[tokenId] = name;
        _registeredAt[tokenId] = block.timestamp;
        _directoryIds[tokenId] = directoryId;

        handleRegistry.registerScopedHandle(
            handle, SAGAHandleRegistry.EntityType.ORG, tokenId, directoryId
        );

        // Interactions LAST.
        _safeMint(msg.sender, tokenId);

        emit OrgRegistered(tokenId, handle, name, msg.sender, block.timestamp);
        return tokenId;
    }

    /// @notice Update the organization display name (owner only)
    /// @dev nonReentrant — Phase 8 (Copilot review on PR #45). Prevents an
    ///      ERC721Receiver callback during register* from mutating org name
    ///      before OrgRegistered is emitted.
    function updateOrgName(uint256 tokenId, string calldata name) external nonReentrant {
        // Phase 10 (M-3): use _isAuthorized so smart-wallet operators
        // approved via setApprovalForAll can rotate org names. See
        // SAGAAgentIdentity.updateHomeHub for full rationale.
        // _requireOwned reverts with ERC721NonexistentToken for unminted
        // tokens (Copilot review on PR #54).
        address tokenOwner = _requireOwned(tokenId);
        require(
            _isAuthorized(tokenOwner, msg.sender, tokenId),
            "SAGAOrgIdentity: not authorized"
        );
        require(
            bytes(name).length > 0 && bytes(name).length <= 128, "SAGAOrgIdentity: invalid name"
        );
        string memory oldName = _orgNames[tokenId];
        _orgNames[tokenId] = name;
        emit OrgNameUpdated(tokenId, oldName, name);
    }

    // --- View functions ---

    function orgHandle(uint256 tokenId) external view returns (string memory) {
        _requireOwned(tokenId);
        return _orgHandles[tokenId];
    }

    function orgName(uint256 tokenId) external view returns (string memory) {
        _requireOwned(tokenId);
        return _orgNames[tokenId];
    }

    function registeredAt(uint256 tokenId) external view returns (uint256) {
        _requireOwned(tokenId);
        return _registeredAt[tokenId];
    }

    function orgDirectoryId(uint256 tokenId) external view returns (string memory) {
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
    /// @dev Phase 9 (G-8): see SAGAAgentIdentity.setBaseURI for rationale.
    function setBaseURI(string calldata newBaseURI) external onlyOwner {
        SAGAValidation.validateUrl(newBaseURI);
        _pendingBaseURI = newBaseURI;
        _pendingBaseURIReadyAt = block.timestamp + BASE_URI_TIMELOCK;
        emit BaseURIQueued(newBaseURI, _pendingBaseURIReadyAt);
    }

    /// @notice Apply a previously-queued base URI after the 24h timelock.
    function applyBaseURI() external {
        require(_pendingBaseURIReadyAt > 0, "SAGAOrgIdentity: no pending base uri");
        require(
            block.timestamp >= _pendingBaseURIReadyAt,
            "SAGAOrgIdentity: base uri not yet ready"
        );
        // Phase 10 (M-2): re-validate at apply time as defense-in-depth.
        // See SAGAAgentIdentity for rationale.
        SAGAValidation.validateUrl(_pendingBaseURI);
        emit BaseURIUpdated(_baseTokenURI, _pendingBaseURI);
        _baseTokenURI = _pendingBaseURI;
        delete _pendingBaseURI;
        delete _pendingBaseURIReadyAt;
    }

    function _baseURI() internal view override returns (string memory) {
        return _baseTokenURI;
    }

    // --- ERC-721 transfer hooks ---

    /// @dev Phase 8 (F-4): block transfers into the token's own ERC-6551 TBA.
    function _update(address to, uint256 tokenId, address auth)
        internal
        override
        returns (address)
    {
        if (to != address(0)) {
            address selfTba = ITBAHelperLite(tbaHelper).computeAccount(address(this), tokenId);
            require(to != selfTba, "SAGAOrgIdentity: cannot transfer to own TBA");
        }
        return super._update(to, tokenId, auth);
    }
}
