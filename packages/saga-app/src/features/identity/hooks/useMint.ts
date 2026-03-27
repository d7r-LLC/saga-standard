// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { useCallback, useState } from 'react'
import type { WalletClient } from 'viem'
import { useChain } from '../../../core/providers/ChainProvider'
import { useStorage } from '../../../core/providers/StorageProvider'
import { mintAgent, mintOrg } from '../chain'
import type { EntityType, MintState } from '../types'

const INITIAL_STATE: MintState = {
  step: 'type',
  entityType: null,
  handle: '',
  orgName: '',
  hubUrl: '',
  error: null,
  txHash: null,
  tokenId: null,
  tbaAddress: null,
}

interface UseMintResult {
  state: MintState
  selectType: (type: EntityType) => void
  setHandle: (handle: string) => void
  setOrgName: (name: string) => void
  setHubUrl: (url: string) => void
  confirmHandle: () => void
  executeMint: (walletClient: WalletClient) => Promise<void>
  reset: () => void
}

export function useMint(): UseMintResult {
  const { chainId, publicClient } = useChain()
  const { addIdentity } = useStorage()
  const [state, setState] = useState<MintState>(INITIAL_STATE)

  const selectType = useCallback((type: EntityType) => {
    setState(prev => ({ ...prev, entityType: type, step: 'handle' }))
  }, [])

  const setHandle = useCallback((handle: string) => {
    setState(prev => ({ ...prev, handle }))
  }, [])

  const setOrgName = useCallback((name: string) => {
    setState(prev => ({ ...prev, orgName: name }))
  }, [])

  const setHubUrl = useCallback((url: string) => {
    setState(prev => ({ ...prev, hubUrl: url }))
  }, [])

  const confirmHandle = useCallback(() => {
    setState(prev => ({ ...prev, step: 'confirm' }))
  }, [])

  const executeMint = useCallback(
    async (walletClient: WalletClient) => {
      setState(prev => ({ ...prev, step: 'minting', error: null }))
      try {
        const result =
          state.entityType === 'agent'
            ? await mintAgent(state.handle, state.hubUrl, walletClient, publicClient, chainId)
            : await mintOrg(state.handle, state.orgName, walletClient, publicClient, chainId)

        const identity = {
          id: `${state.entityType}-${result.tokenId.toString()}`,
          type: state.entityType as EntityType,
          handle: state.handle,
          tokenId: result.tokenId.toString(),
          contractAddress: '',
          tbaAddress: result.tbaAddress,
          hubUrl: state.hubUrl,
        }
        addIdentity(identity)

        setState(prev => ({
          ...prev,
          step: 'done',
          txHash: result.txHash,
          tokenId: result.tokenId.toString(),
          tbaAddress: result.tbaAddress,
        }))
      } catch (err: unknown) {
        setState(prev => ({
          ...prev,
          step: 'error',
          error: err instanceof Error ? err.message : String(err),
        }))
      }
    },
    [
      state.entityType,
      state.handle,
      state.hubUrl,
      state.orgName,
      publicClient,
      chainId,
      addIdentity,
    ]
  )

  const reset = useCallback(() => {
    setState(INITIAL_STATE)
  }, [])

  return { state, selectType, setHandle, setOrgName, setHubUrl, confirmHandle, executeMint, reset }
}
