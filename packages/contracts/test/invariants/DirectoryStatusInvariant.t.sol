// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import {SAGAHandleRegistry} from "../../src/SAGAHandleRegistry.sol";
import {SAGADirectoryIdentity} from "../../src/SAGADirectoryIdentity.sol";
import {DirectoryStatusHandler} from "./DirectoryStatusHandler.sol";

contract MockTBAHelper {
    function computeAccount(address tokenContract, uint256 tokenId)
        external
        pure
        returns (address)
    {
        return address(uint160(uint256(keccak256(abi.encode(tokenContract, tokenId)))));
    }
}

/// @notice Phase 8 (F-7) invariant: when only the NFT-owner path drives
///         updateDirectoryStatus, the on-chain status rank is monotonically
///         non-decreasing. Pins the A-Crit#4 fix against thousands of
///         random call sequences.
contract DirectoryStatusInvariantTest is Test, IERC721Receiver {
    SAGADirectoryIdentity public directory;
    DirectoryStatusHandler public handler;
    uint256 public tokenId;

    function onERC721Received(address, address, uint256, bytes calldata)
        external
        pure
        override
        returns (bytes4)
    {
        return IERC721Receiver.onERC721Received.selector;
    }

    function setUp() public {
        SAGAHandleRegistry registry = new SAGAHandleRegistry();
        MockTBAHelper tba = new MockTBAHelper();
        directory = new SAGADirectoryIdentity(address(registry), address(tba));
        registry.setAuthorizedContract(address(directory), true);
        registry.setTrustedDirectoryContract(address(directory), true);

        tokenId = directory.registerDirectory(
            "test-dir", "https://dir.example.com", makeAddr("op"), "basic"
        );

        // Transfer token to the handler so handler.setStatus runs as
        // the NFT owner (downgrade-only path), NOT the contract owner.
        handler = new DirectoryStatusHandler(directory, tokenId);
        directory.transferFrom(address(this), address(handler), tokenId);

        targetContract(address(handler));
    }

    function invariant_tokenOwnerNeverUpgradesStatus() public view {
        // Recompute current rank from the live status string. The contract's
        // _statusRank is internal; we mirror it.
        bytes32 h = keccak256(bytes(directory.directoryStatus(tokenId)));
        uint8 chainRank;
        if (h == keccak256("active")) chainRank = 0;
        else if (h == keccak256("suspended")) chainRank = 1;
        else if (h == keccak256("flagged")) chainRank = 2;
        else if (h == keccak256("revoked")) chainRank = 3;
        else revert("invariant: unknown status");

        // Ghost lives in the handler — monotonically non-decreasing across
        // every successfully-applied call. On-chain rank must keep pace.
        assertGe(chainRank, handler.ghostRank());
    }
}
