// Copyright 2026 d7r LLC
// SPDX-License-Identifier: Apache-2.0

'use client'

import { useState } from 'react'
import { Check, Copy } from 'lucide-react'

function truncate(address: string): string {
  if (address.length <= 10) return address
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

export function WalletAddress({ address }: { address: string }) {
  const [copied, setCopied] = useState(false)

  async function copyToClipboard() {
    try {
      await navigator.clipboard.writeText(address)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard API unavailable (insecure context or permission denied)
    }
  }

  return (
    <button
      onClick={copyToClipboard}
      className="inline-flex items-center gap-1.5 rounded-md bg-slate-100 px-2 py-1 font-mono text-xs text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700"
      title={address}
    >
      {truncate(address)}
      {copied ? (
        <Check className="h-3 w-3 text-green-500" />
      ) : (
        <Copy className="h-3 w-3" />
      )}
    </button>
  )
}
