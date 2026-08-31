// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { execFileSync } from 'node:child_process'

/**
 * Deploy secrets resolved on the host via the interactive `op` CLI.
 *
 * Used as a fallback when OP_SERVICE_ACCOUNT_TOKEN is not set. The
 * caller is responsible for passing these to the deploy container via
 * stdin (NOT env vars) so the values do not leak into /proc/$pid/environ
 * on the host. Caller should also null out the reference after use.
 */
export interface ResolvedSecrets {
  signer: string
  explorerKey: string
  derivationPath: string | null
}

export interface SecretSourceConfig {
  vault: string
  signerItem: string
  /** Field on the signer item — defaults to `password`. */
  signerField?: string
  explorerKeyItem: string
}

/**
 * Read deploy secrets from the host's `op` CLI session.
 *
 * Throws with an actionable message if `op` is not signed in or any
 * required field is missing. Never logs the resolved values.
 */
export function resolveSecretsFromHostOp(config: SecretSourceConfig): ResolvedSecrets {
  const field = config.signerField ?? 'password'

  const signer = readOpSecret(
    `op://${config.vault}/${config.signerItem}/${field}`,
    'signer credential'
  )
  const explorerKey = readOpSecret(
    `op://${config.vault}/${config.explorerKeyItem}/password`,
    'explorer api key'
  )

  // derivation_path is optional — only mnemonic-format signers use it.
  let derivationPath: string | null = null
  try {
    derivationPath = execFileSync(
      'op',
      ['read', `op://${config.vault}/${config.signerItem}/derivation_path`],
      { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30_000 }
    ).trim()
    if (!derivationPath) derivationPath = null
  } catch {
    // Field absent or item has no derivation_path — fine, downstream defaults.
  }

  return { signer, explorerKey, derivationPath }
}

/**
 * Whether the host `op` CLI is available and signed in. Returns false
 * (without throwing) if `op` is missing, not signed in, or the call
 * times out.
 *
 * Uses `op vault list` rather than `op whoami` — `whoami` requires an
 * implicitly-selected default account and reports "account is not
 * signed in" on multi-account setups even when the user IS signed in
 * to the relevant account. `vault list` aggregates across signed-in
 * accounts and succeeds whenever ANY account has an active session,
 * which is the property we actually want here. Timeout is generous
 * (30s) to accommodate macOS biometric prompts on cold start and
 * 1Password daemon spin-up.
 */
export function isHostOpAvailable(): boolean {
  try {
    execFileSync('op', ['vault', 'list', '--format=json'], {
      stdio: 'pipe',
      timeout: 30_000,
    })
    return true
  } catch {
    return false
  }
}

function readOpSecret(opUri: string, label: string): string {
  let value: string
  try {
    value = execFileSync('op', ['read', opUri], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
      // 30s allows for biometric prompts (Touch ID) on macOS while the
      // 1Password daemon caches credentials. Subsequent reads in the
      // same run land in the warm-path under 1s.
      timeout: 30_000,
    }).trim()
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    throw new Error(`Failed to read ${label} via host op CLI (${opUri}): ${msg}`)
  }
  if (!value) {
    throw new Error(`Host op CLI returned empty ${label} for ${opUri}`)
  }
  return value
}
