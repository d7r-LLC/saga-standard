// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { Command } from 'commander'
import chalk from 'chalk'
import ora from 'ora'
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  assembleSagaDocument,
  createPrivateKeySigner,
  packSagaContainer,
  validateSagaDocument,
  validateSemantics,
} from '@epicdm/saga-sdk'
import type { ExportType, PartialSagaDocument } from '@epicdm/saga-sdk'
import { SagaServerClient } from '@epicdm/saga-client'
import { getWalletInfo, loadWalletPrivateKey } from '../wallet-store'
import { getCachedSession, loadConfig } from '../config'

export const exportCommand = new Command('export')
  .description('Assemble and export a .saga container')
  .option('--type <exportType>', 'Export type (profile, transfer, full, etc.)', 'full')
  .option('--wallet <name>', 'Wallet to sign with', 'default')
  .option('--password <password>', 'Wallet password')
  .option('--partials <dir>', 'Directory with collected partials', '.saga-partials')
  .option('--output <path>', 'Output .saga file path')
  .option('--push', 'Upload to default server after export')
  .option('--server <url-or-name>', 'Server to push to')
  .action(async opts => {
    const spinner = ora('Loading partials...').start()

    try {
      // Load partials
      if (!existsSync(opts.partials)) {
        spinner.fail('No partials found. Run "saga collect" first.')
        process.exit(1)
      }

      const partials: PartialSagaDocument[] = readdirSync(opts.partials)
        .filter(f => f.endsWith('.json'))
        .map(f => JSON.parse(readFileSync(join(opts.partials, f), 'utf-8')) as PartialSagaDocument)

      if (partials.length === 0) {
        spinner.fail('No partial documents found')
        process.exit(1)
      }

      spinner.succeed(`Loaded ${partials.length} partial(s)`)

      // Get wallet info for identity
      const walletInfo = getWalletInfo(opts.wallet)
      if (!walletInfo) {
        console.error(chalk.red(`Wallet "${opts.wallet}" not found. Run: saga wallet create`))
        process.exit(1)
      }

      // Create identity partial
      const identityPartial: PartialSagaDocument = {
        source: 'wallet',
        layers: {
          identity: {
            handle: `${walletInfo.address.slice(0, 10)}.saga`,
            walletAddress: walletInfo.address,
            chain: walletInfo.chain,
            createdAt: walletInfo.createdAt,
          },
        },
      }

      // Assemble
      const assembleSpinner = ora('Assembling document...').start()
      const result = assembleSagaDocument({
        partials: [identityPartial, ...partials],
        exportType: opts.type as ExportType,
      })
      assembleSpinner.succeed('Document assembled')

      // Validate
      const validSpinner = ora('Validating...').start()
      const schemaResult = validateSagaDocument(result.document)
      const schemaErrors = schemaResult.valid ? [] : schemaResult.errors
      const semanticResult = validateSemantics(result.document)
      const semanticErrors = semanticResult.valid ? [] : semanticResult.errors
      const errors = [...schemaErrors, ...semanticErrors].filter(e => e.severity === 'error')

      if (errors.length > 0) {
        validSpinner.fail(`Validation failed (${errors.length} errors)`)
        for (const err of errors) {
          console.error(chalk.red(`  ${err.path}: ${err.message}`))
        }
        process.exit(1)
      }
      validSpinner.succeed('Validation passed')

      // Sign
      const signSpinner = ora('Signing...').start()
      const password = opts.password ?? 'saga-default-password'
      const privateKey = loadWalletPrivateKey(opts.wallet, password)
      const signer = createPrivateKeySigner({
        privateKey: privateKey as `0x${string}`,
        chain: walletInfo.chain as 'eip155:8453',
      })
      const signed = await signer.sign(result.document)
      signSpinner.succeed('Document signed')

      // Pack container
      const packSpinner = ora('Packaging...').start()
      const container = await packSagaContainer({
        document: signed,
        signer,
      })
      packSpinner.succeed(`Container packed (${container.length} bytes)`)

      // Write output
      const outputPath = opts.output ?? `${result.document.documentId}.saga`
      writeFileSync(outputPath, container)
      console.log(chalk.green(`Exported: ${outputPath}`))

      // Push to server if requested
      if (opts.push) {
        await pushToServer(container, opts.server)
      }
    } catch (err) {
      spinner.fail(`Export failed: ${(err as Error).message}`)
      process.exit(1)
    }
  })

async function pushToServer(container: Uint8Array, serverUrlOrName?: string): Promise<void> {
  const pushSpinner = ora('Uploading to server...').start()
  try {
    const config = loadConfig()
    let serverUrl: string

    if (serverUrlOrName) {
      if (config.servers[serverUrlOrName]) {
        serverUrl = serverUrlOrName
      } else {
        const found = Object.entries(config.servers).find(([, s]) => s.name === serverUrlOrName)
        if (!found) throw new Error(`Server not found: ${serverUrlOrName}`)
        serverUrl = found[0]
      }
    } else if (config.defaultServer) {
      serverUrl = config.defaultServer
    } else {
      throw new Error('No server configured. Run: saga server add <url>')
    }

    const cached = getCachedSession(serverUrl)
    const auth = cached
      ? {
          token: cached.token,
          expiresAt: new Date(cached.expiresAt),
          walletAddress: cached.walletAddress,
          serverUrl,
        }
      : undefined
    const client = new SagaServerClient({ serverUrl, auth })

    // For push, we need the handle — extract from the container or config
    const walletInfo = getWalletInfo(config.defaultWallet ?? 'default')
    const handle = walletInfo ? `${walletInfo.address.slice(0, 10)}.saga` : 'agent.saga'

    const doc = await client.uploadDocument(handle, container)
    pushSpinner.succeed(`Uploaded: ${doc.documentId}`)
  } catch (err) {
    pushSpinner.fail(`Upload failed: ${(err as Error).message}`)
  }
}
