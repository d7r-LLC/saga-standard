// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { Command } from 'commander'
import { walletCommand } from './commands/wallet'
import { serverCommand } from './commands/server'
import { collectCommand } from './commands/collect'
import { exportCommand } from './commands/export'
import { inspectCommand, verifyCommand } from './commands/inspect'
import { vaultCommand } from './commands/vault'
import { registerCommand } from './commands/register'
import { resolveCommand } from './commands/resolve'
import { registerOrgCommand } from './commands/register-org'
import { registerDirectoryCommand } from './commands/register-directory'
import { deployCommand } from './commands/deploy'
import { fundCommand } from './commands/fund'
import { secretsGenerateCommand } from './commands/secrets-generate'
import { secretsPushCommand } from './commands/secrets-push'
import { secretsDeployCommand } from './commands/secrets-deploy'

const program = new Command()

program
  .name('saga')
  .description('SAGA CLI — collect, export, and manage portable AI agent state')
  .version('0.1.0')

program.addCommand(walletCommand)
program.addCommand(serverCommand)
program.addCommand(registerCommand)
program.addCommand(resolveCommand)
program.addCommand(registerOrgCommand)
program.addCommand(registerDirectoryCommand)
program.addCommand(collectCommand)
program.addCommand(exportCommand)
program.addCommand(inspectCommand)
program.addCommand(verifyCommand)
program.addCommand(vaultCommand)
program.addCommand(deployCommand)
program.addCommand(fundCommand)

// `saga secrets …` — secret lifecycle for the saga-server worker.
// Subcommands:
//   saga secrets generate --env <env>   produce .env.<env> file
//   saga secrets push     --env <env>   read .env.<env>, populate 1P
//   saga secrets deploy   --env <env>   read 1P, push to wrangler secrets
//
// Currently scoped to saga-server only — slug prefix
// `saga-server-<env>-…`, default path `packages/server/.env.<env>`,
// deploy targets the `saga-server-<env>` worker. saga-directory
// doesn't have its own secrets at the moment (it proxies through
// saga-server via the SAGA_SERVER service binding) so no parallel
// flow is needed yet. If saga-directory gains its own secrets,
// extend the command surface to take a target package option.
const secretsCommand = new Command('secrets').description(
  'Manage saga-server worker secrets. Subcommands: generate, push, deploy.'
)
secretsCommand.addCommand(secretsGenerateCommand)
secretsCommand.addCommand(secretsPushCommand)
secretsCommand.addCommand(secretsDeployCommand)
program.addCommand(secretsCommand)

program.parse()
