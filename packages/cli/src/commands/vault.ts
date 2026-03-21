// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { Command } from 'commander'
import chalk from 'chalk'
import ora from 'ora'
import { randomBytes } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { decryptVaultItem, deriveVaultMasterKey, encryptVaultItem } from '@epicdm/saga-sdk'
import { getSagaDir } from '../config'
import { getWalletInfo, loadWalletPrivateKey } from '../wallet-store'
import type { VaultDecryptedFields, VaultItem, VaultItemType, VaultLayer } from '@epicdm/saga-sdk'

/**
 * Vault management commands: encrypted credential store for agents.
 *
 * The vault is unlocked using the agent's wallet private key.
 * Vault contents are AES-256-GCM encrypted with wallet-derived keys.
 * No server or platform ever sees plaintext vault data.
 */
export const vaultCommand = new Command('vault').description('Manage the agent credential vault')

/**
 * List all vault items (metadata only, no decryption required)
 */
vaultCommand
  .command('list')
  .description('List vault items')
  .option('--type <type>', 'Filter by item type')
  .option('--tag <tag>', 'Filter by tag')
  .option('--saga <path>', 'Path to .saga file (default: local vault)')
  .action(async opts => {
    try {
      const vault = loadVault(opts.saga)

      if (!vault || vault.items.length === 0) {
        console.log(chalk.yellow('Vault is empty. Add items with: saga vault add'))
        return
      }

      let items = vault.items

      if (opts.type) {
        items = items.filter(i => i.type === opts.type)
      }
      if (opts.tag) {
        items = items.filter(i => i.tags?.includes(opts.tag))
      }

      console.log(chalk.bold(`Vault: ${items.length} item(s)`))
      console.log()

      for (const item of items) {
        const typeIcon = getTypeIcon(item.type)
        const tags = item.tags?.length ? chalk.dim(` [${item.tags.join(', ')}]`) : ''
        console.log(`  ${typeIcon} ${chalk.bold(item.name)} ${chalk.dim(`(${item.type})`)}${tags}`)
        console.log(`    ID: ${item.itemId}  Updated: ${item.updatedAt}`)
      }

      console.log()
      console.log(
        chalk.dim(`Encryption: ${vault.encryption.algorithm} / ${vault.encryption.keyDerivation}`)
      )
      console.log(chalk.dim(`Vault version: ${vault.version}`))
    } catch (err) {
      console.error(chalk.red(`Failed to list vault: ${(err as Error).message}`))
      process.exit(1)
    }
  })

/**
 * Add a new vault item with real AES-256-GCM encryption
 */
vaultCommand
  .command('add')
  .description('Add a credential to the vault')
  .requiredOption(
    '--type <type>',
    'Item type (login, api-key, oauth-token, ssh-key, certificate, note, custom)'
  )
  .requiredOption('--name <name>', 'Human-readable item name')
  .option('--category <category>', 'Item category (e.g., social, infrastructure)')
  .option('--tags <tags>', 'Comma-separated tags')
  .option('--wallet <name>', 'Wallet to encrypt with', 'default')
  .option('--password <password>', 'Wallet password')
  .option('--fields <json>', 'Fields as JSON string')
  .option('--fields-file <path>', 'Fields from JSON file')
  .action(async opts => {
    const spinner = ora('Adding vault item...').start()

    try {
      // Validate type
      const validTypes: VaultItemType[] = [
        'login',
        'api-key',
        'oauth-token',
        'ssh-key',
        'certificate',
        'note',
        'custom',
      ]
      if (!validTypes.includes(opts.type as VaultItemType)) {
        spinner.fail(`Invalid type: ${opts.type}. Valid types: ${validTypes.join(', ')}`)
        process.exit(1)
      }

      // Load fields
      let fields: VaultDecryptedFields
      if (opts.fieldsFile) {
        fields = JSON.parse(readFileSync(opts.fieldsFile, 'utf-8'))
      } else if (opts.fields) {
        fields = JSON.parse(opts.fields)
      } else {
        spinner.fail('Provide fields via --fields or --fields-file')
        process.exit(1)
      }

      // Validate wallet
      const walletInfo = getWalletInfo(opts.wallet)
      if (!walletInfo) {
        spinner.fail(`Wallet "${opts.wallet}" not found`)
        process.exit(1)
      }

      // Load or create vault
      const vault = loadVault() ?? createEmptyVault()

      // Derive vault master key from wallet private key
      const vaultPassword = opts.password ?? 'saga-default-password'
      const privKey = loadWalletPrivateKey(opts.wallet, vaultPassword)
      const privKeyBytes = new Uint8Array(Buffer.from(privKey.slice(2), 'hex'))
      const vaultMasterKey = await deriveVaultMasterKey(
        privKeyBytes,
        Buffer.from(vault.encryption.salt, 'base64')
      )

      // Encrypt fields with real AES-256-GCM
      const encrypted = await encryptVaultItem(fields, vaultMasterKey)

      const itemId = `vi_${generateItemId()}`
      const now = new Date().toISOString()

      const item: VaultItem = {
        itemId,
        type: opts.type as VaultItemType,
        name: opts.name,
        category: opts.category,
        tags: opts.tags ? opts.tags.split(',').map((t: string) => t.trim()) : undefined,
        createdAt: now,
        updatedAt: now,
        fields: encrypted.fields,
        keyWraps: [encrypted.wrappedDek],
      }

      vault.items.push(item)
      vault.version++
      vault.updatedAt = now

      saveVault(vault)
      spinner.succeed(`Added: ${item.name} (${item.itemId})`)
    } catch (err) {
      spinner.fail(`Failed to add item: ${(err as Error).message}`)
      process.exit(1)
    }
  })

/**
 * Remove a vault item
 */
vaultCommand
  .command('remove')
  .description('Remove a credential from the vault')
  .argument('<itemId>', 'Item ID to remove')
  .action(async itemId => {
    try {
      const vault = loadVault()
      if (!vault) {
        console.error(chalk.red('No vault found'))
        process.exit(1)
      }

      const idx = vault.items.findIndex(i => i.itemId === itemId)
      if (idx === -1) {
        console.error(chalk.red(`Item not found: ${itemId}`))
        process.exit(1)
      }

      const removed = vault.items.splice(idx, 1)[0]
      vault.version++
      vault.updatedAt = new Date().toISOString()

      saveVault(vault)
      console.log(chalk.green(`Removed: ${removed.name} (${removed.itemId})`))
    } catch (err) {
      console.error(chalk.red(`Failed to remove: ${(err as Error).message}`))
      process.exit(1)
    }
  })

/**
 * Show vault item details (decrypted if wallet is available)
 */
vaultCommand
  .command('get')
  .description('Show vault item details')
  .argument('<itemId>', 'Item ID to inspect')
  .option('--wallet <name>', 'Wallet to decrypt with', 'default')
  .option('--password <password>', 'Wallet password')
  .option('--json', 'Output as JSON')
  .action(async (itemId, opts) => {
    try {
      const vault = loadVault()
      if (!vault) {
        console.error(chalk.red('No vault found'))
        process.exit(1)
      }

      const item = vault.items.find(i => i.itemId === itemId)
      if (!item) {
        console.error(chalk.red(`Item not found: ${itemId}`))
        process.exit(1)
      }

      if (opts.json) {
        console.log(JSON.stringify(item, null, 2))
        return
      }

      console.log(chalk.bold(`${getTypeIcon(item.type)} ${item.name}`))
      console.log(`  Type:     ${item.type}`)
      console.log(`  ID:       ${item.itemId}`)
      console.log(`  Category: ${item.category ?? '(none)'}`)
      console.log(`  Tags:     ${item.tags?.join(', ') ?? '(none)'}`)
      console.log(`  Created:  ${item.createdAt}`)
      console.log(`  Updated:  ${item.updatedAt}`)
      console.log(`  Key wraps: ${item.keyWraps.length} recipient(s)`)
      console.log()

      // Attempt real decryption
      const walletInfo = getWalletInfo(opts.wallet)
      if (walletInfo && item.fields.__encrypted) {
        try {
          const vaultPassword = opts.password ?? 'saga-default-password'
          const privKey = loadWalletPrivateKey(opts.wallet, vaultPassword)
          const privKeyBytes = new Uint8Array(Buffer.from(privKey.slice(2), 'hex'))

          const masterKey = await deriveVaultMasterKey(
            privKeyBytes,
            Buffer.from(vault.encryption.salt, 'base64')
          )

          const selfWrap = item.keyWraps.find(kw => kw.recipient === 'self')
          if (!selfWrap) throw new Error('No self key wrap found')

          const fields = await decryptVaultItem(item.fields, selfWrap, masterKey)
          console.log(chalk.bold('  Fields (decrypted):'))
          for (const [key, value] of Object.entries(fields)) {
            const display =
              key === 'password' || key === 'privateKey' || key === 'clientSecret'
                ? chalk.dim('********')
                : String(value)
            console.log(`    ${key}: ${display}`)
          }
        } catch {
          console.log(chalk.yellow('  Fields: [encrypted - decryption failed]'))
        }
      } else {
        console.log(chalk.yellow('  Fields: [encrypted - unlock vault to view]'))
      }
    } catch (err) {
      console.error(chalk.red(`Failed to get item: ${(err as Error).message}`))
      process.exit(1)
    }
  })

/**
 * Share a vault item with another wallet
 */
vaultCommand
  .command('share')
  .description('Share a vault item with another agent')
  .argument('<itemId>', 'Item ID to share')
  .requiredOption('--to <address>', 'Recipient wallet address')
  .option('--permission <level>', 'Permission level (read, write)', 'read')
  .option('--expires <date>', 'Expiration date (ISO 8601)')
  .option('--wallet <name>', 'Your wallet', 'default')
  .action(async (itemId, opts) => {
    const spinner = ora('Sharing vault item...').start()
    try {
      const vault = loadVault()
      if (!vault) {
        spinner.fail('No vault found')
        process.exit(1)
      }

      const item = vault.items.find(i => i.itemId === itemId)
      if (!item) {
        spinner.fail(`Item not found: ${itemId}`)
        process.exit(1)
      }

      const walletInfo = getWalletInfo(opts.wallet)
      if (!walletInfo) {
        spinner.fail(`Wallet "${opts.wallet}" not found`)
        process.exit(1)
      }

      // Add share grant
      if (!vault.shares) vault.shares = []

      vault.shares.push({
        recipientAddress: opts.to,
        recipientPublicKey: '', // Would be fetched from recipient's SAGA identity
        permission: opts.permission,
        itemIds: [itemId],
        grantedBy: walletInfo.address,
        grantedAt: new Date().toISOString(),
        expiresAt: opts.expires,
      })

      // Add key wrap for recipient (placeholder until recipient pubkey is available)
      item.keyWraps.push({
        recipient: opts.to,
        algorithm: 'x25519-xsalsa20-poly1305',
        wrappedKey: Buffer.from(randomBytes(32)).toString('base64'),
      })

      vault.version++
      vault.updatedAt = new Date().toISOString()

      saveVault(vault)
      spinner.succeed(`Shared ${item.name} with ${opts.to} (${opts.permission})`)
    } catch (err) {
      spinner.fail(`Failed to share: ${(err as Error).message}`)
      process.exit(1)
    }
  })

// -- Helpers --

function loadVault(_sagaPath?: string): VaultLayer | null {
  const vaultPath = join(getSagaDir(), 'vault.json')

  try {
    return JSON.parse(readFileSync(vaultPath, 'utf-8'))
  } catch {
    return null
  }
}

function saveVault(vault: VaultLayer): void {
  const vaultPath = join(getSagaDir(), 'vault.json')
  writeFileSync(vaultPath, JSON.stringify(vault, null, 2))
}

function createEmptyVault(): VaultLayer {
  return {
    encryption: {
      algorithm: 'aes-256-gcm',
      keyDerivation: 'hkdf-sha256',
      keyWrapAlgorithm: 'x25519-xsalsa20-poly1305',
      salt: Buffer.from(randomBytes(32)).toString('base64'),
      info: 'saga-vault-v1',
    },
    items: [],
    shares: [],
    version: 0,
    updatedAt: new Date().toISOString(),
  }
}

function generateItemId(): string {
  return randomBytes(8).toString('hex')
}

function getTypeIcon(type: string): string {
  const icons: Record<string, string> = {
    login: '🔑',
    'api-key': '🗝️',
    'oauth-token': '🎫',
    'ssh-key': '🔐',
    certificate: '📜',
    note: '📝',
    custom: '📦',
  }
  return icons[type] ?? '📦'
}
