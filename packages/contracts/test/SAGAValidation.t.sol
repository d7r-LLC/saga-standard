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
}
