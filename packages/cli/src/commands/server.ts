// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { Command } from 'commander'
import chalk from 'chalk'
import { SagaServerClient, type ServerInfo } from '@d7r/saga-client'
import { clearCachedSession, loadConfig, saveConfig } from '../config'

export const serverCommand = new Command('server').description('Manage SAGA servers')

serverCommand
  .command('add')
  .description('Add a SAGA server')
  .argument('<url>', 'Server URL')
  .option('--name <name>', 'Display name for the server')
  .action(async (url, opts) => {
    const normalizedUrl = url.replace(/\/$/, '')

    try {
      // Verify it's a SAGA server
      const client = new SagaServerClient({ serverUrl: normalizedUrl })
      const info: ServerInfo = await client.getServerInfo()

      if (!info.sagaVersion) {
        console.error(chalk.red('Not a SAGA-compatible server (missing sagaVersion)'))
        process.exit(1)
      }

      // Store in config
      const config = loadConfig()
      config.servers[normalizedUrl] = {
        name: opts.name ?? info.name,
        addedAt: new Date().toISOString(),
      }

      // Set as default if first server
      if (!config.defaultServer) {
        config.defaultServer = normalizedUrl
      }

      saveConfig(config)

      console.log(chalk.green(`Server added: ${info.name}`))
      console.log(`  URL:         ${normalizedUrl}`)
      console.log(`  Version:     ${info.version}`)
      console.log(`  SAGA:        ${info.sagaVersion}`)
      console.log(`  Conformance: Level ${info.conformanceLevel}`)
      console.log(`  Chains:      ${info.supportedChains.join(', ')}`)
    } catch (err) {
      console.error(chalk.red(`Failed to connect: ${(err as Error).message}`))
      process.exit(1)
    }
  })

serverCommand
  .command('list')
  .description('List configured servers')
  .action(() => {
    const config = loadConfig()
    const urls = Object.keys(config.servers)

    if (urls.length === 0) {
      console.log(chalk.yellow('No servers configured. Run: saga server add <url>'))
      return
    }

    console.log(chalk.bold('Configured servers:'))
    for (const url of urls) {
      const srv = config.servers[url]
      const isDefault = url === config.defaultServer ? chalk.cyan(' (default)') : ''
      console.log(`  ${srv.name}${isDefault}`)
      console.log(`    ${url}`)
    }
  })

serverCommand
  .command('remove')
  .description('Remove a server')
  .argument('<url-or-name>', 'Server URL or name')
  .action(urlOrName => {
    const config = loadConfig()
    let targetUrl: string | null = null

    // Try URL first
    if (config.servers[urlOrName]) {
      targetUrl = urlOrName
    } else {
      // Search by name
      for (const [url, srv] of Object.entries(config.servers)) {
        if (srv.name === urlOrName) {
          targetUrl = url
          break
        }
      }
    }

    if (!targetUrl) {
      console.error(chalk.red(`Server not found: ${urlOrName}`))
      process.exit(1)
    }

    delete config.servers[targetUrl]
    if (config.defaultServer === targetUrl) {
      config.defaultServer = Object.keys(config.servers)[0]
    }

    clearCachedSession(targetUrl)
    saveConfig(config)
    console.log(chalk.green(`Server removed: ${targetUrl}`))
  })

serverCommand
  .command('info')
  .description('Show server details')
  .argument('[url-or-name]', 'Server URL or name (defaults to default server)')
  .action(async (urlOrName?) => {
    const config = loadConfig()
    let targetUrl: string

    if (!urlOrName) {
      if (!config.defaultServer) {
        console.error(chalk.red('No default server. Run: saga server add <url>'))
        process.exit(1)
      }
      targetUrl = config.defaultServer
    } else if (config.servers[urlOrName]) {
      targetUrl = urlOrName
    } else {
      // Search by name
      const found = Object.entries(config.servers).find(([, s]) => s.name === urlOrName)
      if (!found) {
        console.error(chalk.red(`Server not found: ${urlOrName}`))
        process.exit(1)
      }
      targetUrl = found[0]
    }

    try {
      const client = new SagaServerClient({ serverUrl: targetUrl })
      const info = await client.getServerInfo()

      console.log(chalk.bold(info.name))
      console.log(`  URL:          ${targetUrl}`)
      console.log(`  Version:      ${info.version}`)
      console.log(`  SAGA:         ${info.sagaVersion}`)
      console.log(`  Conformance:  Level ${info.conformanceLevel}`)
      console.log(`  Chains:       ${info.supportedChains.join(', ')}`)
      console.log(`  Capabilities: ${info.capabilities.join(', ')}`)
      if (info.registrationOpen !== undefined) {
        console.log(`  Registration: ${info.registrationOpen ? 'Open' : 'Closed'}`)
      }
    } catch (err) {
      console.error(chalk.red(`Failed: ${(err as Error).message}`))
      process.exit(1)
    }
  })
