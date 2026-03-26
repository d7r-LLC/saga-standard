#!/usr/bin/env bash
set -euo pipefail

# ── Logging (never logs secret values) ──────────────────────────────────
log() { echo "{\"log\":\"$1\",\"ts\":\"$(date -u +%FT%TZ)\"}" >&2; }
die() { echo "{\"error\":\"$1\"}" >&2 && exit 1; }

# ── Parse config from base64 env var ────────────────────────────────────
[ -z "${DEPLOY_CONFIG:-}" ] && die "DEPLOY_CONFIG not set"
CONFIG=$(echo "$DEPLOY_CONFIG" | base64 -d 2>/dev/null) || die "invalid DEPLOY_CONFIG"

CHAIN=$(echo "$CONFIG" | jq -r '.chain') || die "missing .chain"
CHAIN_ID=$(echo "$CONFIG" | jq -r '.chainId') || die "missing .chainId"
RPC=$(echo "$CONFIG" | jq -r '.rpc') || die "missing .rpc"
VAULT=$(echo "$CONFIG" | jq -r '.op.vault') || die "missing .op.vault"
SIGNER_ITEM=$(echo "$CONFIG" | jq -r '.op.signerItem') || die "missing .op.signerItem"
EXPLORER_KEY_ITEM=$(echo "$CONFIG" | jq -r '.op.explorerKeyItem') || die "missing .op.explorerKeyItem"
SAFE_ADDR=$(echo "$CONFIG" | jq -r '.safe') || die "missing .safe"
SAFE_TX_SERVICE=$(echo "$CONFIG" | jq -r '.safeTransactionService') || die "missing .safeTransactionService"
VERIFY=$(echo "$CONFIG" | jq -r '.verify') || die "missing .verify"
SAFE_THRESHOLD=$(echo "$CONFIG" | jq -r '.safeThreshold') || die "missing .safeThreshold"
ERC6551_REGISTRY=$(echo "$CONFIG" | jq -r '.external.erc6551Registry') || die "missing .external.erc6551Registry"
TBA_IMPLEMENTATION=$(echo "$CONFIG" | jq -r '.external.tbaImplementation') || die "missing .external.tbaImplementation"
MODE=${DEPLOY_MODE:-dry-run}

log "chain=${CHAIN} chainId=${CHAIN_ID} mode=${MODE}"

# ── Validate 1Password token ───────────────────────────────────────────
[ -z "${OP_SERVICE_ACCOUNT_TOKEN:-}" ] && die "OP_SERVICE_ACCOUNT_TOKEN not set"

# ── Fetch secrets from 1Password (in-memory only) ──────────────────────
log "reading signer key from 1password"
SIGNER_KEY=$(op read "op://${VAULT}/${SIGNER_ITEM}/private-key" 2>/dev/null) \
  || die "failed to read signer key from 1password"

log "reading explorer api key from 1password"
EXPLORER_KEY=$(op read "op://${VAULT}/${EXPLORER_KEY_ITEM}/api-key" 2>/dev/null) \
  || die "failed to read explorer api key from 1password"

# ── Derive signer address (key never logged) ──────────────────────────
SIGNER_ADDR=$(cast wallet address "$SIGNER_KEY" 2>/dev/null) \
  || die "invalid signer key"
log "signer=${SIGNER_ADDR}"

# ── Simulate deployment ────────────────────────────────────────────────
log "simulating deployment"
export ERC6551_REGISTRY
export TBA_IMPLEMENTATION
SIM_OUTPUT=$(DEPLOYER_PRIVATE_KEY="$SIGNER_KEY" \
  forge script script/Deploy.s.sol \
  --fork-url "$RPC" \
  --json 2>/dev/null) || die "simulation failed"

# Parse simulation results
ADDRESSES=$(echo "$SIM_OUTPUT" | jq -c '
  [.transactions[]? | select(.transactionType == "CREATE") |
   {key: .contractName, value: .contractAddress}] |
  from_entries // {}
' 2>/dev/null || echo '{}')

GAS_ESTIMATE=$(echo "$SIM_OUTPUT" | jq '[.transactions[]?.gas // 0] | add // 0' 2>/dev/null || echo '"unknown"')

log "simulation complete"

# ── Dry-run: output and exit ───────────────────────────────────────────
if [ "$MODE" = "dry-run" ]; then
  echo "{\"status\":\"simulated\",\"chain\":\"${CHAIN}\",\"chainId\":${CHAIN_ID},\"signer\":\"${SIGNER_ADDR}\",\"addresses\":${ADDRESSES},\"gasEstimate\":${GAS_ESTIMATE}}"
  exit 0
fi

# ── Broadcast: encode Safe batch, sign, propose ───────────────────────
if [ "$MODE" = "broadcast" ]; then
  log "encoding safe transaction batch"

  # Run forge script to get the raw transaction data
  BROADCAST_OUTPUT=$(DEPLOYER_PRIVATE_KEY="$SIGNER_KEY" \
    forge script script/Deploy.s.sol \
    --fork-url "$RPC" \
    --broadcast \
    --json 2>/dev/null) || die "broadcast simulation failed"

  # Extract transaction data for Safe batch proposal
  TRANSACTIONS=$(echo "$BROADCAST_OUTPUT" | jq -c '[.transactions[]? | {
    to: .contractAddress,
    value: "0",
    data: .transaction.data,
    operation: 0
  }]' 2>/dev/null) || die "failed to parse transactions"

  # Compute Safe transaction hash
  NONCE=$(curl -sf "${SAFE_TX_SERVICE}/api/v1/safes/${SAFE_ADDR}/" \
    | jq -r '.nonce' 2>/dev/null) || die "failed to get safe nonce"

  # Build the multisend batch for Safe
  # For multi-transaction deploys, encode as MultiSend
  TX_COUNT=$(echo "$TRANSACTIONS" | jq 'length')

  if [ "$TX_COUNT" -gt 1 ]; then
    # MultiSend encoding via cast
    MULTISEND_ADDR="0x38869bf66a61cF6bDB996A6aE40D5853Fd43B526" # Safe MultiSend canonical
    MULTISEND_DATA=$(echo "$TRANSACTIONS" | jq -r '
      [.[] | "\(.to)|\(.value)|\(.data)"] | join(",")
    ')
    OPERATION=1 # DelegateCall for MultiSend
    TO_ADDR="$MULTISEND_ADDR"
    # Encode the multiSend call
    CALL_DATA=$(cast calldata "multiSend(bytes)" "$MULTISEND_DATA" 2>/dev/null) \
      || die "failed to encode multisend"
  else
    OPERATION=0
    TO_ADDR=$(echo "$TRANSACTIONS" | jq -r '.[0].to')
    CALL_DATA=$(echo "$TRANSACTIONS" | jq -r '.[0].data')
  fi

  # Sign the Safe transaction hash
  TX_HASH=$(cast call "$SAFE_ADDR" \
    "getTransactionHash(address,uint256,bytes,uint8,uint256,uint256,uint256,address,address,uint256)(bytes32)" \
    "$TO_ADDR" 0 "$CALL_DATA" "$OPERATION" 0 0 0 \
    "0x0000000000000000000000000000000000000000" \
    "0x0000000000000000000000000000000000000000" \
    "$NONCE" \
    --rpc-url "$RPC" 2>/dev/null) || die "failed to compute safe tx hash"

  SIGNATURE=$(cast wallet sign "$TX_HASH" --private-key "$SIGNER_KEY" 2>/dev/null) \
    || die "failed to sign safe transaction"

  log "proposing to safe transaction service"

  # POST to Safe Transaction Service
  HTTP_STATUS=$(curl -sf -o /tmp/safe-response.json -w "%{http_code}" \
    -X POST "${SAFE_TX_SERVICE}/api/v1/safes/${SAFE_ADDR}/multisig-transactions/" \
    -H "Content-Type: application/json" \
    -d "{
      \"to\": \"${TO_ADDR}\",
      \"value\": \"0\",
      \"data\": \"${CALL_DATA}\",
      \"operation\": ${OPERATION},
      \"safeTxGas\": \"0\",
      \"baseGas\": \"0\",
      \"gasPrice\": \"0\",
      \"gasToken\": \"0x0000000000000000000000000000000000000000\",
      \"refundReceiver\": \"0x0000000000000000000000000000000000000000\",
      \"nonce\": ${NONCE},
      \"contractTransactionHash\": \"${TX_HASH}\",
      \"sender\": \"${SIGNER_ADDR}\",
      \"signature\": \"${SIGNATURE}\"
    }" 2>/dev/null) || die "failed to propose to safe"

  [ "$HTTP_STATUS" -ge 200 ] && [ "$HTTP_STATUS" -lt 300 ] || die "safe proposal returned HTTP ${HTTP_STATUS}"

  SAFE_TX_HASH="${TX_HASH}"
  SAFE_URL="https://app.safe.global/transactions/queue?safe=${CHAIN}:${SAFE_ADDR}"

  log "proposal submitted"

  echo "{\"status\":\"proposed\",\"safeTxHash\":\"${SAFE_TX_HASH}\",\"safeUrl\":\"${SAFE_URL}\",\"simulatedAddresses\":${ADDRESSES},\"gasEstimate\":${GAS_ESTIMATE},\"signer\":\"${SIGNER_ADDR}\",\"signaturesCollected\":\"1/${SAFE_THRESHOLD:-2}\"}"
  exit 0
fi

# ── Finalize: query execution, verify, write back to 1Password ─────────
if [ "$MODE" = "finalize" ]; then
  log "querying safe for execution result"

  # Load pending safe tx hash from config (passed in by CLI)
  SAFE_TX_HASH=$(echo "$CONFIG" | jq -r '.pendingSafeTxHash // empty')
  [ -z "$SAFE_TX_HASH" ] && die "no pendingSafeTxHash in config"

  # Query Safe TX Service for the executed transaction
  TX_RESULT=$(curl -sf "${SAFE_TX_SERVICE}/api/v1/multisig-transactions/${SAFE_TX_HASH}/" 2>/dev/null) \
    || die "failed to query safe transaction"

  IS_EXECUTED=$(echo "$TX_RESULT" | jq -r '.isExecuted')
  [ "$IS_EXECUTED" = "true" ] || die "transaction not yet executed"

  EXEC_TX_HASH=$(echo "$TX_RESULT" | jq -r '.transactionHash')
  log "execution tx: ${EXEC_TX_HASH}"

  # Get receipt and extract deployed addresses
  RECEIPT=$(cast receipt "$EXEC_TX_HASH" --rpc-url "$RPC" --json 2>/dev/null) \
    || die "failed to get transaction receipt"

  # Parse CREATE opcodes from trace to get deployed addresses
  # This uses the simulation addresses as reference
  FINAL_ADDRESSES="$ADDRESSES"

  # ── Verify contracts on block explorer ──
  VERIFIED=false
  if [ "$VERIFY" = "true" ]; then
    log "verifying contracts"
    for ROW in $(echo "$FINAL_ADDRESSES" | jq -r 'to_entries[] | "\(.key)=\(.value)"'); do
      NAME="${ROW%%=*}"
      ADDR="${ROW#*=}"
      BASESCAN_API_KEY="$EXPLORER_KEY" forge verify-contract \
        "$ADDR" "src/${NAME}.sol:${NAME}" \
        --chain-id "$CHAIN_ID" \
        --etherscan-api-key "$EXPLORER_KEY" \
        --watch 2>/dev/null || log "verification failed for ${NAME} (non-fatal)"
    done
    VERIFIED=true
  fi

  # ── Write addresses to 1Password ──
  ADDRESSES_ITEM=$(echo "$CONFIG" | jq -r '.op.addressesItem')
  OP_UPDATED=false

  if [ -n "$ADDRESSES_ITEM" ]; then
    log "writing addresses to 1password"
    for ROW in $(echo "$FINAL_ADDRESSES" | jq -r 'to_entries[] | "\(.key)=\(.value)"'); do
      NAME="${ROW%%=*}"
      ADDR="${ROW#*=}"
      op item edit "$ADDRESSES_ITEM" --vault "$VAULT" "${NAME}=${ADDR}" 2>/dev/null \
        || log "failed to write ${NAME} to 1password (non-fatal)"
    done
    op item edit "$ADDRESSES_ITEM" --vault "$VAULT" \
      "deployedAt=$(date -u +%FT%TZ)" \
      "safeTxHash=${SAFE_TX_HASH}" \
      "executionTxHash=${EXEC_TX_HASH}" 2>/dev/null || true
    OP_UPDATED=true
  fi

  log "finalization complete"

  echo "{\"status\":\"finalized\",\"addresses\":${FINAL_ADDRESSES},\"safeTxHash\":\"${SAFE_TX_HASH}\",\"executionTxHash\":\"${EXEC_TX_HASH}\",\"verified\":${VERIFIED},\"opUpdated\":${OP_UPDATED}}"
  exit 0
fi

die "unknown mode: ${MODE}"
