# @saga-standard/contracts

SAGA Identity NFT smart contracts and TypeScript bindings for the SAGA ecosystem on Base.

## Contracts

| Contract             | Description                                                                                            |
| -------------------- | ------------------------------------------------------------------------------------------------------ |
| `SAGAHandleRegistry` | On-chain DNS. Maps handles to entity types and token IDs. Shared namespace across agents and orgs.     |
| `SAGAAgentIdentity`  | ERC-721 NFT for agent identities. Each token represents a unique agent with a handle and home hub URL. |
| `SAGAOrgIdentity`    | ERC-721 NFT for organization identities. Each token represents a unique org with a handle and name.    |
| `SAGATBAHelper`      | Utility for creating and computing ERC-6551 Token Bound Account addresses for SAGA NFTs.               |

## Deployment Addresses

| Contract           | Base Sepolia                                 | Base Mainnet     |
| ------------------ | -------------------------------------------- | ---------------- |
| SAGAHandleRegistry | Not yet deployed                             | Not yet deployed |
| SAGAAgentIdentity  | Not yet deployed                             | Not yet deployed |
| SAGAOrgIdentity    | Not yet deployed                             | Not yet deployed |
| SAGATBAHelper      | Not yet deployed                             | Not yet deployed |
| ERC-6551 Registry  | `0x000000006551c19487814612e58FE06813775758` | Same             |

Addresses are populated in `src/ts/addresses.ts` after deployment.

## Architecture

```
SAGAHandleRegistry (shared handle namespace)
├── SAGAAgentIdentity (ERC-721)
│   └── registerAgent(handle, hubUrl) → registers handle, mints NFT
└── SAGAOrgIdentity (ERC-721)
    └── registerOrganization(handle, name) → registers handle, mints NFT

SAGATBAHelper → ERC-6551 Registry (canonical, pre-deployed)
└── computeAccount() / createAccount() → deterministic TBA per NFT
```

## Contract Interfaces

### SAGAHandleRegistry

Manages the shared handle namespace. Only authorized contracts can register handles.

```solidity
// Write (authorized contracts only)
function registerHandle(string handle, EntityType entityType, uint256 tokenId) external
function setAuthorizedContract(address contract, bool authorized) external  // onlyOwner

// Read
function handleExists(string handle) external view returns (bool)
function resolveHandle(string handle) external view returns (EntityType, uint256, address)

// EntityType enum: NONE = 0, AGENT = 1, ORG = 2
```

### SAGAAgentIdentity

ERC-721 token for agent identities.

```solidity
// Write
function registerAgent(string handle, string homeHubUrl) external returns (uint256 tokenId)
function updateHomeHub(uint256 tokenId, string newHubUrl) external  // token owner only

// Read
function agentHandle(uint256 tokenId) external view returns (string)
function homeHubUrl(uint256 tokenId) external view returns (string)
function handleToTokenId(string handle) external view returns (uint256)
function tokenURI(uint256 tokenId) external view returns (string)
```

### SAGAOrgIdentity

ERC-721 token for organization identities.

```solidity
// Write
function registerOrganization(string handle, string name) external returns (uint256 tokenId)
function updateOrgName(uint256 tokenId, string name) external  // token owner only

// Read
function orgHandle(uint256 tokenId) external view returns (string)
function orgName(uint256 tokenId) external view returns (string)
```

## Events

### SAGAAgentIdentity

| Event             | Parameters                                             | Description                       |
| ----------------- | ------------------------------------------------------ | --------------------------------- |
| `AgentRegistered` | `tokenId`, `handle`, `owner`, `hubUrl`, `registeredAt` | Emitted on agent mint             |
| `HomeHubUpdated`  | `tokenId`, `oldUrl`, `newUrl`                          | Emitted when home hub URL changes |
| `Transfer`        | `from`, `to`, `tokenId`                                | Standard ERC-721 transfer         |

### SAGAOrgIdentity

| Event            | Parameters                                           | Description                   |
| ---------------- | ---------------------------------------------------- | ----------------------------- |
| `OrgRegistered`  | `tokenId`, `handle`, `name`, `owner`, `registeredAt` | Emitted on org mint           |
| `OrgNameUpdated` | `tokenId`, `oldName`, `newName`                      | Emitted when org name changes |
| `Transfer`       | `from`, `to`, `tokenId`                              | Standard ERC-721 transfer     |

## TypeScript Bindings

The `src/ts/` directory exports typed ABIs, addresses, and helpers for use with viem.

### Mint an agent identity

```typescript
import { getAgentIdentityConfig, computeTBAAddress } from '@saga-standard/contracts'
import { createWalletClient, createPublicClient, http } from 'viem'
import { baseSepolia } from 'viem/chains'

const config = getAgentIdentityConfig('base-sepolia')
const txHash = await walletClient.writeContract({
  ...config,
  functionName: 'registerAgent',
  args: ['my-agent', 'https://hub.example.com'],
  account,
})

const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash })
// Parse AgentRegistered event from receipt.logs to get tokenId
```

### Resolve a handle

```typescript
import { getHandleRegistryConfig, entityTypeFromNumber } from '@saga-standard/contracts'

const config = getHandleRegistryConfig('base-sepolia')
const [rawType, tokenId, contractAddr] = await publicClient.readContract({
  ...config,
  functionName: 'resolveHandle',
  args: ['my-agent'],
})

const entityType = entityTypeFromNumber(rawType) // 'AGENT' | 'ORG' | 'NONE'
```

### Compute a TBA address

```typescript
import { computeTBAAddress } from '@saga-standard/contracts'

const tba = computeTBAAddress({
  implementation: '0x55266d75D1a14E4572138116aF39863Ed6596E7F',
  chainId: 84532,
  tokenContract: '0x...agentIdentityAddress',
  tokenId: 42n,
})
```

## Setup

```bash
# Install Foundry (if not already installed)
curl -L https://foundry.paradigm.xyz | bash
foundryup

# Submodules are pinned in .gitmodules (Phase 8 F-14). Use --recursive on
# clone or run submodule update directly. Do NOT run `forge install` against
# latest — pin lives in the parent repo's gitlink, not in the submodule URL.
git submodule update --init --recursive
```

**Pinned dependency versions:**

| Submodule | Version | Pinned commit |
| --------- | ------- | ------------- |
| `lib/openzeppelin-contracts` | v5.6.1 | `5fd1781b1454fd1ef8e722282f86f9293cacf256` |
| `lib/forge-std`              | v1.9.6 | `0844d7e1fc5e60d77b68e469bff60265f236c398` |

Verify after submodule init:

```bash
git submodule status packages/contracts/lib/
```

Both lines should show the SHAs above without an asterisk or `+` prefix
(asterisk = uninitialised; `+` = local commit drift).

## Build & Test

```bash
forge build          # Compile contracts
forge test -vvv      # Run tests
forge test --gas-report  # Gas report
pnpm test:ts         # Run TypeScript binding tests
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

### Required env for Deploy.s.sol

| Variable | Notes |
| -------- | ----- |
| `DEPLOYER_PRIVATE_KEY` | Deployer EOA — initial owner of all four Ownable2Step contracts |
| `ERC6551_REGISTRY`     | Optional. Defaults to canonical `0x0000...775758` |
| `TBA_IMPLEMENTATION`   | **Required.** Phase 8 (F-5) — must be a deployed contract; deploy reverts on zero/EOA |

### Ownership transfer to Safe

After mainnet deploy, hand ownership to the project Safe:

```bash
NEW_OWNER=<safe-address> \
HANDLE_REGISTRY=<from-deploy> \
AGENT_IDENTITY=<from-deploy> \
ORG_IDENTITY=<from-deploy> \
DIRECTORY_IDENTITY=<from-deploy> \
forge script script/TransferOwnership.s.sol --rpc-url base --broadcast
```

This is a **two-step handoff** (Phase 8 F-3): the script calls
`transferOwnership(safe)` from the deployer, which sets `pendingOwner`.
The Safe must subsequently call `acceptOwnership()` on each contract from
the multisig UI to finalize. `owner()` remains the deployer until each
`acceptOwnership` lands.

### Re-deploying contracts post-Safe-transfer

`script/DeployOrg.s.sol` redeploys a single SAGAOrgIdentity and
re-authorizes it on the existing registry. **Once registry ownership has
been transferred to the Safe, the deployer EOA can no longer call
`setAuthorizedContract` directly.** Two paths to re-deploy:

1. **Recommended:** wrap the deploy + `setAuthorizedContract` call as a
   single Safe transaction batched via Safe Transaction Builder, signed by
   the multisig threshold. The deploy itself can still be initiated by the
   deployer EOA; only the registry-authorization side needs to come from
   the Safe.

2. Temporarily revert ownership back to the deployer (Safe calls
   `transferOwnership(deployerEOA)`; deployer calls `acceptOwnership()`),
   run the script, then re-transfer to the Safe again. This is the
   higher-friction path and should be avoided when possible.

`DeployOrg.s.sol` also requires `TBA_HELPER` in env (Phase 8 F-4: identity
constructors take `(registry, tbaHelper)`).

## License

Apache-2.0
