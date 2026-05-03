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
  // Note: --internal omitted because it blocks ALL outbound traffic.
  // The container needs outbound access to RPC, Safe TX Service, 1Password, and explorer APIs.
  // Container hardening is enforced via --read-only, --cap-drop ALL, --security-opt no-new-privileges.
  return ['network', 'create', networkName]
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

  // Container hardening (Phase 1, A-Crit#3 — 2026-05-03 audit):
  //   --read-only       root filesystem is immutable; a compromised forge/cast/jq
  //                     cannot persist to disk or rewrite the entrypoint.
  //   --tmpfs ...       small writable scratch areas for forge cache + tmp.
  //                     FOUNDRY_CACHE_PATH=/forge-cache is set in Dockerfile.deploy.
  //   --cap-drop ALL    no Linux capabilities.
  //   --security-opt no-new-privileges  cannot escalate via setuid binaries.
  //
  // The mnemonic-via-stdin helper (scripts/derive-mnemonic.mjs) means the
  // deploy signer never lands on argv inside the container, so /proc/$pid/cmdline
  // does not leak the seed phrase to sibling processes.
  return [
    'run',
    '--rm',
    '--name',
    `saga-deploy-${Date.now()}`,
    '--network',
    networkName,
    '-e',
    'OP_SERVICE_ACCOUNT_TOKEN',
    '-e',
    `DEPLOY_CONFIG=${configBase64}`,
    '-e',
    `DEPLOY_MODE=${mode}`,
    '--read-only',
    '--tmpfs',
    '/forge-cache:rw,size=512m,mode=1777',
    '--tmpfs',
    '/tmp:rw,size=128m,mode=1777',
    '--cap-drop',
    'ALL',
    '--security-opt',
    'no-new-privileges',
    'saga-deploy:latest',
  ]
}
