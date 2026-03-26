// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { deriveNetworkAllowlist, loadDeployConfig, resolveChainConfig } from '../deploy-config'

const TEST_DIR = join(tmpdir(), `saga-deploy-test-${Date.now()}`)

const VALID_CONFIG_YAML = `
version: 1

defaults:
  contracts:
    - SAGAHandleRegistry
    - SAGAAgentIdentity
    - SAGAOrgIdentity
    - SAGATBAHelper
  verify: true
  notify: true

chains:
  base-sepolia:
    chainId: 84532
    rpc: https://sepolia.base.org
    safe: "0x1234567890abcdef1234567890abcdef12345678"
    safeThreshold: 2
    explorerApi: https://api-sepolia.basescan.org
    safeTransactionService: https://safe-transaction-base-sepolia.safe.global
    external:
      erc6551Registry: "0x000000006551c19487814612e58FE06813775758"
      tbaImplementation: "0xaabbccdd"
    op:
      vault: SAGA Deploys
      signerItem: base-sepolia-signer
      addressesItem: base-sepolia-addresses
      explorerKeyItem: basescan-api-key

  base:
    chainId: 8453
    rpc: https://mainnet.base.org
    safe: "0xabcdef1234567890abcdef1234567890abcdef12"
    safeThreshold: 3
    explorerApi: https://api.basescan.org
    safeTransactionService: https://safe-transaction-base.safe.global
    production: true
    external:
      erc6551Registry: "0x000000006551c19487814612e58FE06813775758"
      tbaImplementation: "0xeeff0011"
    op:
      vault: SAGA Deploys
      signerItem: base-mainnet-signer
      addressesItem: base-mainnet-addresses
      explorerKeyItem: basescan-api-key

networkAllowlist:
  - my.1password.com
`

describe('deploy-config', () => {
  beforeEach(() => {
    mkdirSync(TEST_DIR, { recursive: true })
  })

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true })
    }
  })

  describe('loadDeployConfig', () => {
    it('parses a valid YAML config', () => {
      const configPath = join(TEST_DIR, 'deploy.config.yaml')
      writeFileSync(configPath, VALID_CONFIG_YAML)

      const config = loadDeployConfig(configPath)
      expect(config.version).toBe(1)
      expect(config.defaults.contracts).toHaveLength(4)
      expect(config.chains['base-sepolia'].chainId).toBe(84532)
      expect(config.chains['base'].production).toBe(true)
    })

    it('throws on missing file', () => {
      expect(() => loadDeployConfig(join(TEST_DIR, 'nope.yaml'))).toThrow('Deploy config not found')
    })

    it('throws on missing required fields', () => {
      const configPath = join(TEST_DIR, 'bad.yaml')
      writeFileSync(configPath, 'version: 1\nchains: {}')

      expect(() => loadDeployConfig(configPath)).toThrow('defaults')
    })
  })

  describe('resolveChainConfig', () => {
    it('returns chain config with defaults merged', () => {
      const configPath = join(TEST_DIR, 'deploy.config.yaml')
      writeFileSync(configPath, VALID_CONFIG_YAML)
      const config = loadDeployConfig(configPath)

      const resolved = resolveChainConfig(config, 'base-sepolia', {})
      expect(resolved.chainId).toBe(84532)
      expect(resolved.contracts).toEqual([
        'SAGAHandleRegistry',
        'SAGAAgentIdentity',
        'SAGAOrgIdentity',
        'SAGATBAHelper',
      ])
      expect(resolved.verify).toBe(true)
      expect(resolved.notify).toBe(true)
    })

    it('applies CLI overrides', () => {
      const configPath = join(TEST_DIR, 'deploy.config.yaml')
      writeFileSync(configPath, VALID_CONFIG_YAML)
      const config = loadDeployConfig(configPath)

      const resolved = resolveChainConfig(config, 'base-sepolia', {
        rpc: 'https://custom-rpc.example.com',
        verify: false,
      })
      expect(resolved.rpc).toBe('https://custom-rpc.example.com')
      expect(resolved.verify).toBe(false)
    })

    it('throws on unknown chain', () => {
      const configPath = join(TEST_DIR, 'deploy.config.yaml')
      writeFileSync(configPath, VALID_CONFIG_YAML)
      const config = loadDeployConfig(configPath)

      expect(() => resolveChainConfig(config, 'polygon', {})).toThrow('not found in config')
    })

    it('throws on empty safe address', () => {
      const configPath = join(TEST_DIR, 'deploy.config.yaml')
      const yaml = VALID_CONFIG_YAML.replace(
        'safe: "0x1234567890abcdef1234567890abcdef12345678"',
        "safe: ''"
      )
      writeFileSync(configPath, yaml)
      const config = loadDeployConfig(configPath)

      expect(() => resolveChainConfig(config, 'base-sepolia', {})).toThrow('empty "safe" address')
    })

    it('flags production chains', () => {
      const configPath = join(TEST_DIR, 'deploy.config.yaml')
      writeFileSync(configPath, VALID_CONFIG_YAML)
      const config = loadDeployConfig(configPath)

      const resolved = resolveChainConfig(config, 'base', {})
      expect(resolved.production).toBe(true)
    })
  })

  describe('deriveNetworkAllowlist', () => {
    it('extracts unique hostnames from chain config and global allowlist', () => {
      const configPath = join(TEST_DIR, 'deploy.config.yaml')
      writeFileSync(configPath, VALID_CONFIG_YAML)
      const config = loadDeployConfig(configPath)
      const resolved = resolveChainConfig(config, 'base-sepolia', {})

      const allowlist = deriveNetworkAllowlist(config, resolved)
      expect(allowlist).toContain('sepolia.base.org')
      expect(allowlist).toContain('api-sepolia.basescan.org')
      expect(allowlist).toContain('safe-transaction-base-sepolia.safe.global')
      expect(allowlist).toContain('my.1password.com')
      // No duplicates
      expect(new Set(allowlist).size).toBe(allowlist.length)
    })
  })
})
