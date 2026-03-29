> **FlowState Document:** `docu_2BatrZrkQm`

# Phase 7D: Fork-and-Deploy Guide -- Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable any developer to fork saga-standard and deploy their own SAGA directory that federates with existing directories.

**Architecture:** Adds a `mintDirectoryIdentity` helper to the client chain module and a `register-directory` CLI command for on-chain directory NFT minting. Creates a wrangler deployment template with documented environment variables and a comprehensive fork-and-deploy guide covering the full workflow from fork through federation verification.

**Tech Stack:** TypeScript, viem (on-chain), Commander.js (CLI), Cloudflare Workers/Wrangler (deployment), vitest (tests)

**Working directory:** `.worktrees/feat-phase7d-docs` (branch: `feat/phase7d-docs`, base: `dev`)

---

## File Structure

| Action | Path                                              | Responsibility                          |
| ------ | ------------------------------------------------- | --------------------------------------- |
| Modify | `packages/client/src/chain.ts`                    | Add `mintDirectoryIdentity()` function  |
| Modify | `packages/client/src/__tests__/chain.test.ts`     | Add tests for `mintDirectoryIdentity()` |
| Modify | `packages/client/src/index.ts`                    | Export `mintDirectoryIdentity`          |
| Create | `packages/cli/src/commands/register-directory.ts` | CLI command to mint Directory NFT       |
| Modify | `packages/cli/src/index.ts`                       | Register `register-directory` command   |
| Create | `docs/deploy/wrangler.template.toml`              | Documented wrangler config template     |
| Create | `docs/deploy/fork-and-deploy-guide.md`            | Comprehensive deployment guide          |

---

### Task 1: Add `mintDirectoryIdentity` to Client Chain Module

**Files:**

- Modify: `packages/client/src/chain.ts`
- Modify: `packages/client/src/__tests__/chain.test.ts`
- Modify: `packages/client/src/index.ts`

- [ ] **Step 1: Add mock for `getDirectoryIdentityConfig` in test file**

In `packages/client/src/__tests__/chain.test.ts`, add the mock constant and update the `vi.mock` block.

Add after the existing `MOCK_` constants (after line 12):

```typescript
const MOCK_DIRECTORY_CONTRACT = '0x5555555555555555555555555555555555555555' as const
```

Inside the `vi.mock('@saga-standard/contracts', () => ({` block, add after `getOrgIdentityConfig`:

```typescript
  getDirectoryIdentityConfig: () => ({
    address: MOCK_DIRECTORY_CONTRACT,
    abi: [
      {
        type: 'function',
        name: 'registerDirectory',
        inputs: [
          { name: 'directoryId', type: 'string' },
          { name: 'url', type: 'string' },
          { name: 'operator', type: 'address' },
          { name: 'conformanceLevel', type: 'string' },
        ],
        outputs: [{ type: 'uint256' }],
        stateMutability: 'nonpayable',
      },
    ],
  }),
```

Update the dynamic import to include `mintDirectoryIdentity`:

```typescript
const {
  mintAgentIdentity,
  mintOrgIdentity,
  mintDirectoryIdentity,
  resolveHandleOnChain,
  isHandleAvailable,
} = await import('../chain')
```

- [ ] **Step 2: Write failing tests for `mintDirectoryIdentity`**

Add this test suite at the end of `packages/client/src/__tests__/chain.test.ts`, before the final blank line:

```typescript
// -- mintDirectoryIdentity ---------------------------------------------------

describe('mintDirectoryIdentity', () => {
  it('calls writeContract with registerDirectory and correct args', async () => {
    const walletClient = createMockWalletClient()
    const publicClient = createMockPublicClient()

    await mintDirectoryIdentity({
      directoryId: 'my-directory',
      url: 'https://my-directory.example.com',
      operatorWallet: '0xaabbccddee1234567890aabbccddee1234567890',
      conformanceLevel: 'full',
      walletClient,
      publicClient,
      chain: 'base-sepolia',
    }).catch(() => {
      /* expected -- no DirectoryRegistered event in empty logs */
    })

    expect(walletClient.writeContract).toHaveBeenCalledWith(
      expect.objectContaining({
        functionName: 'registerDirectory',
        args: [
          'my-directory',
          'https://my-directory.example.com',
          '0xaabbccddee1234567890aabbccddee1234567890',
          'full',
        ],
      })
    )
  })

  it('waits for transaction receipt after writeContract', async () => {
    const walletClient = createMockWalletClient()
    const waitFn = vi.fn().mockResolvedValue({ status: 'success', logs: [] })
    const publicClient = createMockPublicClient({
      waitForTransactionReceipt: waitFn,
    })

    await mintDirectoryIdentity({
      directoryId: 'my-directory',
      url: 'https://my-directory.example.com',
      operatorWallet: '0xaabbccddee1234567890aabbccddee1234567890',
      conformanceLevel: 'full',
      walletClient,
      publicClient,
      chain: 'base-sepolia',
    }).catch(() => {
      /* expected */
    })

    expect(waitFn).toHaveBeenCalledWith({ hash: MOCK_TX })
  })

  it('throws when DirectoryRegistered event is missing from receipt', async () => {
    const walletClient = createMockWalletClient()
    const publicClient = createMockPublicClient()

    await expect(
      mintDirectoryIdentity({
        directoryId: 'my-directory',
        url: 'https://my-directory.example.com',
        operatorWallet: '0xaabbccddee1234567890aabbccddee1234567890',
        conformanceLevel: 'full',
        walletClient,
        publicClient,
        chain: 'base-sepolia',
      })
    ).rejects.toThrow('DirectoryRegistered event not found')
  })

  it('throws on reverted transaction', async () => {
    const walletClient = createMockWalletClient()
    const publicClient = createMockPublicClient({
      waitForTransactionReceipt: vi.fn().mockResolvedValue({ status: 'reverted', logs: [] }),
    })

    await expect(
      mintDirectoryIdentity({
        directoryId: 'my-directory',
        url: 'https://my-directory.example.com',
        operatorWallet: '0xaabbccddee1234567890aabbccddee1234567890',
        conformanceLevel: 'full',
        walletClient,
        publicClient,
        chain: 'base-sepolia',
      })
    ).rejects.toThrow('Transaction reverted while minting directory identity')
  })

  it('throws on chain mismatch between client and options', async () => {
    const walletClient = createMockWalletClient(8453) // mainnet
    const publicClient = createMockPublicClient()

    await expect(
      mintDirectoryIdentity({
        directoryId: 'my-directory',
        url: 'https://my-directory.example.com',
        operatorWallet: '0xaabbccddee1234567890aabbccddee1234567890',
        conformanceLevel: 'full',
        walletClient,
        publicClient,
        chain: 'base-sepolia', // sepolia, mismatch!
      })
    ).rejects.toThrow('Chain mismatch')
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd packages/client && npx vitest run src/__tests__/chain.test.ts`
Expected: FAIL with "mintDirectoryIdentity is not a function" or "not exported"

- [ ] **Step 4: Implement `mintDirectoryIdentity` in chain.ts**

In `packages/client/src/chain.ts`, add `getDirectoryIdentityConfig` to the imports (line 10):

```typescript
import {
  type SupportedChain,
  computeTBAAddress,
  entityTypeFromNumber,
  getAgentIdentityConfig,
  getDirectoryIdentityConfig,
  getHandleRegistryConfig,
  getOrgIdentityConfig,
} from '@saga-standard/contracts'
```

Add the function after `mintOrgIdentity` (after line 182):

```typescript
/**
 * Mint a SAGA Directory Identity NFT on-chain.
 *
 * Calls SAGADirectoryIdentity.registerDirectory(directoryId, url, operator, conformanceLevel)
 * and waits for the transaction receipt. Extracts tokenId from the
 * DirectoryRegistered event log and computes the TBA address.
 */
export async function mintDirectoryIdentity(options: {
  directoryId: string
  url: string
  operatorWallet: string
  conformanceLevel: string
  walletClient: WalletClient
  publicClient: PublicClient
  chain: SupportedChain
}): Promise<MintResult> {
  const { directoryId, url, operatorWallet, conformanceLevel, walletClient, publicClient, chain } =
    options
  const config = getDirectoryIdentityConfig(chain)

  assertChainMatch(walletClient, publicClient, chain)

  const account = walletClient.account
  if (!account) {
    throw new Error('WalletClient must have an account')
  }

  const txHash = await walletClient.writeContract({
    ...config,
    functionName: 'registerDirectory',
    args: [directoryId, url, operatorWallet as `0x${string}`, conformanceLevel],
    account,
    chain: walletClient.chain,
  })

  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash })

  if (receipt.status === 'reverted') {
    throw new Error('Transaction reverted while minting directory identity')
  }

  // Find DirectoryRegistered event in logs
  let tokenId: bigint | undefined
  for (const log of receipt.logs) {
    try {
      const decoded = decodeEventLog({
        abi: config.abi,
        data: log.data,
        topics: log.topics,
      })
      if (decoded.eventName === 'DirectoryRegistered') {
        const args = decoded.args as { tokenId: bigint }
        tokenId = args.tokenId
        break
      }
    } catch {
      // Not an event from this ABI, skip
    }
  }

  if (tokenId === undefined) {
    throw new Error('DirectoryRegistered event not found in transaction receipt')
  }

  const tbaAddress = computeTBAAddress({
    implementation: TBA_IMPLEMENTATION,
    chainId: CHAIN_IDS[chain],
    tokenContract: config.address,
    tokenId,
  })

  return { tokenId, txHash, tbaAddress }
}
```

- [ ] **Step 5: Export `mintDirectoryIdentity` from client index.ts**

In `packages/client/src/index.ts`, update the chain exports (line 12-17):

```typescript
export {
  mintAgentIdentity,
  mintOrgIdentity,
  mintDirectoryIdentity,
  resolveHandleOnChain,
  isHandleAvailable,
} from './chain'
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd packages/client && npx vitest run src/__tests__/chain.test.ts`
Expected: All tests PASS (existing 14 + new 5 = 19 tests)

- [ ] **Step 7: Commit**

```bash
git add packages/client/src/chain.ts packages/client/src/__tests__/chain.test.ts packages/client/src/index.ts
git commit -m "$(cat <<'EOF'
feat(client): add mintDirectoryIdentity for on-chain directory NFT minting

Built with Epic Flowstate
EOF
)"
```

---

### Task 2: Add `register-directory` CLI Command

**Files:**

- Create: `packages/cli/src/commands/register-directory.ts`
- Modify: `packages/cli/src/index.ts`

- [ ] **Step 1: Create the `register-directory` command**

Create `packages/cli/src/commands/register-directory.ts`:

```typescript
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { Command } from 'commander'
import chalk from 'chalk'
import { privateKeyToAccount } from 'viem/accounts'
import { SagaServerClient, isHandleAvailable, mintDirectoryIdentity } from '@epicdm/saga-client'
import { loadConfig } from '../config'
import { getWalletInfo, loadWalletPrivateKey } from '../wallet-store'
import { chainFromCaip2, createViemClients, waitForIndexer } from '../cli-chain-helpers'

export const registerDirectoryCommand = new Command('register-directory')
  .description('Register a directory on-chain with a SAGA Directory Identity NFT')
  .requiredOption('--directory-id <id>', 'Directory identifier (e.g. "my-hub")')
  .requiredOption('--url <url>', 'Directory server URL (e.g. "https://my-hub.example.com")')
  .option('--operator <address>', 'Operator wallet address (defaults to signing wallet)')
  .option('--conformance-level <level>', 'Conformance level', 'full')
  .option('--wallet <name>', 'Wallet name', 'default')
  .option('--password <password>', 'Wallet password', 'saga-default-password')
  .option('--server <url>', 'Server URL (defaults to configured default)')
  .option('--chain <chain>', 'Chain ID', 'eip155:8453')
  .action(async opts => {
    // 1. Load wallet
    const walletInfo = getWalletInfo(opts.wallet)
    if (!walletInfo) {
      console.error(chalk.red(`Wallet "${opts.wallet}" not found. Run: saga wallet create`))
      process.exit(1)
    }

    const privateKeyHex = loadWalletPrivateKey(opts.wallet, opts.password)
    const account = privateKeyToAccount(privateKeyHex as `0x${string}`)

    const operatorWallet = opts.operator ?? account.address

    // 2. Resolve server (optional -- indexer wait is skipped without one)
    const config = loadConfig()
    const serverUrl = opts.server ?? config.defaultServer

    const chain = chainFromCaip2(opts.chain)

    if (serverUrl) console.log(chalk.dim(`Server:       ${serverUrl}`))
    console.log(chalk.dim(`Wallet:       ${account.address}`))
    console.log(chalk.dim(`Directory ID: ${opts.directoryId}`))
    console.log(chalk.dim(`URL:          ${opts.url}`))
    console.log(chalk.dim(`Operator:     ${operatorWallet}`))
    console.log(chalk.dim(`Conformance:  ${opts.conformanceLevel}`))
    console.log()

    try {
      const { publicClient, walletClient } = createViemClients({
        privateKeyHex,
        chain,
      })

      // Check handle availability (directoryId is registered as a handle)
      console.log(chalk.dim('Checking directory ID availability on-chain...'))
      const available = await isHandleAvailable({
        handle: opts.directoryId,
        publicClient,
        chain,
      })

      if (!available) {
        console.error(chalk.red(`Directory ID "${opts.directoryId}" is already taken on-chain.`))
        process.exit(1)
      }

      console.log(chalk.green(`Directory ID "${opts.directoryId}" is available.`))

      // Mint directory NFT
      console.log(chalk.dim('Minting SAGA Directory Identity NFT...'))
      const result = await mintDirectoryIdentity({
        directoryId: opts.directoryId,
        url: opts.url,
        operatorWallet,
        conformanceLevel: opts.conformanceLevel,
        walletClient,
        publicClient,
        chain,
      })

      console.log(chalk.green('NFT minted.'))
      console.log(chalk.dim(`  TX Hash: ${result.txHash}`))

      // Wait for indexer (only if server is configured)
      if (serverUrl) {
        console.log(chalk.dim('Waiting for server indexer...'))
        const client = new SagaServerClient({ serverUrl })
        try {
          const resolved = await waitForIndexer({ client, handle: opts.directoryId })
          console.log(chalk.dim(`  Indexed: ${resolved.walletAddress}`))
        } catch {
          console.log(chalk.yellow('  Indexer not available (skipped).'))
        }
      } else {
        console.log(chalk.dim('No server configured -- skipping indexer wait.'))
      }

      console.log()
      console.log(chalk.green.bold('Directory registered on-chain.'))
      console.log(`  Directory ID: ${opts.directoryId}`)
      console.log(`  URL:          ${opts.url}`)
      console.log(`  Operator:     ${operatorWallet}`)
      console.log(`  Conformance:  ${opts.conformanceLevel}`)
      console.log(`  Token ID:     ${result.tokenId}`)
      console.log(`  TBA Address:  ${result.tbaAddress}`)
      console.log(`  Mint TX:      ${result.txHash}`)
      console.log(`  Wallet:       ${account.address}`)
      console.log(`  Chain:        ${chain}`)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(chalk.red(`Registration failed: ${message}`))
      process.exit(1)
    }
  })
```

- [ ] **Step 2: Register the command in CLI entry point**

In `packages/cli/src/index.ts`, add the import (after existing command imports):

```typescript
import { registerDirectoryCommand } from './commands/register-directory'
```

Add the command registration (after `registerOrgCommand` registration):

```typescript
program.addCommand(registerDirectoryCommand)
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd packages/cli && npx tsc --noEmit`
Expected: Clean compilation

- [ ] **Step 4: Commit**

```bash
git add packages/cli/src/commands/register-directory.ts packages/cli/src/index.ts
git commit -m "$(cat <<'EOF'
feat(cli): add register-directory command for minting Directory NFTs

Built with Epic Flowstate
EOF
)"
```

---

### Task 3: Create Wrangler Deployment Template

**Files:**

- Create: `docs/deploy/wrangler.template.toml`

- [ ] **Step 1: Create the template file**

Create `docs/deploy/wrangler.template.toml`:

```toml
# SAGA Server -- Wrangler Configuration Template
#
# Copy this file to packages/server/wrangler.toml and fill in your values.
# See docs/deploy/fork-and-deploy-guide.md for the full walkthrough.
#
# Required: Replace all <PLACEHOLDER> values before deploying.

name = "<YOUR_WORKER_NAME>"   # e.g. "saga-my-directory"
main = "src/index.ts"
compatibility_date = "2025-03-01"
compatibility_flags = ["nodejs_compat"]

[triggers]
crons = ["* * * * *"]    # Runs indexer every minute

# ---------- Development ----------

[env.dev]
name = "<YOUR_WORKER_NAME>-dev"

[env.dev.vars]
SERVER_NAME = "<YOUR_DIRECTORY_NAME>"       # e.g. "My SAGA Directory"
SUPPORTED_CHAINS = "eip155:84532"           # Base Sepolia for testing

# Chain indexer (Base Sepolia testnet)
BASE_RPC_URL = "https://sepolia.base.org"
AGENT_IDENTITY_CONTRACT = "<DEPLOYED_AGENT_CONTRACT>"
ORG_IDENTITY_CONTRACT = "<DEPLOYED_ORG_CONTRACT>"
DIRECTORY_IDENTITY_CONTRACT = "<DEPLOYED_DIRECTORY_CONTRACT>"
HANDLE_REGISTRY_CONTRACT = "<DEPLOYED_REGISTRY_CONTRACT>"
INDEXER_CHAIN = "eip155:84532"
INDEXER_START_BLOCK = "<BLOCK_NUMBER>"       # Block where your contracts were deployed

# Federation
LOCAL_DIRECTORY_ID = "<YOUR_DIRECTORY_ID>"   # Must match the directoryId used when minting your NFT

# Admin (set a strong random string)
ADMIN_SECRET = "<RANDOM_SECRET>"

# D1 Database
[[env.dev.d1_databases]]
binding = "DB"
database_name = "<YOUR_DB_NAME>-dev"        # e.g. "saga-my-directory-dev"
database_id = "<D1_DATABASE_ID>"            # From: wrangler d1 create <name>

# R2 Document Storage
[[env.dev.r2_buckets]]
binding = "STORAGE"
bucket_name = "<YOUR_BUCKET_NAME>-dev"      # e.g. "saga-docs-dev"

# KV Namespaces
[[env.dev.kv_namespaces]]
binding = "SESSIONS"
id = "<KV_NAMESPACE_ID>"                    # From: wrangler kv namespace create SESSIONS

[[env.dev.kv_namespaces]]
binding = "INDEXER_STATE"
id = "<KV_NAMESPACE_ID>"                    # From: wrangler kv namespace create INDEXER_STATE

[[env.dev.kv_namespaces]]
binding = "RELAY_MAILBOX"
id = "<KV_NAMESPACE_ID>"                    # From: wrangler kv namespace create RELAY_MAILBOX

# Durable Objects
[[env.dev.durable_objects.bindings]]
name = "RELAY_ROOM"
class_name = "RelayRoom"

[[env.dev.migrations]]
tag = "v1"
new_classes = ["RelayRoom"]

# ---------- Production ----------

[env.production]
name = "<YOUR_WORKER_NAME>"

[env.production.vars]
SERVER_NAME = "<YOUR_DIRECTORY_NAME>"
SUPPORTED_CHAINS = "eip155:8453"            # Base mainnet

# Chain indexer (Base mainnet)
BASE_RPC_URL = "https://mainnet.base.org"
AGENT_IDENTITY_CONTRACT = "<DEPLOYED_AGENT_CONTRACT>"
ORG_IDENTITY_CONTRACT = "<DEPLOYED_ORG_CONTRACT>"
DIRECTORY_IDENTITY_CONTRACT = "<DEPLOYED_DIRECTORY_CONTRACT>"
HANDLE_REGISTRY_CONTRACT = "<DEPLOYED_REGISTRY_CONTRACT>"
INDEXER_CHAIN = "eip155:8453"
INDEXER_START_BLOCK = "<BLOCK_NUMBER>"

# Federation
LOCAL_DIRECTORY_ID = "<YOUR_DIRECTORY_ID>"

# Admin
ADMIN_SECRET = "<RANDOM_SECRET>"

# D1 Database
[[env.production.d1_databases]]
binding = "DB"
database_name = "<YOUR_DB_NAME>"
database_id = "<D1_DATABASE_ID>"

# R2 Document Storage
[[env.production.r2_buckets]]
binding = "STORAGE"
bucket_name = "<YOUR_BUCKET_NAME>"

# KV Namespaces
[[env.production.kv_namespaces]]
binding = "SESSIONS"
id = "<KV_NAMESPACE_ID>"

[[env.production.kv_namespaces]]
binding = "INDEXER_STATE"
id = "<KV_NAMESPACE_ID>"

[[env.production.kv_namespaces]]
binding = "RELAY_MAILBOX"
id = "<KV_NAMESPACE_ID>"

# Durable Objects
[[env.production.durable_objects.bindings]]
name = "RELAY_ROOM"
class_name = "RelayRoom"

[[env.production.migrations]]
tag = "v1"
new_classes = ["RelayRoom"]
```

- [ ] **Step 2: Commit**

```bash
git add docs/deploy/wrangler.template.toml
git commit -m "$(cat <<'EOF'
docs: add wrangler deployment template for new directories

Built with Epic Flowstate
EOF
)"
```

---

### Task 4: Write Fork-and-Deploy Guide

**Files:**

- Create: `docs/deploy/fork-and-deploy-guide.md`

- [ ] **Step 1: Create the guide**

Create `docs/deploy/fork-and-deploy-guide.md`:

````markdown
# Fork-and-Deploy Guide: Running Your Own SAGA Directory

This guide walks you through deploying your own SAGA directory from scratch. By the end, you'll have a running server that can host agents, relay messages, and federate with other SAGA directories.

## Prerequisites

Before you start, make sure you have:

- **Node.js 20+** and **pnpm** installed
- A **Cloudflare account** (free tier works for development)
- The **Wrangler CLI** installed: `pnpm add -g wrangler`
- A wallet with **ETH on Base Sepolia** (for testnet) or **Base mainnet**
  - Get testnet ETH from the [Base Sepolia Faucet](https://www.coinbase.com/faucets/base-ethereum-goerli-faucet)
- **Foundry** installed (for contract deployment): `curl -L https://foundry.paradigm.xyz | bash && foundryup`

## 1. Fork and Install

Fork the [saga-standard repository](https://github.com/d7r-LLC/saga-standard), then clone your fork:

```bash
git clone https://github.com/<your-org>/saga-standard.git
cd saga-standard
pnpm install
```
````

Build all packages:

```bash
pnpm run build
```

## 2. Create a Wallet

The SAGA CLI stores encrypted wallets locally. Create one for your directory operator:

```bash
pnpm --filter cli exec saga wallet create --name operator
```

Note the wallet address. You'll need it for contract deployment and NFT minting.

Fund it with testnet ETH if deploying to Base Sepolia:

```bash
# Get your wallet address
pnpm --filter cli exec saga wallet list
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
pnpm --filter cli exec saga deploy --chain base-sepolia --broadcast
```

For mainnet (requires `--production` flag):

```bash
pnpm --filter cli exec saga deploy --chain base --broadcast --production
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
| `<KV_NAMESPACE_ID>`     | From each `wrangler kv namespace create` output                    |
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
pnpm --filter cli exec saga register-directory \
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
pnpm --filter cli exec saga register my-agent \
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

| Variable                      | Required | Description                             |
| ----------------------------- | -------- | --------------------------------------- |
| `SERVER_NAME`                 | No       | Display name for your directory         |
| `SUPPORTED_CHAINS`            | No       | Comma-separated CAIP-2 chain IDs        |
| `BASE_RPC_URL`                | Yes\*    | Base RPC endpoint for the indexer       |
| `AGENT_IDENTITY_CONTRACT`     | Yes\*    | Deployed SAGAAgentIdentity address      |
| `ORG_IDENTITY_CONTRACT`       | Yes\*    | Deployed SAGAOrgIdentity address        |
| `DIRECTORY_IDENTITY_CONTRACT` | Yes\*    | Deployed SAGADirectoryIdentity address  |
| `HANDLE_REGISTRY_CONTRACT`    | Yes\*    | Deployed SAGAHandleRegistry address     |
| `INDEXER_CHAIN`               | No       | CAIP-2 chain ID (default: eip155:84532) |
| `INDEXER_START_BLOCK`         | No       | Starting block for indexer              |
| `ADMIN_SECRET`                | No       | Enables `/admin/reindex` endpoint       |
| `LOCAL_DIRECTORY_ID`          | No       | Enables federation when set             |

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

````

- [ ] **Step 2: Verify no broken links or placeholder text**

Search the guide for any remaining `<PLACEHOLDER>` patterns that should be actual values. All `<PLACEHOLDER>` text in the guide should be clearly marked as values the user fills in (surrounded by angle brackets and described in the table).

- [ ] **Step 3: Commit**

```bash
git add docs/deploy/fork-and-deploy-guide.md
git commit -m "$(cat <<'EOF'
docs: add fork-and-deploy guide for running your own SAGA directory

Built with Epic Flowstate
EOF
)"
````

---

## Summary

| Task | Deliverable                                  | Type          |
| ---- | -------------------------------------------- | ------------- |
| 1    | `mintDirectoryIdentity()` function + 5 tests | Code (TDD)    |
| 2    | `register-directory` CLI command             | Code          |
| 3    | `wrangler.template.toml` deployment template | Configuration |
| 4    | Fork-and-deploy guide                        | Documentation |
