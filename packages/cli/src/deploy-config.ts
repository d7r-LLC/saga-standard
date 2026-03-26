// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { existsSync, readFileSync } from 'node:fs'
import yaml from 'js-yaml'

export interface OpConfig {
  vault: string
  signerItem: string
  addressesItem: string
  explorerKeyItem: string
}

export interface ExternalAddresses {
  erc6551Registry: string
  tbaImplementation: string
}

export interface ChainConfig {
  chainId: number
  rpc: string
  safe: string
  safeThreshold: number
  explorerApi: string
  safeTransactionService: string
  production?: boolean
  external: ExternalAddresses
  op: OpConfig
}

export interface DeployDefaults {
  contracts: string[]
  verify: boolean
  notify: boolean
}

export interface DeployConfig {
  version: number
  defaults: DeployDefaults
  chains: Record<string, ChainConfig>
  networkAllowlist: string[]
}

export interface ResolvedChainConfig extends ChainConfig {
  chain: string
  contracts: string[]
  verify: boolean
  notify: boolean
}

export interface CliOverrides {
  rpc?: string
  verify?: boolean
  notify?: boolean
}

export function loadDeployConfig(configPath: string): DeployConfig {
  if (!existsSync(configPath)) {
    throw new Error(`Deploy config not found: ${configPath}`)
  }

  const raw = yaml.load(readFileSync(configPath, 'utf-8')) as Record<string, unknown>

  if (!raw.defaults) {
    throw new Error('Deploy config missing required field: defaults')
  }
  if (!raw.chains || typeof raw.chains !== 'object') {
    throw new Error('Deploy config missing required field: chains')
  }

  return {
    version: (raw.version as number) ?? 1,
    defaults: raw.defaults as DeployDefaults,
    chains: raw.chains as Record<string, ChainConfig>,
    networkAllowlist: (raw.networkAllowlist as string[]) ?? [],
  }
}

export function resolveChainConfig(
  config: DeployConfig,
  chain: string,
  overrides: CliOverrides
): ResolvedChainConfig {
  const chainConfig = config.chains[chain]
  if (!chainConfig) {
    throw new Error(`Chain "${chain}" not found in config`)
  }

  // Validate required non-empty fields
  if (!chainConfig.safe) {
    throw new Error(`Chain "${chain}" has empty "safe" address — populate before deploying`)
  }
  if (!chainConfig.rpc) {
    throw new Error(`Chain "${chain}" has empty "rpc" URL`)
  }
  if (!chainConfig.op?.vault || !chainConfig.op?.signerItem) {
    throw new Error(
      `Chain "${chain}" has incomplete 1Password config (op.vault and op.signerItem required)`
    )
  }

  return {
    ...chainConfig,
    chain,
    rpc: overrides.rpc ?? chainConfig.rpc,
    contracts: config.defaults.contracts,
    verify: overrides.verify ?? config.defaults.verify,
    notify: overrides.notify ?? config.defaults.notify,
  }
}

export function deriveNetworkAllowlist(
  config: DeployConfig,
  resolved: ResolvedChainConfig
): string[] {
  const urls = [resolved.rpc, resolved.explorerApi, resolved.safeTransactionService]

  const hostnames = urls.map(url => {
    try {
      return new URL(url).hostname
    } catch {
      return url
    }
  })

  const all = [...hostnames, ...config.networkAllowlist]
  return [...new Set(all)]
}
