> **FlowState Document:** `docu_NLtY89SA_f`

# Base Mainnet Deployment Plan & Checklist

**Target Chain:** Base (chain ID 8453)
**Safe:** 0x3F31e7FE81F4f859FB630E1c97FB693f23a3f3B8 (threshold 3)
**Deployment Method:** Docker-isolated forge script via `saga deploy` CLI
**Production Gate:** Requires `--production` flag

## Contracts to Deploy

| Contract           | Constructor Args                                       | Dependencies                               |
| ------------------ | ------------------------------------------------------ | ------------------------------------------ |
| SAGAHandleRegistry | none (deployer becomes owner)                          | —                                          |
| SAGAAgentIdentity  | `address registry`                                     | SAGAHandleRegistry                         |
| SAGAOrgIdentity    | `address registry`                                     | SAGAHandleRegistry                         |
| SAGATBAHelper      | `address erc6551Registry`, `address tbaImplementation` | Canonical ERC-6551 Registry, Tokenbound V3 |

**Post-deploy transactions (included in Deploy.s.sol):**

- `registry.setAuthorizedContract(agentIdentity, true)`
- `registry.setAuthorizedContract(orgIdentity, true)`

**Total transactions:** 6 (4 deploys + 2 authorizations)

---

## Pre-Deployment Checklist

### 1. Resolve Testnet Open Issues

- [ ] Fund Base Sepolia deployer wallet (~0.001 ETH via faucet)
- [ ] Redeploy SAGAOrgIdentity on Base Sepolia using `DeployOrg.s.sol`
- [ ] Update `addresses.ts` with new OrgIdentity address
- [ ] Verify org registration works end-to-end on testnet
- [ ] Run full test suite (`pnpm test`) — all packages green

### 2. Safe Multisig Setup

- [ ] Verify Safe at `0x3F31e7FE81F4f859FB630E1c97FB693f23a3f3B8` is deployed on Base mainnet
- [ ] Confirm Safe has 3+ signers configured
- [ ] Confirm threshold is 3 (matches `deploy.config.yaml`)
- [ ] Identify all signers and confirm availability for signing ceremony
- [ ] Fund Safe with ~0.05 ETH on Base for gas (deploy + auth transactions)

### 3. External Contract Verification

- [ ] Verify ERC-6551 Registry exists at `0x000000006551c19487814612e58FE06813775758` on Base mainnet
  ```bash
  cast code 0x000000006551c19487814612e58FE06813775758 --rpc-url https://mainnet.base.org
  ```
- [ ] Identify and verify Tokenbound V3 implementation address on Base mainnet
- [ ] Update `deploy.config.yaml` → `base.external.tbaImplementation` with verified address

### 4. 1Password Vault Setup

- [ ] Verify `saga-prod` vault exists in 1Password
- [ ] Create item: `base-mainnet-signer`
  - Field: `password` → deployer private key (EOA that proposes to Safe)
- [ ] Create item: `base-mainnet-addresses`
  - Fields: SAGAHandleRegistry, SAGAAgentIdentity, SAGAOrgIdentity, SAGATBAHelper, deployedAt, safeTxHash
  - (Will be populated during finalization)
- [ ] Verify item: `basescan-api-key`
  - Field: `password` → Basescan API key (shared between testnet/mainnet)
- [ ] Generate 1Password service account token scoped to `saga-prod` vault
- [ ] Store token in `.env` as `OP_SERVICE_ACCOUNT_TOKEN`
- [ ] Test token access: `op read "op://saga-prod/base-mainnet-signer/password"`

### 5. Deployer Wallet Setup

- [ ] Generate or designate mainnet deployer EOA
- [ ] Store private key in `saga-prod/base-mainnet-signer/password`
- [ ] Fund deployer with ~0.01 ETH on Base (enough for propose TX gas)
- [ ] Verify deployer can interact with Safe (is a signer, or use direct broadcast if threshold allows)

### 6. Configuration Review

- [ ] Review `packages/contracts/deploy.config.yaml` — Base mainnet section
  - [ ] RPC URL: `https://mainnet.base.org` (or private RPC for reliability)
  - [ ] Safe address correct
  - [ ] Safe threshold = 3
  - [ ] Explorer API: `https://api.basescan.org`
  - [ ] Safe TX Service: `https://safe-transaction-base.safe.global`
  - [ ] `tbaImplementation` populated (see step 3)
  - [ ] `production: true` flag present
- [ ] Review `packages/contracts/script/Deploy.s.sol` for any hardcoded testnet values
- [ ] Review `packages/contracts/scripts/deploy-entrypoint.sh` for any testnet assumptions

### 7. Infrastructure Readiness

- [ ] Cloudflare Workers production environment deployed (`wrangler deploy --env production`)
- [ ] D1 database `saga-hub` migrations applied (0001–0005)
- [ ] R2 bucket `saga-documents-production` created
- [ ] KV namespaces created and bound:
  - `SESSIONS` (id: `5983236e52ad4f1c973cf059c52a2611`)
  - `INDEXER_STATE` (id: `saga-indexer-production`)
  - `RELAY_MAILBOX` (id: `saga-relay-mailbox-production`)
- [ ] DNS: `api.saga-standard.dev` pointing to Workers
- [ ] Metadata URLs accessible:
  - `https://saga-standard.dev/api/metadata/agent/`
  - `https://saga-standard.dev/api/metadata/org/`

### 8. Code Freeze & Review

- [ ] All testnet bugs from deployment report are fixed (see items 1-11)
- [ ] PR with all deployment fixes merged to `main`
- [ ] Tag release: `v0.1.0` (or appropriate version)
- [ ] No uncommitted changes in working tree

---

## Deployment Procedure

### Phase 1: Dry Run

```bash
# Simulate deployment — no transactions sent
saga deploy --chain base --production
```

**Verify output:**

- [ ] All 4 contracts show simulated addresses
- [ ] Gas estimate is reasonable (~0.003-0.01 ETH total)
- [ ] No errors in simulation output
- [ ] Docker container builds and runs cleanly
- [ ] 1Password secrets are accessible inside container

### Phase 2: Broadcast (Propose to Safe)

> **CRITICAL:** This proposes the deployment batch to the Safe multisig. No contracts are deployed until signers approve and execute.

```bash
# Propose deployment to Safe multisig
saga deploy --chain base --broadcast --production
```

**Note on Safe threshold 3:** The current `deploy-entrypoint.sh` only supports direct deployment (threshold == 1) via `forge script --broadcast`. For threshold > 1, the script encodes the batch and posts to the Safe Transaction Service for multisig approval.

**However:** Bug #9 from the testnet report identified that Safe cannot execute raw CREATE opcodes. This means:

> **BLOCKER:** The multisig deployment path (threshold > 1) requires a factory/CREATE2 pattern that is **not yet implemented**. Before mainnet deployment, one of these must happen:
>
> 1. **Implement CREATE2 factory deployment** — Deploy contracts via a factory that uses CREATE2, making the Safe's `delegateCall` or `call` execute deployments through the factory
> 2. **Use threshold-1 deployment** — Temporarily reduce Safe threshold to 1, deploy, then restore threshold to 3
> 3. **Deploy from EOA, transfer ownership** — Deploy from the proposer EOA directly, then transfer HandleRegistry ownership to the Safe

**Recommended approach:** Option 3 (deploy from EOA, transfer ownership to Safe). This is the simplest and most battle-tested pattern:

1. Deploy all contracts from the proposer EOA using `forge script --broadcast`
2. Call `registry.transferOwnership(safeAddress)` to transfer control to the multisig
3. The Safe then governs future admin operations (authorize/deauthorize contracts)

**After broadcast:**

- [ ] Record pending deploy state (auto-saved to `.saga/deploys/base-pending.json`)
- [ ] Record Safe transaction hash(es)
- [ ] Share transaction hash(es) with other signers

### Phase 3: Multisig Approval (if using Safe flow)

- [ ] Signer 1 reviews and approves via Safe UI or API
- [ ] Signer 2 reviews and approves
- [ ] Signer 3 reviews and executes (final approval triggers on-chain execution)
- [ ] Wait for transaction confirmation (~2 seconds on Base)

### Phase 4: Finalization

```bash
# Query Safe TX Service, extract addresses, verify contracts
saga deploy --chain base --finalize
```

**Verify:**

- [ ] All 4 contract addresses returned
- [ ] Each address has deployed bytecode:
  ```bash
  cast code <address> --rpc-url https://mainnet.base.org
  ```
- [ ] Contracts verified on Basescan (green checkmark)
- [ ] HandleRegistry owner is correct (Safe or deployer, depending on approach)
- [ ] AgentIdentity and OrgIdentity are authorized on HandleRegistry:
  ```bash
  cast call <registry> "authorizedContracts(address)" <agentIdentity> --rpc-url https://mainnet.base.org
  cast call <registry> "authorizedContracts(address)" <orgIdentity> --rpc-url https://mainnet.base.org
  ```

### Phase 5: Post-Deploy Updates

- [ ] Update `packages/contracts/src/ts/addresses.ts` with mainnet addresses
- [ ] Update `packages/contracts/deployments/base.json` with deployment record
- [ ] Update `packages/server/wrangler.toml` production vars:
  ```toml
  [env.production.vars]
  BASE_RPC_URL = "https://mainnet.base.org"
  AGENT_IDENTITY_CONTRACT = "<deployed-address>"
  ORG_IDENTITY_CONTRACT = "<deployed-address>"
  INDEXER_CHAIN = "eip155:8453"
  INDEXER_START_BLOCK = "<deployment-block-number>"
  ```
- [ ] If ownership was via EOA, transfer HandleRegistry ownership to Safe:
  ```bash
  cast send <registry> "transferOwnership(address)" <safeAddress> \
    --private-key <deployerKey> --rpc-url https://mainnet.base.org
  ```
- [ ] Deploy updated server: `wrangler deploy --env production`
- [ ] Trigger initial indexer run: `POST https://api.saga-standard.dev/admin/reindex`
- [ ] Commit all address/config updates to `main`
- [ ] Tag deployment: `git tag deploy/base-mainnet-v1 && git push --tags`

---

## Post-Deployment Verification

### Smoke Tests

- [ ] **Agent registration:**
  ```bash
  saga register <test-handle> --on-chain --chain base --wallet <wallet-name>
  ```
- [ ] **Agent resolution (on-chain):**
  ```bash
  saga resolve <test-handle> --on-chain --chain base
  ```
- [ ] **Agent resolution (server):**
  ```bash
  saga resolve <test-handle> --server https://api.saga-standard.dev
  ```
- [ ] **Org registration:**
  ```bash
  saga register-org --handle <test-org> --name "Test Org" --chain base --wallet <wallet-name>
  ```
- [ ] **Org resolution:**
  ```bash
  saga resolve <test-org> --on-chain --chain base
  ```
- [ ] **TBA computation:**
  ```bash
  cast call <tbaHelper> "computeAccount(address,uint256)" <agentIdentity> 0 --rpc-url https://mainnet.base.org
  ```
- [ ] **Indexer working:** Check that registered entities appear in server resolve API within 2 minutes
- [ ] **Directory UI:** Verify agents/orgs appear at `https://saga-standard.dev`

### Security Verification

- [ ] HandleRegistry `owner()` returns the Safe address
- [ ] Only AgentIdentity and OrgIdentity are authorized (`authorizedContracts`)
- [ ] No unexpected authorized contracts
- [ ] Contracts are verified on Basescan with matching source code
- [ ] Private keys are removed from any local environment (only in 1Password)

---

## Rollback Plan

### If deployment fails mid-broadcast:

1. Check `.saga/deploys/base-pending.json` for recorded state
2. If no on-chain transactions: safe to retry from Phase 1
3. If partial deployment: note which contracts deployed, update addresses manually

### If contracts deploy but verification fails:

1. Manual verification: `forge verify-contract <address> <Contract> --chain base --etherscan-api-key <key>`
2. Verification doesn't affect functionality — contracts work regardless

### If authorization fails:

1. Re-run admin script: authorize contracts on HandleRegistry
2. Requires HandleRegistry owner (Safe or deployer) to call `setAuthorizedContract`

### If a contract has no bytecode (repeat of testnet bug #11):

1. Identify which contract(s) failed
2. Use targeted deployment script (like `DeployOrg.s.sol`)
3. Re-authorize the new contract on HandleRegistry
4. Update addresses in all config files

### Nuclear option — full redeploy:

1. Deploy fresh HandleRegistry + all contracts
2. Old contracts become orphaned (no admin concern — they're immutable)
3. Update all addresses everywhere
4. Any previously minted handles/NFTs are on the old contracts (not recoverable without migration)

---

## Known Blockers

| Blocker                                  | Status | Resolution                                        |
| ---------------------------------------- | ------ | ------------------------------------------------- |
| Safe threshold > 1 cannot execute CREATE | Open   | Use EOA deploy + ownership transfer (recommended) |
| TBA Implementation address unknown       | Open   | Research Tokenbound V3 on Base mainnet            |
| OrgIdentity failed on testnet            | Open   | Redeploy on testnet first to validate fix         |
| Deployer EOA not yet designated          | Open   | Generate key, store in 1Password                  |

## Cost Estimate

| Item                                 | Estimated Cost       |
| ------------------------------------ | -------------------- |
| Contract deployments (4 CREATE txs)  | ~0.002-0.005 ETH     |
| Authorization transactions (2 calls) | ~0.0002 ETH          |
| Ownership transfer (1 call)          | ~0.0001 ETH          |
| Contract verification (off-chain)    | Free                 |
| **Total**                            | **~0.003-0.006 ETH** |

_Base L2 fees are very low (~$0.01-0.05 per tx at current gas prices)._

## Timeline

| Step                        | Duration     | Notes                                       |
| --------------------------- | ------------ | ------------------------------------------- |
| Pre-deployment checklist    | 1-2 days     | Vault setup, Safe config, testnet fixes     |
| Dry run + review            | 30 min       | Team reviews simulation output              |
| Broadcast                   | 5 min        | Automated via CLI                           |
| Multisig signing            | 1-4 hours    | Depends on signer availability              |
| Finalization + verification | 30 min       | Automated with manual checks                |
| Post-deploy smoke tests     | 1 hour       | End-to-end verification                     |
| Server indexer update       | 30 min       | Deploy + trigger + verify                   |
| **Total**                   | **1-3 days** | Mostly waiting on signers and testnet fixes |
