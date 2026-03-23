// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {IERC6551Registry} from "./interfaces/IERC6551Registry.sol";

/// @title SAGATBAHelper
/// @notice Computes and creates ERC-6551 Token Bound Accounts for SAGA identity NFTs
/// @dev References the canonical ERC-6551 registry deployed on all EVM chains
contract SAGATBAHelper {
    /// @notice The ERC-6551 registry address (configurable for testnet/local vs canonical)
    IERC6551Registry public immutable registry;

    /// @notice The Tokenbound account implementation address
    address public immutable accountImplementation;

    /// @notice Default salt for TBA creation (0 for deterministic single-TBA-per-NFT)
    bytes32 public constant DEFAULT_SALT = bytes32(0);

    constructor(address _registry, address _accountImplementation) {
        registry = IERC6551Registry(_registry);
        accountImplementation = _accountImplementation;
    }

    /// @notice Compute the TBA address for a SAGA identity NFT without creating it
    /// @param tokenContract Address of the identity NFT contract (agent or org)
    /// @param tokenId Token ID of the identity NFT
    /// @return The deterministic TBA address
    function computeAccount(
        address tokenContract,
        uint256 tokenId
    ) external view returns (address) {
        return
            registry.account(accountImplementation, DEFAULT_SALT, block.chainid, tokenContract, tokenId);
    }

    /// @notice Create a TBA for a SAGA identity NFT
    /// @param tokenContract Address of the identity NFT contract
    /// @param tokenId Token ID of the identity NFT
    /// @return The created TBA address
    function createAccount(address tokenContract, uint256 tokenId) external returns (address) {
        return registry.createAccount(
            accountImplementation, DEFAULT_SALT, block.chainid, tokenContract, tokenId
        );
    }

    /// @notice Compute TBA address for a specific chain (for cross-chain resolution)
    function computeAccountForChain(
        address tokenContract,
        uint256 tokenId,
        uint256 chainId
    ) external view returns (address) {
        return registry.account(accountImplementation, DEFAULT_SALT, chainId, tokenContract, tokenId);
    }
}
