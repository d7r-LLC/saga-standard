// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { Command } from 'commander'
import chalk from 'chalk'
import { chmodSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { randomBytes } from 'node:crypto'

/**
 * Operator-supplied secrets — the script writes empty placeholders so
 * the operator knows the slots exist; values come from external API
 * dashboards (Anthropic, OpenAI, Google AI Studio).
 */
const OPERATOR_SECRETS = ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'GOOGLE_AI_API_KEY'] as const

/**
 * Auto-generated secrets — the script generates random hex values
 * with the appropriate shape for each.
 */
type GeneratedSecret = { name: string; comment: string; generator: () => string }

const GENERATED_SECRETS: GeneratedSecret[] = [
  {
    name: 'ADMIN_SECRET',
    comment:
      '32-byte hex (256 bits). Required for /admin/reindex; ' +
      'endpoint returns 403 fail-closed when unset.',
    // 32 random bytes -> 64-char hex string. No `0x` prefix; ADMIN_SECRET
    // is compared as a raw string against the X-Admin-Secret header.
    generator: () => randomBytes(32).toString('hex'),
  },
  {
    name: 'OPERATOR_PRIVATE_KEY',
    comment:
      '32-byte ETH private key as 0x-prefixed hex. Signs federation ' +
      'envelopes from this server. NOT the deploy signer.',
    // 32 random bytes -> 0x + 64-char hex. secp256k1 accepts any 32-byte
    // value below the curve order; the probability of generating an
    // invalid key by chance is ~1 in 2^128, well below cryptographic
    // significance, but viem's privateKeyToAccount will throw on the
    // pathological case (caller's job to retry if so).
    generator: () => `0x${randomBytes(32).toString('hex')}`,
  },
]

interface EnvFileEntry {
  name: string
  value: string
  comment: string
  // Whether the value will be a real secret or a placeholder. Placeholders
  // are written empty so the operator knows the slot exists.
  generated: boolean
}

function buildEnvFileContent(entries: EnvFileEntry[], envName: string): string {
  const header = [
    `# saga-server secrets for env=${envName}`,
    `# Generated: ${new Date().toISOString()}`,
    '#',
    '# DO NOT COMMIT. This file is git-ignored.',
    '#',
    '# Workflow:',
    `#   1. \`saga secrets generate --env ${envName}\` writes this file with`,
    '#      auto-generated values for crypto secrets and empty placeholders',
    '#      for operator-supplied ones (LLM API keys).',
    '#   2. Operator copies each value into the corresponding 1Password',
    `#      vault item (vault: saga-${envName}, item names below).`,
    `#   3. \`saga secrets deploy --env ${envName}\` reads from 1Password`,
    '#      and pipes each into `wrangler secret put` for the saga-server',
    `#      worker (saga-server-${envName}).`,
    '#',
    '# After step 3, this file MAY be deleted. Each value lives in 1P.',
    '#',
    `# 1Password layout (one item per secret, all in vault saga-${envName}):`,
    ...entries.map(
      e =>
        `#   op://saga-${envName}/saga-server-${envName}-${e.name.toLowerCase().replace(/_/g, '-')}/value`
    ),
    '',
  ]

  const body = entries.flatMap(e => [
    `# ${e.comment}`,
    e.generated
      ? `${e.name}=${e.value}`
      : `# ${e.name}=  # populate manually from external API dashboard`,
    '',
  ])

  return [...header, ...body].join('\n')
}

export const secretsGenerateCommand = new Command('generate')
  .description(
    'Generate cryptographic secrets for saga-server and write them to a local .env.<env> file. ' +
      'Operator copies each value into 1Password (vault: saga-<env>) before running `saga secrets deploy`.'
  )
  .requiredOption('--env <env>', 'Target environment (e.g., staging, production)')
  .option('--out <path>', 'Override output path (default: packages/server/.env.<env>)')
  .option('--force', 'Overwrite existing .env.<env> file')
  .action(opts => {
    const envName = opts.env
    if (envName === 'production') {
      // Belt-and-suspenders: production secrets generation should be a
      // deliberate, audited event. Refuse the implicit path; allow
      // --force as the explicit acknowledgement. Use distinct message
      // wording per branch so audit logs don't show "Refusing..."
      // immediately followed by a successful run.
      if (!opts.force) {
        console.error(
          chalk.red(
            'Refusing to generate production secrets without --force. ' +
              'Production secrets must be generated in a documented runbook session, ' +
              'not via an ad-hoc CLI invocation.'
          )
        )
        process.exit(1)
      }
      console.error(
        chalk.yellow(
          'Generating production secrets with --force. ' +
            'Document this run (operator, timestamp, reason) in your audit log.'
        )
      )
    }

    // Locate packages/server. Same heuristic as deploy/smoke-test.
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

    const outPath = opts.out ?? join(serverDir, `.env.${envName}`)

    if (existsSync(outPath) && !opts.force) {
      console.error(chalk.red(`Refusing to overwrite existing file: ${outPath}`))
      console.error(chalk.dim('Use --force to overwrite, or delete the file first.'))
      process.exit(1)
    }

    // Ensure parent dir exists (--out may point at a non-default location).
    const parent = dirname(outPath)
    if (!existsSync(parent)) {
      mkdirSync(parent, { recursive: true })
    }

    // Generate the entries.
    const entries: EnvFileEntry[] = [
      ...GENERATED_SECRETS.map(spec => ({
        name: spec.name,
        value: spec.generator(),
        comment: spec.comment,
        generated: true,
      })),
      ...OPERATOR_SECRETS.map(name => ({
        name,
        value: '',
        comment: 'Operator-supplied LLM API key (chat routes only).',
        generated: false,
      })),
    ]

    const content = buildEnvFileContent(entries, envName)
    // 0600 so only the owner can read; secrets-on-disk are sensitive
    // even when the directory is git-ignored.
    //
    // writeFileSync's `mode` option only takes effect when the file is
    // CREATED. On overwrite (--force) it leaves any pre-existing
    // permissions in place — which could be world-readable if the
    // operator created the file manually before re-generating.
    // Explicit chmodSync after the write guarantees 0600 in both
    // create and overwrite paths.
    writeFileSync(outPath, content, { mode: 0o600 })
    chmodSync(outPath, 0o600)

    console.log()
    console.log(chalk.green.bold(`Secrets file written: ${outPath}`))
    console.log(chalk.dim(`File mode: 0600 (owner read/write only)`))
    console.log()
    console.log(chalk.bold('Generated secrets:'))
    for (const spec of GENERATED_SECRETS) {
      console.log(`  ${spec.name.padEnd(28)} ${chalk.dim('(generated, do NOT commit)')}`)
    }
    console.log()
    console.log(chalk.bold('Operator-supplied placeholders:'))
    for (const name of OPERATOR_SECRETS) {
      console.log(`  ${name.padEnd(28)} ${chalk.dim('(populate from external API dashboard)')}`)
    }
    console.log()
    console.log(chalk.bold('Next steps:'))
    console.log(`  1. Copy each value from ${chalk.cyan(outPath)} into 1Password`)
    console.log(`     vault ${chalk.cyan(`saga-${envName}`)} as one item per secret`)
    console.log(`     (item naming: saga-server-${envName}-<lower-kebab>).`)
    console.log(
      `  2. Once 1P is populated, run: ${chalk.cyan(`saga secrets deploy --env ${envName}`)}`
    )
    console.log(`  3. Optionally delete ${chalk.cyan(outPath)} once 1P is the source of truth.`)
  })
