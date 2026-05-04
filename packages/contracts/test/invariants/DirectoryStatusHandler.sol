// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {SAGADirectoryIdentity} from "../../src/SAGADirectoryIdentity.sol";

/// @notice Phase 8 (F-7): handler for the directory status monotonicity
///         invariant. Wraps `updateDirectoryStatus` from the token-owner
///         perspective only — the contract-owner branch (governance can
///         set any status) is intentionally NOT exposed because it would
///         break the monotonicity property.
///
/// The handler is the sole `targetContract` for the invariant test, so
/// every fuzz call goes through this surface. It tracks the last
/// successfully-applied rank as a ghost variable; the invariant asserts
/// the live status's rank is always >= ghost.
contract DirectoryStatusHandler {
    SAGADirectoryIdentity public immutable directory;
    uint256 public immutable tokenId;

    /// Status rank: active=0, suspended=1, flagged=2, revoked=3.
    string[4] public statuses = ["active", "suspended", "flagged", "revoked"];

    /// Ghost: highest rank we've successfully applied. Monotonically
    /// non-decreasing because the token-owner path enforces downgrade-only.
    uint8 public ghostRank;

    constructor(SAGADirectoryIdentity _directory, uint256 _tokenId) {
        directory = _directory;
        tokenId = _tokenId;
    }

    /// Drive a status update. The handler is the NFT owner (the test
    /// transfers the token to the handler at setUp). Reverts on
    /// upgrade-from-current — those are caught and ignored, leaving
    /// ghostRank at the previous value.
    function setStatus(uint8 idx) external {
        idx = idx % 4;
        try directory.updateDirectoryStatus(tokenId, statuses[idx]) {
            ghostRank = idx;
        } catch {
            // Upgrade attempts revert; leave ghostRank unchanged.
        }
    }
}
