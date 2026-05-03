// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { describe, expect, it } from 'vitest'
import {
  buildDockerBuildArgs,
  buildDockerNetworkCreateArgs,
  buildDockerNetworkRmArgs,
  buildDockerRunArgs,
} from '../deploy-docker'
import type { ResolvedChainConfig } from '../deploy-config'

const MOCK_RESOLVED: ResolvedChainConfig = {
  chain: 'base-sepolia',
  chainId: 84532,
  rpc: 'https://sepolia.base.org',
  safe: '0x1234567890abcdef1234567890abcdef12345678',
  safeThreshold: 2,
  explorerApi: 'https://api-sepolia.basescan.org',
  safeTransactionService: 'https://safe-transaction-base-sepolia.safe.global',
  external: {
    erc6551Registry: '0x000000006551c19487814612e58FE06813775758',
    tbaImplementation: '0xaabbccdd',
  },
  op: {
    vault: 'SAGA Deploys',
    signerItem: 'base-sepolia-signer',
    addressesItem: 'base-sepolia-addresses',
    explorerKeyItem: 'basescan-api-key',
  },
  contracts: ['SAGAHandleRegistry', 'SAGAAgentIdentity', 'SAGAOrgIdentity', 'SAGATBAHelper'],
  verify: true,
  notify: true,
}

describe('deploy-docker', () => {
  describe('buildDockerBuildArgs', () => {
    it('generates build command for contracts directory', () => {
      const args = buildDockerBuildArgs('/path/to/contracts')
      expect(args).toContain('build')
      expect(args).toContain('-t')
      expect(args).toContain('saga-deploy:latest')
      expect(args).toContain('-f')
      expect(args).toContain('/path/to/contracts/Dockerfile.deploy')
      expect(args[args.length - 1]).toBe('/path/to/contracts')
    })
  })

  describe('buildDockerNetworkCreateArgs', () => {
    it('generates network create command', () => {
      const args = buildDockerNetworkCreateArgs('saga-deploy-net')
      expect(args).toContain('network')
      expect(args).toContain('create')
      expect(args).toContain('saga-deploy-net')
    })
  })

  describe('buildDockerNetworkRmArgs', () => {
    it('generates network remove command', () => {
      const args = buildDockerNetworkRmArgs('saga-deploy-net')
      expect(args).toEqual(['network', 'rm', 'saga-deploy-net'])
    })
  })

  describe('buildDockerRunArgs', () => {
    it('includes hardening flags', () => {
      const args = buildDockerRunArgs({
        resolved: MOCK_RESOLVED,
        networkName: 'saga-deploy-net',
        mode: 'broadcast',
      })

      expect(args).toContain('--rm')
      expect(args).toContain('--cap-drop')
      expect(args[args.indexOf('--cap-drop') + 1]).toBe('ALL')
      expect(args).toContain('--security-opt')
      expect(args[args.indexOf('--security-opt') + 1]).toBe('no-new-privileges')
    })

    it('passes deploy mode as env var', () => {
      const args = buildDockerRunArgs({
        resolved: MOCK_RESOLVED,
        networkName: 'saga-deploy-net',
        mode: 'dry-run',
      })

      const envIdx = args.findIndex((a, i) => a === '-e' && args[i + 1]?.startsWith('DEPLOY_MODE='))
      expect(envIdx).toBeGreaterThan(-1)
      expect(args[envIdx + 1]).toBe('DEPLOY_MODE=dry-run')
    })

    it('runs with read-only root filesystem and tmpfs for forge cache + tmp', () => {
      // Phase 1 hardening (A-Crit#3): the deploy container's root filesystem
      // is immutable. Forge writes go to a /forge-cache tmpfs (set via
      // FOUNDRY_CACHE_PATH in Dockerfile.deploy); other temp writes go to
      // a /tmp tmpfs. Neither persists beyond the run.
      const args = buildDockerRunArgs({
        resolved: MOCK_RESOLVED,
        networkName: 'saga-deploy-net',
        mode: 'broadcast',
      })

      expect(args).toContain('--read-only')

      // Two tmpfs mounts: /forge-cache and /tmp
      const tmpfsValues = args.reduce<string[]>((acc, val, i) => {
        if (val === '--tmpfs' && typeof args[i + 1] === 'string') acc.push(args[i + 1])
        return acc
      }, [])
      expect(tmpfsValues).toEqual(
        expect.arrayContaining([
          expect.stringMatching(/^\/forge-cache:/),
          expect.stringMatching(/^\/tmp:/),
        ])
      )
    })

    it('uses the specified network', () => {
      const args = buildDockerRunArgs({
        resolved: MOCK_RESOLVED,
        networkName: 'saga-deploy-net',
        mode: 'broadcast',
      })

      expect(args).toContain('--network')
      expect(args[args.indexOf('--network') + 1]).toBe('saga-deploy-net')
    })

    it('passes DEPLOY_CONFIG as base64 env var', () => {
      const args = buildDockerRunArgs({
        resolved: MOCK_RESOLVED,
        networkName: 'saga-deploy-net',
        mode: 'broadcast',
      })

      const envIdx = args.findIndex(
        (a, i) => a === '-e' && args[i + 1]?.startsWith('DEPLOY_CONFIG=')
      )
      expect(envIdx).toBeGreaterThan(-1)

      const configB64 = args[envIdx + 1].replace('DEPLOY_CONFIG=', '')
      const decoded = JSON.parse(Buffer.from(configB64, 'base64').toString('utf-8'))
      expect(decoded.chain).toBe('base-sepolia')
      expect(decoded.rpc).toBe('https://sepolia.base.org')
      expect(decoded.op.vault).toBe('SAGA Deploys')
    })

    it('passes OP_SERVICE_ACCOUNT_TOKEN as env name only (resolved from host env)', () => {
      const args = buildDockerRunArgs({
        resolved: MOCK_RESOLVED,
        networkName: 'saga-deploy-net',
        mode: 'broadcast',
      })

      const opEnvIdx = args.findIndex(
        (a, i) => a === '-e' && args[i + 1] === 'OP_SERVICE_ACCOUNT_TOKEN'
      )
      expect(opEnvIdx).toBeGreaterThan(-1)
      expect(args[opEnvIdx + 1]).toBe('OP_SERVICE_ACCOUNT_TOKEN')
    })

    it('ends with image name', () => {
      const args = buildDockerRunArgs({
        resolved: MOCK_RESOLVED,
        networkName: 'saga-deploy-net',
        mode: 'broadcast',
      })

      expect(args[args.length - 1]).toBe('saga-deploy:latest')
    })
  })
})
