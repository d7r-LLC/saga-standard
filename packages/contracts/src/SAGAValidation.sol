// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

/// @title SAGAValidation
/// @notice Shared validation helpers for SAGA identity contracts.
/// @dev Applied at every URL ingress on agent + directory contracts to bound
///      storage cost and reject malformed payloads (e.g., javascript: URIs)
///      before they hit on-chain state. See Phase 1 of the 2026-05-03 security
///      remediation plan (FlowState `docu_13E_mSxrv3`).
library SAGAValidation {
    /// @notice Maximum allowed length of a URL stored on-chain (bytes).
    /// @dev 1024 bytes is generous for legitimate hub/directory URLs and bounds
    ///      worst-case gas + storage for an attacker registering bloated payloads.
    uint256 internal constant MAX_URL_BYTES = 1024;

    error InvalidUrlLength();
    error InvalidUrlProtocol();

    /// @notice Validate a URL string is non-empty, ≤MAX_URL_BYTES bytes, and
    ///         starts with "http://" or "https://".
    /// @dev Reverts on failure. Callers should `validateUrl(url)` before any
    ///      state write. Reads bytes directly from calldata (no memory copy)
    ///      to keep per-call gas low.
    function validateUrl(string calldata url) internal pure {
        bytes calldata b = bytes(url);
        uint256 len = b.length;
        if (len == 0 || len > MAX_URL_BYTES) revert InvalidUrlLength();

        // Check "http://" (7 bytes) or "https://" (8 bytes) prefix.
        // We don't allow other schemes — no javascript:, data:, file:, ftp:, etc.
        bool isHttp = len >= 7 && b[0] == "h" && b[1] == "t" && b[2] == "t"
            && b[3] == "p" && b[4] == ":" && b[5] == "/" && b[6] == "/";

        bool isHttps = len >= 8 && b[0] == "h" && b[1] == "t" && b[2] == "t"
            && b[3] == "p" && b[4] == "s" && b[5] == ":" && b[6] == "/" && b[7] == "/";

        if (!isHttp && !isHttps) revert InvalidUrlProtocol();

        // Phase 8 (F-12): require at least one byte of host content after the
        // scheme prefix. Without this, "http://" (exactly 7 bytes) and
        // "https://" (exactly 8) would silently pass validation — useless
        // garbage that off-chain consumers attempt to resolve.
        if (isHttp && len == 7) revert InvalidUrlLength();
        if (isHttps && len == 8) revert InvalidUrlLength();
    }
}
