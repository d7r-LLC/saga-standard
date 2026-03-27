// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { useCallback, useMemo } from 'react'
import { useStorage } from '../../../core/providers/StorageProvider'
import type { Identity } from '../../../core/providers/StorageProvider'

interface UseIdentityResult {
  identities: Identity[]
  activeIdentity: Identity | null
  setActive: (id: string) => void
}

export function useIdentity(): UseIdentityResult {
  const { identities, activeIdentityId, setActiveIdentity } = useStorage()

  const activeIdentity = useMemo(
    () => identities.find(i => i.id === activeIdentityId) ?? null,
    [identities, activeIdentityId]
  )

  const setActive = useCallback(
    (id: string) => {
      setActiveIdentity(id)
    },
    [setActiveIdentity]
  )

  return { identities, activeIdentity, setActive }
}
