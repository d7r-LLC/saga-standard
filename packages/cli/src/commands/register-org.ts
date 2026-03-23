// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { Command } from 'commander'
import chalk from 'chalk'
import { privateKeyToAccount } from 'viem/accounts'
import { SagaServerClient, isHandleAvailable, mintOrgIdentity } from '@epicdm/saga-client'
import { loadConfig } from '../config'
import { getWalletInfo, loadWalletPrivateKey } from '../wallet-store'
import { chainFromCaip2, createViemClients, waitForIndexer } from '../cli-chain-helpers'

export const registerOrgCommand = new Command('register-org')
  .description('Register an organization on-chain with a SAGA Org Identity NFT')
  .requiredOption('--handle <handle>', 'Organization handle')
  .requiredOption('--name <name>', 'Organization display name')
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

    // 2. Resolve server
    const config = loadConfig()
    const serverUrl = opts.server ?? config.defaultServer
    if (!serverUrl) {
      console.error(chalk.red('No server configured. Run: saga server add <url>'))
      process.exit(1)
    }

    const chain = chainFromCaip2(opts.chain)

    console.log(chalk.dim(`Server:  ${serverUrl}`))
    console.log(chalk.dim(`Wallet:  ${account.address}`))
    console.log(chalk.dim(`Handle:  ${opts.handle}`))
    console.log(chalk.dim(`Name:    ${opts.name}`))
    console.log()

    try {
      const { publicClient, walletClient } = createViemClients({
        privateKeyHex,
        chain,
      })

      // Check handle availability
      console.log(chalk.dim('Checking handle availability on-chain...'))
      const available = await isHandleAvailable({
        handle: opts.handle,
        publicClient,
        chain,
      })

      if (!available) {
        console.error(chalk.red(`Handle "${opts.handle}" is already taken on-chain.`))
        process.exit(1)
      }

      console.log(chalk.green(`Handle "${opts.handle}" is available.`))

      // Mint org NFT
      console.log(chalk.dim('Minting SAGA Org Identity NFT...'))
      const result = await mintOrgIdentity({
        handle: opts.handle,
        name: opts.name,
        walletClient,
        publicClient,
        chain,
      })

      console.log(chalk.green('NFT minted.'))
      console.log(chalk.dim(`  TX Hash: ${result.txHash}`))

      // Wait for indexer
      console.log(chalk.dim('Waiting for server indexer...'))
      const client = new SagaServerClient({ serverUrl })
      const resolved = await waitForIndexer({ client, handle: opts.handle })

      console.log()
      console.log(chalk.green.bold('Organization registered on-chain.'))
      console.log(`  Handle:      ${opts.handle}`)
      console.log(`  Name:        ${opts.name}`)
      console.log(`  Token ID:    ${result.tokenId}`)
      console.log(`  TBA Address: ${result.tbaAddress}`)
      console.log(`  Mint TX:     ${result.txHash}`)
      console.log(`  Wallet:      ${resolved.walletAddress}`)
      console.log(`  Chain:       ${resolved.chain}`)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(chalk.red(`Registration failed: ${message}`))
      process.exit(1)
    }
  })
