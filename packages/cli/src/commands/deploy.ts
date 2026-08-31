// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { Command } from 'commander'
import chalk from 'chalk'
import ora from 'ora'
import { execFileSync, spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { existsSync, readFileSync } from 'node:fs'
import { scrubSecrets } from '../redact'
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
import { isHostOpAvailable, resolveSecretsFromHostOp } from '../deploy-secrets'
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
      // Secrets-provisioning strategy:
      //   1. OP_SERVICE_ACCOUNT_TOKEN set (env or .env) → container reads
      //      from 1Password itself (hermetic, no host-side secret handling).
      //   2. Otherwise → resolve secrets here on the host via the user's
      //      interactive `op` CLI session and pipe them to the container
      //      via stdin (avoids env-var leak through /proc/$pid/environ).
      try {
        const envPath = join(process.cwd(), '.env')
        if (existsSync(envPath) && !process.env.OP_SERVICE_ACCOUNT_TOKEN) {
          const envContent = readFileSync(envPath, 'utf-8')
          const match = envContent.match(/^OP_SERVICE_ACCOUNT_TOKEN=(.+)$/m)
          if (match) {
            process.env.OP_SERVICE_ACCOUNT_TOKEN = match[1].trim()
          }
        }

        const useStdinSecrets = !process.env.OP_SERVICE_ACCOUNT_TOKEN
        let stdinPayload: string | undefined
        // Track every concrete secret value we touch so we can pass them
        // to scrubSecrets() as exact-match literals if any error message
        // would otherwise carry them. We never log these directly.
        const knownSecretLiterals: string[] = []

        if (useStdinSecrets) {
          if (!isHostOpAvailable()) {
            runSpinner.fail(
              'OP_SERVICE_ACCOUNT_TOKEN not set and host `op` CLI is not signed in. ' +
                'Either export OP_SERVICE_ACCOUNT_TOKEN, add it to .env, or run `op signin`.'
            )
            process.exit(1)
          }
          const secrets = resolveSecretsFromHostOp({
            vault: resolved.op.vault,
            signerItem: resolved.op.signerItem,
            signerField: resolved.op.signerField,
            explorerKeyItem: resolved.op.explorerKeyItem,
          })
          knownSecretLiterals.push(secrets.signer, secrets.explorerKey)
          if (secrets.derivationPath) knownSecretLiterals.push(secrets.derivationPath)
          stdinPayload = JSON.stringify({
            signer: secrets.signer,
            explorerKey: secrets.explorerKey,
            derivationPath: secrets.derivationPath,
          })
        } else if (process.env.OP_SERVICE_ACCOUNT_TOKEN) {
          knownSecretLiterals.push(process.env.OP_SERVICE_ACCOUNT_TOKEN)
        }

        const runArgs = buildDockerRunArgs({
          resolved,
          networkName,
          mode,
          secretsViaStdin: useStdinSecrets,
        })

        // Pass MINIMAL env to docker — only PATH (so docker resolves) and
        // OP_SERVICE_ACCOUNT_TOKEN when env-token mode is active. Avoids
        // forwarding any unrelated host env vars into the docker process.
        const dockerEnv: NodeJS.ProcessEnv = { PATH: process.env.PATH ?? '' }
        if (!useStdinSecrets && process.env.OP_SERVICE_ACCOUNT_TOKEN) {
          dockerEnv.OP_SERVICE_ACCOUNT_TOKEN = process.env.OP_SERVICE_ACCOUNT_TOKEN
        }

        // Capture stdout AND stderr separately (no inherit) so any noise
        // from the container — including JSON `log()` lines from the
        // entrypoint or accidental forge output — is held in memory and
        // scrubbed before any user-facing print.
        //
        // Timeout: 15 minutes. The first invocation against a chain pays
        // for an svm cold-start (downloads solc 0.8.24, ~30MB), full
        // Solidity compile of all four contracts plus OZ dependencies,
        // and a fork simulation against the public RPC. /forge-cache and
        // /tmp are tmpfs so every container start is cold; can't reuse
        // the host's solc / compile cache without breaking the
        // read-only-rootfs hardening.
        const result = spawnSync('docker', runArgs, {
          encoding: 'utf-8',
          timeout: 900_000, // 15 minute timeout
          env: dockerEnv,
          input: stdinPayload,
          // Cap the buffer so a runaway entrypoint can't fill heap.
          maxBuffer: 16 * 1024 * 1024,
        })

        // Best-effort: drop the secrets reference promptly.
        stdinPayload = undefined

        const containerStderr = scrubSecrets(result.stderr ?? '', knownSecretLiterals)
        const containerStdout = scrubSecrets(result.stdout ?? '', knownSecretLiterals)

        if (result.error) {
          throw Object.assign(new Error(scrubSecrets(result.error.message, knownSecretLiterals)), {
            containerStderr,
            containerStdout,
          })
        }
        if (typeof result.status === 'number' && result.status !== 0) {
          // Pull the entrypoint's terminal {"error":"..."} line out of
          // stderr if present — that's the actionable bit. Everything
          // else is forge / op chatter that we already redacted.
          const errLine = containerStderr
            .split('\n')
            .reverse()
            .find(l => /^\s*\{"error"/.test(l))
          throw Object.assign(
            new Error(
              `docker exited with status ${result.status}: ${errLine ?? '(no error line)'}`
            ),
            { containerStderr, containerStdout }
          )
        }
        containerOutput = containerStdout.trim()

        runSpinner.succeed(
          mode === 'dry-run'
            ? 'Simulation complete.'
            : mode === 'finalize'
              ? 'Finalization complete.'
              : 'Deployment proposed to Safe.'
        )
      } catch (err) {
        runSpinner.fail('Container execution failed.')
        const e = err as Error & { containerStderr?: string; containerStdout?: string }
        // Message is already scrubbed via scrubSecrets() before throw.
        console.error(chalk.dim(e.message))
        // Show the container's scrubbed stderr below the message — it's
        // where forge errors land. Skip empty / whitespace-only buffers.
        if (e.containerStderr && e.containerStderr.trim()) {
          console.error()
          console.error(chalk.dim('--- container stderr (secrets scrubbed) ---'))
          console.error(chalk.dim(e.containerStderr.trim()))
          console.error(chalk.dim('--- end container stderr ---'))
        }
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
        // Direct deployment (threshold == 1)
        if (result.mode === 'direct') {
          const addresses = result.addresses as Record<string, string>
          console.log()
          console.log(chalk.green.bold('Deployment complete (direct broadcast).'))
          console.log(`  Chain: ${opts.chain} (${resolved.chainId})`)
          for (const [name, addr] of Object.entries(addresses)) {
            console.log(`  ${name.padEnd(20)} ${addr}`)
          }
          console.log(`  Gas used: ${result.gasUsed}`)

          // Update local files if they exist
          const deploymentJsonPath = join(contractsDir, 'deployments', `${opts.chain}.json`)
          if (existsSync(deploymentJsonPath)) {
            updateDeploymentJson(deploymentJsonPath, {
              addresses,
              safeTxHash: '',
              deployedAt: new Date().toISOString(),
            })
          }
          const addressesTsPath = join(contractsDir, 'src', 'ts', 'addresses.ts')
          if (existsSync(addressesTsPath)) {
            updateAddressesTs(addressesTsPath, opts.chain, addresses)
          }
          return
        }

        // Safe proposal (threshold > 1)
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
