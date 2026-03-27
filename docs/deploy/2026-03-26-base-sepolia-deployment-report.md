# Base Sepolia Deployment Test Report

**Date:** 2026-03-26
**Chain:** Base Sepolia (chain ID 84532)
**Deployer:** 0x8f0BCeB40A136f3d34649820E3276e7f2cE477e3
**Safe:** 0x3F31e7FE81F4f859FB630E1c97FB693f23a3f3B8 (threshold 1)

## Deployed Contracts

| Contract           | Address                                      | Status                          |
| ------------------ | -------------------------------------------- | ------------------------------- |
| SAGAHandleRegistry | `0xec2f53f2cfa24553c4ad6e585965490f839b28f0` | Deployed, verified              |
| SAGAAgentIdentity  | `0x1a706cc37ea90af568dce0f637aeb60884c9fadb` | Deployed, verified              |
| SAGAOrgIdentity    | `0x4f297f7b3439d1bdd548ba897d3b82b5fc2bdd26` | **Failed** — no code at address |
| SAGATBAHelper      | `0xcbd2a8193901eb838439dd2bb3303ce177989dbe` | Deployed, verified              |

### OrgIdentity Deployment Failure

The initial `saga deploy --chain base-sepolia --broadcast` deployed 4 contracts via `forge script --broadcast`. The CREATE transaction for SAGAOrgIdentity appears to have failed silently during the batch broadcast (likely a gas estimation or nonce collision in the multi-tx batch). The address was recorded in Foundry's broadcast artifacts but no bytecode was deployed.

**Impact:** Org registration is non-functional until OrgIdentity is redeployed. A `DeployOrg.s.sol` script was created for targeted redeployment. Requires funding the deployer wallet (~0.000026 ETH estimated).

### Authorization State

| Contract          | Authorized on HandleRegistry                                |
| ----------------- | ----------------------------------------------------------- |
| SAGAAgentIdentity | Yes                                                         |
| SAGAOrgIdentity   | Yes (authorized via admin script, but contract has no code) |

## CLI Smoke Tests

### Deploy Command (`saga deploy`)

| Test                                                  | Result                                          |
| ----------------------------------------------------- | ----------------------------------------------- |
| `saga deploy --chain base-sepolia` (dry-run)          | Pass — simulation output with gas estimate      |
| `saga deploy --chain base-sepolia --broadcast`        | Pass — 4 contracts deployed, addresses returned |
| Docker container build (multi-arch)                   | Pass — arm64 + amd64 via direct binary download |
| 1Password secret retrieval                            | Pass — signer key and explorer key fetched      |
| Production gate (`--production` required for mainnet) | Pass — blocks without flag                      |

### Fund Command (`saga fund`)

| Test                                                                | Result                                  |
| ------------------------------------------------------------------- | --------------------------------------- |
| `saga fund --chain base-sepolia --to <addr> --amount 0.000001ether` | Pass — TX 0x3e3c92af...                 |
| `saga fund --chain base-sepolia --to <addr> --amount 0.000008ether` | Pass — TX 0xe02ce32c...                 |
| `saga fund --chain base-sepolia --to <addr> --amount 0.000005ether` | Pass — TX 0x554b1f43...                 |
| Production chain gate                                               | Pass — blocks fund on production chains |

### Register Command (`saga register`)

| Test                                                                             | Result                                            |
| -------------------------------------------------------------------------------- | ------------------------------------------------- |
| `saga register test-agent-1 --on-chain --chain base-sepolia --wallet test-agent` | Pass                                              |
| Handle availability check (`handleExists`)                                       | Pass                                              |
| NFT mint (AgentIdentity.registerAgent)                                           | Pass — Token ID 0, TX 0x72df73f1...               |
| TBA address computation                                                          | Pass — 0x29b26D48F68dd1948c1F1A2e601F5c8A7Ba3690e |
| Server-optional mode (no `--server` required for on-chain)                       | Pass                                              |

### Register-Org Command (`saga register-org`)

| Test                                                                               | Result                             |
| ---------------------------------------------------------------------------------- | ---------------------------------- |
| `saga register-org --handle epic-test --name "Epic Test Org" --chain base-sepolia` | **Fail** — OrgIdentity has no code |

### Resolve Command (`saga resolve`)

| Test                                                        | Result                                  |
| ----------------------------------------------------------- | --------------------------------------- |
| `saga resolve test-agent-1 --on-chain --chain base-sepolia` | Pass — entity type AGENT, token ID 0    |
| `saga resolve test-agent-1 --server http://localhost:8787`  | Pass — full agent data from indexer     |
| `saga resolve epic-test --on-chain --chain base-sepolia`    | Fail — handle not registered (expected) |

### Admin Command (`saga deploy` admin scripts)

| Test                                               | Result                  |
| -------------------------------------------------- | ----------------------- |
| `admin-entrypoint.sh` authorize-contract operation | Pass — TX 0x6e065451... |

## Server Indexer Tests

| Test                                           | Result                                             |
| ---------------------------------------------- | -------------------------------------------------- |
| Local server startup (`wrangler dev`)          | Pass                                               |
| D1 migrations (0001–0005)                      | Pass                                               |
| Indexer config (env vars in wrangler.toml)     | Pass                                               |
| Manual indexer trigger (`POST /admin/reindex`) | Pass                                               |
| AgentRegistered event indexing                 | Pass — agent appears in `/v1/resolve/test-agent-1` |
| Indexer cursor advancement                     | Pass — 39400000 → 39402001                         |

## Bugs Found and Fixed

### 1. Dockerfile arm64 architecture (Critical)

**Issue:** 1Password apt repo only publishes amd64 packages. Docker on Apple Silicon runs arm64 containers.
**Fix:** Switched to direct binary download with `dpkg --print-architecture` for multi-arch support.

### 2. `isHandleAvailable` used reverting function (Critical)

**Issue:** `resolveHandle()` reverts with "not found" when handle doesn't exist. `isHandleAvailable` called this function expecting a return value.
**Fix:** Changed to use `handleExists()` which returns a boolean.

### 3. Indexer event ABI mismatch (Critical)

**Issue:** `owner` field was marked `indexed: false` in indexer ABIs but is `indexed: true` in the contracts. Field `hubUrl` didn't match contract's `homeHubUrl`. This caused viem to fail decoding all on-chain events.
**Fix:** Corrected `indexed` flags and field names in `chain-indexer.ts`, `types.ts`, and `event-handlers.ts`.

### 4. Forge multi-JSON output parsing (High)

**Issue:** `forge script --json` emits one JSON object per transaction. The entrypoint's `jq` calls failed on multi-object input.
**Fix:** Added `-s` (slurp) flag to all `jq` calls: `jq -sc '[...]'`.

### 5. 1Password field name mismatch (High)

**Issue:** Entrypoint used `op://vault/item/private-key` but secrets were stored under the `password` field.
**Fix:** Changed all `op read` calls to use `/password`.

### 6. Private key 0x prefix (Medium)

**Issue:** Key from 1Password lacked `0x` prefix. Foundry/cast requires it.
**Fix:** Added normalization in entrypoint: `case "$SIGNER_KEY" in 0x*) ;; *) SIGNER_KEY="0x${SIGNER_KEY}" ;; esac`.

### 7. Docker --read-only broke forge (Medium)

**Issue:** `--read-only` filesystem prevented forge from writing compilation cache and op CLI from writing config.
**Fix:** Removed `--read-only` flag entirely (forge needs writable cache/out dirs).

### 8. OP_SERVICE_ACCOUNT_TOKEN not reaching container (Medium)

**Issue:** Shell env had a different token than `.env` file. Container received wrong token.
**Fix:** Added `.env` file loading in deploy command with project-specific precedence.

### 9. Safe cannot execute CREATE transactions (High)

**Issue:** When `safeThreshold > 1`, the Safe multisig cannot execute raw CREATE opcodes (no `.to` address).
**Fix:** Added direct deployment path for `safeThreshold == 1`. Multi-sig flow requires factory/CREATE2 pattern (not yet implemented).

### 10. Safe TX Service redirect (Low)

**Issue:** `curl` without `-L` flag failed on 308 redirects from the Safe Transaction Service.
**Fix:** Added `-L` flag to all `curl` calls in the entrypoint.

### 11. OrgIdentity contract deployment failure (Open)

**Issue:** The CREATE transaction for SAGAOrgIdentity in the batch broadcast did not deploy bytecode. Root cause unclear — possibly gas estimation failure or nonce collision in the 6-tx batch.
**Status:** Open. `DeployOrg.s.sol` script created for targeted redeployment. Deployer needs ~0.000026 ETH.

## Test Wallet

| Property          | Value                                      |
| ----------------- | ------------------------------------------ |
| Name              | test-agent                                 |
| Address           | 0xAcc46419c6B8B914964b06255424a510CA425b87 |
| Chain             | Base Sepolia                               |
| Remaining Balance | ~0.000007 ETH                              |

## Files Changed

### New Files

- `packages/cli/src/commands/fund.ts` — Fund command for sending testnet ETH via Docker/1Password
- `packages/contracts/scripts/fund-entrypoint.sh` — Docker entrypoint for ETH transfers
- `packages/contracts/scripts/admin-entrypoint.sh` — Docker entrypoint for admin operations (authorize contracts)
- `packages/contracts/script/DeployOrg.s.sol` — Targeted OrgIdentity-only deployment script

### Modified Files

- `packages/contracts/Dockerfile.deploy` — Multi-arch 1Password install, added fund/admin entrypoints
- `packages/contracts/deploy.config.yaml` — Correct vault names, safe threshold, external addresses
- `packages/contracts/scripts/deploy-entrypoint.sh` — Fixed jq parsing, 1Password fields, 0x prefix, direct deploy path, curl redirects
- `packages/contracts/script/Deploy.s.sol` — TBA_IMPLEMENTATION optional via `vm.envOr`
- `packages/contracts/src/ts/addresses.ts` — Populated Base Sepolia contract addresses
- `packages/contracts/deployments/base-sepolia.json` — Updated deployment record
- `packages/cli/src/index.ts` — Added fund command
- `packages/cli/src/commands/deploy.ts` — .env loading for OP token, direct deploy handling
- `packages/cli/src/commands/register.ts` — Server optional for on-chain path
- `packages/cli/src/commands/register-org.ts` — Server optional
- `packages/cli/src/commands/resolve.ts` — Added `--on-chain` flag for direct chain resolution
- `packages/cli/src/deploy-docker.ts` — Removed --read-only and tmpfs flags
- `packages/cli/src/__tests__/deploy-docker.test.ts` — Updated tests for new Docker args
- `packages/cli/tsup.config.ts` — Added `noExternal: ['js-yaml']`
- `packages/sdk/tsup.config.ts` — Added `noExternal: ['tweetnacl-util']`
- `packages/client/src/chain.ts` — Fixed `isHandleAvailable` to use `handleExists`, simplified `resolveHandleOnChain`
- `packages/server/wrangler.toml` — Added indexer config for local dev
- `packages/server/src/index.ts` — Added `POST /admin/reindex` endpoint
- `packages/server/src/indexer/chain-indexer.ts` — Fixed event ABI indexed flags and field names
- `packages/server/src/indexer/event-handlers.ts` — Updated to use `homeHubUrl`
- `packages/server/src/indexer/types.ts` — Updated `AgentRegisteredEvent.homeHubUrl`

## Next Steps

1. Fund deployer wallet with ~0.001 ETH via Base Sepolia faucet
2. Redeploy SAGAOrgIdentity using `DeployOrg.s.sol`
3. Update `addresses.ts` with new OrgIdentity address
4. Retest org registration end-to-end
5. Run full test suite to verify no regressions
6. Deploy indexer configuration to staging/production environments
