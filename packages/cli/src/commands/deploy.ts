// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { Command } from 'commander'
import chalk from 'chalk'
import ora from 'ora'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { deriveNetworkAllowlist, loadDeployConfig, resolveChainConfig } from '../deploy-config'
import {
  buildDockerBuildArgs,
  buildDockerNetworkCreateArgs,
  buildDockerNetworkRmArgs,
  buildDockerRunArgs,
} from '../deploy-docker'
import {
  clearPendingDeploy,
  loadPendingDeploy,
  savePendingDeploy,
  updateAddressesTs,
  updateDeploymentJson,
} from '../deploy-post'
import { getSagaDir, loadConfig } from '../config'

// Resolve paths relative to monorepo root
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

export const deployCommand = new Command('deploy')
  .description('Deploy SAGA smart contracts via secure Docker container')
  .requiredOption('--chain <chain>', 'Target chain (e.g., base-sepolia, base)')
  .option('--broadcast', 'Propose deployment to Safe (default: dry-run simulation)')
  .option('--production', 'Required flag for production chain deployments')
  .option('--rpc <url>', 'Override RPC URL')
  .option('--no-verify', 'Skip contract verification on block explorer')
  .option('--status', 'Check Safe approval status for pending deployment')
  .option('--finalize', 'Complete post-deploy steps after Safe execution')
  .option('--config <path>', 'Path to deploy.config.yaml')
  .action(async opts => {
    const contractsDir = findContractsDir()
    const configPath = opts.config ?? join(contractsDir, 'deploy.config.yaml')
    const deploysDir = join(getSagaDir(), 'deploys')

    try {
      // Load and resolve config
      const config = loadDeployConfig(configPath)
      const resolved = resolveChainConfig(config, opts.chain, {
        rpc: opts.rpc,
        verify: opts.verify === false ? false : undefined,
      })

      // ── Status check (no Docker needed) ──
      if (opts.status) {
        const pending = loadPendingDeploy(deploysDir, opts.chain)
        if (!pending) {
          console.log(chalk.yellow(`No pending deployment for ${opts.chain}.`))
          return
        }
        console.log(chalk.bold(`Pending deployment for ${opts.chain}`))
        console.log(`  Safe TX Hash: ${pending.safeTxHash}`)
        console.log(`  Proposed at:  ${pending.proposedAt}`)
        console.log(`  Safe URL:     ${pending.safeUrl}`)
        console.log()
        console.log(chalk.dim('Check Safe UI for approval status.'))
        return
      }

      // ── Production gate ──
      if (resolved.production && !opts.production) {
        console.error(
          chalk.red(
            `Chain "${opts.chain}" is a production chain. Add --production flag to proceed.`
          )
        )
        process.exit(1)
      }

      // ── Pre-flight checklist for production ──
      if (opts.production) {
        console.log(chalk.bold.yellow('=== PRODUCTION DEPLOYMENT PRE-FLIGHT ==='))
        console.log()
        console.log(`  Chain:          ${resolved.chain} (${resolved.chainId})`)
        console.log(`  Safe:           ${resolved.safe}`)
        console.log(`  Safe Threshold: ${resolved.safeThreshold}`)
        console.log(`  RPC:            ${resolved.rpc}`)
        console.log(`  Contracts:      ${resolved.contracts.join(', ')}`)
        console.log(`  Verify:         ${resolved.verify}`)
        console.log(`  1Password:      ${resolved.op.vault} / ${resolved.op.signerItem}`)
        console.log()
        console.log(chalk.yellow('Review the above carefully.'))
        console.log()

        // Require confirmation for production
        const readline = await import('node:readline')
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
        const answer = await new Promise<string>(resolve => {
          rl.question(chalk.yellow('Proceed with production deployment? [y/N] '), resolve)
        })
        rl.close()
        if (answer.toLowerCase() !== 'y') {
          console.log(chalk.yellow('Aborted.'))
          return
        }
      }

      const mode = opts.finalize ? 'finalize' : opts.broadcast ? 'broadcast' : 'dry-run'
      const networkName = `saga-deploy-${Date.now()}`
      const allowlist = deriveNetworkAllowlist(config, resolved)

      // For finalize mode, inject the pending Safe TX hash into resolved config
      if (mode === 'finalize') {
        const pending = loadPendingDeploy(deploysDir, opts.chain)
        if (!pending) {
          console.error(
            chalk.red(`No pending deployment for ${opts.chain}. Run --broadcast first.`)
          )
          process.exit(1)
        }
        ;(resolved as unknown as Record<string, unknown>).pendingSafeTxHash = pending.safeTxHash
      }

      // ── Build Docker image ──
      const buildSpinner = ora('Building deploy container...').start()
      try {
        const buildArgs = buildDockerBuildArgs(contractsDir)
        execFileSync('docker', buildArgs, { stdio: 'pipe' })
        buildSpinner.succeed('Deploy container built.')
      } catch (err) {
        buildSpinner.fail('Failed to build deploy container.')
        console.error(chalk.dim((err as Error).message))
        process.exit(1)
      }

      // ── Create restricted network ──
      const netSpinner = ora('Creating restricted network...').start()
      try {
        const netArgs = buildDockerNetworkCreateArgs(networkName)
        execFileSync('docker', netArgs, { stdio: 'pipe' })
        netSpinner.succeed(`Network created: ${networkName}`)
        console.log(chalk.dim(`  Allowlist: ${allowlist.join(', ')}`))
      } catch (err) {
        netSpinner.fail('Failed to create Docker network.')
        console.error(chalk.dim((err as Error).message))
        process.exit(1)
      }

      // ── Run container ──
      const runSpinner = ora(
        mode === 'dry-run'
          ? 'Simulating deployment...'
          : mode === 'finalize'
            ? 'Finalizing deployment...'
            : 'Proposing deployment to Safe...'
      ).start()

      let containerOutput: string
      try {
        const runArgs = buildDockerRunArgs({ resolved, networkName, mode })

        // Replace the OP token placeholder with the actual env var
        const opToken = process.env.OP_SERVICE_ACCOUNT_TOKEN
        if (!opToken) {
          runSpinner.fail('OP_SERVICE_ACCOUNT_TOKEN environment variable is not set.')
          process.exit(1)
        }

        const cmdArgs = runArgs.map(a =>
          a === 'OP_SERVICE_ACCOUNT_TOKEN=${OP_SERVICE_ACCOUNT_TOKEN}'
            ? `OP_SERVICE_ACCOUNT_TOKEN=${opToken}`
            : a
        )

        containerOutput = execFileSync('docker', cmdArgs, {
          encoding: 'utf-8',
          timeout: 300_000, // 5 minute timeout
        }).trim()

        runSpinner.succeed(
          mode === 'dry-run'
            ? 'Simulation complete.'
            : mode === 'finalize'
              ? 'Finalization complete.'
              : 'Deployment proposed to Safe.'
        )
      } catch (err) {
        runSpinner.fail('Container execution failed.')
        console.error(chalk.dim((err as Error).message))
        // Clean up network
        try {
          execFileSync('docker', buildDockerNetworkRmArgs(networkName), { stdio: 'pipe' })
        } catch {
          /* network cleanup is best-effort */
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

      // ── Handle result by mode ──
      if (mode === 'dry-run') {
        console.log()
        console.log(chalk.bold('Simulation Result:'))
        console.log(chalk.dim(JSON.stringify(result, null, 2)))
        console.log()
        console.log(chalk.dim('Add --broadcast to propose this deployment to Safe.'))
        return
      }

      if (mode === 'broadcast') {
        savePendingDeploy(deploysDir, opts.chain, {
          safeTxHash: result.safeTxHash as string,
          safeUrl: result.safeUrl as string,
          simulatedAddresses: result.simulatedAddresses as Record<string, string>,
          proposedAt: new Date().toISOString(),
        })

        console.log()
        console.log(chalk.green.bold('Deployment proposed to Safe.'))
        console.log(`  Safe TX Hash: ${result.safeTxHash}`)
        console.log(`  Signatures:   ${result.signaturesCollected}`)
        console.log(`  Approve at:   ${result.safeUrl}`)
        console.log()
        console.log(chalk.dim('After all signers approve, run:'))
        console.log(chalk.dim(`  saga deploy --chain ${opts.chain} --finalize`))
        return
      }

      if (mode === 'finalize') {
        const addresses = result.addresses as Record<string, string>

        // Update deployment JSON
        const deploymentJsonPath = join(contractsDir, 'deployments', `${opts.chain}.json`)
        if (existsSync(deploymentJsonPath)) {
          updateDeploymentJson(deploymentJsonPath, {
            addresses,
            safeTxHash: (result.safeTxHash as string) ?? '',
            deployedAt: new Date().toISOString(),
          })
        }

        // Update addresses.ts
        const addressesTsPath = join(contractsDir, 'src', 'ts', 'addresses.ts')
        if (existsSync(addressesTsPath)) {
          updateAddressesTs(addressesTsPath, opts.chain, addresses)
        }

        // Notify SAGA server if configured
        let serverNotified = false
        if (resolved.notify) {
          const sagaConfig = loadConfig()
          const serverUrl = sagaConfig.defaultServer
          if (serverUrl) {
            try {
              const response = await fetch(`${serverUrl}/admin/reindex`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  chain: opts.chain,
                  contracts: addresses,
                }),
              })
              serverNotified = response.ok
            } catch {
              // Server notification is best-effort
            }
          }
        }

        // Clean up pending state
        clearPendingDeploy(deploysDir, opts.chain)

        console.log()
        console.log(chalk.green.bold('Deployment finalized.'))
        console.log(`  Chain:              ${opts.chain} (${resolved.chainId})`)
        for (const [name, addr] of Object.entries(addresses)) {
          console.log(`  ${name.padEnd(20)} ${addr}`)
        }
        console.log(
          `  Verified:           ${result.verified ? chalk.green('yes') : chalk.yellow('no')}`
        )
        console.log(
          `  1Password:          ${result.opUpdated ? chalk.green('updated') : chalk.yellow('skipped')}`
        )
        console.log(
          `  Server notified:    ${serverNotified ? chalk.green('yes') : chalk.yellow('skipped')}`
        )
        console.log()
        console.log(chalk.dim('Files updated:'))
        console.log(chalk.dim(`  ${deploymentJsonPath}`))
        console.log(chalk.dim(`  ${addressesTsPath}`))
        console.log()
        console.log(chalk.dim('Commit these changes:'))
        console.log(
          chalk.dim(
            `  git add packages/contracts && git commit -m "deploy(${opts.chain}): update addresses"`
          )
        )
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(chalk.red(`Deploy failed: ${message}`))
      process.exit(1)
    }
  })
