// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {SAGAValidation} from "../src/SAGAValidation.sol";

/// @notice Tests for SAGAValidation library. The library is internal-only,
///         so a thin harness contract surfaces validateUrl as a public function
///         that we can call with calldata strings (required for `string calldata`).
contract ValidationHarness {
    function validateUrl(string calldata url) external pure {
        SAGAValidation.validateUrl(url);
    }

    function validateDisplayText(string calldata s, uint256 maxLen) external pure {
        SAGAValidation.validateDisplayText(s, maxLen);
    }

    function validateBaseUri(string calldata uri) external pure {
        SAGAValidation.validateBaseUri(uri);
    }
}

contract SAGAValidationTest is Test {
    ValidationHarness internal harness;

    function setUp() public {
        harness = new ValidationHarness();
    }

    // --- Length checks ---

    function test_validateUrl_emptyReverts() public {
        vm.expectRevert(SAGAValidation.InvalidUrlLength.selector);
        harness.validateUrl("");
    }

    function test_validateUrl_oversizeReverts() public {
        // 1025 bytes = MAX_URL_BYTES + 1
        bytes memory big = new bytes(1025);
        for (uint256 i = 0; i < big.length; i++) {
            big[i] = "x";
        }
        // Replace the first 8 bytes with a valid https:// prefix so that
        // length is the only failing condition.
        big[0] = "h"; big[1] = "t"; big[2] = "t"; big[3] = "p";
        big[4] = "s"; big[5] = ":"; big[6] = "/"; big[7] = "/";

        vm.expectRevert(SAGAValidation.InvalidUrlLength.selector);
        harness.validateUrl(string(big));
    }

    function test_validateUrl_atMaxLengthSucceeds() public view {
        // 1024 bytes = MAX_URL_BYTES
        bytes memory big = new bytes(1024);
        for (uint256 i = 0; i < big.length; i++) {
            big[i] = "x";
        }
        big[0] = "h"; big[1] = "t"; big[2] = "t"; big[3] = "p";
        big[4] = "s"; big[5] = ":"; big[6] = "/"; big[7] = "/";

        harness.validateUrl(string(big)); // must not revert
    }

    // --- Protocol checks ---

    function test_validateUrl_httpAccepted() public view {
        harness.validateUrl("http://example.com");
    }

    function test_validateUrl_httpsAccepted() public view {
        harness.validateUrl("https://example.com");
    }

    function test_validateUrl_javascriptUriReverts() public {
        vm.expectRevert(SAGAValidation.InvalidUrlProtocol.selector);
        harness.validateUrl("javascript:alert(1)");
    }

    function test_validateUrl_dataUriReverts() public {
        vm.expectRevert(SAGAValidation.InvalidUrlProtocol.selector);
        harness.validateUrl("data:text/html,<script>");
    }

    function test_validateUrl_fileSchemeReverts() public {
        vm.expectRevert(SAGAValidation.InvalidUrlProtocol.selector);
        harness.validateUrl("file:///etc/passwd");
    }

    function test_validateUrl_ftpReverts() public {
        vm.expectRevert(SAGAValidation.InvalidUrlProtocol.selector);
        harness.validateUrl("ftp://example.com");
    }

    function test_validateUrl_uppercaseHttpReverts() public {
        // Strict case-sensitive check — uppercase HTTP:// is rejected.
        // Clients should normalize to lowercase scheme before submission.
        vm.expectRevert(SAGAValidation.InvalidUrlProtocol.selector);
        harness.validateUrl("HTTP://example.com");
    }

    function test_validateUrl_almostHttpReverts() public {
        // Catch off-by-one prefix mismatches.
        vm.expectRevert(SAGAValidation.InvalidUrlProtocol.selector);
        harness.validateUrl("htt://example.com");
    }

    function test_validateUrl_hashOnlyReverts() public {
        // 7 bytes that aren't http://
        vm.expectRevert(SAGAValidation.InvalidUrlProtocol.selector);
        harness.validateUrl("####://");
    }

    // === Phase 8 (F-12) — require host bytes after scheme prefix ===

    function test_validateUrl_revertsOnHttpPrefixOnly() public {
        vm.expectRevert(SAGAValidation.InvalidUrlLength.selector);
        harness.validateUrl("http://");
    }

    function test_validateUrl_revertsOnHttpsPrefixOnly() public {
        vm.expectRevert(SAGAValidation.InvalidUrlLength.selector);
        harness.validateUrl("https://");
    }

    function test_validateUrl_acceptsMinimalHostHttp() public view {
        harness.validateUrl("http://a");
    }

    function test_validateUrl_acceptsMinimalHostHttps() public view {
        harness.validateUrl("https://b");
    }

    // === Phase 8 (F-7) — URL length boundary fuzz ===

    /// @notice Build "https://" + N filler bytes for N in [0, 1500]. Total
    ///         length = N + 8. Accepted iff total > 8 (host present) AND
    ///         total <= 1024. Outside that range must revert.
    function testFuzz_validateUrl_lengthBoundary(uint16 hostLen) public {
        vm.assume(hostLen <= 1500);
        bytes memory host = new bytes(hostLen);
        for (uint16 i = 0; i < hostLen; i++) host[i] = "a";
        string memory url = string(abi.encodePacked("https://", host));
        uint256 totalLen = bytes(url).length;

        if (totalLen == 8 || totalLen > 1024) {
            vm.expectRevert(SAGAValidation.InvalidUrlLength.selector);
        }
        harness.validateUrl(url);
    }

    // === Phase 10 (H-4) regression tests ===

    /// @notice URLs containing control bytes, raw whitespace, backslash,
    ///         or HTML metacharacters are now rejected so off-chain
    ///         consumers (indexers, frontends, log processors) get a
    ///         parser-stable URL out of the registry.
    function test_h4_validateUrl_rejectsControlByte() public {
        bytes memory bad = bytes("https://x.example/\x00path");
        vm.expectRevert(SAGAValidation.InvalidUrlCharacter.selector);
        harness.validateUrl(string(bad));
    }

    function test_h4_validateUrl_rejectsRawSpace() public {
        vm.expectRevert(SAGAValidation.InvalidUrlCharacter.selector);
        harness.validateUrl("https:// example.com");
    }

    function test_h4_validateUrl_rejectsNewline() public {
        bytes memory bad = bytes("https://x.example/\npath");
        vm.expectRevert(SAGAValidation.InvalidUrlCharacter.selector);
        harness.validateUrl(string(bad));
    }

    function test_h4_validateUrl_rejectsTab() public {
        bytes memory bad = bytes("https://x.example/\tpath");
        vm.expectRevert(SAGAValidation.InvalidUrlCharacter.selector);
        harness.validateUrl(string(bad));
    }

    function test_h4_validateUrl_rejectsBackslash() public {
        vm.expectRevert(SAGAValidation.InvalidUrlCharacter.selector);
        harness.validateUrl("https://x.example/\\path");
    }

    function test_h4_validateUrl_rejectsAngleBrackets() public {
        vm.expectRevert(SAGAValidation.InvalidUrlCharacter.selector);
        harness.validateUrl("https://x.example/<script>");
    }

    function test_h4_validateUrl_rejectsQuotes() public {
        // Double quote (0x22) and single quote (0x27) are both rejected.
        // Use byte construction to keep the literal unambiguous regardless
        // of which quote style the file's author prefers.
        bytes memory withDoubleQuote = bytes("https://x.example/\x22");
        vm.expectRevert(SAGAValidation.InvalidUrlCharacter.selector);
        harness.validateUrl(string(withDoubleQuote));

        bytes memory withSingleQuote = bytes("https://x.example/\x27");
        vm.expectRevert(SAGAValidation.InvalidUrlCharacter.selector);
        harness.validateUrl(string(withSingleQuote));
    }

    function test_h4_validateUrl_rejectsDel() public {
        bytes memory bad = bytes("https://x.example/\x7Fpath");
        vm.expectRevert(SAGAValidation.InvalidUrlCharacter.selector);
        harness.validateUrl(string(bad));
    }

    /// @notice Multi-byte UTF-8 IDN host bytes (>=0x80) MUST still pass —
    ///         RFC 3987 IDN domains rely on them.
    function test_h4_validateUrl_acceptsHighBytes() public {
        bytes memory utf8 = bytes("https://\xc3\xa9.example.com");
        harness.validateUrl(string(utf8));
        // No revert == pass.
    }

    // === Phase 11 (J-5) — validateDisplayText ===

    function test_j5_validateDisplayText_acceptsPlainAscii() public view {
        harness.validateDisplayText("d7r LLC", 128);
        harness.validateDisplayText("Org Name 1", 128);
    }

    function test_j5_validateDisplayText_acceptsHighBytes() public view {
        // UTF-8 multi-byte must still pass (non-ASCII names allowed).
        bytes memory utf8 = bytes("\xc3\x89pic D\xc3\xa9sign");
        harness.validateDisplayText(string(utf8), 128);
    }

    function test_j5_validateDisplayText_rejectsAngleBrackets() public {
        vm.expectRevert(SAGAValidation.InvalidTextCharacter.selector);
        harness.validateDisplayText("<script>", 128);
    }

    function test_j5_validateDisplayText_rejectsBackslash() public {
        bytes memory bad = bytes("Foo\\bar");
        vm.expectRevert(SAGAValidation.InvalidTextCharacter.selector);
        harness.validateDisplayText(string(bad), 128);
    }

    function test_j5_validateDisplayText_rejectsControlBytes() public {
        bytes memory withNull = bytes("Foo\x00bar");
        vm.expectRevert(SAGAValidation.InvalidTextCharacter.selector);
        harness.validateDisplayText(string(withNull), 128);

        bytes memory withEsc = bytes("Foo\x1bbar");
        vm.expectRevert(SAGAValidation.InvalidTextCharacter.selector);
        harness.validateDisplayText(string(withEsc), 128);
    }

    function test_j5_validateDisplayText_lengthBounds() public {
        vm.expectRevert(SAGAValidation.InvalidTextLength.selector);
        harness.validateDisplayText("", 128);

        bytes memory longName = new bytes(129);
        for (uint256 i = 0; i < 129; i++) longName[i] = "a";
        vm.expectRevert(SAGAValidation.InvalidTextLength.selector);
        harness.validateDisplayText(string(longName), 128);
    }

    // === Phase 11 (J-6) — validateBaseUri ===

    function test_j6_validateBaseUri_acceptsPathPrefix() public view {
        harness.validateBaseUri("https://saga-standard.dev/api/metadata/agent/");
        harness.validateBaseUri("http://example.com/path/");
    }

    function test_j6_validateBaseUri_requiresTrailingSlash() public {
        vm.expectRevert(SAGAValidation.InvalidBaseUriPath.selector);
        harness.validateBaseUri("https://example.com/path");
    }

    function test_j6_validateBaseUri_rejectsQueryString() public {
        vm.expectRevert(SAGAValidation.InvalidBaseUriPath.selector);
        harness.validateBaseUri("https://example.com/?evil=");
    }

    function test_j6_validateBaseUri_rejectsFragment() public {
        vm.expectRevert(SAGAValidation.InvalidBaseUriPath.selector);
        harness.validateBaseUri("https://example.com/#frag/");
    }

    function test_j6_validateBaseUri_rejectsAmpersand() public {
        vm.expectRevert(SAGAValidation.InvalidBaseUriPath.selector);
        harness.validateBaseUri("https://example.com/path&/");
    }

    // Phase 11 (J-12): fuzz the H-4 byte-blacklist closure. Asserts
    // that any byte in the rejected set (control bytes, space, DEL,
    // backslash, both quote types, both angle brackets) causes
    // InvalidUrlCharacter, while ANY byte outside that set is accepted
    // — including printable ASCII punctuation and the entire high-byte
    // range 0x80..0xFF (UTF-8 IDN tail bytes are RFC 3987 valid). The
    // acceptance set is "everything not in the blacklist", not
    // "alphanumeric + safe punctuation" — the on-chain validator is
    // intentionally permissive past the blacklist.
    function testFuzz_j12_validateUrl_charBlacklistClosure(uint8 b) public {
        // Build a URL like "https://x.example/p<byte>" with the fuzzed
        // byte appended. The prefix is always-valid; tail acceptance
        // depends only on the fuzzed byte.
        bytes memory url = abi.encodePacked(
            bytes("https://x.example/p"), bytes1(b)
        );

        bool inBlacklist = (
            b <= 0x20 || b == 0x7F || b == 0x5C
                || b == 0x22 || b == 0x27 || b == 0x3C || b == 0x3E
        );

        if (inBlacklist) {
            vm.expectRevert(SAGAValidation.InvalidUrlCharacter.selector);
            harness.validateUrl(string(url));
        } else {
            // Should not revert for allowed bytes — prefix + allowed
            // tail is a well-formed URL clearing validateUrl.
            harness.validateUrl(string(url));
        }
    }
}
