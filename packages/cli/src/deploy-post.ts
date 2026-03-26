// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export interface DeploymentAddresses {
  [contractName: string]: string
}

export interface DeploymentUpdate {
  addresses: DeploymentAddresses
  safeTxHash: string
  deployedAt: string
}

export interface PendingDeploy {
  safeTxHash: string
  safeUrl: string
  simulatedAddresses: DeploymentAddresses
  proposedAt: string
}

export function updateDeploymentJson(filePath: string, update: DeploymentUpdate): void {
  const existing = JSON.parse(readFileSync(filePath, 'utf-8'))

  existing.deployedAt = update.deployedAt
  existing.deploySafeTxHash = update.safeTxHash

  for (const [name, address] of Object.entries(update.addresses)) {
    if (name in existing.contracts) {
      existing.contracts[name] = address
    }
  }

  writeFileSync(filePath, `${JSON.stringify(existing, null, 2)}\n`)
}

export function updateAddressesTs(
  filePath: string,
  chain: string,
  addresses: DeploymentAddresses
): void {
  let content = readFileSync(filePath, 'utf-8')

  const chainKey = chain.includes('-') ? `'${chain}'` : chain
  const chainBlockRegex = new RegExp(
    `(${chainKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:\\s*\\{)([^}]+)(\\})`,
    's'
  )

  const match = content.match(chainBlockRegex)
  if (!match) {
    throw new Error(`Chain "${chain}" block not found in addresses.ts`)
  }

  let block = match[2]
  for (const [name, address] of Object.entries(addresses)) {
    const fieldRegex = new RegExp(`(${name}:\\s*)(?:ZERO|'0x[^']*')[^,\\n]*`)
    block = block.replace(fieldRegex, `$1'${address}'`)
  }

  content = content.replace(chainBlockRegex, `$1${block}$3`)
  writeFileSync(filePath, content)
}

export function savePendingDeploy(deploysDir: string, chain: string, pending: PendingDeploy): void {
  if (!existsSync(deploysDir)) {
    mkdirSync(deploysDir, { recursive: true })
  }
  writeFileSync(join(deploysDir, `${chain}-pending.json`), JSON.stringify(pending, null, 2))
}

export function loadPendingDeploy(deploysDir: string, chain: string): PendingDeploy | null {
  const filePath = join(deploysDir, `${chain}-pending.json`)
  if (!existsSync(filePath)) return null
  return JSON.parse(readFileSync(filePath, 'utf-8'))
}

export function clearPendingDeploy(deploysDir: string, chain: string): void {
  const filePath = join(deploysDir, `${chain}-pending.json`)
  if (existsSync(filePath)) {
    unlinkSync(filePath)
  }
}
