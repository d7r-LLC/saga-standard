// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import type { PublicClient, WalletClient } from 'viem'
import {
  isHandleAvailable,
  mintAgentIdentity,
  mintOrgIdentity,
  resolveHandleOnChain,
} from '@epicdm/saga-client'
import type { MintResult, OnChainResolveResult, SupportedChain } from '@epicdm/saga-client'
import type { ChainId } from '../wallet/types'

export type { MintResult, OnChainResolveResult }

export async function checkHandleAvailability(
  handle: string,
  publicClient: PublicClient,
  chainId: ChainId
): Promise<boolean> {
  return isHandleAvailable({
    handle,
    publicClient,
    chain: chainId as SupportedChain,
  })
}

export async function resolveHandle(
  handle: string,
  publicClient: PublicClient,
  chainId: ChainId
): Promise<OnChainResolveResult> {
  return resolveHandleOnChain({
    handle,
    publicClient,
    chain: chainId as SupportedChain,
  })
}

export async function mintAgent(
  handle: string,
  homeHubUrl: string,
  walletClient: WalletClient,
  publicClient: PublicClient,
  chainId: ChainId
): Promise<MintResult> {
  return mintAgentIdentity({
    handle,
    homeHubUrl,
    walletClient,
    publicClient,
    chain: chainId as SupportedChain,
  })
}

export async function mintOrg(
  handle: string,
  name: string,
  walletClient: WalletClient,
  publicClient: PublicClient,
  chainId: ChainId
): Promise<MintResult> {
  return mintOrgIdentity({
    handle,
    name,
    walletClient,
    publicClient,
    chain: chainId as SupportedChain,
  })
}
