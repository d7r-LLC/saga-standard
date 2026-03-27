// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { RealmStore } from '../storage/realm-store'
import { AppStorage } from '../storage/async-storage'
import { WalletRecord } from '../storage/realm-schemas'

export interface Wallet {
  id: string
  type: 'self-custody' | 'managed'
  label: string
  address: string
  chain: string
  balance: string
  derivationPath?: string
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
  updateWalletBalance: (id: string, balance: string) => void
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
      const walletResults = RealmStore.query<WalletRecord>('Wallet')
      const loadedWallets: Wallet[] = Array.from(walletResults).map(w => ({
        id: w.id,
        type: w.type,
        label: w.label,
        address: w.address,
        chain: w.chain,
        balance: w.balance,
        derivationPath: w.derivationPath,
      }))
      setWallets(loadedWallets)
      const savedWalletId = await AppStorage.get<string>('activeWalletId')
      const savedIdentityId = await AppStorage.get<string>('activeIdentityId')
      if (savedWalletId && loadedWallets.some(w => w.id === savedWalletId)) {
        setActiveWalletId(savedWalletId)
      } else if (savedWalletId) {
        AppStorage.set('activeWalletId', '')
      }
      if (savedIdentityId) setActiveIdentityId(savedIdentityId)
      setInitialized(true)
    }
    init()
    return () => {
      if (saveTimeout.current) clearTimeout(saveTimeout.current)
    }
  }, [])

  const addWallet = useCallback((wallet: Wallet) => {
    RealmStore.write(() => {
      const realm = RealmStore.getInstance()
      realm.create('Wallet', {
        id: wallet.id,
        type: wallet.type,
        label: wallet.label,
        address: wallet.address,
        chain: wallet.chain,
        balance: wallet.balance,
        lastSync: 0,
        derivationPath: wallet.derivationPath ?? '',
      })
    })
    setWallets(prev => [...prev, wallet])
  }, [])

  const deleteWallet = useCallback(
    (id: string) => {
      RealmStore.write(() => {
        const realm = RealmStore.getInstance()
        const record = realm.objectForPrimaryKey('Wallet', id)
        if (record) realm.delete(record)
      })
      if (activeWalletId === id) {
        setActiveWalletId(null)
        AppStorage.set('activeWalletId', '')
      }
      setWallets(prev => prev.filter(w => w.id !== id))
    },
    [activeWalletId]
  )

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

  const updateWalletBalance = useCallback((id: string, balance: string) => {
    RealmStore.write(() => {
      const realm = RealmStore.getInstance()
      const record = realm.objectForPrimaryKey('Wallet', id)
      if (record) {
        record.balance = balance
        record.lastSync = Date.now()
      }
    })
    setWallets(prev => prev.map(w => (w.id === id ? { ...w, balance } : w)))
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
    updateWalletBalance,
  }

  return <StorageContext.Provider value={value}>{children}</StorageContext.Provider>
}
