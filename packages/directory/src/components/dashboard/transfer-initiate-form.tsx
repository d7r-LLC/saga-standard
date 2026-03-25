// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

'use client'

import { useState } from 'react'

const SAGA_LAYERS = [
  'identity',
  'persona',
  'cognitive',
  'memory',
  'skills',
  'task-history',
  'relationships',
  'environment',
  'vault',
]

interface TransferInitiateFormProps {
  agentHandle: string
}

export function TransferInitiateForm({
  agentHandle,
}: TransferInitiateFormProps) {
  const [destinationUrl, setDestinationUrl] = useState('')
  const [selectedLayers, setSelectedLayers] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{
    transferId: string
    consentMessage?: string
  } | null>(null)

  function toggleLayer(layer: string) {
    setSelectedLayers((prev) =>
      prev.includes(layer) ? prev.filter((l) => l !== layer) : [...prev, layer],
    )
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!destinationUrl) return

    setSubmitting(true)
    setError(null)

    try {
      const res = await fetch('/api/transfers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentHandle,
          destinationServerUrl: destinationUrl,
          requestedLayers:
            selectedLayers.length > 0 ? selectedLayers : undefined,
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Transfer initiation failed')
        return
      }

      setResult({
        transferId: data.transferId,
        consentMessage: data.consentMessage,
      })
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (result) {
    return (
      <div className="rounded-lg border border-sky-200 bg-sky-50 p-6 dark:border-sky-800 dark:bg-sky-900/20">
        <h3 className="font-semibold text-slate-900 dark:text-white">
          Transfer Initiated
        </h3>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
          Transfer ID:{' '}
          <code className="font-mono text-xs">{result.transferId}</code>
        </p>
        {result.consentMessage && (
          <div className="mt-4">
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Sign the consent message in your wallet to proceed:
            </p>
            <pre className="mt-2 rounded-md bg-white p-3 text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-300">
              {result.consentMessage}
            </pre>
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              Consent signing will be available in a future update.
            </p>
          </div>
        )}
      </div>
    )
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <div>
        <label
          htmlFor="destination"
          className="block text-sm font-medium text-slate-700 dark:text-slate-300"
        >
          Destination Server URL
        </label>
        <input
          id="destination"
          type="url"
          value={destinationUrl}
          onChange={(e) => setDestinationUrl(e.target.value)}
          placeholder="https://other-saga-server.example.com"
          className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:ring-sky-500 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
          required
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
          Layers to Transfer
        </label>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Select which layers to include. Leave empty for all available layers.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {SAGA_LAYERS.map((layer) => (
            <button
              key={layer}
              type="button"
              onClick={() => toggleLayer(layer)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                selectedLayers.includes(layer)
                  ? 'border-sky-500 bg-sky-50 text-sky-700 dark:border-sky-400 dark:bg-sky-900/30 dark:text-sky-300'
                  : 'border-slate-300 text-slate-600 hover:border-slate-400 dark:border-slate-600 dark:text-slate-400'
              }`}
            >
              {layer}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      )}

      <button
        type="submit"
        disabled={!destinationUrl || submitting}
        className="rounded-md bg-sky-500 px-4 py-2 text-sm font-medium text-white hover:bg-sky-600 disabled:opacity-50"
      >
        {submitting ? 'Initiating...' : 'Initiate Transfer'}
      </button>
    </form>
  )
}
