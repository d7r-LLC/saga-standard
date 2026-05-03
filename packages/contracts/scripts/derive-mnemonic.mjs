#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC
//
// Derive a hex private key from a BIP-39 mnemonic supplied on stdin.
//
// The mnemonic is read from stdin and NEVER appears on argv, so it does not
// leak via /proc/$pid/cmdline or `ps -ef`. The derivation path is taken from
// the first positional argument (default `m/44'/60'/0'/0/0`).
//
// Output: a single line `0x<64 hex chars>` to stdout, no trailing newline,
// no logging of any kind. Errors go to stderr and exit code 1.
//
// Used by packages/contracts/scripts/deploy-entrypoint.sh as the secure
// replacement for `cast wallet private-key "$MNEMONIC" "$PATH"` (Phase 1
// of the 2026-05-03 security remediation, finding A-Crit#3).
//
// Validation: a quick smoke test with the well-known Hardhat mnemonic
//   "test test test test test test test test test test test junk"
// at default path yields:
//   0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
// which is Hardhat account index 0. Used as a regression vector in tests.

import { mnemonicToSeedSync, validateMnemonic } from '@scure/bip39'
import { wordlist as englishWordlist } from '@scure/bip39/wordlists/english'
import { HDKey } from '@scure/bip32'

function bytesToHex(bytes) {
  return [...bytes].map(b => b.toString(16).padStart(2, '0')).join('')
}

function readStdin() {
  return new Promise((resolve, reject) => {
    let data = ''
    process.stdin.setEncoding('utf-8')
    process.stdin.on('data', chunk => {
      data += chunk
    })
    process.stdin.on('end', () => resolve(data))
    process.stdin.on('error', reject)
  })
}

async function main() {
  const derivationPath = process.argv[2] ?? "m/44'/60'/0'/0/0"

  const raw = await readStdin()
  // Trim trailing whitespace/newline; keep internal single spaces between words.
  const mnemonic = raw.trim().replace(/\s+/g, ' ')

  if (!mnemonic) {
    console.error('derive-mnemonic: empty mnemonic on stdin')
    process.exit(1)
  }

  if (!validateMnemonic(mnemonic, englishWordlist)) {
    console.error('derive-mnemonic: invalid BIP-39 mnemonic')
    process.exit(1)
  }

  // Derive seed → HD master key → child key at the derivation path.
  const seed = mnemonicToSeedSync(mnemonic)
  const masterKey = HDKey.fromMasterSeed(seed)
  const childKey = masterKey.derive(derivationPath)

  if (!childKey.privateKey) {
    console.error('derive-mnemonic: derivation produced no private key')
    process.exit(1)
  }

  // Emit hex key to stdout with no trailing newline, ever.
  process.stdout.write(`0x${bytesToHex(childKey.privateKey)}`)
}

main().catch(err => {
  // Generic error message — never echo the mnemonic or partial key.
  console.error(`derive-mnemonic: ${err && err.message ? err.message : 'failed'}`)
  process.exit(1)
})
