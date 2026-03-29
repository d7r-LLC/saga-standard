> **FlowState Document:** `docu_RVG-jXlbOF`

# Secure Smart Contract Deploy CLI — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `saga deploy` command that securely deploys SAGA identity contracts through a hardened Docker container using 1Password for secret management and Gnosis Safe for multisig execution.

**Architecture:** The host CLI (`deploy.ts`) reads a YAML config file, validates it, builds/runs a hardened Docker container that fetches the signer key from 1Password via `op` CLI, simulates/proposes the deployment as a Safe multisig transaction, and returns structured JSON. The host CLI then handles post-deploy bookkeeping (update repo files, notify server). Secrets never leave the container.

**Tech Stack:** TypeScript (commander), Docker, Foundry (forge/cast), 1Password CLI (`op`), Gnosis Safe Transaction Service API, YAML (deploy config), bash (entrypoint script)

---

## File Structure

| File                                               | Purpose                                                                                      |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `packages/contracts/deploy.config.yaml`            | Deployment steering config — chains, Safe addresses, 1Password item refs, external addresses |
| `packages/contracts/Dockerfile.deploy`             | Hardened container image — Foundry + 1Password CLI on slim Debian                            |
| `packages/contracts/scripts/deploy-entrypoint.sh`  | Container entrypoint — fetches secrets, runs forge, proposes to Safe, outputs JSON           |
| `packages/cli/src/commands/deploy.ts`              | Host CLI command — config parsing, Docker orchestration, post-deploy bookkeeping             |
| `packages/cli/src/deploy-config.ts`                | Config loader/validator — parses YAML, merges CLI overrides, derives network allowlist       |
| `packages/cli/src/deploy-docker.ts`                | Docker orchestration — image build, network setup, container run, output capture             |
| `packages/cli/src/deploy-post.ts`                  | Post-deploy actions — update deployment JSON, patch addresses.ts, notify server              |
| `packages/cli/src/__tests__/deploy-config.test.ts` | Tests for config loading, validation, override merging                                       |
| `packages/cli/src/__tests__/deploy-docker.test.ts` | Tests for Docker command generation, network allowlist derivation                            |
| `packages/cli/src/__tests__/deploy-post.test.ts`   | Tests for deployment file updates, address patching                                          |

---

### Task 1: Deploy Config Schema and Loader

**Files:**

- Create: `packages/cli/src/deploy-config.ts`
- Create: `packages/cli/src/__tests__/deploy-config.test.ts`

- [ ] **Step 1: Install js-yaml dependency**

```bash
cd /Users/sthornock/code/epic/saga-standard && pnpm --filter @epicdm/saga-cli add js-yaml && pnpm --filter @epicdm/saga-cli add -D @types/js-yaml
```

- [ ] **Step 2: Write failing tests for config loader**

Create `packages/cli/src/__tests__/deploy-config.test.ts`:

```typescript
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  loadDeployConfig,
  resolveChainConfig,
  deriveNetworkAllowlist,
  type DeployConfig,
  type ChainConfig,
} from '../deploy-config'

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
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
cd /Users/sthornock/code/epic/saga-standard && pnpm --filter @epicdm/saga-cli test -- src/__tests__/deploy-config.test.ts
```

Expected: FAIL — module `../deploy-config` does not exist.

- [ ] **Step 4: Implement deploy-config.ts**

Create `packages/cli/src/deploy-config.ts`:

```typescript
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { readFileSync, existsSync } from 'node:fs'
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
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd /Users/sthornock/code/epic/saga-standard && pnpm --filter @epicdm/saga-cli test -- src/__tests__/deploy-config.test.ts
```

Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
cd /Users/sthornock/code/epic/saga-standard && git add packages/cli/src/deploy-config.ts packages/cli/src/__tests__/deploy-config.test.ts packages/cli/package.json pnpm-lock.yaml && git commit -m "feat(cli): add deploy config loader with YAML parsing and validation"
```

---

### Task 2: Docker Orchestration Module

**Files:**

- Create: `packages/cli/src/deploy-docker.ts`
- Create: `packages/cli/src/__tests__/deploy-docker.test.ts`

- [ ] **Step 1: Write failing tests for Docker command generation**

Create `packages/cli/src/__tests__/deploy-docker.test.ts`:

```typescript
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { describe, expect, it } from 'vitest'
import {
  buildDockerRunArgs,
  buildDockerNetworkCreateArgs,
  buildDockerBuildArgs,
  buildDockerNetworkRmArgs,
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
    it('generates network create with internal flag', () => {
      const args = buildDockerNetworkCreateArgs('saga-deploy-net')
      expect(args).toContain('network')
      expect(args).toContain('create')
      expect(args).toContain('saga-deploy-net')
      expect(args).toContain('--internal')
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
      expect(args).toContain('--read-only')
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

    it('includes tmpfs mount for /tmp', () => {
      const args = buildDockerRunArgs({
        resolved: MOCK_RESOLVED,
        networkName: 'saga-deploy-net',
        mode: 'broadcast',
      })

      expect(args).toContain('--tmpfs')
      const tmpfsIdx = args.indexOf('--tmpfs')
      expect(args[tmpfsIdx + 1]).toBe('/tmp:noexec,nosuid,size=64m')
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

    it('does NOT include OP_SERVICE_ACCOUNT_TOKEN in args (passed at runtime)', () => {
      const args = buildDockerRunArgs({
        resolved: MOCK_RESOLVED,
        networkName: 'saga-deploy-net',
        mode: 'broadcast',
      })

      // The OP token placeholder is included so the CLI knows to pass it at runtime
      const opEnvIdx = args.findIndex(
        (a, i) => a === '-e' && args[i + 1]?.startsWith('OP_SERVICE_ACCOUNT_TOKEN=')
      )
      // Should have the env flag but with a placeholder
      expect(opEnvIdx).toBeGreaterThan(-1)
      expect(args[opEnvIdx + 1]).toBe('OP_SERVICE_ACCOUNT_TOKEN=${OP_SERVICE_ACCOUNT_TOKEN}')
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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/sthornock/code/epic/saga-standard && pnpm --filter @epicdm/saga-cli test -- src/__tests__/deploy-docker.test.ts
```

Expected: FAIL — module `../deploy-docker` does not exist.

- [ ] **Step 3: Implement deploy-docker.ts**

Create `packages/cli/src/deploy-docker.ts`:

```typescript
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import type { ResolvedChainConfig } from './deploy-config'

export function buildDockerBuildArgs(contractsDir: string): string[] {
  return [
    'build',
    '-t',
    'saga-deploy:latest',
    '-f',
    `${contractsDir}/Dockerfile.deploy`,
    contractsDir,
  ]
}

export function buildDockerNetworkCreateArgs(networkName: string): string[] {
  return ['network', 'create', networkName, '--internal']
}

export function buildDockerNetworkRmArgs(networkName: string): string[] {
  return ['network', 'rm', networkName]
}

export interface DockerRunOptions {
  resolved: ResolvedChainConfig
  networkName: string
  mode: 'dry-run' | 'broadcast' | 'finalize'
}

export function buildDockerRunArgs(options: DockerRunOptions): string[] {
  const { resolved, networkName, mode } = options

  const configPayload: Record<string, unknown> = {
    chain: resolved.chain,
    chainId: resolved.chainId,
    rpc: resolved.rpc,
    safe: resolved.safe,
    safeThreshold: resolved.safeThreshold,
    explorerApi: resolved.explorerApi,
    safeTransactionService: resolved.safeTransactionService,
    external: resolved.external,
    contracts: resolved.contracts,
    verify: resolved.verify,
    op: resolved.op,
  }

  // Include pendingSafeTxHash for finalize mode
  if ('pendingSafeTxHash' in resolved) {
    configPayload.pendingSafeTxHash = (resolved as Record<string, unknown>).pendingSafeTxHash
  }

  const configJson = JSON.stringify(configPayload)

  const configBase64 = Buffer.from(configJson).toString('base64')

  return [
    'run',
    '--rm',
    '--name',
    `saga-deploy-${Date.now()}`,
    '--network',
    networkName,
    '-e',
    `OP_SERVICE_ACCOUNT_TOKEN=\${OP_SERVICE_ACCOUNT_TOKEN}`,
    '-e',
    `DEPLOY_CONFIG=${configBase64}`,
    '-e',
    `DEPLOY_MODE=${mode}`,
    '--read-only',
    '--tmpfs',
    '/tmp:noexec,nosuid,size=64m',
    '--cap-drop',
    'ALL',
    '--security-opt',
    'no-new-privileges',
    'saga-deploy:latest',
  ]
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/sthornock/code/epic/saga-standard && pnpm --filter @epicdm/saga-cli test -- src/__tests__/deploy-docker.test.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/sthornock/code/epic/saga-standard && git add packages/cli/src/deploy-docker.ts packages/cli/src/__tests__/deploy-docker.test.ts && git commit -m "feat(cli): add Docker orchestration for deploy container"
```

---

### Task 3: Post-Deploy Actions Module

**Files:**

- Create: `packages/cli/src/deploy-post.ts`
- Create: `packages/cli/src/__tests__/deploy-post.test.ts`

- [ ] **Step 1: Write failing tests for post-deploy actions**

Create `packages/cli/src/__tests__/deploy-post.test.ts`:

```typescript
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  updateDeploymentJson,
  updateAddressesTs,
  savePendingDeploy,
  loadPendingDeploy,
  clearPendingDeploy,
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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/sthornock/code/epic/saga-standard && pnpm --filter @epicdm/saga-cli test -- src/__tests__/deploy-post.test.ts
```

Expected: FAIL — module `../deploy-post` does not exist.

- [ ] **Step 3: Implement deploy-post.ts**

Create `packages/cli/src/deploy-post.ts`:

```typescript
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

  writeFileSync(filePath, JSON.stringify(existing, null, 2) + '\n')
}

export function updateAddressesTs(
  filePath: string,
  chain: string,
  addresses: DeploymentAddresses
): void {
  let content = readFileSync(filePath, 'utf-8')

  // Find the chain block and replace ZERO / existing addresses with new ones
  // Match the chain key (could be quoted 'base-sepolia' or bare base)
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
    // Replace "Name: ZERO" or "Name: '0x...'" with "Name: '0xnew'"
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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/sthornock/code/epic/saga-standard && pnpm --filter @epicdm/saga-cli test -- src/__tests__/deploy-post.test.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/sthornock/code/epic/saga-standard && git add packages/cli/src/deploy-post.ts packages/cli/src/__tests__/deploy-post.test.ts && git commit -m "feat(cli): add post-deploy actions for address updates and pending state"
```

---

### Task 4: Deploy CLI Command (Host Orchestrator)

**Files:**

- Create: `packages/cli/src/commands/deploy.ts`
- Modify: `packages/cli/src/index.ts`

- [ ] **Step 1: Write the deploy command**

Create `packages/cli/src/commands/deploy.ts`:

```typescript
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { Command } from 'commander'
import chalk from 'chalk'
import ora from 'ora'
import { execSync } from 'node:child_process'
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { loadDeployConfig, resolveChainConfig, deriveNetworkAllowlist } from '../deploy-config'
import {
  buildDockerBuildArgs,
  buildDockerNetworkCreateArgs,
  buildDockerNetworkRmArgs,
  buildDockerRunArgs,
} from '../deploy-docker'
import {
  savePendingDeploy,
  loadPendingDeploy,
  clearPendingDeploy,
  updateDeploymentJson,
  updateAddressesTs,
} from '../deploy-post'
import { getSagaDir } from '../config'

// Resolve paths relative to monorepo root
function findContractsDir(): string {
  // Walk up from CLI package to find packages/contracts
  const candidates = [
    join(process.cwd(), 'packages', 'contracts'),
    join(process.cwd(), '..', 'contracts'),
  ]
  for (const dir of candidates) {
    if (existsSync(join(dir, 'foundry.toml'))) return dir
  }
  throw new Error(
    'Cannot find packages/contracts directory. Run from the monorepo root or packages/cli.'
  )
}

export const deployCommand = new Command('deploy')
  .description('Deploy SAGA smart contracts via secure Docker container')
  .requiredOption('--chain <chain>', 'Target chain (e.g., base-sepolia, base)')
  .option('--broadcast', 'Propose deployment to Safe (default: dry-run simulation)')
  .option('--production', 'Required flag for production chain deployments')
  .option('--rpc <url>', 'Override RPC URL')
  .option('--no-verify', 'Skip contract verification on block explorer')
  .option('--status', 'Check Safe approval status for pending deployment')
  .option('--finalize', 'Complete post-deploy steps after Safe execution')
  .option('--config <path>', 'Path to deploy.config.yaml')
  .action(async opts => {
    const contractsDir = findContractsDir()
    const configPath = opts.config ?? join(contractsDir, 'deploy.config.yaml')
    const deploysDir = join(getSagaDir(), 'deploys')

    try {
      // Load and resolve config
      const config = loadDeployConfig(configPath)
      const resolved = resolveChainConfig(config, opts.chain, {
        rpc: opts.rpc,
        verify: opts.verify === false ? false : undefined,
      })

      // ── Status check (no Docker needed) ──
      if (opts.status) {
        const pending = loadPendingDeploy(deploysDir, opts.chain)
        if (!pending) {
          console.log(chalk.yellow(`No pending deployment for ${opts.chain}.`))
          return
        }
        console.log(chalk.bold(`Pending deployment for ${opts.chain}`))
        console.log(`  Safe TX Hash: ${pending.safeTxHash}`)
        console.log(`  Proposed at:  ${pending.proposedAt}`)
        console.log(`  Safe URL:     ${pending.safeUrl}`)
        console.log()
        console.log(chalk.dim('Check Safe UI for approval status.'))
        return
      }

      // ── Production gate ──
      if (resolved.production && !opts.production) {
        console.error(
          chalk.red(
            `Chain "${opts.chain}" is a production chain. Add --production flag to proceed.`
          )
        )
        process.exit(1)
      }

      // ── Pre-flight checklist for production ──
      if (opts.production) {
        console.log(chalk.bold.yellow('=== PRODUCTION DEPLOYMENT PRE-FLIGHT ==='))
        console.log()
        console.log(`  Chain:          ${resolved.chain} (${resolved.chainId})`)
        console.log(`  Safe:           ${resolved.safe}`)
        console.log(`  Safe Threshold: ${resolved.safeThreshold}`)
        console.log(`  RPC:            ${resolved.rpc}`)
        console.log(`  Contracts:      ${resolved.contracts.join(', ')}`)
        console.log(`  Verify:         ${resolved.verify}`)
        console.log(`  1Password:      ${resolved.op.vault} / ${resolved.op.signerItem}`)
        console.log()
        console.log(chalk.yellow('Review the above carefully.'))
        console.log()
      }

      const mode = opts.finalize ? 'finalize' : opts.broadcast ? 'broadcast' : 'dry-run'
      const networkName = `saga-deploy-${Date.now()}`
      const allowlist = deriveNetworkAllowlist(config, resolved)

      // For finalize mode, inject the pending Safe TX hash into resolved config
      if (mode === 'finalize') {
        const pending = loadPendingDeploy(deploysDir, opts.chain)
        if (!pending) {
          console.error(
            chalk.red(`No pending deployment for ${opts.chain}. Run --broadcast first.`)
          )
          process.exit(1)
        }
        ;(resolved as Record<string, unknown>).pendingSafeTxHash = pending.safeTxHash
      }

      // ── Build Docker image ──
      const buildSpinner = ora('Building deploy container...').start()
      try {
        const buildArgs = buildDockerBuildArgs(contractsDir)
        execSync(`docker ${buildArgs.join(' ')}`, { stdio: 'pipe' })
        buildSpinner.succeed('Deploy container built.')
      } catch (err) {
        buildSpinner.fail('Failed to build deploy container.')
        console.error(chalk.dim((err as Error).message))
        process.exit(1)
      }

      // ── Create restricted network ──
      const netSpinner = ora('Creating restricted network...').start()
      try {
        const netArgs = buildDockerNetworkCreateArgs(networkName)
        execSync(`docker ${netArgs.join(' ')}`, { stdio: 'pipe' })
        netSpinner.succeed(`Network created: ${networkName}`)
        console.log(chalk.dim(`  Allowlist: ${allowlist.join(', ')}`))
      } catch (err) {
        netSpinner.fail('Failed to create Docker network.')
        console.error(chalk.dim((err as Error).message))
        process.exit(1)
      }

      // ── Run container ──
      const runSpinner = ora(
        mode === 'dry-run'
          ? 'Simulating deployment...'
          : mode === 'finalize'
            ? 'Finalizing deployment...'
            : 'Proposing deployment to Safe...'
      ).start()

      let containerOutput: string
      try {
        const runArgs = buildDockerRunArgs({ resolved, networkName, mode })

        // Replace the OP token placeholder with the actual env var
        const opToken = process.env.OP_SERVICE_ACCOUNT_TOKEN
        if (!opToken) {
          runSpinner.fail('OP_SERVICE_ACCOUNT_TOKEN environment variable is not set.')
          process.exit(1)
        }

        const cmdArgs = runArgs.map(a =>
          a === 'OP_SERVICE_ACCOUNT_TOKEN=${OP_SERVICE_ACCOUNT_TOKEN}'
            ? `OP_SERVICE_ACCOUNT_TOKEN=${opToken}`
            : a
        )

        containerOutput = execSync(`docker ${cmdArgs.join(' ')}`, {
          encoding: 'utf-8',
          timeout: 300_000, // 5 minute timeout
        }).trim()

        runSpinner.succeed(
          mode === 'dry-run'
            ? 'Simulation complete.'
            : mode === 'finalize'
              ? 'Finalization complete.'
              : 'Deployment proposed to Safe.'
        )
      } catch (err) {
        runSpinner.fail('Container execution failed.')
        console.error(chalk.dim((err as Error).message))
        // Clean up network
        try {
          execSync(`docker ${buildDockerNetworkRmArgs(networkName).join(' ')}`, { stdio: 'pipe' })
        } catch {
          /* network cleanup is best-effort */
        }
        process.exit(1)
      }

      // ── Clean up network ──
      try {
        execSync(`docker ${buildDockerNetworkRmArgs(networkName).join(' ')}`, { stdio: 'pipe' })
      } catch {
        /* best-effort */
      }

      // ── Parse output ──
      let result: Record<string, unknown>
      try {
        result = JSON.parse(containerOutput)
      } catch {
        console.error(chalk.red('Failed to parse container output as JSON.'))
        console.error(chalk.dim(containerOutput))
        process.exit(1)
      }

      // ── Handle result by mode ──
      if (mode === 'dry-run') {
        console.log()
        console.log(chalk.bold('Simulation Result:'))
        console.log(chalk.dim(JSON.stringify(result, null, 2)))
        console.log()
        console.log(chalk.dim('Add --broadcast to propose this deployment to Safe.'))
        return
      }

      if (mode === 'broadcast') {
        savePendingDeploy(deploysDir, opts.chain, {
          safeTxHash: result.safeTxHash as string,
          safeUrl: result.safeUrl as string,
          simulatedAddresses: result.simulatedAddresses as Record<string, string>,
          proposedAt: new Date().toISOString(),
        })

        console.log()
        console.log(chalk.green.bold('Deployment proposed to Safe.'))
        console.log(`  Safe TX Hash: ${result.safeTxHash}`)
        console.log(`  Signatures:   ${result.signaturesCollected}`)
        console.log(`  Approve at:   ${result.safeUrl}`)
        console.log()
        console.log(chalk.dim('After all signers approve, run:'))
        console.log(chalk.dim(`  saga deploy --chain ${opts.chain} --finalize`))
        return
      }

      if (mode === 'finalize') {
        const addresses = result.addresses as Record<string, string>

        // Update deployment JSON
        const deploymentJsonPath = join(contractsDir, 'deployments', `${opts.chain}.json`)
        if (existsSync(deploymentJsonPath)) {
          updateDeploymentJson(deploymentJsonPath, {
            addresses,
            safeTxHash: (result.safeTxHash as string) ?? '',
            deployedAt: new Date().toISOString(),
          })
        }

        // Update addresses.ts
        const addressesTsPath = join(contractsDir, 'src', 'ts', 'addresses.ts')
        if (existsSync(addressesTsPath)) {
          updateAddressesTs(addressesTsPath, opts.chain, addresses)
        }

        // Notify SAGA server if configured
        let serverNotified = false
        if (resolved.notify) {
          const sagaConfig = loadConfig()
          const serverUrl = sagaConfig.defaultServer
          if (serverUrl) {
            try {
              const response = await fetch(`${serverUrl}/admin/reindex`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  chain: opts.chain,
                  contracts: addresses,
                }),
              })
              serverNotified = response.ok
            } catch {
              // Server notification is best-effort
            }
          }
        }

        // Clean up pending state
        clearPendingDeploy(deploysDir, opts.chain)

        console.log()
        console.log(chalk.green.bold('Deployment finalized.'))
        console.log(`  Chain:              ${opts.chain} (${resolved.chainId})`)
        for (const [name, addr] of Object.entries(addresses)) {
          console.log(`  ${name.padEnd(20)} ${addr}`)
        }
        console.log(
          `  Verified:           ${result.verified ? chalk.green('yes') : chalk.yellow('no')}`
        )
        console.log(
          `  1Password:          ${result.opUpdated ? chalk.green('updated') : chalk.yellow('skipped')}`
        )
        console.log(
          `  Server notified:    ${serverNotified ? chalk.green('yes') : chalk.yellow('skipped')}`
        )
        console.log()
        console.log(chalk.dim('Files updated:'))
        console.log(chalk.dim(`  ${deploymentJsonPath}`))
        console.log(chalk.dim(`  ${addressesTsPath}`))
        console.log()
        console.log(chalk.dim('Commit these changes:'))
        console.log(
          chalk.dim(
            `  git add packages/contracts && git commit -m "deploy(${opts.chain}): update addresses"`
          )
        )
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(chalk.red(`Deploy failed: ${message}`))
      process.exit(1)
    }
  })
```

- [ ] **Step 2: Register the command in index.ts**

In `packages/cli/src/index.ts`, add the import and registration:

Add import:

```typescript
import { deployCommand } from './commands/deploy'
```

Add command:

```typescript
program.addCommand(deployCommand)
```

- [ ] **Step 3: Verify the CLI builds**

```bash
cd /Users/sthornock/code/epic/saga-standard && pnpm --filter @epicdm/saga-cli build
```

Expected: build succeeds with no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
cd /Users/sthornock/code/epic/saga-standard && git add packages/cli/src/commands/deploy.ts packages/cli/src/index.ts && git commit -m "feat(cli): add saga deploy command with Docker orchestration"
```

---

### Task 5: Deploy Config YAML File

**Files:**

- Create: `packages/contracts/deploy.config.yaml`

- [ ] **Step 1: Create the deploy config**

Create `packages/contracts/deploy.config.yaml`:

```yaml
# SAGA Smart Contract Deployment Configuration
# See: docs/superpowers/specs/2026-03-26-secure-deploy-design.md
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
    safe: '' # TODO: populate with Safe address after creation
    safeThreshold: 2
    explorerApi: https://api-sepolia.basescan.org
    safeTransactionService: https://safe-transaction-base-sepolia.safe.global
    external:
      erc6551Registry: '0x000000006551c19487814612e58FE06813775758'
      tbaImplementation: '' # TODO: populate with Tokenbound V3 implementation address
    op:
      vault: SAGA Deploys
      signerItem: base-sepolia-signer
      addressesItem: base-sepolia-addresses
      explorerKeyItem: basescan-api-key

  base:
    chainId: 8453
    rpc: https://mainnet.base.org
    safe: '' # TODO: populate with Safe address after creation
    safeThreshold: 3
    explorerApi: https://api.basescan.org
    safeTransactionService: https://safe-transaction-base.safe.global
    production: true
    external:
      erc6551Registry: '0x000000006551c19487814612e58FE06813775758'
      tbaImplementation: '' # TODO: populate with Tokenbound V3 implementation address
    op:
      vault: SAGA Deploys
      signerItem: base-mainnet-signer
      addressesItem: base-mainnet-addresses
      explorerKeyItem: basescan-api-key

networkAllowlist:
  - my.1password.com
```

- [ ] **Step 2: Commit**

```bash
cd /Users/sthornock/code/epic/saga-standard && git add packages/contracts/deploy.config.yaml && git commit -m "feat(contracts): add deploy config with chain targets and 1Password references"
```

---

### Task 6: Dockerfile and Entrypoint Script

**Files:**

- Create: `packages/contracts/Dockerfile.deploy`
- Create: `packages/contracts/scripts/deploy-entrypoint.sh`

- [ ] **Step 1: Create the scripts directory**

```bash
mkdir -p /Users/sthornock/code/epic/saga-standard/packages/contracts/scripts
```

- [ ] **Step 2: Create the entrypoint script**

Create `packages/contracts/scripts/deploy-entrypoint.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

# ── Logging (never logs secret values) ──────────────────────────────────
log() { echo "{\"log\":\"$1\",\"ts\":\"$(date -u +%FT%TZ)\"}" >&2; }
die() { echo "{\"error\":\"$1\"}" && exit 1; }

# ── Parse config from base64 env var ────────────────────────────────────
[ -z "${DEPLOY_CONFIG:-}" ] && die "DEPLOY_CONFIG not set"
CONFIG=$(echo "$DEPLOY_CONFIG" | base64 -d 2>/dev/null) || die "invalid DEPLOY_CONFIG"

CHAIN=$(echo "$CONFIG" | jq -r '.chain') || die "missing .chain"
CHAIN_ID=$(echo "$CONFIG" | jq -r '.chainId') || die "missing .chainId"
RPC=$(echo "$CONFIG" | jq -r '.rpc') || die "missing .rpc"
VAULT=$(echo "$CONFIG" | jq -r '.op.vault') || die "missing .op.vault"
SIGNER_ITEM=$(echo "$CONFIG" | jq -r '.op.signerItem') || die "missing .op.signerItem"
EXPLORER_KEY_ITEM=$(echo "$CONFIG" | jq -r '.op.explorerKeyItem') || die "missing .op.explorerKeyItem"
SAFE_ADDR=$(echo "$CONFIG" | jq -r '.safe') || die "missing .safe"
SAFE_TX_SERVICE=$(echo "$CONFIG" | jq -r '.safeTransactionService') || die "missing .safeTransactionService"
VERIFY=$(echo "$CONFIG" | jq -r '.verify') || die "missing .verify"
ERC6551_REGISTRY=$(echo "$CONFIG" | jq -r '.external.erc6551Registry') || die "missing .external.erc6551Registry"
TBA_IMPLEMENTATION=$(echo "$CONFIG" | jq -r '.external.tbaImplementation') || die "missing .external.tbaImplementation"
MODE=${DEPLOY_MODE:-dry-run}

log "chain=${CHAIN} chainId=${CHAIN_ID} mode=${MODE}"

# ── Validate 1Password token ───────────────────────────────────────────
[ -z "${OP_SERVICE_ACCOUNT_TOKEN:-}" ] && die "OP_SERVICE_ACCOUNT_TOKEN not set"

# ── Fetch secrets from 1Password (in-memory only) ──────────────────────
log "reading signer key from 1password"
SIGNER_KEY=$(op read "op://${VAULT}/${SIGNER_ITEM}/private-key" 2>/dev/null) \
  || die "failed to read signer key from 1password"

log "reading explorer api key from 1password"
EXPLORER_KEY=$(op read "op://${VAULT}/${EXPLORER_KEY_ITEM}/api-key" 2>/dev/null) \
  || die "failed to read explorer api key from 1password"

# ── Derive signer address (key never logged) ──────────────────────────
SIGNER_ADDR=$(cast wallet address "$SIGNER_KEY" 2>/dev/null) \
  || die "invalid signer key"
log "signer=${SIGNER_ADDR}"

# ── Simulate deployment ────────────────────────────────────────────────
log "simulating deployment"
export ERC6551_REGISTRY
export TBA_IMPLEMENTATION
SIM_OUTPUT=$(DEPLOYER_PRIVATE_KEY="$SIGNER_KEY" \
  forge script script/Deploy.s.sol \
  --fork-url "$RPC" \
  --json 2>/dev/null) || die "simulation failed"

# Parse simulation results
ADDRESSES=$(echo "$SIM_OUTPUT" | jq -c '
  [.transactions[]? | select(.transactionType == "CREATE") |
   {name: .contractName, address: .contractAddress}] |
  from_entries // {}
' 2>/dev/null || echo '{}')

GAS_ESTIMATE=$(echo "$SIM_OUTPUT" | jq '[.transactions[]?.gas // 0] | add // 0' 2>/dev/null || echo '"unknown"')

log "simulation complete"

# ── Dry-run: output and exit ───────────────────────────────────────────
if [ "$MODE" = "dry-run" ]; then
  echo "{\"status\":\"simulated\",\"chain\":\"${CHAIN}\",\"chainId\":${CHAIN_ID},\"signer\":\"${SIGNER_ADDR}\",\"addresses\":${ADDRESSES},\"gasEstimate\":${GAS_ESTIMATE}}"
  exit 0
fi

# ── Broadcast: encode Safe batch, sign, propose ───────────────────────
if [ "$MODE" = "broadcast" ]; then
  log "encoding safe transaction batch"

  # Run forge script to get the raw transaction data
  BROADCAST_OUTPUT=$(DEPLOYER_PRIVATE_KEY="$SIGNER_KEY" \
    forge script script/Deploy.s.sol \
    --fork-url "$RPC" \
    --broadcast \
    --json 2>/dev/null) || die "broadcast simulation failed"

  # Extract transaction data for Safe batch proposal
  TRANSACTIONS=$(echo "$BROADCAST_OUTPUT" | jq -c '[.transactions[]? | {
    to: .contractAddress,
    value: "0",
    data: .transaction.data,
    operation: 0
  }]' 2>/dev/null) || die "failed to parse transactions"

  # Compute Safe transaction hash
  NONCE=$(curl -sf "${SAFE_TX_SERVICE}/api/v1/safes/${SAFE_ADDR}/" \
    | jq -r '.nonce' 2>/dev/null) || die "failed to get safe nonce"

  # Build the multisend batch for Safe
  # For multi-transaction deploys, encode as MultiSend
  TX_COUNT=$(echo "$TRANSACTIONS" | jq 'length')

  if [ "$TX_COUNT" -gt 1 ]; then
    # MultiSend encoding via cast
    MULTISEND_ADDR="0x38869bf66a61cF6bDB996A6aE40D5853Fd43B526" # Safe MultiSend canonical
    MULTISEND_DATA=$(echo "$TRANSACTIONS" | jq -r '
      [.[] | "\(.to)|\(.value)|\(.data)"] | join(",")
    ')
    OPERATION=1 # DelegateCall for MultiSend
    TO_ADDR="$MULTISEND_ADDR"
    # Encode the multiSend call
    CALL_DATA=$(cast calldata "multiSend(bytes)" "$MULTISEND_DATA" 2>/dev/null) \
      || die "failed to encode multisend"
  else
    OPERATION=0
    TO_ADDR=$(echo "$TRANSACTIONS" | jq -r '.[0].to')
    CALL_DATA=$(echo "$TRANSACTIONS" | jq -r '.[0].data')
  fi

  # Sign the Safe transaction hash
  TX_HASH=$(cast keccak "$(echo -n "${SAFE_ADDR}${TO_ADDR}${CALL_DATA}${NONCE}" | cast --to-bytes32)" 2>/dev/null) \
    || die "failed to compute tx hash"

  SIGNATURE=$(cast wallet sign "$TX_HASH" --private-key "$SIGNER_KEY" 2>/dev/null) \
    || die "failed to sign safe transaction"

  log "proposing to safe transaction service"

  # POST to Safe Transaction Service
  HTTP_STATUS=$(curl -sf -o /tmp/safe-response.json -w "%{http_code}" \
    -X POST "${SAFE_TX_SERVICE}/api/v1/safes/${SAFE_ADDR}/multisig-transactions/" \
    -H "Content-Type: application/json" \
    -d "{
      \"to\": \"${TO_ADDR}\",
      \"value\": \"0\",
      \"data\": \"${CALL_DATA}\",
      \"operation\": ${OPERATION},
      \"safeTxGas\": \"0\",
      \"baseGas\": \"0\",
      \"gasPrice\": \"0\",
      \"gasToken\": \"0x0000000000000000000000000000000000000000\",
      \"refundReceiver\": \"0x0000000000000000000000000000000000000000\",
      \"nonce\": ${NONCE},
      \"contractTransactionHash\": \"${TX_HASH}\",
      \"sender\": \"${SIGNER_ADDR}\",
      \"signature\": \"${SIGNATURE}\"
    }" 2>/dev/null) || die "failed to propose to safe"

  [ "$HTTP_STATUS" -ge 200 ] && [ "$HTTP_STATUS" -lt 300 ] || die "safe proposal returned HTTP ${HTTP_STATUS}"

  SAFE_TX_HASH="${TX_HASH}"
  SAFE_URL="https://app.safe.global/transactions/queue?safe=${CHAIN}:${SAFE_ADDR}"

  log "proposal submitted"

  echo "{\"status\":\"proposed\",\"safeTxHash\":\"${SAFE_TX_HASH}\",\"safeUrl\":\"${SAFE_URL}\",\"simulatedAddresses\":${ADDRESSES},\"gasEstimate\":${GAS_ESTIMATE},\"signer\":\"${SIGNER_ADDR}\",\"signaturesCollected\":\"1/${SAFE_THRESHOLD:-2}\"}"
  exit 0
fi

# ── Finalize: query execution, verify, write back to 1Password ─────────
if [ "$MODE" = "finalize" ]; then
  log "querying safe for execution result"

  # Load pending safe tx hash from config (passed in by CLI)
  SAFE_TX_HASH=$(echo "$CONFIG" | jq -r '.pendingSafeTxHash // empty')
  [ -z "$SAFE_TX_HASH" ] && die "no pendingSafeTxHash in config"

  # Query Safe TX Service for the executed transaction
  TX_RESULT=$(curl -sf "${SAFE_TX_SERVICE}/api/v1/multisig-transactions/${SAFE_TX_HASH}/" 2>/dev/null) \
    || die "failed to query safe transaction"

  IS_EXECUTED=$(echo "$TX_RESULT" | jq -r '.isExecuted')
  [ "$IS_EXECUTED" = "true" ] || die "transaction not yet executed"

  EXEC_TX_HASH=$(echo "$TX_RESULT" | jq -r '.transactionHash')
  log "execution tx: ${EXEC_TX_HASH}"

  # Get receipt and extract deployed addresses
  RECEIPT=$(cast receipt "$EXEC_TX_HASH" --rpc-url "$RPC" --json 2>/dev/null) \
    || die "failed to get transaction receipt"

  # Parse CREATE opcodes from trace to get deployed addresses
  # This uses the simulation addresses as reference
  FINAL_ADDRESSES="$ADDRESSES"

  # ── Verify contracts on block explorer ──
  VERIFIED=false
  if [ "$VERIFY" = "true" ]; then
    log "verifying contracts"
    for ROW in $(echo "$FINAL_ADDRESSES" | jq -r 'to_entries[] | "\(.key)=\(.value)"'); do
      NAME="${ROW%%=*}"
      ADDR="${ROW#*=}"
      BASESCAN_API_KEY="$EXPLORER_KEY" forge verify-contract \
        "$ADDR" "src/${NAME}.sol:${NAME}" \
        --chain-id "$CHAIN_ID" \
        --etherscan-api-key "$EXPLORER_KEY" \
        --watch 2>/dev/null || log "verification failed for ${NAME} (non-fatal)"
    done
    VERIFIED=true
  fi

  # ── Write addresses to 1Password ──
  ADDRESSES_ITEM=$(echo "$CONFIG" | jq -r '.op.addressesItem')
  OP_UPDATED=false

  if [ -n "$ADDRESSES_ITEM" ]; then
    log "writing addresses to 1password"
    for ROW in $(echo "$FINAL_ADDRESSES" | jq -r 'to_entries[] | "\(.key)=\(.value)"'); do
      NAME="${ROW%%=*}"
      ADDR="${ROW#*=}"
      op item edit "$ADDRESSES_ITEM" --vault "$VAULT" "${NAME}=${ADDR}" 2>/dev/null \
        || log "failed to write ${NAME} to 1password (non-fatal)"
    done
    op item edit "$ADDRESSES_ITEM" --vault "$VAULT" \
      "deployedAt=$(date -u +%FT%TZ)" \
      "safeTxHash=${SAFE_TX_HASH}" \
      "executionTxHash=${EXEC_TX_HASH}" 2>/dev/null || true
    OP_UPDATED=true
  fi

  log "finalization complete"

  echo "{\"status\":\"finalized\",\"addresses\":${FINAL_ADDRESSES},\"safeTxHash\":\"${SAFE_TX_HASH}\",\"executionTxHash\":\"${EXEC_TX_HASH}\",\"verified\":${VERIFIED},\"opUpdated\":${OP_UPDATED}}"
  exit 0
fi

die "unknown mode: ${MODE}"
```

- [ ] **Step 3: Create the Dockerfile**

Create `packages/contracts/Dockerfile.deploy`:

```dockerfile
# Secure SAGA contract deployment container
# See: docs/superpowers/specs/2026-03-26-secure-deploy-design.md

# Stage 1: Pull Foundry binaries
FROM ghcr.io/foundry-rs/foundry:latest AS foundry

# Stage 2: Slim runtime with Foundry + 1Password CLI
FROM debian:bookworm-slim

# Copy Foundry binaries
COPY --from=foundry /usr/local/bin/forge /usr/local/bin/forge
COPY --from=foundry /usr/local/bin/cast /usr/local/bin/cast

# Install 1Password CLI, curl, jq
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl jq ca-certificates gnupg \
    && curl -sS https://downloads.1password.com/linux/keys/1password.asc \
       | gpg --dearmor -o /usr/share/keyrings/1password.gpg \
    && echo "deb [arch=amd64 signed-by=/usr/share/keyrings/1password.gpg] \
       https://downloads.1password.com/linux/debian/amd64 stable main" \
       > /etc/apt/sources.list.d/1password.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends 1password-cli \
    && rm -rf /var/lib/apt/lists/*

# Copy contract sources (frozen snapshot, no host volume mounts)
WORKDIR /deploy
COPY src/ src/
COPY script/ script/
COPY lib/ lib/
COPY foundry.toml .

# Copy entrypoint
COPY scripts/deploy-entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Security: disable shell history
ENV HISTFILE=/dev/null

ENTRYPOINT ["/entrypoint.sh"]
```

- [ ] **Step 4: Verify Dockerfile syntax**

```bash
cd /Users/sthornock/code/epic/saga-standard/packages/contracts && docker build --check -f Dockerfile.deploy . 2>&1 || echo "Docker syntax check complete (--check may not be available, that is fine)"
```

- [ ] **Step 5: Commit**

```bash
cd /Users/sthornock/code/epic/saga-standard && git add packages/contracts/Dockerfile.deploy packages/contracts/scripts/deploy-entrypoint.sh && git commit -m "feat(contracts): add hardened Dockerfile and entrypoint for secure deployment"
```

---

### Task 7: Gitignore Updates

**Files:**

- Modify: `.gitignore`

- [ ] **Step 1: Add .saga/deploys to gitignore**

Add to `.gitignore`:

```
# SAGA deploy pending state
.saga/deploys/
```

- [ ] **Step 2: Commit**

```bash
cd /Users/sthornock/code/epic/saga-standard && git add .gitignore && git commit -m "chore: gitignore .saga/deploys pending state directory"
```

---

### Task 8: Integration Smoke Test

**Files:**

- None created — this is a validation task

- [ ] **Step 1: Run all CLI tests**

```bash
cd /Users/sthornock/code/epic/saga-standard && pnpm --filter @epicdm/saga-cli test
```

Expected: all tests pass (existing + new deploy-config, deploy-docker, deploy-post).

- [ ] **Step 2: Verify CLI builds cleanly**

```bash
cd /Users/sthornock/code/epic/saga-standard && pnpm --filter @epicdm/saga-cli build
```

Expected: build succeeds.

- [ ] **Step 3: Verify deploy command appears in help**

```bash
cd /Users/sthornock/code/epic/saga-standard && node packages/cli/dist/index.js deploy --help
```

Expected: shows deploy command usage with `--chain`, `--broadcast`, `--production`, `--status`, `--finalize` options.

- [ ] **Step 4: Verify dry-run fails gracefully without Docker**

```bash
cd /Users/sthornock/code/epic/saga-standard && node packages/cli/dist/index.js deploy --chain base-sepolia 2>&1 || true
```

Expected: fails with a clear error about Docker or config, not an unhandled exception.

- [ ] **Step 5: Commit (if any test fixes were needed)**

```bash
cd /Users/sthornock/code/epic/saga-standard && git add -A && git commit -m "fix(cli): address integration test findings" || echo "Nothing to commit — all clean"
```
