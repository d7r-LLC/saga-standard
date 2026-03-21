// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { Command } from 'commander'
import chalk from 'chalk'
import { createWallet, getWalletInfo, importWallet, listWallets } from '../wallet-store'

export const walletCommand = new Command('wallet').description('Manage wallets')

walletCommand
  .command('create')
  .description('Create a new wallet')
  .option('--name <name>', 'Wallet name', 'default')
  .option('--password <password>', 'Encryption password')
  .action(opts => {
    const password = opts.password ?? 'saga-default-password'
    try {
      const wallet = createWallet(opts.name, password)
      console.log(chalk.green('Wallet created'))
      console.log(`  Name:    ${wallet.name}`)
      console.log(`  Address: ${wallet.address}`)
      console.log(`  Chain:   ${wallet.chain}`)
    } catch (err) {
      console.error(chalk.red(`Error: ${(err as Error).message}`))
      process.exit(1)
    }
  })

walletCommand
  .command('import')
  .description('Import a wallet from a private key')
  .argument('<private-key>', 'Hex-encoded private key')
  .option('--name <name>', 'Wallet name', 'default')
  .option('--password <password>', 'Encryption password')
  .action((privateKey, opts) => {
    const password = opts.password ?? 'saga-default-password'
    try {
      const wallet = importWallet(opts.name, privateKey, password)
      console.log(chalk.green('Wallet imported'))
      console.log(`  Name:    ${wallet.name}`)
      console.log(`  Address: ${wallet.address}`)
    } catch (err) {
      console.error(chalk.red(`Error: ${(err as Error).message}`))
      process.exit(1)
    }
  })

walletCommand
  .command('list')
  .description('List stored wallets')
  .action(() => {
    const wallets = listWallets()
    if (wallets.length === 0) {
      console.log(chalk.yellow('No wallets found. Run: saga wallet create'))
      return
    }
    console.log(chalk.bold('Stored wallets:'))
    for (const w of wallets) {
      console.log(`  ${w.name} — ${w.address} (${w.chain})`)
    }
  })

walletCommand
  .command('export')
  .description('Show wallet address')
  .argument('<name>', 'Wallet name')
  .action(name => {
    const info = getWalletInfo(name)
    if (!info) {
      console.error(chalk.red(`Wallet "${name}" not found`))
      process.exit(1)
    }
    console.log(`Address: ${info.address}`)
    console.log(`Chain:   ${info.chain}`)
  })
