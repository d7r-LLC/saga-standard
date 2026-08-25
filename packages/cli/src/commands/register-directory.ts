// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { Command } from 'commander'
import chalk from 'chalk'
import { getAddress, isAddress } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { SagaServerClient, isHandleAvailable, mintDirectoryIdentity } from '@d7r/saga-client'
import { loadConfig } from '../config'
import { getWalletInfo, loadWalletPrivateKey } from '../wallet-store'
import { chainFromCaip2, createViemClients, waitForIndexer } from '../cli-chain-helpers'

export const registerDirectoryCommand = new Command('register-directory')
  .description('Register a directory on-chain with a SAGA Directory Identity NFT')
  .requiredOption('--directory-id <id>', 'Directory identifier (e.g. "my-hub")')
  .requiredOption('--url <url>', 'Directory server URL (e.g. "https://my-hub.example.com")')
  .option('--operator <address>', 'Operator wallet address (defaults to signing wallet)')
  .option('--conformance-level <level>', 'Conformance level', 'full')
  .option('--wallet <name>', 'Wallet name', 'default')
  .option('--password <password>', 'Wallet password', 'saga-default-password')
  .option('--server <url>', 'Server URL (defaults to configured default)')
  .option('--chain <chain>', 'Chain ID', 'eip155:8453')
  .action(async opts => {
    // 1. Load wallet
    const walletInfo = getWalletInfo(opts.wallet)
    if (!walletInfo) {
      console.error(chalk.red(`Wallet "${opts.wallet}" not found. Run: saga wallet create`))
      process.exit(1)
    }

    const privateKeyHex = loadWalletPrivateKey(opts.wallet, opts.password)
    const account = privateKeyToAccount(privateKeyHex as `0x${string}`)

    const rawOperator = opts.operator ?? account.address
    if (!isAddress(rawOperator)) {
      console.error(
        chalk.red(`Invalid operator address: "${rawOperator}". Must be a valid 0x address.`)
      )
      process.exit(1)
    }
    const operatorWallet = getAddress(rawOperator)

    // 2. Resolve server (optional -- indexer wait is skipped without one)
    const config = loadConfig()
    const serverUrl = opts.server ?? config.defaultServer

    const chain = chainFromCaip2(opts.chain)

    if (serverUrl) console.log(chalk.dim(`Server:       ${serverUrl}`))
    console.log(chalk.dim(`Wallet:       ${account.address}`))
    console.log(chalk.dim(`Directory ID: ${opts.directoryId}`))
    console.log(chalk.dim(`URL:          ${opts.url}`))
    console.log(chalk.dim(`Operator:     ${operatorWallet}`))
    console.log(chalk.dim(`Conformance:  ${opts.conformanceLevel}`))
    console.log()

    try {
      const { publicClient, walletClient } = createViemClients({
        privateKeyHex,
        chain,
      })

      // Check handle availability (directoryId is registered as a handle)
      console.log(chalk.dim('Checking directory ID availability on-chain...'))
      const available = await isHandleAvailable({
        handle: opts.directoryId,
        publicClient,
        chain,
      })

      if (!available) {
        console.error(chalk.red(`Directory ID "${opts.directoryId}" is already taken on-chain.`))
        process.exit(1)
      }

      console.log(chalk.green(`Directory ID "${opts.directoryId}" is available.`))

      // Mint directory NFT
      console.log(chalk.dim('Minting SAGA Directory Identity NFT...'))
      const result = await mintDirectoryIdentity({
        directoryId: opts.directoryId,
        url: opts.url,
        operatorWallet,
        conformanceLevel: opts.conformanceLevel,
        walletClient,
        publicClient,
        chain,
      })

      console.log(chalk.green('NFT minted.'))
      console.log(chalk.dim(`  TX Hash: ${result.txHash}`))

      // Wait for indexer (only if server is configured)
      if (serverUrl) {
        console.log(chalk.dim('Waiting for server indexer...'))
        const client = new SagaServerClient({ serverUrl })
        try {
          const resolved = await waitForIndexer({ client, handle: opts.directoryId })
          console.log(chalk.dim(`  Indexed: ${resolved.walletAddress}`))
        } catch {
          console.log(chalk.yellow('  Indexer not available (skipped).'))
        }
      } else {
        console.log(chalk.dim('No server configured -- skipping indexer wait.'))
      }

      console.log()
      console.log(chalk.green.bold('Directory registered on-chain.'))
      console.log(`  Directory ID: ${opts.directoryId}`)
      console.log(`  URL:          ${opts.url}`)
      console.log(`  Operator:     ${operatorWallet}`)
      console.log(`  Conformance:  ${opts.conformanceLevel}`)
      console.log(`  Token ID:     ${result.tokenId}`)
      console.log(`  TBA Address:  ${result.tbaAddress}`)
      console.log(`  Mint TX:      ${result.txHash}`)
      console.log(`  Wallet:       ${account.address}`)
      console.log(`  Chain:        ${chain}`)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(chalk.red(`Registration failed: ${message}`))
      process.exit(1)
    }
  })
