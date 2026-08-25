// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { Command } from 'commander'
import chalk from 'chalk'
import ora from 'ora'
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { scrubSecrets } from '../redact'

/**
 * The set of secrets that saga-server-<env> consumes. Mirrors the
 * shape of `secrets-generate.ts` GENERATED_SECRETS + OPERATOR_SECRETS,
 * but flat — every entry is a wrangler secret name, mapped to whether
 * the secret is required (push fails if absent) or optional (push
 * skipped if absent).
 *
 * This list is the source of truth for "what secrets does the
 * saga-server worker need at deploy time". Keep in sync with
 * packages/server/src/bindings.ts when adding new secret-shaped env
 * vars.
 */
type SecretSpec = { name: string; required: boolean; comment: string }

const SAGA_SERVER_SECRETS: SecretSpec[] = [
  {
    name: 'ADMIN_SECRET',
    required: true,
    comment: '/admin/reindex bearer (fail-closed when unset)',
  },
  {
    name: 'OPERATOR_PRIVATE_KEY',
    required: true,
    comment: 'Federation envelope signer',
  },
  { name: 'ANTHROPIC_API_KEY', required: false, comment: 'Anthropic chat route' },
  { name: 'OPENAI_API_KEY', required: false, comment: 'OpenAI chat route' },
  { name: 'GOOGLE_AI_API_KEY', required: false, comment: 'Google AI chat route' },
]

/**
 * Map ENV-style secret name to the canonical 1Password item slug.
 * Matches secrets-generate.ts and secrets-push.ts.
 */
function itemSlugFor(envName: string, secretName: string): string {
  return `saga-server-${envName}-${secretName.toLowerCase().replace(/_/g, '-')}`
}

/**
 * Read a single concealed value from 1Password. Returns the value on
 * success; throws on auth failure. Returns null if the item or field
 * is absent (caller decides whether that's fatal based on the spec).
 */
function readOpValue(vault: string, item: string): string | null {
  const result = spawnSync('op', ['read', `op://${vault}/${item}/value`], {
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 30_000,
  })
  if (result.status === 0) {
    return result.stdout.trim()
  }
  // Distinguish "item missing" (acceptable for optional) from "auth /
  // network failure" (always fatal). 1Password CLI returns specific
  // strings on stderr we can recognize.
  const stderr = result.stderr ?? ''
  if (
    /isn't an item/i.test(stderr) ||
    /no items found/i.test(stderr) ||
    /could not retrieve/i.test(stderr) ||
    /not found/i.test(stderr) ||
    /no such field/i.test(stderr)
  ) {
    return null
  }
  throw new Error(
    `op read failed for op://${vault}/${item}/value: ${stderr.split('\n')[0] || 'unknown error'}`
  )
}

/**
 * Push a single secret into a Cloudflare Worker via `wrangler secret
 * put`. Pipes the value through stdin so it never appears on argv
 * (which would expose it in /proc/<pid>/cmdline and ps -ef on the
 * host). Returns true on success, throws on failure.
 */
function pushToWrangler(
  serverDir: string,
  envName: string,
  secretName: string,
  value: string
): void {
  // `wrangler secret put` reads the value from stdin when it detects
  // a non-TTY stdin. We use spawnSync with `input` to feed the value;
  // the secret never appears in argv or env var.
  const result = spawnSync(
    'pnpm',
    ['exec', 'wrangler', 'secret', 'put', secretName, '--env', envName],
    {
      cwd: serverDir,
      input: value,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 60_000,
      // Wrangler requires the user's CLOUDFLARE_API_TOKEN or interactive
      // browser auth. We let it inherit PATH and any pre-existing
      // CLOUDFLARE_* env vars but pass nothing else from the parent
      // env (no leak of unrelated host secrets to the wrangler subprocess).
      env: {
        PATH: process.env.PATH ?? '',
        HOME: process.env.HOME ?? '',
        CLOUDFLARE_API_TOKEN: process.env.CLOUDFLARE_API_TOKEN ?? '',
        CLOUDFLARE_ACCOUNT_ID: process.env.CLOUDFLARE_ACCOUNT_ID ?? '',
      },
    }
  )
  if (result.status !== 0) {
    // Scrub the value out of the failure message in case wrangler
    // echoed it back somewhere (defense-in-depth).
    const scrubbed = scrubSecrets(`${result.stderr ?? ''}${result.stdout ?? ''}`, [value])
    throw new Error(
      `wrangler secret put ${secretName} (env ${envName}) failed: ${
        scrubbed.split('\n').filter(Boolean)[0] || 'no output'
      }`
    )
  }
}

/**
 * Verify wrangler is available and the user has Cloudflare auth.
 * Throws with an actionable message otherwise.
 */
function checkWranglerAuth(serverDir: string): void {
  // `wrangler whoami` is the canonical auth probe. Returns 0 when
  // authenticated; non-zero with sign-in instructions otherwise.
  const result = spawnSync('pnpm', ['exec', 'wrangler', 'whoami'], {
    cwd: serverDir,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 30_000,
    env: {
      PATH: process.env.PATH ?? '',
      HOME: process.env.HOME ?? '',
      CLOUDFLARE_API_TOKEN: process.env.CLOUDFLARE_API_TOKEN ?? '',
      CLOUDFLARE_ACCOUNT_ID: process.env.CLOUDFLARE_ACCOUNT_ID ?? '',
    },
  })
  if (result.status !== 0) {
    throw new Error(
      'wrangler is not authenticated. Run `wrangler login` (interactive) or ' +
        'set CLOUDFLARE_API_TOKEN with sufficient permissions.'
    )
  }
}

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

export const secretsDeployCommand = new Command('deploy')
  .description(
    'Read saga-server secrets from 1Password vault saga-<env> and push them ' +
      'to the corresponding Cloudflare Worker (saga-server-<env>) via ' +
      '`wrangler secret put`. Values pass through stdin only — never argv.'
  )
  .requiredOption('--env <env>', 'Target environment (e.g., staging, production)')
  .option('--vault <name>', 'Override vault name (default: saga-<env>)')
  .option('--dry-run', 'List what would be deployed without contacting 1Password or wrangler')
  .action(opts => {
    const envName = opts.env
    const vaultName = opts.vault ?? `saga-${envName}`

    if (envName === 'production' && vaultName !== 'saga-prod' && vaultName !== 'saga-production') {
      console.error(
        chalk.red(
          `Refusing to deploy production secrets from vault "${vaultName}". ` +
            `Production secrets must come from saga-prod (or pass --vault saga-prod explicitly).`
        )
      )
      process.exit(1)
    }

    // Locate packages/server (wrangler runs from there).
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
    if (!serverDir) {
      console.error(chalk.red('Cannot find packages/server directory. Run from the monorepo root.'))
      process.exit(1)
    }

    console.log(
      chalk.bold(
        `Deploying ${SAGA_SERVER_SECRETS.length} secret slots ` +
          `from vault ${vaultName} -> worker saga-server-${envName}:`
      )
    )
    for (const spec of SAGA_SERVER_SECRETS) {
      console.log(
        `  ${spec.name.padEnd(28)} ${spec.required ? chalk.red('(required)') : chalk.dim('(optional)')}` +
          `  <- op://${vaultName}/${itemSlugFor(envName, spec.name)}/value`
      )
    }
    console.log()

    if (opts.dryRun) {
      console.log(chalk.dim('--dry-run: no changes made.'))
      return
    }

    // Pre-flight: vault present, wrangler authenticated.
    const probeSpinner = ora('Pre-flight: 1Password + Cloudflare auth...').start()
    if (!vaultExists(vaultName)) {
      probeSpinner.fail(`Vault "${vaultName}" not found in 1Password.`)
      console.error(
        chalk.dim(
          `Run \`saga secrets generate --env ${envName}\` and ` +
            `\`saga secrets push --env ${envName}\` first.`
        )
      )
      process.exit(1)
    }
    try {
      checkWranglerAuth(serverDir)
    } catch (err) {
      probeSpinner.fail((err as Error).message)
      process.exit(1)
    }
    probeSpinner.succeed('Pre-flight OK.')

    type DeployResult = {
      name: string
      required: boolean
      status: 'deployed' | 'skipped-missing' | 'failed'
      error?: string
    }
    const results: DeployResult[] = []
    let valueRef: string | null = null
    try {
      for (const spec of SAGA_SERVER_SECRETS) {
        const slug = itemSlugFor(envName, spec.name)
        const spinner = ora(`Reading ${spec.name} from 1Password...`).start()

        try {
          valueRef = readOpValue(vaultName, slug)
        } catch (err) {
          spinner.fail(`${spec.name}: ${(err as Error).message}`)
          results.push({
            name: spec.name,
            required: spec.required,
            status: 'failed',
            error: (err as Error).message,
          })
          continue
        }

        if (!valueRef) {
          if (spec.required) {
            spinner.fail(
              `${spec.name}: not found in 1P (required). ` +
                `Expected at op://${vaultName}/${slug}/value`
            )
            results.push({
              name: spec.name,
              required: true,
              status: 'failed',
              error: 'missing in 1Password',
            })
          } else {
            spinner.warn(`${spec.name}: not in 1P, skipped (optional).`)
            results.push({ name: spec.name, required: false, status: 'skipped-missing' })
          }
          continue
        }

        spinner.text = `Pushing ${spec.name} to wrangler (env=${envName})...`
        try {
          pushToWrangler(serverDir, envName, spec.name, valueRef)
          spinner.succeed(`${spec.name.padEnd(28)} deployed`)
          results.push({ name: spec.name, required: spec.required, status: 'deployed' })
        } catch (err) {
          spinner.fail(`${spec.name}: ${(err as Error).message}`)
          results.push({
            name: spec.name,
            required: spec.required,
            status: 'failed',
            error: (err as Error).message,
          })
        }
      }
    } finally {
      // Best-effort: drop the secret reference promptly. Node will
      // GC it when the function returns regardless, but explicitly
      // null-ing is a discipline cue.
      valueRef = null
    }

    const failed = results.filter(r => r.status === 'failed')
    const deployed = results.filter(r => r.status === 'deployed')
    const skipped = results.filter(r => r.status === 'skipped-missing')

    console.log()
    console.log(
      chalk.bold(
        `Result: ${chalk.green(`${deployed.length} deployed`)}, ` +
          `${chalk.dim(`${skipped.length} skipped`)}, ` +
          `${failed.length > 0 ? chalk.red(`${failed.length} failed`) : '0 failed'}`
      )
    )

    if (failed.length > 0) {
      console.log()
      for (const f of failed) {
        console.error(chalk.red(`  ${f.name}: ${f.error}`))
      }
      process.exit(1)
    }

    console.log()
    console.log(chalk.bold('Next:'))
    console.log(
      `  pnpm --filter @d7r/saga-server deploy:${envName}   ${chalk.dim('# deploy the worker code itself')}`
    )
  })
