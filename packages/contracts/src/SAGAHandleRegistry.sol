// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

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
contract SAGAHandleRegistry is Ownable2Step, ReentrancyGuard {
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
    /// @notice Phase 10 (M-1) + Phase 11 (J-3): emitted when an
    ///         authorize-true is queued for post-bootstrap timelock.
    ///         Auth = true requires a 24h delay once `bootstrapFinalized`
    ///         is set (typically inside Deploy.s.sol's final step);
    ///         deauthorization is always immediate (safety action).
    event AuthorizedContractQueued(address indexed addr, uint256 readyAt);
    event TrustedDirectoryContractQueued(address indexed addr, uint256 readyAt);
    /// @notice Phase 11 (J-1): emitted when a queued authorize-true /
    ///         trust-true is canceled before apply. The Safe's prior
    ///         recourse to back out of a mistake was to overwrite the
    ///         slot with a different address (which started its own
    ///         24h timer); these events accompany an explicit cancel.
    event AuthorizedContractCancelled(address indexed addr);
    event TrustedDirectoryContractCancelled(address indexed addr);
    /// @notice Phase 11 (J-3): emitted when the bootstrap window closes.
    event BootstrapFinalized();

    /// @notice Phase 11 (J-3): bootstrap-finalization flag. While `false`,
    ///         the current owner can authorize identity contracts
    ///         immediately via setAuthorizedContract so Deploy.s.sol can
    ///         wire the system in a single transaction. Deploy.s.sol
    ///         calls `finalizeBootstrap` at the end of the run; from
    ///         that point on, EVERY new authorize-true requires the
    ///         24h queue+apply path, regardless of who the current
    ///         owner is. Replaces the Phase 10 `_initialOwner == owner()`
    ///         check, which left a window between Deploy.s.sol and the
    ///         Safe's `acceptOwnership` during which a compromised
    ///         deployer EOA could authorize without the timelock.
    bool public bootstrapFinalized;

    /// @notice Phase 10 (M-1): single-slot pending queues for the timelock.
    address private _pendingAuthorizedContract;
    uint256 private _pendingAuthorizedContractReadyAt;
    address private _pendingTrustedDirectoryContract;
    uint256 private _pendingTrustedDirectoryContractReadyAt;

    /// @notice Phase 12 (K-2): codehash snapshot at queue time. Compared
    ///         at apply time so a bytecode swap during the 24h timelock
    ///         (CREATE2 metamorphism after a SELFDESTRUCT-then-CREATE2
    ///         sequence in some pre-Cancun chain history, or a proxy
    ///         implementation flip behind a constant-codehash facade)
    ///         invalidates the apply. The Phase 10 Copilot-review
    ///         code.length re-check confirmed liveness but not integrity.
    bytes32 private _pendingAuthorizedContractCodehash;
    bytes32 private _pendingTrustedDirectoryContractCodehash;

    /// @notice Hours until a queued authorization can be applied.
    uint256 public constant AUTH_TIMELOCK = 24 hours;

    constructor() Ownable(msg.sender) {}

    /// @notice Phase 11 (J-3): finalize the bootstrap window. Once called,
    ///         every new authorize-true goes through the 24h queue+apply
    ///         path. Idempotent: reverts on second call to make
    ///         deploy-script ordering errors loud.
    function finalizeBootstrap() external onlyOwner {
        require(!bootstrapFinalized, "SAGAHandleRegistry: already finalized");
        bootstrapFinalized = true;
        emit BootstrapFinalized();
    }

    /// @notice Renounce is disabled. Phase 8 (F-3) — losing the registry owner
    ///         permanently removes the ability to authorize future identity contracts
    ///         and to wire the directoryIdentity reference (F-1).
    function renounceOwnership() public override {
        // Phase 10 (H-6): drop `view` and `onlyOwner` so the disabled
        // message wins for everyone. Previously, non-owners hit OZ's
        // `OwnableUnauthorizedAccount` error first, masking the actual
        // intent. The override permanently disables renounce regardless
        // of caller — that is the property worth pinning.
        revert("SAGAHandleRegistry: renounce disabled");
    }

    // --- Admin ---

    /// @notice Read the queued (not-yet-applied) authorize-true target.
    function pendingAuthorizedContract() external view returns (address) {
        return _pendingAuthorizedContract;
    }

    function pendingAuthorizedContractReadyAt() external view returns (uint256) {
        return _pendingAuthorizedContractReadyAt;
    }

    function pendingTrustedDirectoryContract() external view returns (address) {
        return _pendingTrustedDirectoryContract;
    }

    function pendingTrustedDirectoryContractReadyAt() external view returns (uint256) {
        return _pendingTrustedDirectoryContractReadyAt;
    }

    /// @notice Authorize or deauthorize a contract to register handles.
    /// @dev Phase 10 (M-1 + M-4):
    ///      - `authorized=true` from the initial deployer is immediate
    ///        (bootstrap path: Deploy.s.sol must wire identity contracts
    ///        in a single transaction; a 24h delay would brick the deploy).
    ///      - `authorized=true` from a post-handoff Safe owner reverts;
    ///        the Safe must use queueAuthorizedContract + applyAuthorizedContract
    ///        with a 24h timelock so a Safe-compromise cannot squat
    ///        every valuable handle in one block.
    ///      - `authorized=false` is always immediate. Deauthorization is
    ///        the safety action — slowing it down would let an attacker
    ///        keep operating against a known-compromised contract for
    ///        a full day.
    ///      - Phase 10 (M-4) requires `addr` to be a contract when
    ///        authorizing (true). Authorizing an EOA would let it directly
    ///        call registerHandle with arbitrary tokenIds.
    function setAuthorizedContract(address addr, bool authorized) external onlyOwner {
        if (authorized) {
            require(addr.code.length > 0, "SAGAHandleRegistry: authorized must be contract");
            // Phase 11 (J-3): the bootstrap-finalization flag replaces
            // the Phase 10 `owner() == _initialOwner` check so the
            // immediate-authorize window closes at a deterministic
            // point inside Deploy.s.sol, not at Safe acceptOwnership.
            require(
                !bootstrapFinalized,
                "SAGAHandleRegistry: post-bootstrap: use queueAuthorizedContract"
            );
            authorizedContracts[addr] = true;
            emit AuthorizedContractSet(addr, true);
        } else {
            // Deauthorization: always immediate, regardless of bootstrap state.
            authorizedContracts[addr] = false;
            emit AuthorizedContractSet(addr, false);
        }
    }

    /// @notice Phase 10 (M-1): queue an authorize-true for application
    ///         after the 24h timelock. Used by the Safe post-handoff to
    ///         add new identity contracts. The queue is single-slot;
    ///         re-queueing overwrites and resets the timer.
    function queueAuthorizedContract(address addr) external onlyOwner {
        require(addr.code.length > 0, "SAGAHandleRegistry: authorized must be contract");
        _pendingAuthorizedContract = addr;
        _pendingAuthorizedContractReadyAt = block.timestamp + AUTH_TIMELOCK;
        // Phase 12 (K-2): pin the codehash so a bytecode swap during
        // the 24h window (CREATE2 metamorphism, proxy upgrade behind
        // a constant-codehash facade) invalidates the apply.
        _pendingAuthorizedContractCodehash = addr.codehash;
        emit AuthorizedContractQueued(addr, _pendingAuthorizedContractReadyAt);
    }

    /// @notice Apply a previously-queued authorization after the timelock.
    /// @dev Phase 12 (K-1): onlyOwner. The Phase 11 J-1 cancel path
    ///      created a race window: at the exact block the M-1 24h
    ///      timelock ripened, a watching attacker could front-run a
    ///      Safe cancel-tx with their own permissionless apply-tx,
    ///      defeating governance review. The Safe queues AND applies;
    ///      the queue is the slow gate, not the apply.
    ///      Phase 10 (Copilot review on PR #54): re-check code.length at
    ///      apply time. The queued target could have selfdestructed
    ///      during the 24h window; without this check, a code-less EOA
    ///      address could end up authorized, undermining the
    ///      "authorized must be contract" invariant from M-4.
    function applyAuthorizedContract(address addr) external onlyOwner {
        require(_pendingAuthorizedContractReadyAt > 0, "SAGAHandleRegistry: no pending authorize");
        require(_pendingAuthorizedContract == addr, "SAGAHandleRegistry: pending mismatch");
        require(
            block.timestamp >= _pendingAuthorizedContractReadyAt,
            "SAGAHandleRegistry: authorize not yet ready"
        );
        // Phase 12 (K-2): codehash integrity. Replaces the Phase 10
        // code.length re-check (which only confirmed liveness, not
        // sameness). extcodehash returns 0 for EOAs and keccak256("")
        // for empty bytecode, so a SELFDESTRUCT-then-empty target also
        // fails this comparison.
        // Residual (Copilot review on PR #58): a Transparent / UUPS /
        // ERC-1967 proxy can swap its implementation behind a constant
        // proxy-shell codehash without changing addr.codehash. This
        // check pins the proxy shell, not the live implementation.
        // Safe diligence MUST refuse to queue any proxy address — see
        // the README "Authorized contracts: residual risk" section.
        require(
            addr.codehash == _pendingAuthorizedContractCodehash,
            "SAGAHandleRegistry: code changed during timelock"
        );
        authorizedContracts[addr] = true;
        emit AuthorizedContractSet(addr, true);
        delete _pendingAuthorizedContract;
        delete _pendingAuthorizedContractReadyAt;
        delete _pendingAuthorizedContractCodehash;
    }

    /// @notice Phase 11 (J-1): cancel a previously-queued authorize-true
    ///         before it applies. The Safe's prior recourse to back out
    ///         of a mistake was to overwrite the slot with a different
    ///         contract (which itself started a 24h timer); a forgotten
    ///         or mistaken queue could then be permissionlessly applied
    ///         at the 24h mark by anyone watching the Safe.
    /// @dev Reverts when nothing is queued so callers don't accidentally
    ///      emit a misleading no-op `AuthorizedContractCancelled(0)`.
    function cancelPendingAuthorizedContract() external onlyOwner {
        require(_pendingAuthorizedContractReadyAt > 0, "SAGAHandleRegistry: no pending authorize");
        address cancelled = _pendingAuthorizedContract;
        delete _pendingAuthorizedContract;
        delete _pendingAuthorizedContractReadyAt;
        delete _pendingAuthorizedContractCodehash; // K-2
        emit AuthorizedContractCancelled(cancelled);
    }

    /// @notice Add or remove a trusted directory NFT contract used by
    ///         registerScopedHandle to verify directory existence + active
    ///         status. Phase 9 (G-11) replaced the singleton
    ///         setDirectoryIdentity setter from Phase 8A.
    /// @dev Phase 10 (M-1) timelock semantics:
    ///      - `trusted=true` from the initial deployer is immediate.
    ///      - `trusted=true` from a post-handoff Safe owner reverts;
    ///        use queueTrustedDirectoryContract + applyTrustedDirectoryContract.
    ///      - `trusted=false` is always immediate (deauthorization is the
    ///        safety action).
    ///      Removing trust does NOT invalidate already-registered scoped
    ///      handles; it only blocks NEW scoped registrations and
    ///      resolveActiveScopedHandle (Phase 10 H-2) from resolving via
    ///      directory handles minted by the deauthorized contract. The
    ///      deployer/governance is expected to verify that `addr` exposes
    ///      `directoryStatus(uint256) returns (string)` before marking
    ///      it trusted; on-chain ABI probes are unreliable across
    ///      Solidity versions and a misconfigured contract is caught at
    ///      the next registerScopedHandle call.
    function setTrustedDirectoryContract(address addr, bool trusted) external onlyOwner {
        if (trusted) {
            require(addr.code.length > 0, "SAGAHandleRegistry: trusted directory must be contract");
            // Phase 11 (J-3): bootstrap-finalization gate. See setAuthorizedContract.
            require(
                !bootstrapFinalized,
                "SAGAHandleRegistry: post-bootstrap: use queueTrustedDirectoryContract"
            );
            trustedDirectoryContracts[addr] = true;
            emit TrustedDirectoryContractSet(addr, true);
        } else {
            // Detrust: always immediate, regardless of bootstrap state.
            trustedDirectoryContracts[addr] = false;
            emit TrustedDirectoryContractSet(addr, false);
        }
    }

    /// @notice Phase 10 (M-1): queue a trusted-true for application after
    ///         the 24h timelock. Used by the Safe post-handoff to add new
    ///         directory contract implementations.
    function queueTrustedDirectoryContract(address addr) external onlyOwner {
        require(addr.code.length > 0, "SAGAHandleRegistry: trusted directory must be contract");
        _pendingTrustedDirectoryContract = addr;
        _pendingTrustedDirectoryContractReadyAt = block.timestamp + AUTH_TIMELOCK;
        // Phase 12 (K-2): see queueAuthorizedContract.
        _pendingTrustedDirectoryContractCodehash = addr.codehash;
        emit TrustedDirectoryContractQueued(addr, _pendingTrustedDirectoryContractReadyAt);
    }

    /// @dev Phase 12 (K-1): onlyOwner. See applyAuthorizedContract for the
    ///      cancel/apply race rationale.
    ///      Phase 10 (Copilot review on PR #54): re-check code.length at
    ///      apply time, mirroring applyAuthorizedContract.
    function applyTrustedDirectoryContract(address addr) external onlyOwner {
        require(_pendingTrustedDirectoryContractReadyAt > 0, "SAGAHandleRegistry: no pending trust");
        require(
            _pendingTrustedDirectoryContract == addr, "SAGAHandleRegistry: pending mismatch"
        );
        require(
            block.timestamp >= _pendingTrustedDirectoryContractReadyAt,
            "SAGAHandleRegistry: trust not yet ready"
        );
        // Phase 12 (K-2): see applyAuthorizedContract.
        require(
            addr.codehash == _pendingTrustedDirectoryContractCodehash,
            "SAGAHandleRegistry: code changed during timelock"
        );
        trustedDirectoryContracts[addr] = true;
        emit TrustedDirectoryContractSet(addr, true);
        delete _pendingTrustedDirectoryContract;
        delete _pendingTrustedDirectoryContractReadyAt;
        delete _pendingTrustedDirectoryContractCodehash;
    }

    /// @notice Phase 11 (J-1): cancel a previously-queued trust-true
    ///         before it applies. See cancelPendingAuthorizedContract.
    /// @dev Reverts when nothing is queued so callers don't accidentally
    ///      emit a misleading no-op `TrustedDirectoryContractCancelled(0)`.
    function cancelPendingTrustedDirectoryContract() external onlyOwner {
        require(_pendingTrustedDirectoryContractReadyAt > 0, "SAGAHandleRegistry: no pending trust");
        address cancelled = _pendingTrustedDirectoryContract;
        delete _pendingTrustedDirectoryContract;
        delete _pendingTrustedDirectoryContractReadyAt;
        delete _pendingTrustedDirectoryContractCodehash; // K-2
        emit TrustedDirectoryContractCancelled(cancelled);
    }

    // --- Registration (callable only by authorized contracts) ---

    /// @notice Register a handle for an entity. Only authorized contracts can call this.
    /// @param handle The handle string (3-64 chars, alphanumeric with dots/hyphens/underscores)
    /// @param entityType The type of entity (AGENT, ORG, or DIRECTORY)
    /// @param tokenId The token ID in the calling contract
    function registerHandle(string calldata handle, EntityType entityType, uint256 tokenId)
        external
        nonReentrant
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
    ) external nonReentrant {
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

    /// @notice Resolve a scoped handle, but only if the parent directory is
    ///         currently in `active` status. Phase 9 (G-5).
    /// @dev `resolveScopedHandle` (above) is preserved as the raw historical
    ///      resolver for callers that explicitly want revoked-namespace data
    ///      (forensic indexers, audit trails). Off-chain compute gates that
    ///      key on registry resolution alone should prefer this view so
    ///      identities under a revoked directory are filtered out.
    function resolveActiveScopedHandle(string calldata handle, string calldata directoryId)
        external
        view
        returns (EntityType entityType, uint256 tokenId, address contractAddress)
    {
        bytes32 dirGlobalKey = _handleKey(directoryId);
        HandleRecord memory dirRecord = _handles[dirGlobalKey];
        require(
            dirRecord.entityType == EntityType.DIRECTORY,
            "SAGAHandleRegistry: directory not found"
        );
        // Phase 10 (H-2): mirror registerScopedHandle's trust gate. Without
        // this check, a directory contract that governance has detrusted
        // (compromised or upgraded out) can continue to spoof "active" via
        // its directoryStatus() implementation, letting existing scoped
        // handles resolve as if nothing changed. The write path
        // (registerScopedHandle) already blocks this; the read path must
        // too, otherwise governance deauthorization is bypassable.
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
    ///      Phase 9 (G-2) added the consecutive-separator rejection as an
    ///      anti-spam measure: it blocks `m..arcus`, `m--arcus`, `m._arcus`,
    ///      etc. but does NOT defend against the broader homoglyph /
    ///      visual-similarity attack class. Single-separator variants like
    ///      `m.arcus`, `m-arcus`, `m_arcus`, `mar.cus`, `marc.us` remain
    ///      registrable and are visually similar to `marcus`. Phase 10
    ///      (H-3) corrected the original docstring's overclaim — handle
    ///      similarity is an off-chain UX concern (indexers should warn on
    ///      Damerau-Levenshtein distance ≤ 2 to an existing handle); the
    ///      on-chain layer cannot solve it without breaking legitimate
    ///      separator-bearing handles. ENS reached the same conclusion.
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
