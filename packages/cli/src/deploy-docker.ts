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
