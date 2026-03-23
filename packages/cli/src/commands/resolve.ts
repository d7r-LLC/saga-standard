// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { Command } from 'commander'
import chalk from 'chalk'
import { SagaAuthError, SagaServerClient } from '@epicdm/saga-client'
import type { ResolveResponse } from '@epicdm/saga-client'
import { loadConfig } from '../config'

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
  .option('--json', 'Output raw JSON')
  .action(async (handle, opts) => {
    const config = loadConfig()
    const serverUrl = opts.server ?? config.defaultServer
    if (!serverUrl) {
      console.error(chalk.red('No server configured. Run: saga server add <url>'))
      process.exit(1)
    }

    try {
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
