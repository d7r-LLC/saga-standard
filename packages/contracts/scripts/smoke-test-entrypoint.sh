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
SIGNER_FIELD=$(echo "$CONFIG" | jq -r '.op.signerField // "password"')

# Smoke-test-specific: deployed addresses come in via the same config payload.
HANDLE_REGISTRY=$(echo "$CONFIG" | jq -r '.deployed.SAGAHandleRegistry // empty')
AGENT_IDENTITY=$(echo "$CONFIG" | jq -r '.deployed.SAGAAgentIdentity // empty')
ORG_IDENTITY=$(echo "$CONFIG" | jq -r '.deployed.SAGAOrgIdentity // empty')
DIRECTORY_IDENTITY=$(echo "$CONFIG" | jq -r '.deployed.SAGADirectoryIdentity // empty')

[ -z "$HANDLE_REGISTRY" ] && die "missing .deployed.SAGAHandleRegistry"
[ -z "$AGENT_IDENTITY" ] && die "missing .deployed.SAGAAgentIdentity"
[ -z "$ORG_IDENTITY" ] && die "missing .deployed.SAGAOrgIdentity"
[ -z "$DIRECTORY_IDENTITY" ] && die "missing .deployed.SAGADirectoryIdentity"

# Optional uniqueness suffix; defaults to block timestamp inside the script.
SMOKE_SUFFIX=$(echo "$CONFIG" | jq -r '.smokeSuffix // empty')

log "chain=${CHAIN} chainId=${CHAIN_ID} mode=smoke-test"
log "registry=${HANDLE_REGISTRY}"

# ── Fetch secrets ──────────────────────────────────────────────────────
# Two modes mirror deploy-entrypoint.sh exactly: env-token (container
# resolves via op) or stdin (CLI resolved on host and piped JSON in).
if [ "${SECRETS_VIA_STDIN:-0}" = "1" ]; then
  log "secrets mode: stdin (host-resolved via op CLI)"
  STDIN_JSON=$(cat)
  [ -z "$STDIN_JSON" ] && die "SECRETS_VIA_STDIN=1 but stdin was empty"
  SIGNER_INPUT=$(echo "$STDIN_JSON" | jq -r '.signer // empty') \
    || die "failed to parse signer from stdin"
  [ -z "$SIGNER_INPUT" ] && die "stdin payload missing .signer"
  STDIN_DERIVATION_PATH=$(echo "$STDIN_JSON" | jq -r '.derivationPath // empty')
  unset STDIN_JSON
else
  log "secrets mode: env-token (container resolves via op)"
  [ -z "${OP_SERVICE_ACCOUNT_TOKEN:-}" ] && die "OP_SERVICE_ACCOUNT_TOKEN not set"
  SIGNER_INPUT=$(op read "op://${VAULT}/${SIGNER_ITEM}/${SIGNER_FIELD}" 2>/dev/null) \
    || die "failed to read signer credential from 1password"
fi

# ── Detect credential format and resolve to a hex private key ──────────
WORD_COUNT=$(echo -n "$SIGNER_INPUT" | wc -w | tr -d ' ')

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
      0x*) ;;
      *) SIGNER_KEY="0x${SIGNER_KEY}" ;;
    esac
    ;;
  *)
    die "signer credential has invalid format"
    ;;
esac
unset SIGNER_INPUT

SIGNER_ADDR=$(cast wallet address "$SIGNER_KEY" 2>/dev/null) \
  || die "invalid signer key (could not derive address)"
log "signer=${SIGNER_ADDR}"

# ── Run smoke test ─────────────────────────────────────────────────────
log "running smoke test"

# Capture forge stderr the same way Deploy does, scrub the key out
# before surfacing on failure.
SMOKE_STDERR_FILE="$(mktemp /tmp/saga-smoke-stderr.XXXXXX)"
trap 'rm -f "$SMOKE_STDERR_FILE"' EXIT

# Build the env-export prefix conditionally — `vm.envOr("X", default)`
# inside Solidity treats an EMPTY string as a present value (not a
# missing var), so passing SMOKE_SUFFIX="" would override the default
# block-timestamp suffix and produce handles like `smoke-dir-` that
# fail the registry's "must end with alphanumeric" check. Only export
# SMOKE_SUFFIX when we actually have a value.
set +e
if [ -n "$SMOKE_SUFFIX" ]; then
  DEPLOYER_PRIVATE_KEY="$SIGNER_KEY" \
  HANDLE_REGISTRY="$HANDLE_REGISTRY" \
  AGENT_IDENTITY="$AGENT_IDENTITY" \
  ORG_IDENTITY="$ORG_IDENTITY" \
  DIRECTORY_IDENTITY="$DIRECTORY_IDENTITY" \
  SMOKE_SUFFIX="$SMOKE_SUFFIX" \
  forge script script/SmokeTest.s.sol \
    --fork-url "$RPC" \
    --broadcast \
    --json >"$SMOKE_STDERR_FILE.stdout" 2>"$SMOKE_STDERR_FILE"
else
  DEPLOYER_PRIVATE_KEY="$SIGNER_KEY" \
  HANDLE_REGISTRY="$HANDLE_REGISTRY" \
  AGENT_IDENTITY="$AGENT_IDENTITY" \
  ORG_IDENTITY="$ORG_IDENTITY" \
  DIRECTORY_IDENTITY="$DIRECTORY_IDENTITY" \
  forge script script/SmokeTest.s.sol \
    --fork-url "$RPC" \
    --broadcast \
    --json >"$SMOKE_STDERR_FILE.stdout" 2>"$SMOKE_STDERR_FILE"
fi
RC=$?
set -e

SMOKE_STDOUT=$(cat "$SMOKE_STDERR_FILE.stdout" 2>/dev/null || true)
SMOKE_ERR=$(cat "$SMOKE_STDERR_FILE" 2>/dev/null || true)
SIGNER_KEY_BARE="${SIGNER_KEY#0x}"
SMOKE_ERR_REDACTED=$(printf '%s\n' "$SMOKE_ERR" \
  | sed -e "s|${SIGNER_KEY}|***REDACTED-KEY***|g" \
        -e "s|${SIGNER_KEY_BARE}|***REDACTED-KEY***|g" 2>/dev/null \
  || echo "(stderr redaction failed)")
rm -f "$SMOKE_STDERR_FILE.stdout"

if [ "$RC" != "0" ]; then
  if [ -n "$SMOKE_ERR_REDACTED" ]; then
    printf '%s\n' "$SMOKE_ERR_REDACTED" >&2
  fi
  die "smoke test failed (forge exited ${RC}; see redacted stderr above)"
fi

# Extract minted token IDs and handles from logs[] for output.
MINTS=$(echo "$SMOKE_STDOUT" | jq -sc '
  [.[].logs[]?
   | capture("^(?<key>(Directory|Org|Agent.*)) tokenId: (?<value>[0-9]+)$")
   | {key: .key, value: (.value | tonumber)}]
  | from_entries // {}
' 2>/dev/null || echo '{}')

PASSED=$(echo "$SMOKE_STDOUT" | jq -sc '
  [.[].logs[]? | select(. == "=== SMOKE TEST PASSED ===")] | length > 0
' 2>/dev/null || echo 'false')

if [ "$PASSED" != "true" ]; then
  die "SmokeTest.s.sol did not emit success marker (forge exited 0 but assertions did not pass)"
fi

log "smoke test passed"
echo "{\"status\":\"smoke-passed\",\"chain\":\"${CHAIN}\",\"chainId\":${CHAIN_ID},\"signer\":\"${SIGNER_ADDR}\",\"mints\":${MINTS}}"
