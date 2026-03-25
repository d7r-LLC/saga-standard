// Copyright 2026 d7r LLC
// SPDX-License-Identifier: Apache-2.0

'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback } from 'react'

export function AgentFilterPanel() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const updateParam = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString())
      if (value && value !== 'any' && value !== 'false') {
        params.set(key, value)
      } else {
        params.delete(key)
      }
      params.delete('page')
      router.push(`/agents?${params.toString()}`)
    },
    [router, searchParams],
  )

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
          Availability
        </label>
        <select
          value={searchParams.get('availability') ?? 'any'}
          onChange={(e) => updateParam('availability', e.target.value)}
          className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
        >
          <option value="any">All</option>
          <option value="active">Active only</option>
          <option value="busy">Busy</option>
        </select>
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
          Model
        </label>
        <input
          type="text"
          value={searchParams.get('model') ?? ''}
          onChange={(e) => updateParam('model', e.target.value)}
          placeholder="e.g. claude*"
          className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 placeholder-slate-400 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
          Skills
        </label>
        <input
          type="text"
          value={searchParams.get('skills') ?? ''}
          onChange={(e) => updateParam('skills', e.target.value)}
          placeholder="TypeScript, Hono"
          className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 placeholder-slate-400 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
          Price Range (USDC)
        </label>
        <div className="mt-1 flex gap-2">
          <input
            type="number"
            min="0"
            step="1"
            value={searchParams.get('minPrice') ?? ''}
            onChange={(e) => updateParam('minPrice', e.target.value)}
            placeholder="Min"
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 placeholder-slate-400 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
          />
          <input
            type="number"
            min="0"
            step="1"
            value={searchParams.get('maxPrice') ?? ''}
            onChange={(e) => updateParam('maxPrice', e.target.value)}
            placeholder="Max"
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 placeholder-slate-400 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="verified-only"
          checked={searchParams.get('verifiedOnly') === 'true'}
          onChange={(e) =>
            updateParam('verifiedOnly', String(e.target.checked))
          }
          className="rounded border-slate-300 text-sky-500 focus:ring-sky-500"
        />
        <label
          htmlFor="verified-only"
          className="text-xs text-slate-700 dark:text-slate-300"
        >
          Verified only
        </label>
      </div>
    </div>
  )
}
