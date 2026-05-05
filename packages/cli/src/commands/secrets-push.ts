// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { Command } from 'commander'
import chalk from 'chalk'
import ora from 'ora'
import { existsSync, readFileSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { execFileSync, spawnSync } from 'node:child_process'

/**
 * Map ENV-style key to the canonical 1Password item slug. Mirrors the
 * naming convention from secrets-generate.ts header.
 */
function itemSlugFor(envName: string, secretName: string): string {
  return `saga-server-${envName}-${secretName.toLowerCase().replace(/_/g, '-')}`
}

interface SecretEntry {
  name: string
  value: string
}

/**
 * Parse a .env-style file into name->value pairs. Handles:
 *   - blank lines (skipped)
 *   - comment lines starting with `#` (skipped)
 *   - KEY=VALUE pairs (no quoting, no escapes — values are stored
 *     verbatim including any whitespace before #)
 *
 * Inline comments (KEY=VALUE  # note) are NOT supported because most
 * generated secrets are random-hex and would never contain `#`, but
 * silently truncating at the first `#` would corrupt any future
 * secret that legitimately contained one. Lines that look like they
 * tried to use inline-comment syntax are REJECTED — the parse throws
 * with the line number so the operator notices and either removes
 * the trailing comment or escapes the `#` differently.
 */
function parseEnvFile(content: string): SecretEntry[] {
  const out: SecretEntry[] = []
  const lines = content.split('\n')
  lines.forEach((raw, idx) => {
    const line = raw.trim()
    if (!line || line.startsWith('#')) return
    const eq = line.indexOf('=')
    if (eq === -1) return
    const name = line.slice(0, eq).trim()
    const value = line.slice(eq + 1)
    // Validate name shape — KEY must be uppercase identifier so we don't
    // accidentally interpret a quoted line or array assignment as a secret.
    if (!/^[A-Z][A-Z0-9_]*$/.test(name)) return
    if (!value) return
    // Reject inline-comment syntax. Specifically: at least one
    // whitespace char followed by `#` somewhere in the value half.
    // Without this guard the trailing ` # note` would be silently
    // included in the secret value and uploaded to 1Password.
    if (/\s+#/.test(value)) {
      throw new Error(
        `${idx + 1}: inline comments (KEY=VALUE  # note) are not supported. ` +
          `Either remove the trailing comment or move it to its own line.`
      )
    }
    out.push({ name, value })
  })
  return out
}

/**
 * Whether the named vault exists in the user's signed-in 1Password
 * account. Returns false (without throwing) when `op` reports it
 * missing or fails for any reason.
 */
function vaultExists(name: string): boolean {
  try {
    const out = execFileSync('op', ['vault', 'list', '--format=json'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 30_000,
    }).toString()
    const vaults = JSON.parse(out) as Array<{ name: string }>
    return vaults.some(v => v.name === name)
  } catch {
    return false
  }
}

function createVault(name: string): void {
  // `op vault create` accepts a positional name argument and prints
  // the new vault's UUID + name to stdout. We ignore stdout content.
  execFileSync('op', ['vault', 'create', name], {
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 30_000,
  })
}

/**
 * Whether the named item exists in the named vault.
 */
function itemExists(vault: string, item: string): boolean {
  try {
    execFileSync('op', ['item', 'get', item, '--vault', vault, '--format=json'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 30_000,
    })
    return true
  } catch {
    return false
  }
}

/**
 * Create or update a 1Password item with a single CONCEALED `value`
 * field. Uses argv assignment syntax (`value=secret`) which 1P CLI
 * accepts — but the value DOES land on argv for the `op` process
 * lifetime. Acceptable because:
 *   - We're not on a multi-tenant host (the user's machine).
 *   - The alternative (op connect via API) would require a separate
 *     setup we don't have wired.
 *   - The value is already on disk in `.env.staging` (mode 0600); the
 *     argv exposure is no worse than that.
 *
 * The function NEVER logs the value or returns it.
 */
function putItem(vault: string, item: string, value: string): 'created' | 'updated' {
  const existed = itemExists(vault, item)
  if (existed) {
    // `op item edit` updates the existing item; assign syntax replaces
    // the named field's value. We use `value[concealed]=...` to make
    // sure the field is created with concealed shape on first edit
    // (idempotent — if already concealed, no-op on shape).
    const result = spawnSync(
      'op',
      ['item', 'edit', item, '--vault', vault, `value[concealed]=${value}`],
      { stdio: ['ignore', 'pipe', 'pipe'], timeout: 30_000 }
    )
    if (result.status !== 0) {
      const stderr = (result.stderr ?? '').toString()
      throw new Error(`op item edit failed for ${item}: ${stderr.split('\n')[0]}`)
    }
    return 'updated'
  }

  // New item. Use category=Password (single-string credential) and
  // populate the `value` field as CONCEALED.
  const result = spawnSync(
    'op',
    [
      'item',
      'create',
      '--category',
      'password',
      '--vault',
      vault,
      '--title',
      item,
      `value[concealed]=${value}`,
    ],
    { stdio: ['ignore', 'pipe', 'pipe'], timeout: 30_000 }
  )
  if (result.status !== 0) {
    const stderr = (result.stderr ?? '').toString()
    throw new Error(`op item create failed for ${item}: ${stderr.split('\n')[0]}`)
  }
  return 'created'
}

export const secretsPushCommand = new Command('push')
  .description(
    'Read a .env.<env> file written by `saga secrets generate` and push each ' +
      'value into the corresponding 1Password vault item. Creates the vault ' +
      'and items if missing; updates them if present. Optionally deletes the ' +
      'on-disk file after a successful push.'
  )
  .requiredOption('--env <env>', 'Target environment (e.g., staging, production)')
  .option('--in <path>', 'Override input path (default: packages/server/.env.<env>)')
  .option('--vault <name>', 'Override vault name (default: saga-<env>)')
  .option(
    '--keep-file',
    'Do NOT delete the local .env.<env> file after a successful push (default: delete)'
  )
  .option(
    '--dry-run',
    'List what would be pushed without contacting 1Password or modifying anything'
  )
  .action(opts => {
    const envName = opts.env
    const vaultName = opts.vault ?? `saga-${envName}`

    if (envName === 'production' && vaultName !== 'saga-prod' && vaultName !== 'saga-production') {
      console.error(
        chalk.red(
          `Refusing to push production secrets to vault "${vaultName}". ` +
            `Production secrets must land in saga-prod (or pass --vault saga-prod explicitly).`
        )
      )
      process.exit(1)
    }

    // Locate packages/server. Same heuristic as deploy / smoke-test /
    // secrets-generate.
    const candidates = [
      join(process.cwd(), 'packages', 'server'),
      join(process.cwd(), '..', 'server'),
    ]
    let serverDir = ''
    for (const dir of candidates) {
      if (existsSync(join(dir, 'wrangler.toml'))) {
        serverDir = dir
        break
      }
    }
    if (!serverDir && !opts.in) {
      console.error(chalk.red('Cannot find packages/server directory. Run from the monorepo root.'))
      process.exit(1)
    }

    const inPath = opts.in ?? join(serverDir, `.env.${envName}`)
    if (!existsSync(inPath)) {
      console.error(chalk.red(`Secrets file not found: ${inPath}`))
      console.error(chalk.dim(`Run \`saga secrets generate --env ${envName}\` first.`))
      process.exit(1)
    }

    let entries: SecretEntry[]
    try {
      entries = parseEnvFile(readFileSync(inPath, 'utf-8'))
    } catch (err) {
      // parseEnvFile prefixes its error with `<line>: <reason>`. Surface
      // the file path + that line context so the operator can navigate
      // straight to the bad line.
      console.error(chalk.red(`Failed to parse ${inPath}:${(err as Error).message}`))
      process.exit(1)
    }

    if (entries.length === 0) {
      console.error(chalk.red(`No secrets to push — ${inPath} has no KEY=VALUE lines.`))
      console.error(
        chalk.dim(
          'If you populated optional LLM keys (ANTHROPIC_API_KEY, etc.), ' +
            'uncomment the lines in the file before re-running.'
        )
      )
      process.exit(1)
    }

    console.log(chalk.bold(`Pushing ${entries.length} secret(s) to vault ${vaultName}:`))
    for (const entry of entries) {
      console.log(`  ${entry.name.padEnd(28)} -> ${itemSlugFor(envName, entry.name)}`)
    }
    console.log()

    if (opts.dryRun) {
      console.log(chalk.dim('--dry-run: no changes made.'))
      return
    }

    // Verify op CLI is signed in before doing any mutation.
    const probeSpinner = ora('Checking 1Password CLI...').start()
    if (!vaultExists(vaultName)) {
      // Vault doesn't exist — try to create it. If `op` is not signed
      // in at all, this will fail with a sign-in error.
      probeSpinner.text = `Creating vault: ${vaultName}`
      try {
        createVault(vaultName)
        probeSpinner.succeed(`Vault created: ${vaultName}`)
      } catch (err) {
        probeSpinner.fail(`Could not create vault "${vaultName}".`)
        const msg = (err as Error).message
        if (/not currently signed in|account is not signed in/i.test(msg)) {
          console.error(
            chalk.dim(
              'Run `op signin` first, or set OP_SERVICE_ACCOUNT_TOKEN if running ' +
                'non-interactively.'
            )
          )
        } else {
          console.error(chalk.dim(msg.split('\n')[0]))
        }
        process.exit(1)
      }
    } else {
      probeSpinner.succeed(`Vault exists: ${vaultName}`)
    }

    const results: { name: string; slug: string; status: 'created' | 'updated' | 'failed' }[] = []
    for (const entry of entries) {
      const slug = itemSlugFor(envName, entry.name)
      const spinner = ora(`Pushing ${entry.name} -> ${slug}...`).start()
      try {
        const status = putItem(vaultName, slug, entry.value)
        spinner.succeed(`${entry.name.padEnd(28)} ${status} (${slug})`)
        results.push({ name: entry.name, slug, status })
      } catch (err) {
        spinner.fail(`${entry.name}: ${(err as Error).message}`)
        results.push({ name: entry.name, slug, status: 'failed' })
      }
    }

    const failed = results.filter(r => r.status === 'failed')
    if (failed.length > 0) {
      console.log()
      console.error(
        chalk.red(`Push partially failed: ${failed.length}/${results.length} item(s) errored.`)
      )
      console.error(
        chalk.dim('The .env file is preserved so you can retry. Inspect 1P state then re-run.')
      )
      process.exit(1)
    }

    console.log()
    console.log(chalk.green.bold(`All ${results.length} secret(s) pushed to ${vaultName}.`))

    if (!opts.keepFile) {
      try {
        unlinkSync(inPath)
        console.log(chalk.dim(`Deleted local file: ${inPath}`))
      } catch (err) {
        console.error(
          chalk.yellow(`Push succeeded but could not delete ${inPath}: ${(err as Error).message}`)
        )
        console.error(chalk.dim('Delete it manually to keep 1P as source of truth.'))
      }
    } else {
      console.log(chalk.dim(`Local file kept (--keep-file): ${inPath}`))
    }

    console.log()
    console.log(chalk.bold('Next:'))
    console.log(`  saga secrets deploy --env ${envName}`)
  })
