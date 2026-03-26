# Secure Smart Contract Deployment via SAGA CLI

**Date:** 2026-03-26
**Status:** Approved
**Scope:** `saga deploy` CLI command with Docker-isolated Gnosis Safe multisig deployment pipeline

## Overview

A secure deployment pipeline for SAGA identity smart contracts to any EVM chain. The deployer private key never leaves a hardened, ephemeral Docker container. 1Password provides secret storage and retrieval. Gnosis Safe multisig enforces multi-party approval before execution.

## Threat Model

**Protected asset:** Deployer signer private key.

**Guarantees:**

- Key never appears on the host filesystem, shell history, logs, or LLM agent context
- Key exists only in-memory inside an ephemeral container with scoped network access
- Container is destroyed after each operation
- Even a compromised host cannot exfiltrate the key (it's fetched inside the container from 1Password)

**Trust boundaries:**

- 1Password vault (encrypted at rest, accessed via service account token)
- Docker container (hardened, read-only filesystem, no capabilities, restricted network)
- Host CLI (orchestrator only — never sees secrets, only structured JSON output)

## Architecture

```
Host (saga CLI)                    Docker Container (ephemeral)
┌──────────────────┐               ┌─────────────────────────────┐
│ saga deploy      │               │ deploy-entrypoint.sh        │
│                  │               │                             │
│ 1. Read config   │  docker run   │ 1. op read → signer key     │
│ 2. Pre-flight    │──────────────▶│ 2. forge simulate           │
│ 3. Build image   │  OP_TOKEN +   │ 3. Encode Safe batch        │
│                  │  config only  │ 4. Sign + propose to Safe   │
│ 4. Parse output  │◀──────────────│ 5. JSON to stdout           │
│ 5. Post-deploy   │  JSON only    │                             │
│    bookkeeping   │               │ Container destroyed         │
└──────────────────┘               └─────────────────────────────┘
```

## Deploy Config File

Located at `packages/contracts/deploy.config.yaml`. Versioned in git, reviewable in PRs.

```yaml
version: 1

defaults:
  contracts:
    - SAGAHandleRegistry
    - SAGAAgentIdentity
    - SAGAOrgIdentity
    - SAGATBAHelper
  verify: true
  notify: true

chains:
  base-sepolia:
    chainId: 84532
    rpc: https://sepolia.base.org
    safe: '0x...'
    safeThreshold: 2
    explorerApi: https://api-sepolia.basescan.org
    safeTransactionService: https://safe-transaction-base-sepolia.safe.global
    external:
      erc6551Registry: '0x000000006551c19487814612e58FE06813775758'
      tbaImplementation: '0x...'
    op:
      vault: 'SAGA Deploys'
      signerItem: 'base-sepolia-signer'
      addressesItem: 'base-sepolia-addresses'
      explorerKeyItem: 'basescan-api-key'

  base:
    chainId: 8453
    rpc: https://mainnet.base.org
    safe: '0x...'
    safeThreshold: 3
    explorerApi: https://api.basescan.org
    safeTransactionService: https://safe-transaction-base.safe.global
    production: true
    external:
      erc6551Registry: '0x000000006551c19487814612e58FE06813775758'
      tbaImplementation: '0x...'
    op:
      vault: 'SAGA Deploys'
      signerItem: 'base-mainnet-signer'
      addressesItem: 'base-mainnet-addresses'
      explorerKeyItem: 'basescan-api-key'

networkAllowlist:
  - my.1password.com
```

The network allowlist is auto-derived from `rpc`, `explorerApi`, and `safeTransactionService` fields plus the explicit `networkAllowlist` entries.

## 1Password Vault Structure

A dedicated "SAGA Deploys" vault scoped to deployment secrets and outputs.

**Items per chain:**

- `base-sepolia-signer` — field: `private-key` (deployer/signer EOA private key)
- `base-sepolia-addresses` — fields: `SAGAHandleRegistry`, `SAGAAgentIdentity`, `SAGAOrgIdentity`, `SAGATBAHelper`, `deployedAt`, `safeTxHash` (living item, updated on each deploy)
- `basescan-api-key` — field: `api-key` (shared across chains for Basescan verification)

**Service account token:** Scoped to read/write on the "SAGA Deploys" vault only. Passed to the container as the `OP_SERVICE_ACCOUNT_TOKEN` env var.

## CLI Command Interface

```bash
# Dry-run (default) — simulates, prints summary, exits
saga deploy --chain base-sepolia

# Live deploy — proposes to Safe
saga deploy --chain base-sepolia --broadcast

# Mainnet — requires --production flag
saga deploy --chain base --broadcast --production

# Override RPC
saga deploy --chain base-sepolia --broadcast --rpc https://base-sepolia.g.alchemy.com/v2/...

# Skip verification
saga deploy --chain base-sepolia --broadcast --no-verify

# Check Safe approval status
saga deploy --chain base-sepolia --status

# Complete post-deploy steps after Safe execution
saga deploy --chain base-sepolia --finalize
```

## Orchestration Flow

### Phase 1: Pre-flight (host)

1. Read `deploy.config.yaml` and apply CLI overrides
2. Validate config: Safe address, 1Password item names, chain target exist
3. If target chain has `production: true`, require `--production` flag
4. If `--production`: print pre-flight checklist (deployer balance, gas estimate, contract count, Safe address and threshold, chain name/ID) and require terminal confirmation before proceeding
5. Build/cache Docker image from `Dockerfile.deploy`
6. Derive network allowlist from config
7. Create restricted Docker network

### Phase 2: Container execution (Docker, isolated)

1. `op read` fetches signer private key and explorer API key from 1Password (in-memory only)
2. `forge script Deploy.s.sol --fork-url $RPC` simulates deployment
3. If dry-run mode: output simulated addresses and gas estimate as JSON, exit
4. Encode deployment transactions as a Safe multisig batch
5. Sign batch with signer key
6. POST proposal to Safe Transaction Service
7. Output structured JSON to stdout:
   ```json
   {
     "status": "proposed",
     "safeTxHash": "0x...",
     "safeUrl": "https://app.safe.global/...",
     "simulatedAddresses": { ... },
     "gasEstimate": "...",
     "signer": "0x...",
     "signaturesCollected": "1/2"
   }
   ```
8. Container exits, is destroyed

### Phase 3: Post-propose (host)

1. Parse container JSON output
2. Save pending deploy state to `.saga/deploys/<chain>-pending.json`
3. Print Safe URL for other signers to approve
4. Print instruction to run `saga deploy --chain <chain> --finalize` after Safe execution

### Phase 4: Finalize (host, triggered by `--finalize`)

Launches a new container that:

1. Queries Safe TX Service for execution receipt
2. Extracts deployed contract addresses from the on-chain transaction
3. Verifies contracts on Basescan via `forge verify-contract`
4. Writes addresses to 1Password via `op item edit` (per-chain living item)
5. Outputs final JSON to stdout

Host CLI then:

1. Updates `packages/contracts/deployments/<chain>.json`
2. Updates `packages/contracts/src/ts/addresses.ts`
3. Notifies SAGA server via `POST /admin/reindex`
4. Cleans up `.saga/deploys/<chain>-pending.json`
5. Prints summary with updated file paths for commit

### Status check (`--status`)

Reads pending state file and queries Safe TX Service for approval count. No container needed (no secrets involved — Safe TX hash and service URL are public).

## Docker Container Design

### Dockerfile.deploy

Located at `packages/contracts/Dockerfile.deploy`.

```dockerfile
FROM ghcr.io/foundry-rs/foundry:latest AS foundry

FROM debian:bookworm-slim
COPY --from=foundry /usr/local/bin/forge /usr/local/bin/forge
COPY --from=foundry /usr/local/bin/cast /usr/local/bin/cast

RUN apt-get update && apt-get install -y curl jq && rm -rf /var/lib/apt/lists/* \
    && curl -sS https://downloads.1password.com/linux/keys/1password.asc \
       | gpg --dearmor -o /usr/share/keyrings/1password.gpg \
    && echo "deb [signed-by=/usr/share/keyrings/1password.gpg] \
       https://downloads.1password.com/linux/debian/amd64 stable main" \
       > /etc/apt/sources.list.d/1password.list \
    && apt-get update && apt-get install -y 1password-cli \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /deploy
COPY src/ src/
COPY script/ script/
COPY lib/ lib/
COPY foundry.toml .
COPY scripts/deploy-entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENV HISTFILE=/dev/null
ENTRYPOINT ["/entrypoint.sh"]
```

**Design decisions:**

- Multi-stage build: Foundry binaries from official image, slim Debian runtime
- No secrets baked into the image
- Contract source COPY'd in (frozen snapshot, no host volume mounts)
- Shell history disabled

### Container invocation

```bash
docker run --rm \
  --name saga-deploy-$(date +%s) \
  --network saga-deploy-net \
  -e OP_SERVICE_ACCOUNT_TOKEN="$TOKEN" \
  -e DEPLOY_CONFIG="$(base64 < resolved-config.json)" \
  -e DEPLOY_MODE=broadcast \
  --read-only \
  --tmpfs /tmp:noexec,nosuid,size=64m \
  --cap-drop ALL \
  --security-opt no-new-privileges \
  saga-deploy:latest
```

**Hardening:**

- `--read-only` — immutable root filesystem
- `--tmpfs /tmp:noexec,nosuid` — writable temp in RAM only, no binary execution
- `--cap-drop ALL` — no Linux capabilities
- `--security-opt no-new-privileges` — prevents privilege escalation
- `--rm` — auto-remove on exit
- Config passed as base64 env var, not a volume mount

### Network isolation

```bash
docker network create saga-deploy-net --internal
# iptables rules restrict to allowlisted domains only
```

Allowlisted domains (auto-derived from config):

- Chain RPC (e.g., `sepolia.base.org`, `mainnet.base.org`)
- 1Password API (`my.1password.com`)
- Safe TX Service (e.g., `safe-transaction-base-sepolia.safe.global`)
- Block explorer API (e.g., `api-sepolia.basescan.org`)

## Entrypoint Script: Secret Handling

The `deploy-entrypoint.sh` is the only code that touches the private key.

**Secret hygiene rules:**

- Key read from 1Password into a shell variable, never written to disk
- `2>/dev/null` on all commands that receive the key (forge/cast can print keys in error messages)
- No `echo`, `printf`, or log call ever references key variables
- Structured JSON on stdout (parsed by host CLI), sanitized log lines on stderr
- `set -euo pipefail` — any failure exits immediately

```bash
#!/usr/bin/env bash
set -euo pipefail

log() { echo "{\"log\":\"$1\",\"ts\":\"$(date -u +%FT%TZ)\"}" >&2; }
die() { echo "{\"error\":\"$1\"}" && exit 1; }

# Parse config
CONFIG=$(echo "$DEPLOY_CONFIG" | base64 -d) || die "invalid config"
CHAIN=$(echo "$CONFIG" | jq -r '.chain')
RPC=$(echo "$CONFIG" | jq -r '.rpc')
VAULT=$(echo "$CONFIG" | jq -r '.op.vault')
SIGNER_ITEM=$(echo "$CONFIG" | jq -r '.op.signerItem')
EXPLORER_KEY_ITEM=$(echo "$CONFIG" | jq -r '.op.explorerKeyItem')
SAFE_ADDR=$(echo "$CONFIG" | jq -r '.safe')
SAFE_TX_SERVICE=$(echo "$CONFIG" | jq -r '.safeTransactionService')
MODE=${DEPLOY_MODE:-dry-run}

# Fetch secrets (in-memory only)
log "reading signer key from 1password"
SIGNER_KEY=$(op read "op://${VAULT}/${SIGNER_ITEM}/private-key" 2>/dev/null) \
  || die "failed to read signer key from 1password"

log "reading explorer api key from 1password"
EXPLORER_KEY=$(op read "op://${VAULT}/${EXPLORER_KEY_ITEM}/api-key" 2>/dev/null) \
  || die "failed to read explorer api key from 1password"

# Derive signer address (without logging key)
SIGNER_ADDR=$(cast wallet address "$SIGNER_KEY" 2>/dev/null) \
  || die "invalid signer key"
log "signer address: ${SIGNER_ADDR}"

# Simulate
log "simulating deployment"
SIM_OUTPUT=$(DEPLOYER_PRIVATE_KEY="$SIGNER_KEY" \
  forge script script/Deploy.s.sol \
  --fork-url "$RPC" \
  --json 2>/dev/null) || die "simulation failed"

ADDRESSES=$(echo "$SIM_OUTPUT" | jq '.deployed_contracts // empty')
GAS_ESTIMATE=$(echo "$SIM_OUTPUT" | jq '.gas_estimate // "unknown"')

if [ "$MODE" = "dry-run" ]; then
  echo "{\"status\":\"simulated\",\"addresses\":${ADDRESSES},\"gasEstimate\":${GAS_ESTIMATE}}"
  exit 0
fi

# Encode Safe batch, sign, propose
log "encoding safe transaction batch"
# ... forge output → Safe-compatible batch encoding via cast + jq ...

log "signing and proposing to safe"
# ... sign with cast, POST to Safe TX Service API ...

echo "{\"status\":\"proposed\",\"safeTxHash\":\"${SAFE_TX_HASH}\",\"safeUrl\":\"https://app.safe.global/transactions/queue?safe=${CHAIN}:${SAFE_ADDR}\",\"simulatedAddresses\":${ADDRESSES},\"gasEstimate\":${GAS_ESTIMATE},\"signer\":\"${SIGNER_ADDR}\"}"
```

**Finalize mode** (`DEPLOY_MODE=finalize`):

- Queries Safe TX Service for execution receipt
- Extracts deployed addresses from on-chain transaction
- Verifies contracts via `forge verify-contract` with explorer API key
- Writes addresses to 1Password via `op item edit`
- Outputs final JSON with verified addresses

## Post-Deploy Output

### Terminal output after `--broadcast`:

```
✓ Deployment proposed to Safe
  Safe TX Hash: 0xabc...
  Signatures:   1/2
  Approve at:   https://app.safe.global/transactions/queue?safe=...

  After all signers approve, run:
    saga deploy --chain base-sepolia --finalize
```

### Terminal output after `--finalize`:

```
✓ Deployment finalized
  Chain:              base-sepolia (84532)
  SAGAHandleRegistry: 0x...
  SAGAAgentIdentity:  0x...
  SAGAOrgIdentity:    0x...
  SAGATBAHelper:      0x...
  Verified:           ✓ basescan
  1Password:          ✓ updated
  Server notified:    ✓

  Files updated:
    packages/contracts/deployments/base-sepolia.json
    packages/contracts/src/ts/addresses.ts

  Commit these changes:
    git add packages/contracts && git commit -m "deploy(base-sepolia): update addresses"
```

## Safety Gates

| Gate                | Trigger                             | Behavior                                                               |
| ------------------- | ----------------------------------- | ---------------------------------------------------------------------- |
| Dry-run default     | No `--broadcast` flag               | Simulate only, print summary, exit                                     |
| Production gate     | Chain config has `production: true` | Requires `--production` flag + pre-flight checklist                    |
| Multisig            | All chains                          | Deployment proposed to Safe, requires N-of-M approval before execution |
| Network isolation   | Always                              | Container DNS restricted to allowlisted domains                        |
| Container hardening | Always                              | Read-only FS, no caps, no privilege escalation, auto-remove            |

## File Inventory

| File                   | Location                          | Purpose                                |
| ---------------------- | --------------------------------- | -------------------------------------- |
| `deploy.config.yaml`   | `packages/contracts/`             | Deployment steering config             |
| `Dockerfile.deploy`    | `packages/contracts/`             | Hardened container image               |
| `deploy-entrypoint.sh` | `packages/contracts/scripts/`     | Container entrypoint (secret handling) |
| `deploy.ts`            | `packages/cli/src/commands/`      | CLI command (host orchestrator)        |
| `<chain>-pending.json` | `.saga/deploys/`                  | Pending deploy state (gitignored)      |
| `<chain>.json`         | `packages/contracts/deployments/` | Deployed addresses (committed)         |
| `addresses.ts`         | `packages/contracts/src/ts/`      | TypeScript address exports (committed) |
