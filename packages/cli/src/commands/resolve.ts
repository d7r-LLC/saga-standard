// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { Command } from 'commander'
import chalk from 'chalk'
import { SagaAuthError, SagaServerClient, resolveHandleOnChain } from '@d7r/saga-client'
import type { ResolveResponse } from '@d7r/saga-client'
import { loadConfig } from '../config'
import { chainFromCaip2, createViemClients } from '../cli-chain-helpers'

/** Format a resolve response for human-readable output */
export function formatResolveResult(result: ResolveResponse): string {
  const lines = [`Entity Type: ${result.entityType}`, `Handle:      ${result.handle}`]

  if (result.tokenId != null) lines.push(`Token ID:    ${result.tokenId}`)
  if (result.tbaAddress) lines.push(`TBA Address: ${result.tbaAddress}`)
  if (result.homeHubUrl) lines.push(`Home Hub:    ${result.homeHubUrl}`)
  if (result.name) lines.push(`Name:        ${result.name}`)
  if (result.contractAddress) lines.push(`Contract:    ${result.contractAddress}`)
  if (result.mintTxHash) lines.push(`Mint TX:     ${result.mintTxHash}`)
  lines.push(`Wallet:      ${result.walletAddress}`)
  lines.push(`Chain:       ${result.chain}`)
  lines.push(`Registered:  ${result.registeredAt}`)

  return lines.join('\n')
}

export const resolveCommand = new Command('resolve')
  .description('Resolve a handle to an agent or organization')
  .argument('<handle>', 'Handle to resolve (e.g., marcus.chen)')
  .option('--server <url>', 'Server URL (defaults to configured default)')
  .option('--on-chain', 'Resolve directly on-chain (no server needed)')
  .option('--chain <chain>', 'Chain ID for on-chain resolution', 'eip155:84532')
  .option('--json', 'Output raw JSON')
  .action(async (handle, opts) => {
    try {
      if (opts.onChain) {
        // ── On-chain resolution path ──
        const chain = chainFromCaip2(opts.chain)
        const { publicClient } = createViemClients({
          // Use a dummy private key — only reading, no signing needed
          privateKeyHex: '0x0000000000000000000000000000000000000000000000000000000000000001',
          chain,
        })

        console.log(chalk.dim(`Resolving "${handle}" on-chain (${chain})...`))

        const result = await resolveHandleOnChain({ handle, publicClient, chain })

        if (opts.json) {
          console.log(
            JSON.stringify(
              {
                handle,
                entityType: result.entityType,
                tokenId: result.tokenId.toString(),
                contractAddress: result.contractAddress,
                chain,
              },
              null,
              2
            )
          )
        } else {
          console.log(`Entity Type: ${result.entityType}`)
          console.log(`Handle:      ${handle}`)
          console.log(`Token ID:    ${result.tokenId}`)
          console.log(`Contract:    ${result.contractAddress}`)
          console.log(`Chain:       ${chain}`)
        }
        return
      }

      // ── Server resolution path ──
      const config = loadConfig()
      const serverUrl = opts.server ?? config.defaultServer
      if (!serverUrl) {
        console.error(
          chalk.red('No server configured. Run: saga server add <url> (or use --on-chain)')
        )
        process.exit(1)
      }

      const client = new SagaServerClient({ serverUrl })
      const result = await client.resolve(handle)

      if (opts.json) {
        console.log(JSON.stringify(result, null, 2))
      } else {
        console.log(formatResolveResult(result))
      }
    } catch (err) {
      if (err instanceof SagaAuthError && err.statusCode === 404) {
        console.error(chalk.red(`Handle "${handle}" not found`))
        process.exit(1)
      }
      const message = err instanceof Error ? err.message : String(err)
      console.error(chalk.red(`Resolve failed: ${message}`))
      process.exit(1)
    }
  })
