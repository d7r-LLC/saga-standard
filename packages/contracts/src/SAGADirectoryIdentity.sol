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

/// @title SAGADirectoryIdentity
/// @notice ERC-721 NFT collection for SAGA directory identities.
///         Each token represents a directory that can host agents and organizations.
/// @dev Minting registers the directoryId as a DIRECTORY handle in SAGAHandleRegistry.
///      The directoryId is immutable once minted.
///      Phase 8: Ownable2Step (F-3), ReentrancyGuard + CEI _safeMint-last (F-2),
///      constructor address validation (F-8), self-TBA transfer guard (F-4),
///      setBaseURI validation + event (F-6), block transfer/URL on flagged/
///      revoked directories (F-10).
contract SAGADirectoryIdentity is ERC721Enumerable, Ownable2Step, ReentrancyGuard {
    uint256 private _nextTokenId;

    SAGAHandleRegistry public immutable handleRegistry;
    address public immutable tbaHelper;

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
    event BaseURIUpdated(string oldBaseURI, string newBaseURI);

    constructor(address registry, address _tbaHelper)
        ERC721("SAGA Directory Identity", "SAGA-DIR")
        Ownable(msg.sender)
    {
        // Phase 8 (F-8).
        require(registry.code.length > 0, "SAGADirectoryIdentity: registry not contract");
        // Phase 8 (F-4).
        require(_tbaHelper.code.length > 0, "SAGADirectoryIdentity: tba helper not contract");
        handleRegistry = SAGAHandleRegistry(registry);
        tbaHelper = _tbaHelper;
        _baseTokenURI = "https://saga-standard.dev/api/metadata/directory/";
    }

    /// @notice Renounce is disabled. Phase 8 (F-3).
    function renounceOwnership() public view override onlyOwner {
        revert("SAGADirectoryIdentity: renounce disabled");
    }

    /// @notice Register a directory and mint an identity NFT.
    /// @param _directoryId Unique directory identifier (3-64 chars, validated by registry)
    /// @param url URL of the directory's hub endpoint
    /// @param operator Operator wallet address for the directory
    /// @param conformanceLevel A SELF-CLAIMED SAGA conformance level (e.g. "full",
    ///        "basic"). Phase 8 (F-9): this string is self-attested at mint time
    ///        with NO on-chain governance gate or whitelist. Off-chain consumers
    ///        MUST treat this value as an unverified label and verify true
    ///        conformance through an out-of-band SAGA conformance audit before
    ///        relying on it for trust decisions. Capped at 32 bytes to bound
    ///        per-mint storage cost.
    /// @return tokenId The minted token ID
    function registerDirectory(
        string calldata _directoryId,
        string calldata url,
        address operator,
        string calldata conformanceLevel
    ) external nonReentrant returns (uint256) {
        SAGAValidation.validateUrl(url);
        require(operator != address(0), "SAGADirectoryIdentity: invalid operator");
        // Phase 8 (F-9): cap claimed conformance level at 32 bytes. Without the
        // cap an attacker can inflate per-mint storage cost. The string is
        // self-attested; off-chain consumers must verify out-of-band. Cache
        // the length once — `bytes(stringCalldata).length` allocates each
        // time it's evaluated.
        uint256 levelLen = bytes(conformanceLevel).length;
        require(
            levelLen > 0 && levelLen <= 32, "SAGADirectoryIdentity: invalid conformance"
        );

        uint256 tokenId = _nextTokenId++;

        // Phase 8 (F-2): Effects FIRST.
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

        // Interactions LAST.
        _safeMint(msg.sender, tokenId);

        emit DirectoryRegistered(
            tokenId, _directoryId, operator, url, conformanceLevel, block.timestamp
        );
        return tokenId;
    }

    /// @notice Update the directory URL (token owner only)
    /// @dev nonReentrant — Phase 8 (Copilot review on PR #45). Same rationale
    ///      as updateHomeHub on the agent contract: prevent re-entry via the
    ///      _safeMint callback in registerDirectory from mutating URL before
    ///      DirectoryRegistered is emitted.
    ///
    ///      Phase 8 (F-10): rejected when the directory is flagged or revoked
    ///      (status rank >= 2). Without this gate, the original token owner
    ///      could redirect a revoked directory's URL to a phishing site even
    ///      after governance has revoked the directory.
    function updateDirectoryUrl(uint256 tokenId, string calldata newUrl) external nonReentrant {
        require(ownerOf(tokenId) == msg.sender, "SAGADirectoryIdentity: not owner");
        require(
            _statusRank(_statuses[tokenId]) < 2,
            "SAGADirectoryIdentity: cannot update url when flagged or revoked"
        );
        SAGAValidation.validateUrl(newUrl);
        string memory oldUrl = _directoryUrls[tokenId];
        _directoryUrls[tokenId] = newUrl;
        emit DirectoryUrlUpdated(tokenId, oldUrl, newUrl);
    }

    /// @notice Update directory status. Authority depends on the role:
    ///         - Contract owner (governance, typically a Safe multisig):
    ///             may set ANY valid status — full authority over the namespace.
    ///         - NFT owner (`ownerOf(tokenId)`):
    ///             may only DOWNGRADE — i.e. set a status with rank
    ///             greater-than-or-equal-to the current status. They cannot
    ///             upgrade from "flagged" or "revoked" back to "active" or
    ///             "suspended".
    ///
    ///         The NFT owner is the on-chain holder of this directory token.
    ///         It is distinct from the off-chain `_operatorWallets[tokenId]`
    ///         metadata field, which is informational and NOT used for any
    ///         authorization decision. Authorization is exclusively keyed on
    ///         `ownerOf(tokenId)` and `owner()` (the contract Ownable owner).
    /// @dev Status rank: active=0, suspended=1, flagged=2, revoked=3. The
    ///      NFT-owner-side enforcement closes the self-rehabilitation hole
    ///      flagged in the 2026-05-03 audit (A-Crit#4): a directory NFT
    ///      holder caught misbehaving cannot flip themselves back to
    ///      "active" once governance has flagged or revoked them.
    /// @param newStatus Must be one of: "active", "suspended", "flagged", "revoked".
    /// @dev nonReentrant — Phase 8 (Copilot review on PR #45). Same rationale
    ///      as updateDirectoryUrl.
    function updateDirectoryStatus(uint256 tokenId, string calldata newStatus)
        external
        nonReentrant
    {
        bool isContractOwner = msg.sender == owner();
        bool isNftOwner = ownerOf(tokenId) == msg.sender;
        require(
            isContractOwner || isNftOwner,
            "SAGADirectoryIdentity: not nft owner or governance"
        );
        require(_isValidStatus(newStatus), "SAGADirectoryIdentity: invalid status");

        string memory oldStatus = _statuses[tokenId];

        // NFT owner can only downgrade or no-op.
        // Contract owner (governance) bypasses this check and can set any status.
        if (!isContractOwner) {
            require(
                _statusRank(newStatus) >= _statusRank(oldStatus),
                "SAGADirectoryIdentity: nft owner can only downgrade status"
            );
        }

        _statuses[tokenId] = newStatus;
        emit DirectoryStatusUpdated(tokenId, oldStatus, newStatus);
    }

    // --- Internal ---

    function _isValidStatus(string memory status) internal pure returns (bool) {
        bytes32 h = keccak256(bytes(status));
        return h == keccak256("active") || h == keccak256("suspended")
            || h == keccak256("flagged") || h == keccak256("revoked");
    }

    /// @dev Status rank used to enforce the downgrade-only rule for token owners.
    ///      active=0 (best) → suspended=1 → flagged=2 → revoked=3 (worst).
    ///      Reverts on any unknown status, but callers should always run
    ///      _isValidStatus first.
    function _statusRank(string memory status) internal pure returns (uint8) {
        bytes32 h = keccak256(bytes(status));
        if (h == keccak256("active")) return 0;
        if (h == keccak256("suspended")) return 1;
        if (h == keccak256("flagged")) return 2;
        if (h == keccak256("revoked")) return 3;
        revert("SAGADirectoryIdentity: unknown status rank");
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

    // Phase 8 (F-9): the string returned here is SELF-ATTESTED at mint time
    //                and NOT governance-verified. Consumers MUST treat it as
    //                an unverified label. Function name preserved for ABI
    //                compatibility; see registerDirectory's docstring.
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

    /// @dev Phase 8 (F-6): validate URL + emit BaseURIUpdated.
    function setBaseURI(string calldata newBaseURI) external onlyOwner {
        SAGAValidation.validateUrl(newBaseURI);
        emit BaseURIUpdated(_baseTokenURI, newBaseURI);
        _baseTokenURI = newBaseURI;
    }

    function _baseURI() internal view override returns (string memory) {
        return _baseTokenURI;
    }

    // --- ERC-721 transfer hooks ---

    /// @dev Phase 8 transfer guard:
    ///      (F-4) block transfers into the token's own ERC-6551 TBA
    ///      (F-10) block transfers when status is flagged or revoked
    ///             (rank >= 2). Mints (`from == 0`) and burns
    ///             (`to == 0`) are unaffected.
    function _update(address to, uint256 tokenId, address auth)
        internal
        override
        returns (address)
    {
        address from = _ownerOf(tokenId);
        if (from != address(0) && to != address(0)) {
            // F-4: self-TBA loop guard
            address selfTba = ITBAHelperLite(tbaHelper).computeAccount(address(this), tokenId);
            require(to != selfTba, "SAGADirectoryIdentity: cannot transfer to own TBA");
            // F-10: revoked / flagged directories are non-transferable
            require(
                _statusRank(_statuses[tokenId]) < 2,
                "SAGADirectoryIdentity: cannot transfer flagged or revoked"
            );
        }
        return super._update(to, tokenId, auth);
    }
}
