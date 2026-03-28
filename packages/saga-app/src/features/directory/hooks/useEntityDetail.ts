// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { useCallback, useEffect, useState } from 'react'
import { getAgent, getOrg } from '../api/directory'
import type { AgentDetail, OrgDetail } from '../types'

export interface UseEntityDetailResult {
  entity: AgentDetail | OrgDetail | null
  loading: boolean
  error: string | null
}

export function useEntityDetail(
  handle: string,
  entityType: 'agent' | 'org'
): UseEntityDetailResult {
  const [entity, setEntity] = useState<AgentDetail | OrgDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchEntity = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = entityType === 'agent' ? await getAgent(handle) : await getOrg(handle)
      setEntity(result)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [handle, entityType])

  useEffect(() => {
    fetchEntity()
  }, [fetchEntity])

  return { entity, loading, error }
}
