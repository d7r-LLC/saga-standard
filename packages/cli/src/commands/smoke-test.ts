// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { Command } from 'commander'
import chalk from 'chalk'
import ora from 'ora'
import { execFileSync, spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { existsSync, readFileSync } from 'node:fs'
import { deriveNetworkAllowlist, loadDeployConfig, resolveChainConfig } from '../deploy-config'
import {
  buildDockerBuildArgs,
  buildDockerNetworkCreateArgs,
  buildDockerNetworkRmArgs,
} from '../deploy-docker'
import { isHostOpAvailable, resolveSecretsFromHostOp } from '../deploy-secrets'
import { scrubSecrets } from '../redact'

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

interface DeploymentJson {
  chainId: number
  network: string
  contracts: Record<string, string>
}

function loadDeployedAddresses(contractsDir: string, chain: string): Record<string, string> {
  const path = join(contractsDir, 'deployments', `${chain}.json`)
  if (!existsSync(path)) {
    throw new Error(
      `No deployment record at ${path}. Run \`saga deploy --chain ${chain} --broadcast\` first.`
    )
  }
  const json = JSON.parse(readFileSync(path, 'utf-8')) as DeploymentJson
  if (!json.contracts) {
    throw new Error(`Deployment record at ${path} has no .contracts field.`)
  }
  return json.contracts
}

export const smokeTestCommand = new Command('smoke-test')
  .description(
    'Run end-to-end smoke test against deployed SAGA contracts (registers one each of agent / org / directory + scoped agent, then verifies registry resolution)'
  )
  .requiredOption('--chain <chain>', 'Target chain (e.g., base-sepolia, base)')
  .option('--rpc <url>', 'Override RPC URL')
  .option('--suffix <suffix>', 'Handle suffix to avoid collisions (defaults to block timestamp)')
  .option('--config <path>', 'Path to deploy.config.yaml')
  .action(async opts => {
    const contractsDir = findContractsDir()
    const configPath = opts.config ?? join(contractsDir, 'deploy.config.yaml')

    try {
      const config = loadDeployConfig(configPath)
      const resolved = resolveChainConfig(config, opts.chain, { rpc: opts.rpc })

      // Pull deployed addresses from the broadcast record.
      const deployed = loadDeployedAddresses(contractsDir, opts.chain)
      const required = [
        'SAGAHandleRegistry',
        'SAGAAgentIdentity',
        'SAGAOrgIdentity',
        'SAGADirectoryIdentity',
      ]
      const missing = required.filter(name => !deployed[name])
      if (missing.length > 0) {
        // SAGADirectoryIdentity may be missing from older deployment
        // records (parser gap from the same session). Fall back to
        // addresses.ts if present so smoke can still run.
        const tsPath = join(contractsDir, 'src', 'ts', 'addresses.ts')
        if (existsSync(tsPath)) {
          const ts = readFileSync(tsPath, 'utf-8')
          for (const name of missing) {
            const re = new RegExp(`'${opts.chain}'[\\s\\S]*?${name}:\\s*'(0x[a-fA-F0-9]{40})'`)
            const m = ts.match(re)
            if (m) deployed[name] = m[1]
          }
        }
        const stillMissing = required.filter(name => !deployed[name])
        if (stillMissing.length > 0) {
          console.error(
            chalk.red(`Missing deployed addresses for ${opts.chain}: ${stillMissing.join(', ')}`)
          )
          process.exit(1)
        }
      }

      const networkName = `saga-smoke-${Date.now()}`
      const allowlist = deriveNetworkAllowlist(config, resolved)

      // Build image (cached if Dockerfile unchanged).
      const buildSpinner = ora('Building deploy container...').start()
      try {
        execFileSync('docker', buildDockerBuildArgs(contractsDir), { stdio: 'pipe' })
        buildSpinner.succeed('Deploy container built.')
      } catch (err) {
        buildSpinner.fail('Failed to build deploy container.')
        console.error(chalk.dim((err as Error).message))
        process.exit(1)
      }

      const netSpinner = ora('Creating restricted network...').start()
      try {
        execFileSync('docker', buildDockerNetworkCreateArgs(networkName), { stdio: 'pipe' })
        netSpinner.succeed(`Network created: ${networkName}`)
        console.log(chalk.dim(`  Allowlist: ${allowlist.join(', ')}`))
      } catch (err) {
        netSpinner.fail('Failed to create Docker network.')
        console.error(chalk.dim((err as Error).message))
        process.exit(1)
      }

      const runSpinner = ora('Running smoke test...').start()
      let containerOutput = ''

      try {
        // Same env-token / stdin-secrets bifurcation as `saga deploy`.
        const envPath = join(process.cwd(), '.env')
        if (existsSync(envPath) && !process.env.OP_SERVICE_ACCOUNT_TOKEN) {
          const envContent = readFileSync(envPath, 'utf-8')
          const match = envContent.match(/^OP_SERVICE_ACCOUNT_TOKEN=(.+)$/m)
          if (match) process.env.OP_SERVICE_ACCOUNT_TOKEN = match[1].trim()
        }

        const useStdinSecrets = !process.env.OP_SERVICE_ACCOUNT_TOKEN
        let stdinPayload: string | undefined
        const knownSecretLiterals: string[] = []

        if (useStdinSecrets) {
          if (!isHostOpAvailable()) {
            runSpinner.fail(
              'OP_SERVICE_ACCOUNT_TOKEN not set and host `op` CLI is not signed in. ' +
                'Either export OP_SERVICE_ACCOUNT_TOKEN or run `op signin`.'
            )
            process.exit(1)
          }
          const secrets = resolveSecretsFromHostOp({
            vault: resolved.op.vault,
            signerItem: resolved.op.signerItem,
            signerField: resolved.op.signerField,
            // Smoke test doesn't actually need the explorer key, but the
            // resolver requires the field. Reuse the same item.
            explorerKeyItem: resolved.op.explorerKeyItem,
          })
          knownSecretLiterals.push(secrets.signer)
          if (secrets.derivationPath) knownSecretLiterals.push(secrets.derivationPath)
          stdinPayload = JSON.stringify({
            signer: secrets.signer,
            explorerKey: secrets.explorerKey,
            derivationPath: secrets.derivationPath,
          })
        } else if (process.env.OP_SERVICE_ACCOUNT_TOKEN) {
          knownSecretLiterals.push(process.env.OP_SERVICE_ACCOUNT_TOKEN)
        }

        // Build the docker run args. We override the image's default
        // entrypoint to point at /smoke-test-entrypoint.sh. Otherwise
        // the layout matches `saga deploy` exactly (same hardening,
        // same tmpfs mounts, same minimal env).
        const configPayload = {
          chain: resolved.chain,
          chainId: resolved.chainId,
          rpc: resolved.rpc,
          op: resolved.op,
          deployed: {
            SAGAHandleRegistry: deployed.SAGAHandleRegistry,
            SAGAAgentIdentity: deployed.SAGAAgentIdentity,
            SAGAOrgIdentity: deployed.SAGAOrgIdentity,
            SAGADirectoryIdentity: deployed.SAGADirectoryIdentity,
          },
          smokeSuffix: opts.suffix ?? '',
        }
        const configBase64 = Buffer.from(JSON.stringify(configPayload)).toString('base64')

        const runArgs: string[] = [
          'run',
          '--rm',
          '-i',
          '--name',
          `saga-smoke-${Date.now()}`,
          '--network',
          networkName,
          '--entrypoint',
          '/smoke-test-entrypoint.sh',
        ]
        if (useStdinSecrets) {
          runArgs.push('-e', 'SECRETS_VIA_STDIN=1')
        } else {
          runArgs.push('-e', 'OP_SERVICE_ACCOUNT_TOKEN')
        }
        runArgs.push(
          '-e',
          `DEPLOY_CONFIG=${configBase64}`,
          '--read-only',
          '--tmpfs',
          '/forge-cache:rw,exec,nosuid,nodev,size=512m,mode=1777',
          '--tmpfs',
          '/tmp:rw,exec,nosuid,nodev,size=256m,mode=1777',
          '--cap-drop',
          'ALL',
          '--security-opt',
          'no-new-privileges',
          'saga-deploy:latest'
        )

        const dockerEnv: NodeJS.ProcessEnv = { PATH: process.env.PATH ?? '' }
        if (!useStdinSecrets && process.env.OP_SERVICE_ACCOUNT_TOKEN) {
          dockerEnv.OP_SERVICE_ACCOUNT_TOKEN = process.env.OP_SERVICE_ACCOUNT_TOKEN
        }

        const result = spawnSync('docker', runArgs, {
          encoding: 'utf-8',
          timeout: 900_000, // 15 min
          env: dockerEnv,
          input: stdinPayload,
          maxBuffer: 16 * 1024 * 1024,
        })

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
        runSpinner.succeed('Smoke test passed.')
      } catch (err) {
        runSpinner.fail('Smoke test failed.')
        const e = err as Error & { containerStderr?: string; containerStdout?: string }
        console.error(chalk.dim(e.message))
        if (e.containerStderr && e.containerStderr.trim()) {
          console.error()
          console.error(chalk.dim('--- container stderr (secrets scrubbed) ---'))
          console.error(chalk.dim(e.containerStderr.trim()))
          console.error(chalk.dim('--- end container stderr ---'))
        }
        try {
          execFileSync('docker', buildDockerNetworkRmArgs(networkName), { stdio: 'pipe' })
        } catch {
          /* network cleanup is best-effort */
        }
        process.exit(1)
      }

      try {
        execFileSync('docker', buildDockerNetworkRmArgs(networkName), { stdio: 'pipe' })
      } catch {
        /* best-effort */
      }

      let parsed: Record<string, unknown>
      try {
        parsed = JSON.parse(containerOutput)
      } catch {
        console.error(chalk.red('Failed to parse smoke-test output as JSON.'))
        console.error(chalk.dim(containerOutput))
        process.exit(1)
      }

      console.log()
      console.log(chalk.green.bold('Smoke test passed.'))
      console.log(`  Chain:   ${parsed.chain} (${parsed.chainId})`)
      console.log(`  Signer:  ${parsed.signer}`)
      const mints = (parsed.mints as Record<string, number>) ?? {}
      for (const [name, tokenId] of Object.entries(mints)) {
        console.log(`  ${name.padEnd(20)} tokenId=${tokenId}`)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(chalk.red(`Smoke test failed: ${message}`))
      process.exit(1)
    }
  })
