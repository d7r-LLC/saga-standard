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
    /// @notice Phase 10 (H-4): URL contains a byte that off-chain consumers
    ///         cannot safely render. Rejected: 0x00..0x20 (control + space),
    ///         0x7F (DEL), 0x5C (\), 0x22 ("), 0x27 ('), 0x3C (<), 0x3E (>).
    error InvalidUrlCharacter();

    /// @notice Validate a URL string is non-empty, ≤MAX_URL_BYTES bytes, and
    ///         starts with "http://" or "https://".
    /// @dev Reverts on failure. Callers should `validateUrl(url)` before any
    ///      state write. Phase 10 (M-2): signature changed from
    ///      `string calldata` to `string memory` so `applyBaseURI` can
    ///      re-validate the queued URI (held in storage as `string`) at
    ///      apply time as defense-in-depth against validator semantics
    ///      tightening between queue and apply. Solidity auto-converts
    ///      `string calldata` callers; the per-call gas delta is small
    ///      compared to the 1024-byte cap.
    function validateUrl(string memory url) internal pure {
        bytes memory b = bytes(url);
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

        // Phase 10 (H-4): reject control bytes, raw whitespace, backslash,
        // and HTML metacharacters. The on-chain layer is not the right
        // place to defend against XSS, but it IS the right place to reject
        // obvious garbage at zero marginal cost so off-chain consumers
        // (indexers, frontends, log processors) can trust that a stored
        // URL is at least parser-stable. Multi-byte UTF-8 (>=0x80) is
        // permitted because RFC 3987 IDN domains rely on it.
        for (uint256 i = 0; i < len; i++) {
            bytes1 c = b[i];
            if (
                c <= 0x20            // control + space
                    || c == 0x7F     // DEL
                    || c == 0x5C     // backslash
                    || c == 0x22     // double quote
                    || c == 0x27     // single quote
                    || c == 0x3C     // <
                    || c == 0x3E     // >
            ) {
                revert InvalidUrlCharacter();
            }
        }
    }
}
