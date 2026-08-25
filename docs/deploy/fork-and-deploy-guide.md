> **FlowState Document:** `docu_aRUOqC-2V2`

# Fork-and-Deploy Guide: Running Your Own SAGA Directory

This guide walks you through deploying your own SAGA directory from scratch. By the end, you'll have a running server that can host agents, relay messages, and federate with other SAGA directories.

## Prerequisites

Before you start, make sure you have:

- **Node.js 20+** and **pnpm** installed
- A **Cloudflare account** (free tier works for development)
- The **Wrangler CLI** installed: `pnpm add -g wrangler`
- A wallet with **ETH on Base Sepolia** (for testnet) or **Base mainnet**
  - Get testnet ETH from the [Base Sepolia Faucet](https://www.coinbase.com/faucets/base-sepolia-testnet)
- **Foundry** installed (for contract deployment): `curl -L https://foundry.paradigm.xyz | bash && foundryup`

## 1. Fork and Install

Fork the [saga-standard repository](https://github.com/d7r-LLC/saga-standard), then clone your fork:

```bash
git clone https://github.com/<your-org>/saga-standard.git
cd saga-standard
pnpm install
```

Build all packages:

```bash
pnpm run build
```

## 2. Create a Wallet

The SAGA CLI stores encrypted wallets locally. Create one for your directory operator:

```bash
pnpm --filter @d7r/saga-cli exec saga wallet create --name operator
```

Note the wallet address. You'll need it for contract deployment and NFT minting.

Fund it with testnet ETH if deploying to Base Sepolia:

```bash
# Get your wallet address
pnpm --filter @d7r/saga-cli exec saga wallet list
```

## 3. Deploy Smart Contracts

SAGA uses four identity contracts plus a TBA helper. The deploy script handles all five.

### 3a. Configure deployment

Edit `packages/contracts/deploy.config.yaml` with your settings:

- Set your RPC URL for the target chain
- Set your deployer wallet (can be the same as operator)
- Configure the Safe multisig address (or use a regular EOA for development)

### 3b. Run the deployment

For testnet (Base Sepolia):

```bash
pnpm --filter @d7r/saga-cli exec saga deploy --chain base-sepolia --broadcast
```

For mainnet (requires `--production` flag):

```bash
pnpm --filter @d7r/saga-cli exec saga deploy --chain base --broadcast --production
```

The deploy command:

1. Builds the contracts with Foundry
2. Deploys all five contracts (HandleRegistry, AgentIdentity, OrgIdentity, DirectoryIdentity, TBAHelper)
3. Authorizes identity contracts on the registry
4. Updates `packages/contracts/src/ts/addresses.ts` with deployed addresses
5. Saves deployment details to `packages/contracts/deployments/<chain>.json`

After deployment, rebuild the contracts package:

```bash
cd packages/contracts && pnpm run build && cd ../..
```

### 3c. Verify contracts (optional but recommended)

Contract verification happens automatically if your deploy config includes a block explorer API key. If it didn't, verify manually:

```bash
forge verify-contract <ADDRESS> SAGAHandleRegistry --chain base-sepolia
```

Repeat for each contract.

## 4. Create Cloudflare Resources

Log into Wrangler:

```bash
wrangler login
```

Create the required Cloudflare resources:

```bash
# D1 Database
wrangler d1 create saga-your-directory-dev

# KV Namespaces
wrangler kv namespace create SESSIONS
wrangler kv namespace create INDEXER_STATE
wrangler kv namespace create RELAY_MAILBOX

# R2 Bucket
wrangler r2 bucket create saga-docs-dev
```

Note each resource ID from the output.

## 5. Configure Wrangler

Copy the template and fill in your values:

```bash
cp docs/deploy/wrangler.template.toml packages/server/wrangler.toml
```

Open `packages/server/wrangler.toml` and replace all `<PLACEHOLDER>` values:

| Placeholder             | Where to find it                                                   |
| ----------------------- | ------------------------------------------------------------------ |
| `<YOUR_WORKER_NAME>`    | Choose a name (e.g. `saga-my-directory`)                           |
| `<YOUR_DIRECTORY_NAME>` | Display name (e.g. `My SAGA Directory`)                            |
| `<DEPLOYED_*_CONTRACT>` | From `packages/contracts/src/ts/addresses.ts` after deployment     |
| `<BLOCK_NUMBER>`        | Block number of your first contract deployment transaction         |
| `<YOUR_DIRECTORY_ID>`   | The identifier you'll use when minting your Directory NFT (step 7) |
| `<D1_DATABASE_ID>`      | From `wrangler d1 create` output                                   |
| `<*_KV_NAMESPACE_ID>`   | From each `wrangler kv namespace create` output (one per binding)  |
| `<YOUR_BUCKET_NAME>`    | From `wrangler r2 bucket create` output                            |
| `<RANDOM_SECRET>`       | Generate with `openssl rand -hex 32`                               |

## 6. Run D1 Migrations

Apply the database schema:

```bash
cd packages/server
wrangler d1 migrations apply saga-your-directory-dev --env dev
```

## 7. Mint Your Directory NFT

Your directory needs an on-chain identity. This mints an ERC-721 NFT on the SAGADirectoryIdentity contract and registers your `directoryId` as a handle.

Choose a `directoryId` that's unique and descriptive (e.g. `my-org-hub`, `acme-ai-dir`). This becomes your directory's permanent on-chain identity.

```bash
pnpm --filter @d7r/saga-cli exec saga register-directory \
  --directory-id "my-hub" \
  --url "https://my-hub.example.com" \
  --wallet operator \
  --chain eip155:84532
```

The `--url` should be the URL where your SAGA server will be deployed (from step 8). The `--operator` defaults to the signing wallet if not specified.

This command:

1. Checks that the directoryId is available on-chain
2. Calls `registerDirectory()` on the SAGADirectoryIdentity contract
3. Waits for the server indexer to pick up the new directory (if server is running)

## 8. Deploy the Server

Deploy to Cloudflare Workers:

```bash
cd packages/server
wrangler deploy --env dev
```

Note the deployed URL (e.g. `https://saga-my-directory-dev.<your-subdomain>.workers.dev`).

Verify the deployment:

```bash
curl https://saga-my-directory-dev.<your-subdomain>.workers.dev/v1/server
```

You should see a JSON response with your server name and capabilities.

### Set the operator secret

Federation requires your directory's operator wallet to sign authentication challenges. Set the private key as a Wrangler secret (never a plain environment variable):

```bash
wrangler secret put OPERATOR_PRIVATE_KEY --env dev
```

Paste the private key (hex format with 0x prefix) when prompted. This must be the private key for the wallet that minted your Directory NFT.

### Trigger the indexer

The indexer runs on a cron schedule (every minute), but you can trigger it immediately:

```bash
curl -X POST https://saga-my-directory-dev.<your-subdomain>.workers.dev/admin/reindex \
  -H "Authorization: Bearer <YOUR_ADMIN_SECRET>"
```

### Verify your directory appears

```bash
curl https://saga-my-directory-dev.<your-subdomain>.workers.dev/v1/directories
```

Your directory should appear in the list once the indexer processes the `DirectoryRegistered` event.

## 9. Enable Federation

Federation allows your directory to exchange messages with other SAGA directories. It requires `LOCAL_DIRECTORY_ID` to be set in your wrangler config (already done in step 5).

Federation is enabled automatically when `LOCAL_DIRECTORY_ID` is set. The federation endpoint (`/v1/relay/federation`) accepts WebSocket connections from other directories.

### Register with other directories

For your directory to federate with another directory, both directories need to know about each other. This happens automatically through the on-chain registry: the chain indexer on each directory picks up `DirectoryRegistered` events and adds them to the local D1 database.

If the other directory's indexer hasn't picked up your registration yet, you can trigger it:

```bash
# On the other directory's server (if you have admin access)
curl -X POST https://other-directory.example.com/admin/reindex \
  -H "Authorization: Bearer <THEIR_ADMIN_SECRET>"
```

### Test federation

Register an agent on your directory:

```bash
pnpm --filter @d7r/saga-cli exec saga register my-agent \
  --on-chain \
  --wallet operator \
  --server https://saga-my-directory-dev.<your-subdomain>.workers.dev \
  --chain eip155:84532
```

The agent's full identity will be `my-agent@my-hub`. Agents on other directories can send messages to this address.

## 10. Verify Everything Works

Run through this checklist:

- [ ] Server responds at `/v1/server` with correct name and capabilities
- [ ] `/v1/directories` lists your directory
- [ ] `/v1/resolve/my-hub` resolves your directory handle
- [ ] Agent registration works (`saga register`)
- [ ] WebSocket relay connects (`/v1/relay`)
- [ ] Federation endpoint responds (`/v1/relay/federation`) when `LOCAL_DIRECTORY_ID` is set

## Environment Variables Reference

| Variable                      | Required | Description                                                  |
| ----------------------------- | -------- | ------------------------------------------------------------ |
| `SERVER_NAME`                 | No       | Display name for your directory                              |
| `SUPPORTED_CHAINS`            | No       | Comma-separated CAIP-2 chain IDs                             |
| `BASE_RPC_URL`                | Yes\*    | Base RPC endpoint for the indexer                            |
| `AGENT_IDENTITY_CONTRACT`     | Yes\*    | Deployed SAGAAgentIdentity address                           |
| `ORG_IDENTITY_CONTRACT`       | Yes\*    | Deployed SAGAOrgIdentity address                             |
| `DIRECTORY_IDENTITY_CONTRACT` | Yes\*    | Deployed SAGADirectoryIdentity address                       |
| `HANDLE_REGISTRY_CONTRACT`    | Yes\*    | Deployed SAGAHandleRegistry address                          |
| `INDEXER_CHAIN`               | No       | CAIP-2 chain ID (default: eip155:84532)                      |
| `INDEXER_START_BLOCK`         | No       | Starting block for indexer                                   |
| `ADMIN_SECRET`                | No       | Enables `/admin/reindex` endpoint                            |
| `LOCAL_DIRECTORY_ID`          | No       | Enables federation when set                                  |
| `OPERATOR_PRIVATE_KEY`        | No       | Operator wallet key for federation signing (Wrangler secret) |

\*Required for the chain indexer. Without these, the server runs but doesn't index on-chain events.

## Troubleshooting

**"Federation not enabled" when connecting to /v1/relay/federation**
Set `LOCAL_DIRECTORY_ID` in your wrangler.toml to match the directoryId you used when minting the NFT.

**Indexer not picking up events**
Check that `BASE_RPC_URL` is reachable and `INDEXER_START_BLOCK` is at or before your contract deployment block. Trigger a manual reindex via `/admin/reindex`.

**"Directory not found" when federating**
Both directories need to have indexed each other's `DirectoryRegistered` events. Trigger reindex on both servers.

**Handle already taken**
Handles are global across all entity types (agents, orgs, directories). Choose a unique directoryId that hasn't been registered as an agent or org handle.
