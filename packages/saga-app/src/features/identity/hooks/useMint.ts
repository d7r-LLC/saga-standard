// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { useCallback, useState } from 'react'
import type { WalletClient } from 'viem'
import { useChain } from '../../../core/providers/ChainProvider'
import { useStorage } from '../../../core/providers/StorageProvider'
import { mintAgent, mintOrg } from '../chain'
import type { EntityType, MintEntityType, MintState } from '../types'

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
  selectType: (type: MintEntityType) => void
  setHandle: (handle: string) => void
  setOrgName: (name: string) => void
  setHubUrl: (url: string) => void
  confirmHandle: () => void
  executeMint: (walletClient: WalletClient) => Promise<void>
  reset: () => void
}

export function useMint(): UseMintResult {
  const { chainId, publicClient } = useChain()
  const { addIdentity, setActiveIdentity, identities } = useStorage()
  const [state, setState] = useState<MintState>(INITIAL_STATE)

  const selectType = useCallback((type: MintEntityType) => {
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
      const { entityType, handle: mintHandle, hubUrl: mintHubUrl, orgName: mintOrgName } = state
      if (!entityType || (entityType !== 'agent' && entityType !== 'org')) {
        setState(prev => ({
          ...prev,
          step: 'error',
          error: 'Select an identity type before minting.',
        }))
        return
      }

      setState(prev => ({ ...prev, step: 'minting', error: null }))
      try {
        const result =
          entityType === 'agent'
            ? await mintAgent(mintHandle, mintHubUrl, walletClient, publicClient, chainId)
            : await mintOrg(mintHandle, mintOrgName, walletClient, publicClient, chainId)

        const identity = {
          id: `${entityType}-${result.tokenId.toString()}`,
          type: entityType as EntityType,
          handle: mintHandle,
          tokenId: result.tokenId.toString(),
          contractAddress: '',
          tbaAddress: result.tbaAddress,
          hubUrl: mintHubUrl,
        }
        addIdentity(identity)

        if (identities.length === 0) {
          setActiveIdentity(identity.id)
        }

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
    [state, publicClient, chainId, addIdentity, setActiveIdentity, identities.length]
  )

  const reset = useCallback(() => {
    setState(INITIAL_STATE)
  }, [])

  return { state, selectType, setHandle, setOrgName, setHubUrl, confirmHandle, executeMint, reset }
}
