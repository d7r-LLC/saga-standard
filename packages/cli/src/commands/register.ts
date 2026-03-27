// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { Command } from 'commander'
import chalk from 'chalk'
import { privateKeyToAccount } from 'viem/accounts'
import { SagaServerClient, isHandleAvailable, mintAgentIdentity } from '@epicdm/saga-client'
import type { WalletSigner } from '@epicdm/saga-client'
import type { ChainId } from '@epicdm/saga-sdk'
import { cacheSession, loadConfig } from '../config'
import { getWalletInfo, loadWalletPrivateKey } from '../wallet-store'
import { chainFromCaip2, createViemClients, waitForIndexer } from '../cli-chain-helpers'

export const registerCommand = new Command('register')
  .description('Register an agent on a SAGA server')
  .argument('<handle>', 'Agent handle (e.g., aria-chen)')
  .option('--wallet <name>', 'Wallet name', 'default')
  .option('--password <password>', 'Wallet password', 'saga-default-password')
  .option('--server <url>', 'Server URL (defaults to configured default)')
  .option('--chain <chain>', 'Chain ID', 'eip155:8453')
  .option('--on-chain', 'Mint an on-chain SAGA Agent Identity NFT')
  .option('--hub-url <url>', 'Home hub URL for the agent identity NFT')
  .action(async (handle, opts) => {
    // 1. Load wallet
    const walletInfo = getWalletInfo(opts.wallet)
    if (!walletInfo) {
      console.error(chalk.red(`Wallet "${opts.wallet}" not found. Run: saga wallet create`))
      process.exit(1)
    }

    const privateKeyHex = loadWalletPrivateKey(opts.wallet, opts.password)
    const account = privateKeyToAccount(privateKeyHex as `0x${string}`)

    // 2. Resolve server (optional for on-chain path)
    const config = loadConfig()
    const serverUrl = opts.server ?? config.defaultServer
    if (!serverUrl && !opts.onChain) {
      console.error(chalk.red('No server configured. Run: saga server add <url>'))
      process.exit(1)
    }

    if (serverUrl) console.log(chalk.dim(`Server:  ${serverUrl}`))
    console.log(chalk.dim(`Wallet:  ${account.address}`))
    console.log(chalk.dim(`Handle:  ${handle}`))
    console.log()

    try {
      if (opts.onChain) {
        // ── On-chain registration path ────────────────────────────
        const chain = chainFromCaip2(opts.chain)
        const hubUrl = opts.hubUrl ?? serverUrl ?? ''

        console.log(chalk.dim('Creating on-chain identity...'))

        const { publicClient, walletClient } = createViemClients({
          privateKeyHex,
          chain,
        })

        // Check handle availability
        console.log(chalk.dim('Checking handle availability on-chain...'))
        const available = await isHandleAvailable({
          handle,
          publicClient,
          chain,
        })

        if (!available) {
          console.error(chalk.red(`Handle "${handle}" is already taken on-chain.`))
          process.exit(1)
        }

        console.log(chalk.green(`Handle "${handle}" is available.`))

        // Mint NFT
        console.log(chalk.dim('Minting SAGA Agent Identity NFT...'))
        const result = await mintAgentIdentity({
          handle,
          homeHubUrl: hubUrl,
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
            const resolved = await waitForIndexer({ client, handle })
            console.log(chalk.dim(`  Indexed: ${resolved.walletAddress}`))
          } catch {
            console.log(chalk.yellow('  Indexer not available (skipped).'))
          }
        } else {
          console.log(chalk.dim('No server configured — skipping indexer wait.'))
        }

        console.log()
        console.log(chalk.green.bold('Agent registered on-chain.'))
        console.log(`  Handle:      ${handle}`)
        console.log(`  Token ID:    ${result.tokenId}`)
        console.log(`  TBA Address: ${result.tbaAddress}`)
        console.log(`  Mint TX:     ${result.txHash}`)
        console.log(`  Wallet:      ${account.address}`)
        console.log(`  Chain:       ${chain}`)
      } else {
        // ── Off-chain registration path (unchanged) ────────────────
        const client = new SagaServerClient({ serverUrl })
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

        console.log(chalk.dim('Authenticating with wallet...'))
        const session = await client.authenticate(signer)

        cacheSession(serverUrl, {
          token: session.token,
          expiresAt: session.expiresAt.toISOString(),
          walletAddress: session.walletAddress,
        })

        console.log(chalk.green('Authenticated.'))
        console.log()

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
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(chalk.red(`Registration failed: ${message}`))
      process.exit(1)
    }
  })
