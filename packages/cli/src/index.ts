// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { Command } from 'commander'
import { walletCommand } from './commands/wallet'
import { serverCommand } from './commands/server'
import { collectCommand } from './commands/collect'
import { exportCommand } from './commands/export'
import { inspectCommand, verifyCommand } from './commands/inspect'
import { vaultCommand } from './commands/vault'

const program = new Command()

program
  .name('saga')
  .description('SAGA CLI — collect, export, and manage portable AI agent state')
  .version('0.1.0')

program.addCommand(walletCommand)
program.addCommand(serverCommand)
program.addCommand(collectCommand)
program.addCommand(exportCommand)
program.addCommand(inspectCommand)
program.addCommand(verifyCommand)
program.addCommand(vaultCommand)

program.parse()
