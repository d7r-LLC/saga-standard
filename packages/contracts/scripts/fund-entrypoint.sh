#!/usr/bin/env bash
set -euo pipefail

# Send ETH from 1Password-stored signer key to a target address.
# Used to fund test wallets on testnets.

log() { echo "{\"log\":\"$1\",\"ts\":\"$(date -u +%FT%TZ)\"}" >&2; }
die() { echo "{\"error\":\"$1\"}" >&2 && exit 1; }

# ── Parse config from base64 env var ────────────────────────────────────
[ -z "${FUND_CONFIG:-}" ] && die "FUND_CONFIG not set"
CONFIG=$(echo "$FUND_CONFIG" | base64 -d 2>/dev/null) || die "invalid FUND_CONFIG"

RPC=$(echo "$CONFIG" | jq -r '.rpc') || die "missing .rpc"
VAULT=$(echo "$CONFIG" | jq -r '.op.vault') || die "missing .op.vault"
SIGNER_ITEM=$(echo "$CONFIG" | jq -r '.op.signerItem') || die "missing .op.signerItem"
TO_ADDRESS=$(echo "$CONFIG" | jq -r '.to') || die "missing .to"
AMOUNT=$(echo "$CONFIG" | jq -r '.amount') || die "missing .amount"

log "to=${TO_ADDRESS} amount=${AMOUNT}"

# ── Validate 1Password token ───────────────────────────────────────────
[ -z "${OP_SERVICE_ACCOUNT_TOKEN:-}" ] && die "OP_SERVICE_ACCOUNT_TOKEN not set"

# ── Fetch signer key from 1Password ────────────────────────────────────
log "reading signer key from 1password"
SIGNER_KEY=$(op read "op://${VAULT}/${SIGNER_ITEM}/password" 2>/dev/null) \
  || die "failed to read signer key from 1password"

# ── Normalize key format (ensure 0x prefix) ────────────────────────────
case "$SIGNER_KEY" in
  0x*) ;; # already has prefix
  *) SIGNER_KEY="0x${SIGNER_KEY}" ;;
esac

# ── Derive signer address ──────────────────────────────────────────────
SIGNER_ADDR=$(cast wallet address "$SIGNER_KEY" 2>/dev/null) \
  || die "invalid signer key"
log "signer=${SIGNER_ADDR}"

# ── Check balance ──────────────────────────────────────────────────────
BALANCE=$(cast balance "$SIGNER_ADDR" --rpc-url "$RPC" 2>/dev/null) \
  || die "failed to check balance"
log "balance=${BALANCE}"

# ── Send ETH ───────────────────────────────────────────────────────────
log "sending ${AMOUNT} to ${TO_ADDRESS}"
TX_HASH=$(cast send "$TO_ADDRESS" \
  --value "$AMOUNT" \
  --private-key "$SIGNER_KEY" \
  --rpc-url "$RPC" \
  --json 2>/dev/null | jq -r '.transactionHash') \
  || die "send failed"

log "sent tx=${TX_HASH}"

# ── Output result ──────────────────────────────────────────────────────
echo "{\"status\":\"sent\",\"txHash\":\"${TX_HASH}\",\"from\":\"${SIGNER_ADDR}\",\"to\":\"${TO_ADDRESS}\",\"amount\":\"${AMOUNT}\"}"
