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

| Submodule                    | Version | Pinned commit                              |
| ---------------------------- | ------- | ------------------------------------------ |
| `lib/openzeppelin-contracts` | v5.6.1  | `5fd1781b1454fd1ef8e722282f86f9293cacf256` |
| `lib/forge-std`              | v1.9.6  | `0844d7e1fc5e60d77b68e469bff60265f236c398` |

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

| Variable               | Notes                                                                                                                                                                                                                                                                                                                                                         |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DEPLOYER_PRIVATE_KEY` | Deployer EOA — initial owner of all four Ownable2Step contracts                                                                                                                                                                                                                                                                                               |
| `ERC6551_REGISTRY`     | Optional. Defaults to canonical `0x0000...775758`                                                                                                                                                                                                                                                                                                             |
| `TBA_IMPLEMENTATION`   | **Required.** Phase 8 (F-5) — must be a deployed contract; deploy reverts on zero/EOA. Phase 9 (G-6) — on Base mainnet (chainId 8453) and Base Sepolia (chainId 84532), MUST equal the canonical Tokenbound V3 address `0x55266d75D1a14E4572138116aF39863Ed6596E7F`; any other contract reverts the deploy. Other chains may supply their own implementation. |

### Mainnet deploy runbook (Phase 12 K-15)

`Deploy.s.sol` no longer calls `finalizeBootstrap` itself; the
finalization is a separate transaction so a partial mid-script
failure cannot leave the registry both partially configured AND
already finalized (which would force every fix-up authorize through
the M-1 24h timelock).

The end-to-end runbook is:

1. `forge script script/Deploy.s.sol --rpc-url base --broadcast`
   (with `DEPLOY_DIRECT=true` per H-5).
2. Verify all four contracts on Basescan with constructor args.
3. Smoke test: register a test agent, org, and directory in the
   bootstrap window (still using `setAuthorizedContract` immediate
   path — the bootstrap window is open until step 4).
4. `HANDLE_REGISTRY=<from-deploy> forge script
   script/FinalizeBootstrap.s.sol --rpc-url base --broadcast` —
   closes the bootstrap window. Cannot be undone.
5. `forge script script/TransferOwnership.s.sol --rpc-url base
   --broadcast` — sets `pendingOwner = Safe` on all four contracts.
6. Safe calls `acceptOwnership()` on each contract through its
   multisig flow.

### Ownership transfer to Safe

After bootstrap finalization, hand ownership to the project Safe:

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

## Security Notes

### Known limitation: self-TBA transfer guard scope

The Phase 8 F-4 self-TBA transfer guard prevents transferring an
identity NFT into the Token Bound Account computed by `SAGATBAHelper`
with `salt = bytes32(0)` and the immutable `accountImplementation`
configured at `SAGATBAHelper` deploy time.

ERC-6551 permits multiple distinct accounts per `(chain, NFT)` tuple
using different `salt` values OR different account implementations. The
on-chain guard does **NOT** block transfers to:

- TBAs computed with a non-zero salt
- TBAs derived from a different (non-canonical) Tokenbound implementation
- TBAs deployed via the canonical ERC-6551 registry directly, bypassing
  `SAGATBAHelper`

A user (or a malicious dApp tricking a user) can still transfer an
identity NFT into a self-bound account using one of the above paths,
creating the documented ERC-6551 ownership-loop and permanently locking
the NFT. **On-chain enforcement of all possible self-TBA derivations is
impractical** — the salt space is 256 bits and account implementations
are not enumerable.

Mitigation lives at the UX layer. Wallets and frontends rendering SAGA
NFT transfers should:

1. Compute the canonical TBA via `SAGATBAHelper.computeAccount` and warn
   before any transfer to that address (the contract already blocks this
   hard).
2. Compute a few common salt variants (the canonical implementation
   typically uses `bytes32(0)`, but some integrators use `keccak256(...)`
   schemes) and warn similarly.
3. Display a "this transfer destination is bound to the NFT you are
   transferring" warning whenever the destination address has been
   recently created via the ERC-6551 registry.

**Phase 11 (J-13) update — partial closure.** The `_update` hook also
performs `try IERC6551BoundAccount(to).token() returns (chainId,
contract, tokenId)` and reverts if the destination reports being bound
to THIS NFT. This closes the salt + alternative-implementation gap
on-chain **for any TBA implementation that conforms to ERC-6551's
universal `token()` getter and reports its binding honestly** (every
canonical Tokenbound, Manifold, and reference implementation does).

**Phase 12 (K-3) update — bounded introspection + adversarial residual.**
The introspection call is bounded at 30,000 gas via Solidity's
try/catch gas option, so a malicious destination cannot grief by
consuming all forwarded gas (EIP-150). The remaining residual: a
destination contract that **lies** about its binding via a non-standard
`token()` (e.g., returns fake chainId or contract values) bypasses
J-13. The on-chain layer cannot verify that an arbitrary contract's
reported binding is truthful; UX-layer warnings (option 1 above)
remain valid for that adversarial-implementation case.

Re-audit references: OpenAI LOW + Gemini MEDIUM
(G-12 in `audits/2026-05-04-post-phase8-gap-matrix.md`); Anthropic
HIGH (H-3 / K-3 in the post-Phase-11 re-audit response).

### Authorized contracts: residual risk

`SAGAHandleRegistry.setAuthorizedContract(addr, true)` grants `addr`
unrestricted ability to call `registerHandle` and `registerScopedHandle`
under any handle, entity type, and token ID. The registry trusts the
authorized caller's claim that the (handle, tokenId) pair corresponds
to a real on-chain identity it owns.

Currently, only the SAGA-deployed identity contracts (Agent, Org,
Directory) are authorized. Granting authorization to any third-party
contract effectively grants it the ability to:

- Register handles with arbitrary token IDs that map nowhere (squatting)
- Register handles claiming `EntityType.AGENT` / `ORG` / `DIRECTORY`
  even when the contract is none of those
- Block legitimate handle registrations by claiming the namespace first

The mitigation is **policy, not code**: the SAGA project Safe multisig
holds the registry owner role, and authorization changes can only be
applied by reaching the Safe's signing threshold — that is what makes
single-key compromise insufficient to hijack authorization.
`Ownable2Step` is a complementary defense: it prevents an _accidental_
ownership transfer to a wrong/non-existent address by requiring the
incoming owner to explicitly accept, but it does NOT by itself defend
against a compromised owner. The Safe threshold does.

New `authorizedContracts` entries should be reviewed in the same way
smart-contract upgrades are reviewed — diligence on the implementation,
the deployer, and the operational governance — before the Safe
transaction is signed.

**Phase 12 (K-6) update — `tokenId` liveness check is intentionally
omitted.** Anthropic's M-2 finding suggested probing `IERC721.ownerOf`
on the calling contract during `registerHandle` to reject handles
claimed for non-existent tokens. We evaluated the lighter "Option 1"
(`try/catch ownerOf{gas: 30000}`) but it is incompatible with the
F-2 CEI ordering: identity contracts call `registerHandle` BEFORE
`_safeMint` so that handle resolution succeeds inside
`onERC721Received` — at that moment the token has not yet been
minted, and `ownerOf` would revert. Closing M-2 in code therefore
requires either reordering F-2 (regressing the half-initialized-state
observation guard) or a `setAuthorizedContract` redesign that pins
each authorized contract to a specific entity type and contract
address. Both halves of M-2 (tokenId-liveness AND
entityType-spoofing) remain documented residuals; mitigation is
governance — Safe diligence on every new authorized contract.
Re-evaluation is deferred to a future major version that revisits
the F-2 / handle-resolution-during-callback contract.

**Phase 11 (J-8) update — dual-direction Safe-compromise risk.** The
M-1 24h queue+apply timelock applies to authorize-true (and trust-true)
ONCE `bootstrapFinalized` is set inside `Deploy.s.sol`. Deauthorization
(`setAuthorizedContract(addr, false)`, `setTrustedDirectoryContract(addr, false)`)
is always immediate — slowing it down would let a known-compromised
contract continue operating against the registry for a full day.

This creates an **asymmetric Safe-compromise profile:**

- **Hijack direction (slow):** a compromised Safe queues a malicious
  authorize-true. The 24h timelock window gives legitimate operators
  time to detect, rotate signers, and call
  `cancelPendingAuthorizedContract` / `cancelPendingTrustedDirectoryContract`
  (Phase 11 J-1) to back out cleanly.
- **Brick direction (fast):** a compromised Safe immediately
  deauthorizes one or more identity contracts in a single transaction.
  Every `registerAgent` / `registerOrganization` / `registerDirectory`
  call reverts with `unauthorized`. Recovery requires queueing
  re-authorization (24h delay) — for that 24h, the SAGA namespace is
  read-only.

Both directions are recovery-time issues, not permanent loss. The
asymmetric design accepts the brick-direction tradeoff because slowing
deauthorization would let attackers continue operating against a
known-compromised authorized contract for 24h, which is strictly worse
than a 24h read-only window.

Re-audit reference: G-14 in
`audits/2026-05-04-post-phase8-gap-matrix.md`; J-8 in
`audits/2026-05-04-post-phase10-gap-matrix.md`.

**Phase 12 (K-2) update — codehash snapshot.** The 24h timelock now
also pins the queued address's `extcodehash` at queue time and re-checks
it at apply time. This catches CREATE2 metamorphism (a contract that
self-destructs and re-deploys with new code at the same address) and
plain bytecode swaps via `vm.etch` in test environments.

**Residual:** a Transparent / UUPS / ERC-1967 proxy can swap its
implementation during the timelock without changing the proxy shell's
own `extcodehash`. The K-2 check pins the proxy shell, NOT the live
implementation. **Safe diligence MUST refuse to queue any proxy
address** — the only way to ensure the implementation reviewed at
queue time is what gets authorized at apply time is to require the
queued contract be non-upgradeable. This is enforced as a policy
boundary, not a code check, because on-chain detection of arbitrary
proxy patterns is unreliable across Solidity versions and proxy
families.

Re-audit reference: K-2 in the post-Phase-11 audit response
(Anthropic HIGH).

### TBA contents are NOT transferred atomically with the NFT

ERC-6551 binds a Token Bound Account's CONTROL to NFT ownership, but
does NOT escrow the TBA's CONTENTS. A seller listing a SAGA identity
NFT on a secondary marketplace can:

1. List the NFT for sale (e.g., on OpenSea or Blur).
2. Wait for a buyer to submit a purchase transaction.
3. Front-run the buyer's transaction by withdrawing tokens, NFTs, or
   other assets from the TBA.
4. Let the buyer's transaction execute. The buyer receives the
   identity NFT and control of an empty TBA.

This is a fundamental ERC-6551 design tradeoff — the on-chain SAGA
identity contracts cannot prevent it without breaking standard ERC-721
transfer semantics.

**Mitigations:**

- **UX layer (REQUIRED):** SAGA-integrating frontends MUST display a
  clear warning before any NFT-listing UI: "TBA contents are not
  guaranteed to be transferred with the NFT. Verify TBA balance
  immediately before purchase."
- **Marketplace adapter (RECOMMENDED for official sales):** if SAGA
  ships a first-party marketplace, use Seaport Zones (or a similar
  conditional execution mechanism) to enforce that a hash of the TBA's
  contents has not changed between order signing and settlement.
  Alternatively, route through an escrow that locks the TBA's assets
  during the listing.
- **Buyer protection:** consumers integrating SAGA NFTs into DeFi
  protocols (collateral, lending, fractionalization) MUST treat TBA
  contents as untrusted at the moment of NFT receipt; only the NFT
  itself is bound by the on-chain transfer.

Re-audit reference: J-4 (OpenAI + Gemini consensus) in
`audits/2026-05-04-post-phase10-gap-matrix.md`.

### `tokenURI` length expectations

`SAGADirectoryIdentity.tokenURI` returns `_baseTokenURI` concatenated
with the `tokenId` decimal representation. The base URI is bounded
through `SAGAValidation.validateUrl` (Phase 8 F-6, 1024-byte cap,
http/https only). The resulting `tokenURI` therefore stays under
1024 + 78 (max `uint256` decimal length) = 1102 bytes — well within the
ERC-721 metadata recommendations and within the maximum URL length of
common indexers and marketplaces (Cloudflare 8192, OpenSea ~2048, the
Graph subgraph indexer 4096).

Indexers integrating SAGA identity NFTs may safely allocate a 1500-byte
buffer for the `tokenURI` string. The base URI is rotated through the
queue + apply pattern (Phase 9 G-8) with a 24-hour timelock; an indexer
that recomputes `tokenURI` per-block is robust to base URI rotations
without backfill.

`SAGAAgentIdentity` and `SAGAOrgIdentity` follow the same construction.

Re-audit reference: G-15 in
`audits/2026-05-04-post-phase8-gap-matrix.md`.

### Scoped registration trust chain

`SAGAAgentIdentity.registerAgentInDirectory` and
`SAGAOrgIdentity.registerOrgInDirectory` write
`_directoryIds[tokenId]` BEFORE calling
`SAGAHandleRegistry.registerScopedHandle`. The registry validates that
the directory exists, is on a trusted contract, and is currently
`active` — but the identity contract itself does NOT independently
re-validate. The trust chain is:

```
identity contract → handleRegistry.registerScopedHandle
                  → trustedDirectoryContracts[directory] gate
                  → IDirectoryStatus(directory).directoryStatus(...)
                  → contract owner of trustedDirectoryContracts mapping
```

Three hops. The mitigation is the Phase 9 (G-11) trust-mapping
combined with the Phase 10 (M-1) post-handoff timelock on
`setTrustedDirectoryContract`, both gated by the Safe multisig's
threshold. A defense-in-depth secondary check at the identity-contract
level is not currently implemented; the cost (an extra `STATICCALL`
per scoped registration) outweighs the marginal benefit given the
current trust model. Re-audit reference: M-6 in
`audits/2026-05-04-post-phase9-gap-matrix.md`.

### `ERC721Enumerable` gas overhead

All three identity contracts inherit `ERC721Enumerable`, which adds
~50K gas per transfer to maintain the index arrays. For agent/org
NFTs that mint once and rarely transfer, this cost is paid once at
mint. For directory NFTs in the governance-rescue flow (Phase 9 G-1

- Phase 10 H-1), it applies to each transfer.

Off-chain enumeration via `Transfer` events is functionally equivalent
for indexers; if a future major version drops `ERC721Enumerable`, mint
costs decrease ~30%. This is left as a future-version decision rather
than a current-phase change because it would invalidate cached
on-chain views (`tokenByIndex`, `tokenOfOwnerByIndex`,
`totalSupply` is via the Enumerable extension, not the base ERC-721).
Re-audit reference: I-3 in
`audits/2026-05-04-post-phase9-gap-matrix.md`.

## License

Apache-2.0
