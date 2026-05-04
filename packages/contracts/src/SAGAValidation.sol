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
    /// @notice Phase 11 (J-5): display-text shape violations.
    error InvalidTextLength();
    error InvalidTextCharacter();
    /// @notice Phase 11 (J-6): base-URI shape violations (missing trailing
    ///         `/` OR contains `?`/`#`/`&` that would cause `tokenURI`
    ///         concatenation to inject the tokenId into a query/fragment).
    error InvalidBaseUriPath();

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

    /// @notice Phase 11 (J-5): validate a free-form display string.
    /// @dev Mirrors validateUrl's H-4 byte blacklist EXCEPT space (0x20)
    ///      is permitted because legitimate display names like
    ///      "d7r LLC" require it. Rejects: C0
    ///      controls (0x00..0x1F), DEL (0x7F), backslash, both quote
    ///      types, and the angle brackets that downstream HTML/JSON
    ///      renderers cannot escape. Multi-byte UTF-8 (>=0x80) passes
    ///      so non-ASCII display names work.
    function validateDisplayText(string calldata s, uint256 maxLen) internal pure {
        bytes calldata b = bytes(s);
        if (b.length == 0 || b.length > maxLen) revert InvalidTextLength();

        for (uint256 i = 0; i < b.length; i++) {
            bytes1 c = b[i];
            if (
                c <= 0x1F            // C0 control bytes (incl. NUL, TAB, ESC)
                    || c == 0x7F     // DEL
                    || c == 0x22     // double quote
                    || c == 0x27     // single quote
                    || c == 0x3C     // <
                    || c == 0x3E     // >
                    || c == 0x5C     // backslash
            ) {
                revert InvalidTextCharacter();
            }
        }
    }

    /// @notice Phase 11 (J-6): validate a base URI suitable for ERC-721
    ///         `tokenURI` concatenation.
    /// @dev Must pass `validateUrl` AND end in `/` AND contain no `?`,
    ///      `#`, or `&`. Without these constraints, a Safe-compromised
    ///      `setBaseURI` to `https://x.example/api/?redirect=` would
    ///      produce `tokenURI(42) = https://x.example/api/?redirect=42`
    ///      — tokenId injected into the query string with off-chain
    ///      consequences (open-redirect chaining, indexer cache
    ///      poisoning) gated only by the 24h G-8 timelock.
    function validateBaseUri(string memory uri) internal pure {
        validateUrl(uri);
        bytes memory b = bytes(uri);
        if (b[b.length - 1] != 0x2F) revert InvalidBaseUriPath();
        for (uint256 i = 0; i < b.length; i++) {
            bytes1 c = b[i];
            if (c == 0x3F || c == 0x23 || c == 0x26) {
                revert InvalidBaseUriPath();
            }
        }
    }
}
