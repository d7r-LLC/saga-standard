// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { RealmStore } from '../storage/realm-store'
import { AppStorage } from '../storage/async-storage'

export interface Wallet {
  id: string
  type: 'self-custody' | 'managed'
  label: string
  address: string
  chain: string
  balance: string
}

export interface Identity {
  id: string
  type: 'agent' | 'org' | 'directory'
  handle: string
  tokenId: string
  contractAddress: string
  tbaAddress: string
  hubUrl: string
}

interface StorageContextValue {
  initialized: boolean
  wallets: Wallet[]
  identities: Identity[]
  activeWalletId: string | null
  activeIdentityId: string | null
  addWallet: (wallet: Wallet) => void
  deleteWallet: (id: string) => void
  setActiveWallet: (id: string) => void
  addIdentity: (identity: Identity) => void
  updateIdentity: (id: string, patch: Partial<Identity>) => void
  setActiveIdentity: (id: string) => void
}

const StorageContext = createContext<StorageContextValue | null>(null)

export function useStorage(): StorageContextValue {
  const context = useContext(StorageContext)
  if (!context) {
    throw new Error('useStorage must be used within a StorageProvider')
  }
  return context
}

interface StorageProviderProps {
  children: React.ReactNode
}

export function StorageProvider({ children }: StorageProviderProps): React.JSX.Element {
  const [initialized, setInitialized] = useState(false)
  const [wallets, setWallets] = useState<Wallet[]>([])
  const [identities, setIdentities] = useState<Identity[]>([])
  const [activeWalletId, setActiveWalletId] = useState<string | null>(null)
  const [activeIdentityId, setActiveIdentityId] = useState<string | null>(null)
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    async function init() {
      await RealmStore.open()
      const savedWalletId = await AppStorage.get<string>('activeWalletId')
      const savedIdentityId = await AppStorage.get<string>('activeIdentityId')
      if (savedWalletId) setActiveWalletId(savedWalletId)
      if (savedIdentityId) setActiveIdentityId(savedIdentityId)
      setInitialized(true)
    }
    init()
    return () => {
      if (saveTimeout.current) clearTimeout(saveTimeout.current)
    }
  }, [])

  const addWallet = useCallback((wallet: Wallet) => {
    setWallets(prev => [...prev, wallet])
  }, [])

  const deleteWallet = useCallback((id: string) => {
    setWallets(prev => prev.filter(w => w.id !== id))
  }, [])

  const setActiveWallet = useCallback((id: string) => {
    setActiveWalletId(id)
    AppStorage.set('activeWalletId', id)
  }, [])

  const addIdentity = useCallback((identity: Identity) => {
    setIdentities(prev => [...prev, identity])
  }, [])

  const updateIdentity = useCallback((id: string, patch: Partial<Identity>) => {
    setIdentities(prev => prev.map(i => (i.id === id ? { ...i, ...patch } : i)))
  }, [])

  const setActiveIdentity = useCallback((id: string) => {
    setActiveIdentityId(id)
    AppStorage.set('activeIdentityId', id)
  }, [])

  const value: StorageContextValue = {
    initialized,
    wallets,
    identities,
    activeWalletId,
    activeIdentityId,
    addWallet,
    deleteWallet,
    setActiveWallet,
    addIdentity,
    updateIdentity,
    setActiveIdentity,
  }

  return <StorageContext.Provider value={value}>{children}</StorageContext.Provider>
}
