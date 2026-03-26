// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  clearPendingDeploy,
  loadPendingDeploy,
  savePendingDeploy,
  updateAddressesTs,
  updateDeploymentJson,
} from '../deploy-post'

const TEST_DIR = join(tmpdir(), `saga-deploy-post-test-${Date.now()}`)

describe('deploy-post', () => {
  beforeEach(() => {
    mkdirSync(TEST_DIR, { recursive: true })
  })

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true })
    }
  })

  describe('updateDeploymentJson', () => {
    it('writes deployment addresses to JSON file', () => {
      const deploymentsDir = join(TEST_DIR, 'deployments')
      mkdirSync(deploymentsDir, { recursive: true })
      const filePath = join(deploymentsDir, 'base-sepolia.json')
      writeFileSync(
        filePath,
        JSON.stringify({
          chainId: 84532,
          network: 'base-sepolia',
          deployedAt: '',
          contracts: {
            SAGAHandleRegistry: '',
            SAGAAgentIdentity: '',
            SAGAOrgIdentity: '',
            SAGATBAHelper: '',
          },
          external: {
            ERC6551Registry: '0x000000006551c19487814612e58FE06813775758',
            TBAImplementation: '',
          },
        })
      )

      updateDeploymentJson(filePath, {
        addresses: {
          SAGAHandleRegistry: '0xaaaa',
          SAGAAgentIdentity: '0xbbbb',
          SAGAOrgIdentity: '0xcccc',
          SAGATBAHelper: '0xdddd',
        },
        safeTxHash: '0xface',
        deployedAt: '2026-03-26T12:00:00Z',
      })

      const result = JSON.parse(readFileSync(filePath, 'utf-8'))
      expect(result.contracts.SAGAHandleRegistry).toBe('0xaaaa')
      expect(result.contracts.SAGAAgentIdentity).toBe('0xbbbb')
      expect(result.deploySafeTxHash).toBe('0xface')
      expect(result.deployedAt).toBe('2026-03-26T12:00:00Z')
    })
  })

  describe('updateAddressesTs', () => {
    it('patches address constants in TypeScript file', () => {
      const filePath = join(TEST_DIR, 'addresses.ts')
      writeFileSync(
        filePath,
        `const ADDRESSES: Record<SupportedChain, Record<ContractName, Address>> = {
  'base-sepolia': {
    SAGAHandleRegistry: ZERO, // populated after testnet deploy
    SAGAAgentIdentity: ZERO,
    SAGAOrgIdentity: ZERO,
    SAGATBAHelper: ZERO,
  },
  base: {
    SAGAHandleRegistry: ZERO,
    SAGAAgentIdentity: ZERO,
    SAGAOrgIdentity: ZERO,
    SAGATBAHelper: ZERO,
  },
}`
      )

      updateAddressesTs(filePath, 'base-sepolia', {
        SAGAHandleRegistry: '0xaaaa',
        SAGAAgentIdentity: '0xbbbb',
        SAGAOrgIdentity: '0xcccc',
        SAGATBAHelper: '0xdddd',
      })

      const result = readFileSync(filePath, 'utf-8')
      expect(result).toContain("SAGAHandleRegistry: '0xaaaa'")
      expect(result).toContain("SAGAAgentIdentity: '0xbbbb'")
      expect(result).toContain("SAGAOrgIdentity: '0xcccc'")
      expect(result).toContain("SAGATBAHelper: '0xdddd'")
      // base chain should remain ZERO
      expect(result).toMatch(/base:\s*\{[\s\S]*SAGAHandleRegistry: ZERO/)
    })
  })

  describe('pending deploy state', () => {
    it('saves and loads pending deploy', () => {
      const deploysDir = join(TEST_DIR, 'deploys')

      savePendingDeploy(deploysDir, 'base-sepolia', {
        safeTxHash: '0xface',
        safeUrl: 'https://app.safe.global/...',
        simulatedAddresses: { SAGAHandleRegistry: '0xaaaa' },
        proposedAt: '2026-03-26T12:00:00Z',
      })

      const loaded = loadPendingDeploy(deploysDir, 'base-sepolia')
      expect(loaded).not.toBeNull()
      expect(loaded!.safeTxHash).toBe('0xface')
    })

    it('returns null when no pending deploy exists', () => {
      const deploysDir = join(TEST_DIR, 'deploys')
      mkdirSync(deploysDir, { recursive: true })

      const loaded = loadPendingDeploy(deploysDir, 'base-sepolia')
      expect(loaded).toBeNull()
    })

    it('clears pending deploy', () => {
      const deploysDir = join(TEST_DIR, 'deploys')

      savePendingDeploy(deploysDir, 'base-sepolia', {
        safeTxHash: '0xface',
        safeUrl: 'https://app.safe.global/...',
        simulatedAddresses: {},
        proposedAt: '2026-03-26T12:00:00Z',
      })

      clearPendingDeploy(deploysDir, 'base-sepolia')
      const loaded = loadPendingDeploy(deploysDir, 'base-sepolia')
      expect(loaded).toBeNull()
    })
  })
})
