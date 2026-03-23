# @saga-standard/contracts

SAGA Identity NFT smart contracts for the SAGA ecosystem on Base.

## Contracts

| Contract | Description |
|----------|-------------|
| `SAGAHandleRegistry` | On-chain DNS. Maps handles to entity types and token IDs. |
| `SAGAAgentIdentity` | ERC-721 NFT for agent identities. |
| `SAGAOrgIdentity` | ERC-721 NFT for organization identities. |
| `SAGATBAHelper` | ERC-6551 Token Bound Account helper for SAGA NFTs. |

## Setup

```bash
# Install Foundry (if not already installed)
curl -L https://foundry.paradigm.xyz | bash
foundryup

# Install dependencies (OpenZeppelin via git submodule)
cd packages/contracts
forge install OpenZeppelin/openzeppelin-contracts
```

## Build & Test

```bash
forge build          # Compile contracts
forge test -vvv      # Run tests
forge test --gas-report  # Gas report
forge fmt --check    # Check formatting
```

## Deploy

```bash
# Copy .env.example to .env and fill in values
cp .env.example .env

# Dry run
forge script script/Deploy.s.sol --rpc-url base_sepolia

# Deploy and verify
forge script script/Deploy.s.sol --rpc-url base_sepolia --broadcast --verify
```

## Architecture

```
SAGAHandleRegistry (shared namespace)
├── SAGAAgentIdentity (ERC-721, registers handles as AGENT)
└── SAGAOrgIdentity (ERC-721, registers handles as ORG)

SAGATBAHelper → ERC-6551 Registry (canonical)
└── Computes/creates Token Bound Accounts for any SAGA NFT
```

## License

Apache-2.0
