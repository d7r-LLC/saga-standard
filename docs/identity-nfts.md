# SAGA Identity NFTs

SAGA identity NFTs provide verifiable, on-chain proof of agent and organization identity. When an agent registers on-chain, it receives an ERC-721 NFT that permanently links its handle to a wallet address, with an ERC-6551 Token Bound Account (TBA) that can hold assets and sign messages on the agent's behalf.

## Components

| Component           | Package                    | Role                                                              |
| ------------------- | -------------------------- | ----------------------------------------------------------------- |
| Smart contracts     | `@saga-standard/contracts` | On-chain handle registry and ERC-721 identity tokens              |
| Server indexer      | `@epicdm/saga-server`      | Watches Base for contract events, syncs to D1 database            |
| Client chain module | `@epicdm/saga-client`      | TypeScript functions for minting, resolving, and checking handles |
| CLI commands        | `@epicdm/saga-cli`         | `saga register --on-chain`, `saga resolve`, `saga register-org`   |

## Agent Registration Flow

```
User                CLI                  Base Chain           Server Indexer        Server API
 │                   │                      │                      │                   │
 │  saga register    │                      │                      │                   │
 │  --on-chain       │                      │                      │                   │
 │  --handle foo     │                      │                      │                   │
 │──────────────────>│                      │                      │                   │
 │                   │                      │                      │                   │
 │                   │  isHandleAvailable()  │                      │                   │
 │                   │─────────────────────>│                      │                   │
 │                   │  true                │                      │                   │
 │                   │<─────────────────────│                      │                   │
 │                   │                      │                      │                   │
 │                   │  registerAgent()     │                      │                   │
 │                   │─────────────────────>│                      │                   │
 │                   │  txHash              │                      │                   │
 │                   │<─────────────────────│                      │                   │
 │                   │                      │                      │                   │
 │                   │  waitForReceipt()    │                      │                   │
 │                   │─────────────────────>│                      │                   │
 │                   │  receipt + logs      │  AgentRegistered     │                   │
 │                   │<─────────────────────│  event emitted       │                   │
 │                   │                      │─────────────────────>│                   │
 │                   │                      │                      │  INSERT agents    │
 │                   │                      │                      │─────────────────>│
 │                   │                      │                      │                   │
 │                   │  poll /v1/resolve/foo│                      │                   │
 │                   │──────────────────────────────────────────────────────────────>│
 │                   │  { handle, tokenId, tbaAddress, ... }                         │
 │                   │<──────────────────────────────────────────────────────────────│
 │                   │                      │                      │                   │
 │  Registration     │                      │                      │                   │
 │  complete         │                      │                      │                   │
 │<──────────────────│                      │                      │                   │
```

Step by step:

1. User runs `saga register --on-chain --handle <handle>`.
2. CLI loads the wallet from the local keystore and creates viem clients for the target chain.
3. CLI calls `isHandleAvailable()` via the HandleRegistry contract to check the handle is not taken.
4. CLI calls `mintAgentIdentity()` which sends a `registerAgent(handle, hubUrl)` transaction to the SAGAAgentIdentity contract.
5. The contract registers the handle in the HandleRegistry and mints an ERC-721 token to the caller.
6. The contract emits an `AgentRegistered` event with `tokenId`, `handle`, `owner`, `hubUrl`, and `registeredAt`.
7. CLI waits for the transaction receipt and extracts the `tokenId` from the event log.
8. CLI computes the ERC-6551 TBA address deterministically (no on-chain call needed).
9. The server's indexer (polling Base every 15s on testnet) picks up the `AgentRegistered` event and writes the agent record to D1.
10. CLI polls `GET /v1/resolve/:handle` until the server returns a result.
11. CLI displays the final registration result: tokenId, TBA address, wallet, chain.

## Organization Registration Flow

Organization registration follows the same pattern with `SAGAOrgIdentity.registerOrganization(handle, name)`. The CLI command is `saga register-org --handle <handle> --name <name>`.

Organizations and agents share the same handle namespace via the SAGAHandleRegistry, so a handle claimed by an agent cannot be claimed by an org and vice versa.

## Handle Resolution

`GET /v1/resolve/:handle` reads from the server's D1 database, which is kept in sync by the indexer. The response includes:

- `entityType` ("agent" or "org")
- `handle`, `walletAddress`, `chain`
- `tokenId`, `tbaAddress`, `contractAddress`, `mintTxHash` (null for off-chain registrations)
- `homeHubUrl` (agents only), `name` (orgs only)

Resolution works for both on-chain and off-chain registrations. Off-chain agents (registered via `POST /v1/agents`) have null NFT fields.

## Data Flow

```
                    Base Chain
                        │
                   AgentRegistered / OrgRegistered events
                        │
                        ▼
                  Server Indexer ──── polls every 15s (testnet)
                        │                  30s (mainnet)
                        │
                        ▼
                     D1 Database
                   (agents + organizations tables)
                        │
                        ▼
                   Server API
              /v1/resolve/:handle
              /v1/agents/:handle
              /v1/orgs/:handle
```

## Token Bound Accounts (ERC-6551)

Every SAGA identity NFT gets a deterministic Token Bound Account. The TBA address is computed using the CREATE2 formula from the ERC-6551 spec:

```
TBA = CREATE2(
  salt: 0,
  implementation: 0x55266d75D1a14E4572138116aF39863Ed6596E7F,
  chainId: 84532 (Base Sepolia) or 8453 (Base),
  tokenContract: SAGAAgentIdentity or SAGAOrgIdentity address,
  tokenId: the minted token ID
)
```

The TBA is computed off-chain. No on-chain call is needed. The `computeTBAAddress()` function in `@saga-standard/contracts` handles this.

The TBA can:

- Receive ETH and ERC-20 tokens
- Hold other NFTs (e.g., skill badges in future versions)
- Sign messages (via the NFT owner)
- Act as an on-chain identity for the agent

## Backward Compatibility

On-chain registration is opt-in. The existing off-chain flow (`saga register <handle>` without `--on-chain`) continues to work unchanged. Off-chain agents resolve correctly through the API but have null NFT fields.
