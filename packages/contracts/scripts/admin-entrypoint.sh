#!/usr/bin/env bash
set -euo pipefail

# Execute admin operations using the 1Password-stored signer key.
# Supported operations: authorize-contract

log() { echo "{\"log\":\"$1\",\"ts\":\"$(date -u +%FT%TZ)\"}" >&2; }
die() { echo "{\"error\":\"$1\"}" >&2 && exit 1; }

# ── Parse config from base64 env var ────────────────────────────────────
[ -z "${ADMIN_CONFIG:-}" ] && die "ADMIN_CONFIG not set"
CONFIG=$(echo "$ADMIN_CONFIG" | base64 -d 2>/dev/null) || die "invalid ADMIN_CONFIG"

RPC=$(echo "$CONFIG" | jq -r '.rpc') || die "missing .rpc"
VAULT=$(echo "$CONFIG" | jq -r '.op.vault') || die "missing .op.vault"
SIGNER_ITEM=$(echo "$CONFIG" | jq -r '.op.signerItem') || die "missing .op.signerItem"
OPERATION=$(echo "$CONFIG" | jq -r '.operation') || die "missing .operation"

log "operation=${OPERATION}"

# ── Validate 1Password token ───────────────────────────────────────────
[ -z "${OP_SERVICE_ACCOUNT_TOKEN:-}" ] && die "OP_SERVICE_ACCOUNT_TOKEN not set"

# ── Fetch signer key from 1Password ────────────────────────────────────
log "reading signer key from 1password"
SIGNER_KEY=$(op read "op://${VAULT}/${SIGNER_ITEM}/password" 2>/dev/null) \
  || die "failed to read signer key from 1password"

# ── Normalize key format ───────────────────────────────────────────────
case "$SIGNER_KEY" in
  0x*) ;;
  *) SIGNER_KEY="0x${SIGNER_KEY}" ;;
esac

SIGNER_ADDR=$(cast wallet address "$SIGNER_KEY" 2>/dev/null) \
  || die "invalid signer key"
log "signer=${SIGNER_ADDR}"

# ── Execute operation ──────────────────────────────────────────────────
case "$OPERATION" in
  authorize-contract)
    REGISTRY=$(echo "$CONFIG" | jq -r '.registry') || die "missing .registry"
    TARGET=$(echo "$CONFIG" | jq -r '.target') || die "missing .target"
    AUTHORIZED=$(echo "$CONFIG" | jq -r '.authorized // "true"')

    log "authorizing ${TARGET} on registry ${REGISTRY} (authorized=${AUTHORIZED})"

    TX_HASH=$(cast send "$REGISTRY" \
      "setAuthorizedContract(address,bool)" "$TARGET" "$AUTHORIZED" \
      --private-key "$SIGNER_KEY" \
      --rpc-url "$RPC" \
      --json 2>/dev/null | jq -r '.transactionHash') \
      || die "setAuthorizedContract failed"

    log "tx=${TX_HASH}"
    echo "{\"status\":\"success\",\"operation\":\"${OPERATION}\",\"txHash\":\"${TX_HASH}\",\"registry\":\"${REGISTRY}\",\"target\":\"${TARGET}\",\"authorized\":${AUTHORIZED}}"
    ;;
  *)
    die "unknown operation: ${OPERATION}"
    ;;
esac
