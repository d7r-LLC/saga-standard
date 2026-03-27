// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { Command } from 'commander'
import chalk from 'chalk'
import ora from 'ora'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { existsSync, readFileSync } from 'node:fs'
import { loadDeployConfig, resolveChainConfig } from '../deploy-config'
import {
  buildDockerBuildArgs,
  buildDockerNetworkCreateArgs,
  buildDockerNetworkRmArgs,
} from '../deploy-docker'

// Resolve contracts directory (same as deploy command)
function findContractsDir(): string {
  const candidates = [
    join(process.cwd(), 'packages', 'contracts'),
    join(process.cwd(), '..', 'contracts'),
  ]
  for (const dir of candidates) {
    if (existsSync(join(dir, 'foundry.toml'))) return dir
  }
  throw new Error(
    'Cannot find packages/contracts directory. Run from the monorepo root or packages/cli.'
  )
}

export const fundCommand = new Command('fund')
  .description('Send ETH from the deploy signer to a target address (uses 1Password)')
  .requiredOption('--chain <chain>', 'Target chain (e.g., base-sepolia)')
  .requiredOption('--to <address>', 'Recipient address')
  .option('--amount <amount>', 'Amount to send (e.g., 0.01ether)', '0.01ether')
  .option('--config <path>', 'Path to deploy.config.yaml')
  .action(async opts => {
    const contractsDir = findContractsDir()
    const configPath = opts.config ?? join(contractsDir, 'deploy.config.yaml')

    try {
      const config = loadDeployConfig(configPath)
      const resolved = resolveChainConfig(config, opts.chain, {})

      // Production gate
      if (resolved.production) {
        console.error(chalk.red('Cannot fund on production chains via this command.'))
        process.exit(1)
      }

      console.log(chalk.bold(`Funding on ${opts.chain}`))
      console.log(`  To:     ${opts.to}`)
      console.log(`  Amount: ${opts.amount}`)
      console.log(`  Signer: ${resolved.op.vault}/${resolved.op.signerItem}`)
      console.log()

      const networkName = `saga-fund-${Date.now()}`

      // ── Build Docker image ──
      const buildSpinner = ora('Building container...').start()
      try {
        const buildArgs = buildDockerBuildArgs(contractsDir)
        execFileSync('docker', buildArgs, { stdio: 'pipe' })
        buildSpinner.succeed('Container built.')
      } catch (err) {
        buildSpinner.fail('Failed to build container.')
        console.error(chalk.dim((err as Error).message))
        process.exit(1)
      }

      // ── Create network ──
      const netSpinner = ora('Creating network...').start()
      try {
        const netArgs = buildDockerNetworkCreateArgs(networkName)
        execFileSync('docker', netArgs, { stdio: 'pipe' })
        netSpinner.succeed(`Network created: ${networkName}`)
      } catch (err) {
        netSpinner.fail('Failed to create Docker network.')
        console.error(chalk.dim((err as Error).message))
        process.exit(1)
      }

      // ── Run container ──
      const runSpinner = ora('Sending ETH...').start()

      let containerOutput: string
      try {
        const fundConfig = {
          rpc: resolved.rpc,
          op: resolved.op,
          to: opts.to,
          amount: opts.amount,
        }
        const configBase64 = Buffer.from(JSON.stringify(fundConfig)).toString('base64')

        // Load OP token from .env
        const envPath = join(process.cwd(), '.env')
        if (existsSync(envPath)) {
          const envContent = readFileSync(envPath, 'utf-8')
          const match = envContent.match(/^OP_SERVICE_ACCOUNT_TOKEN=(.+)$/m)
          if (match) {
            process.env.OP_SERVICE_ACCOUNT_TOKEN = match[1].trim()
          }
        }
        if (!process.env.OP_SERVICE_ACCOUNT_TOKEN) {
          runSpinner.fail('OP_SERVICE_ACCOUNT_TOKEN not found in environment or .env file.')
          process.exit(1)
        }

        const runArgs = [
          'run',
          '--rm',
          '--name',
          `saga-fund-${Date.now()}`,
          '--network',
          networkName,
          '-e',
          'OP_SERVICE_ACCOUNT_TOKEN',
          '-e',
          `FUND_CONFIG=${configBase64}`,
          '--cap-drop',
          'ALL',
          '--security-opt',
          'no-new-privileges',
          '--entrypoint',
          '/fund-entrypoint.sh',
          'saga-deploy:latest',
        ]

        containerOutput = execFileSync('docker', runArgs, {
          encoding: 'utf-8',
          timeout: 60_000,
          env: process.env,
        }).trim()

        runSpinner.succeed('ETH sent.')
      } catch (err) {
        runSpinner.fail('Fund transfer failed.')
        console.error(chalk.dim((err as Error).message))
        try {
          execFileSync('docker', buildDockerNetworkRmArgs(networkName), { stdio: 'pipe' })
        } catch {
          /* best-effort */
        }
        process.exit(1)
      }

      // ── Clean up network ──
      try {
        execFileSync('docker', buildDockerNetworkRmArgs(networkName), { stdio: 'pipe' })
      } catch {
        /* best-effort */
      }

      // ── Parse output ──
      let result: Record<string, unknown>
      try {
        result = JSON.parse(containerOutput)
      } catch {
        console.error(chalk.red('Failed to parse container output as JSON.'))
        console.error(chalk.dim(containerOutput))
        process.exit(1)
      }

      console.log()
      console.log(chalk.green.bold('Transfer complete.'))
      console.log(`  TX Hash: ${result.txHash}`)
      console.log(`  From:    ${result.from}`)
      console.log(`  To:      ${result.to}`)
      console.log(`  Amount:  ${result.amount}`)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(chalk.red(`Fund failed: ${message}`))
      process.exit(1)
    }
  })
