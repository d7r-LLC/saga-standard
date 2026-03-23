// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { Command } from 'commander'
import chalk from 'chalk'
import { privateKeyToAccount } from 'viem/accounts'
import { SagaServerClient } from '@epicdm/saga-client'
import type { WalletSigner } from '@epicdm/saga-client'
import type { ChainId } from '@epicdm/saga-sdk'
import { cacheSession, loadConfig } from '../config'
import { getWalletInfo, loadWalletPrivateKey } from '../wallet-store'

export const registerCommand = new Command('register')
  .description('Register an agent on a SAGA server')
  .argument('<handle>', 'Agent handle (e.g., aria-chen)')
  .option('--wallet <name>', 'Wallet name', 'default')
  .option('--password <password>', 'Wallet password', 'saga-default-password')
  .option('--server <url>', 'Server URL (defaults to configured default)')
  .option('--chain <chain>', 'Chain ID', 'eip155:8453')
  .action(async (handle, opts) => {
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

    console.log(chalk.dim(`Server:  ${serverUrl}`))
    console.log(chalk.dim(`Wallet:  ${account.address}`))
    console.log(chalk.dim(`Handle:  ${handle}`))
    console.log()

    try {
      const client = new SagaServerClient({ serverUrl })

      // 3. Build a WalletSigner from the local private key
      const chain = (opts.chain ?? 'eip155:8453') as ChainId
      const signer: WalletSigner = {
        async signMessage(message: string): Promise<string> {
          return account.signMessage({ message })
        },
        async getAddress(): Promise<string> {
          return account.address
        },
        getChain(): ChainId {
          return chain
        },
      }

      // 4. Authenticate using challenge-response flow
      console.log(chalk.dim('Authenticating with wallet...'))
      const session = await client.authenticate(signer)

      // Cache the session for future CLI commands
      cacheSession(serverUrl, {
        token: session.token,
        expiresAt: session.expiresAt.toISOString(),
        walletAddress: session.walletAddress,
      })

      console.log(chalk.green('Authenticated.'))
      console.log()

      // 5. Register agent
      console.log(chalk.dim('Registering agent...'))
      const agent = await client.registerAgent({
        handle,
        walletAddress: account.address,
        chain,
      })

      console.log()
      console.log(chalk.green.bold('Agent registered.'))
      console.log(`  Agent ID: ${agent.agentId}`)
      console.log(`  Handle:   ${agent.handle}`)
      console.log(`  Wallet:   ${agent.walletAddress}`)
      console.log(`  Chain:    ${agent.chain}`)
      console.log(`  Created:  ${agent.registeredAt}`)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(chalk.red(`Registration failed: ${message}`))
      process.exit(1)
    }
  })
