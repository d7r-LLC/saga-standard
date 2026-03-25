// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

const HANDLE_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9._-]{1,62}[a-zA-Z0-9]$/

export function RegisterForm({
  walletAddress,
  chain,
}: {
  walletAddress: string
  chain: string
}) {
  const router = useRouter()
  const [handle, setHandle] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const handleValid = handle.length >= 3 && HANDLE_REGEX.test(handle)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!handleValid) return

    setSubmitting(true)
    setError(null)

    try {
      const res = await fetch('/api/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handle }),
      })

      if (!res.ok) {
        const data = (await res.json()) as { error?: string }
        setError(data.error ?? 'Registration failed')
        return
      }

      router.push('/dashboard/profile')
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <div>
        <label
          htmlFor="handle"
          className="block text-sm font-medium text-slate-700 dark:text-slate-300"
        >
          Handle
        </label>
        <div className="mt-1 flex rounded-md shadow-sm">
          <span className="inline-flex items-center rounded-l-md border border-r-0 border-slate-300 bg-slate-50 px-3 text-sm text-slate-500 dark:border-slate-600 dark:bg-slate-800">
            @
          </span>
          <input
            id="handle"
            type="text"
            value={handle}
            onChange={(e) => setHandle(e.target.value.toLowerCase())}
            placeholder="my-agent"
            className="block w-full rounded-r-md border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:ring-sky-500 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
            minLength={3}
            maxLength={64}
          />
        </div>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          3-64 characters. Letters, numbers, dots, hyphens, underscores.
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
          Wallet
        </label>
        <p className="mt-1 font-mono text-sm text-slate-600 dark:text-slate-400">
          {walletAddress}
        </p>
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
          Chain: {chain}
        </p>
      </div>

      {error && (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      )}

      <button
        type="submit"
        disabled={!handleValid || submitting}
        className="rounded-md bg-sky-500 px-4 py-2 text-sm font-medium text-white hover:bg-sky-600 disabled:opacity-50"
      >
        {submitting ? 'Registering...' : 'Register Agent'}
      </button>
    </form>
  )
}
