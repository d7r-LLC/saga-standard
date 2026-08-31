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
# Phase 12 follow-on: signer field is configurable so items that store
# the mnemonic in a custom CONCEALED field (e.g. /mnemonic) work without
# code changes. Defaults to "password" for back-compat with the original
# convention of storing credentials in the standard PASSWORD-purpose field.
SIGNER_FIELD=$(echo "$CONFIG" | jq -r '.op.signerField // "password"')
EXPLORER_KEY_ITEM=$(echo "$CONFIG" | jq -r '.op.explorerKeyItem') || die "missing .op.explorerKeyItem"
SAFE_ADDR=$(echo "$CONFIG" | jq -r '.safe') || die "missing .safe"
SAFE_TX_SERVICE=$(echo "$CONFIG" | jq -r '.safeTransactionService') || die "missing .safeTransactionService"
VERIFY=$(echo "$CONFIG" | jq -r '.verify') || die "missing .verify"
SAFE_THRESHOLD=$(echo "$CONFIG" | jq -r '.safeThreshold') || die "missing .safeThreshold"

# Phase 10 (H-5): allow factory deploys to broadcast directly from the
# deployer EOA even when the resolved Safe threshold is > 1. The Safe
# accepts ownership AFTERWARD via TransferOwnership.s.sol; the initial
# Deploy.s.sol uses `new Contract()` (raw CREATE) which Safe MultiSend
# cannot execute. Without this flag, mainnet deploy day deterministically
# fails with "A Safe cannot execute raw CREATE" — see audit gap matrix
# 2026-05-04-post-phase9-gap-matrix.md H-5.
if [ "${DEPLOY_DIRECT:-false}" = "true" ]; then
  echo "[deploy] DEPLOY_DIRECT=true — bypassing Safe-routing for initial CREATE deploy"
  SAFE_THRESHOLD_EFFECTIVE=1
else
  SAFE_THRESHOLD_EFFECTIVE="$SAFE_THRESHOLD"
fi
ERC6551_REGISTRY=$(echo "$CONFIG" | jq -r '.external.erc6551Registry') || die "missing .external.erc6551Registry"
TBA_IMPLEMENTATION=$(echo "$CONFIG" | jq -r '.external.tbaImplementation') || die "missing .external.tbaImplementation"
MODE=${DEPLOY_MODE:-dry-run}

log "chain=${CHAIN} chainId=${CHAIN_ID} mode=${MODE}"

# ── Fetch secrets ──────────────────────────────────────────────────────
# Two modes (decided by the CLI before launching this container):
#
#   (1) env-token mode:    OP_SERVICE_ACCOUNT_TOKEN is set; this script
#                          calls `op read` itself. Hermetic — secrets
#                          never appear on the host shell or in /proc.
#
#   (2) stdin mode:        SECRETS_VIA_STDIN=1; the CLI resolved secrets
#                          on the host via the user's interactive `op`
#                          session and piped them in as JSON. No
#                          OP_SERVICE_ACCOUNT_TOKEN required.
#
# The signer credential MAY be either:
#   (a) a hex private key (64 hex chars, optional 0x prefix), or
#   (b) a BIP-39 mnemonic seed phrase (12/15/18/21/24 space-separated words)
#
# In env-token mode the value lives at op://${VAULT}/${SIGNER_ITEM}/${SIGNER_FIELD},
# where SIGNER_FIELD defaults to "password" but can be overridden per-chain
# via the deploy.config.yaml `op.signerField` option.
#
# This script is the ONLY supported way to read or validate the signer.
# Do not `op read` the credential elsewhere — see .claude/rules/secrets-management.md.

if [ "${SECRETS_VIA_STDIN:-0}" = "1" ]; then
  log "secrets mode: stdin (host-resolved via op CLI)"
  # Read all of stdin in one shot. The CLI sends a single JSON object.
  STDIN_JSON=$(cat)
  [ -z "$STDIN_JSON" ] && die "SECRETS_VIA_STDIN=1 but stdin was empty"
  SIGNER_INPUT=$(echo "$STDIN_JSON" | jq -r '.signer // empty') \
    || die "failed to parse signer from stdin"
  [ -z "$SIGNER_INPUT" ] && die "stdin payload missing .signer"
  EXPLORER_KEY=$(echo "$STDIN_JSON" | jq -r '.explorerKey // empty') \
    || die "failed to parse explorerKey from stdin"
  [ -z "$EXPLORER_KEY" ] && die "stdin payload missing .explorerKey"
  # Optional in stdin payload — only used when signer is a mnemonic.
  STDIN_DERIVATION_PATH=$(echo "$STDIN_JSON" | jq -r '.derivationPath // empty')
  unset STDIN_JSON
else
  log "secrets mode: env-token (container resolves via op)"
  [ -z "${OP_SERVICE_ACCOUNT_TOKEN:-}" ] && die "OP_SERVICE_ACCOUNT_TOKEN not set"
  log "reading signer credential from 1password (field=${SIGNER_FIELD})"
  SIGNER_INPUT=$(op read "op://${VAULT}/${SIGNER_ITEM}/${SIGNER_FIELD}" 2>/dev/null) \
    || die "failed to read signer credential from 1password (op://${VAULT}/${SIGNER_ITEM}/${SIGNER_FIELD})"
  log "reading explorer api key from 1password"
  EXPLORER_KEY=$(op read "op://${VAULT}/${EXPLORER_KEY_ITEM}/password" 2>/dev/null) \
    || die "failed to read explorer api key from 1password"
fi

# ── Detect credential format and resolve to a hex private key ──────────
# Mnemonic detection: count whitespace-separated words. BIP-39 valid lengths
# are 12, 15, 18, 21, or 24. Anything else is treated as a hex key.
#
# For mnemonics we delegate to a Node helper (derive-mnemonic.mjs) that reads
# the mnemonic from STDIN — never argv — so the seed phrase does NOT appear
# in /proc/$pid/cmdline. This closes the leak path flagged by the 2026-05-03
# audit (A-Crit#3).
WORD_COUNT=$(echo -n "$SIGNER_INPUT" | wc -w | tr -d ' ')

# Locate derive-mnemonic.mjs. In the deploy container it's at the canonical
# install path; in local dev runs it's a sibling of this script.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -f "/usr/local/lib/saga-deploy/derive-mnemonic.mjs" ]; then
  DERIVE_HELPER="/usr/local/lib/saga-deploy/derive-mnemonic.mjs"
elif [ -f "${SCRIPT_DIR}/derive-mnemonic.mjs" ]; then
  DERIVE_HELPER="${SCRIPT_DIR}/derive-mnemonic.mjs"
else
  DERIVE_HELPER=""
fi

case "$WORD_COUNT" in
  12|15|18|21|24)
    log "credential format: mnemonic (${WORD_COUNT} words)"
    [ -z "$DERIVE_HELPER" ] && die "derive-mnemonic.mjs not found"
    # Default derivation path: m/44'/60'/0'/0/0 (Ethereum, account 0, address 0).
    # In stdin mode, the CLI may have supplied a non-default path via the
    # JSON payload (STDIN_DERIVATION_PATH). In env-token mode, fall back
    # to op://${VAULT}/${SIGNER_ITEM}/derivation_path if present.
    # Note: bash `${VAR:-default}` parameter expansion does NOT neutralize
    # apostrophes inside the default literal, even when the whole thing is
    # wrapped in double quotes — `m/44'/60'/0'/0/0` would be parsed as an
    # unmatched single quote and trip "unexpected end of file" at script
    # tail. Use an explicit if/else instead so the path literal lives
    # inside a normal double-quoted string where `'` is harmless.
    if [ "${SECRETS_VIA_STDIN:-0}" = "1" ]; then
      if [ -n "${STDIN_DERIVATION_PATH:-}" ]; then
        DERIVATION_PATH="$STDIN_DERIVATION_PATH"
      else
        DERIVATION_PATH="m/44'/60'/0'/0/0"
      fi
    else
      DERIVATION_PATH=$(op read "op://${VAULT}/${SIGNER_ITEM}/derivation_path" 2>/dev/null \
        || echo "m/44'/60'/0'/0/0")
    fi
    SIGNER_KEY=$(printf '%s' "$SIGNER_INPUT" \
      | node "$DERIVE_HELPER" "$DERIVATION_PATH" 2>/dev/null) \
      || die "failed to derive private key from mnemonic"
    ;;
  1)
    log "credential format: hex"
    SIGNER_KEY="$SIGNER_INPUT"
    case "$SIGNER_KEY" in
      0x*) ;; # already prefixed
      *) SIGNER_KEY="0x${SIGNER_KEY}" ;;
    esac
    ;;
  *)
    die "signer credential has invalid format (got ${WORD_COUNT} words; expected 1 hex key or 12/15/18/21/24 mnemonic words)"
    ;;
esac
unset SIGNER_INPUT

# ── Derive signer address (key never logged) ──────────────────────────
SIGNER_ADDR=$(cast wallet address "$SIGNER_KEY" 2>/dev/null) \
  || die "invalid signer key (could not derive address)"
log "signer=${SIGNER_ADDR}"

# ── Simulate deployment ────────────────────────────────────────────────
log "simulating deployment"
export ERC6551_REGISTRY
export TBA_IMPLEMENTATION
# Capture forge stderr to a file so a non-zero exit produces an
# actionable error message instead of a silent "simulation failed".
# We scrub the SIGNER_KEY out of the captured stderr before it ever
# reaches the entrypoint's stderr (which the CLI captures in turn) —
# forge has been observed to echo `--private-key` values on certain
# argument-parse errors, and `DEPLOYER_PRIVATE_KEY=...` would
# otherwise appear verbatim in a stack trace.
SIM_STDERR_FILE="$(mktemp /tmp/saga-sim-stderr.XXXXXX)"
trap 'rm -f "$SIM_STDERR_FILE"' EXIT
SIM_OUTPUT=$(DEPLOYER_PRIVATE_KEY="$SIGNER_KEY" \
  forge script script/Deploy.s.sol \
  --fork-url "$RPC" \
  --json 2>"$SIM_STDERR_FILE") || {
    SIM_ERR=$(cat "$SIM_STDERR_FILE" 2>/dev/null || true)
    # Redact the private key value if it slipped into stderr. SIGNER_KEY
    # is always 0x + 64 hex chars; a literal sed substitution on the
    # exact value (plus its no-prefix variant) is sufficient.
    SIGNER_KEY_BARE="${SIGNER_KEY#0x}"
    SIM_ERR_REDACTED=$(printf '%s\n' "$SIM_ERR" \
      | sed -e "s|${SIGNER_KEY}|***REDACTED-KEY***|g" \
            -e "s|${SIGNER_KEY_BARE}|***REDACTED-KEY***|g" 2>/dev/null \
      || echo "(stderr redaction failed; suppressing raw output)")
    # Echo redacted stderr to our own stderr so the CLI can capture it.
    if [ -n "$SIM_ERR_REDACTED" ]; then
      printf '%s\n' "$SIM_ERR_REDACTED" >&2
    fi
    die "simulation failed (forge exited non-zero; see redacted stderr above)"
  }

# Parse simulation results. `forge script --fork-url ... --json` (no
# --broadcast) emits a single JSON object per run with shape:
#   {"logs":["SAGAHandleRegistry: 0xabc...", ...], "success":true,
#    "returns":{}, "raw_logs":[...]}
# i.e. console.log lines from Deploy.s.sol come back as the `logs[]`
# array of strings. The structured `transactions[]` array is only
# populated under `--broadcast`. Extract addresses by capturing
# "<ContractName>: 0x<40 hex>" pairs from the log strings.
ADDRESSES=$(echo "$SIM_OUTPUT" | jq -sc '
  [
    .[].logs[]?
    | capture("^(?<key>SAGA[A-Za-z]+): (?<value>0x[a-fA-F0-9]{40})$")
  ]
  | from_entries // {}
' 2>/dev/null || echo '{}')

# Gas estimate is not present in the fork-only --json output; would
# require --broadcast to populate transactions[]. Surface a known
# sentinel so dry-run callers know they need to broadcast for the
# real estimate.
GAS_ESTIMATE='"unavailable-in-dry-run"'

log "simulation complete"

# ── Dry-run: output and exit ───────────────────────────────────────────
if [ "$MODE" = "dry-run" ]; then
  echo "{\"status\":\"simulated\",\"chain\":\"${CHAIN}\",\"chainId\":${CHAIN_ID},\"signer\":\"${SIGNER_ADDR}\",\"addresses\":${ADDRESSES},\"gasEstimate\":${GAS_ESTIMATE}}"
  exit 0
fi

# ── Broadcast: deploy directly or propose to Safe ─────────────────────
if [ "$MODE" = "broadcast" ]; then

  # Direct deployment when signer has sole authority (threshold == 1)
  # OR when Phase 10 H-5 DEPLOY_DIRECT=true is set for the initial factory
  # deploy (the Safe will accept ownership afterward via TransferOwnership.s.sol).
  if [ "$SAFE_THRESHOLD_EFFECTIVE" = "1" ]; then
    log "deploying directly (effective threshold=1, signer broadcasts)"

    # Capture forge stderr the same way the dry-run path does — without
    # this the broadcast can silently no-op (RPC failures, gas issues,
    # nonce conflicts) and the JSON parser falls through to empty
    # addresses. SIGNER_KEY is sed'd out before stderr is surfaced.
    BCAST_STDERR_FILE="$(mktemp /tmp/saga-bcast-stderr.XXXXXX)"
    BROADCAST_OUTPUT=$(DEPLOYER_PRIVATE_KEY="$SIGNER_KEY" \
      forge script script/Deploy.s.sol \
      --fork-url "$RPC" \
      --broadcast \
      --json 2>"$BCAST_STDERR_FILE") || {
        BCAST_ERR=$(cat "$BCAST_STDERR_FILE" 2>/dev/null || true)
        SIGNER_KEY_BARE="${SIGNER_KEY#0x}"
        BCAST_ERR_REDACTED=$(printf '%s\n' "$BCAST_ERR" \
          | sed -e "s|${SIGNER_KEY}|***REDACTED-KEY***|g" \
                -e "s|${SIGNER_KEY_BARE}|***REDACTED-KEY***|g" 2>/dev/null \
          || echo "(stderr redaction failed; suppressing raw output)")
        rm -f "$BCAST_STDERR_FILE"
        if [ -n "$BCAST_ERR_REDACTED" ]; then
          printf '%s\n' "$BCAST_ERR_REDACTED" >&2
        fi
        die "broadcast deployment failed (forge exited non-zero; see redacted stderr above)"
      }
    # Forge succeeded — but it can also "succeed" without broadcasting
    # any transactions (e.g. all calls were view/pure or simulation-only
    # fell through). Surface stderr to our own stderr too so the caller
    # can see any warnings even on a no-op success.
    if [ -s "$BCAST_STDERR_FILE" ]; then
      SIGNER_KEY_BARE="${SIGNER_KEY#0x}"
      sed -e "s|${SIGNER_KEY}|***REDACTED-KEY***|g" \
          -e "s|${SIGNER_KEY_BARE}|***REDACTED-KEY***|g" \
          "$BCAST_STDERR_FILE" >&2 || true
    fi
    rm -f "$BCAST_STDERR_FILE"

    # Parse deployed addresses from broadcast output. Forge --broadcast
    # emits transactions[] objects with contractName/contractAddress for
    # CREATE/CREATE2 ops. Fall back to the same logs[] regex the
    # simulation path uses if transactions[] is empty (covers cases
    # where forge logged the deploys but didn't populate the
    # transactions array under some flag combinations).
    DEPLOYED_ADDRESSES=$(echo "$BROADCAST_OUTPUT" | jq -sc '
      ([.[].transactions[]? | select(.transactionType == "CREATE" or .transactionType == "CREATE2") |
        {key: .contractName, value: .contractAddress}] | from_entries) as $tx |
      ($tx | length) as $tx_count |
      if $tx_count > 0 then $tx
      else
        [.[].logs[]?
         | capture("^(?<key>SAGA[A-Za-z]+): (?<value>0x[a-fA-F0-9]{40})$")]
        | from_entries // {}
      end
    ' 2>/dev/null || echo '{}')

    GAS_USED=$(echo "$BROADCAST_OUTPUT" | jq -sc '[.[].transactions[]?.gas // 0] | add // 0' 2>/dev/null || echo '0')

    # Verify at least one address landed on-chain. Empty result means
    # forge didn't actually broadcast anything and we should fail loudly
    # instead of returning a misleading "deployed" status.
    ADDR_COUNT=$(echo "$DEPLOYED_ADDRESSES" | jq -r 'length' 2>/dev/null || echo 0)
    if [ "$ADDR_COUNT" = "0" ]; then
      die "broadcast produced zero deployed addresses — forge may have aborted silently. Check redacted stderr above."
    fi

    log "deployment broadcast complete (${ADDR_COUNT} contracts)"
    echo "{\"status\":\"deployed\",\"chain\":\"${CHAIN}\",\"chainId\":${CHAIN_ID},\"signer\":\"${SIGNER_ADDR}\",\"addresses\":${DEPLOYED_ADDRESSES},\"gasUsed\":${GAS_USED},\"mode\":\"direct\"}"
    exit 0
  fi

  # Multi-sig Safe proposal flow (threshold > 1)
  log "encoding safe transaction batch"

  # Re-simulate to extract transaction calldata (no --broadcast, no on-chain txs)
  BROADCAST_OUTPUT=$(DEPLOYER_PRIVATE_KEY="$SIGNER_KEY" \
    forge script script/Deploy.s.sol \
    --fork-url "$RPC" \
    --json 2>/dev/null) || die "simulation for broadcast failed"

  # Guard: Safe cannot execute raw CREATE transactions (no .to address)
  HAS_CREATE_TX=$(echo "$BROADCAST_OUTPUT" | jq -sc 'any(.[].transactions[]?; .transaction.to == null)' 2>/dev/null || echo "false")
  if [ "$HAS_CREATE_TX" = "true" ]; then
    die "Deploy script produces CREATE transactions. A Safe cannot execute raw CREATE — use a factory/CREATE2 deployment pattern."
  fi

  # Extract transaction data for Safe batch proposal (forge --json may produce multiple JSON objects)
  TRANSACTIONS=$(echo "$BROADCAST_OUTPUT" | jq -sc '[.[].transactions[]? | {
    to: .transaction.to,
    value: "0",
    data: .transaction.data,
    operation: 0
  }]' 2>/dev/null) || die "failed to parse transactions"

  # Compute Safe transaction hash
  NONCE=$(curl -sfL "${SAFE_TX_SERVICE}/api/v1/safes/${SAFE_ADDR}/" \
    | jq -r '.nonce' 2>/dev/null) || die "failed to get safe nonce"

  # Build the multisend batch for Safe
  # For multi-transaction deploys, encode as MultiSend
  TX_COUNT=$(echo "$TRANSACTIONS" | jq 'length')

  if [ "$TX_COUNT" -gt 1 ]; then
    # MultiSend encoding: pack each tx as op(1) + to(20) + value(32) + dataLen(32) + data
    MULTISEND_ADDR="0x38869bf66a61cF6bDB996A6aE40D5853Fd43B526" # Safe MultiSend canonical
    MULTISEND_PACKED=""
    while IFS= read -r TX; do
      TX_TO=$(echo "$TX" | jq -r '.to')
      TX_DATA=$(echo "$TX" | jq -r '.data')
      TX_TO_HEX="${TX_TO#0x}"
      TX_DATA_HEX="${TX_DATA#0x}"
      TX_DATA_LEN=$(( ${#TX_DATA_HEX} / 2 ))
      # op=00 (CALL), to (20 bytes, left-padded), value (32 bytes, zero), dataLen (32 bytes), data
      VALUE_HEX=$(printf '%064x' 0)
      LEN_HEX=$(printf '%064x' "$TX_DATA_LEN")
      MULTISEND_PACKED="${MULTISEND_PACKED}00${TX_TO_HEX}${VALUE_HEX}${LEN_HEX}${TX_DATA_HEX}"
    done < <(echo "$TRANSACTIONS" | jq -c '.[]')

    OPERATION=1 # DelegateCall for MultiSend
    TO_ADDR="$MULTISEND_ADDR"
    # Encode the multiSend(bytes) call with packed transactions
    CALL_DATA=$(cast calldata "multiSend(bytes)" "0x${MULTISEND_PACKED}" 2>/dev/null) \
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
  HTTP_STATUS=$(curl -sfL -o /tmp/safe-response.json -w "%{http_code}" \
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
  TX_RESULT=$(curl -sfL "${SAFE_TX_SERVICE}/api/v1/multisig-transactions/${SAFE_TX_HASH}/" 2>/dev/null) \
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
    VERIFY_FAILED=false
    for ROW in $(echo "$FINAL_ADDRESSES" | jq -r 'to_entries[] | "\(.key)=\(.value)"'); do
      NAME="${ROW%%=*}"
      ADDR="${ROW#*=}"
      if ! BASESCAN_API_KEY="$EXPLORER_KEY" forge verify-contract \
        "$ADDR" "src/${NAME}.sol:${NAME}" \
        --chain-id "$CHAIN_ID" \
        --etherscan-api-key "$EXPLORER_KEY" \
        --watch 2>/dev/null; then
        log "verification failed for ${NAME} (non-fatal)"
        VERIFY_FAILED=true
      fi
    done
    [ "$VERIFY_FAILED" = "false" ] && VERIFIED=true
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
