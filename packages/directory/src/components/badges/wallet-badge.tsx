// Copyright 2026 d7r LLC
// SPDX-License-Identifier: Apache-2.0

'use client'

import { Copy, ExternalLink } from 'lucide-react'
import { useCallback, useState } from 'react'

interface WalletBadgeProps {
  address: string
  chain: string
}

function getExplorerUrl(address: string, chain: string): string {
  if (chain === 'eip155:8453') {
    return `https://basescan.org/address/${address}`
  }
  if (chain === 'eip155:1') {
    return `https://etherscan.io/address/${address}`
  }
  return `https://basescan.org/address/${address}`
}

function truncateAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

export function WalletBadge({ address, chain }: WalletBadgeProps) {
  const [copied, setCopied] = useState(false)
  const explorerUrl = getExplorerUrl(address, chain)

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(address)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [address])

  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-md bg-slate-100 px-2 py-1 font-mono text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-400"
      title={address}
    >
      <a
        href={explorerUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="hover:text-sky-600 dark:hover:text-sky-400"
      >
        {truncateAddress(address)}
      </a>
      <ExternalLink className="h-3 w-3 opacity-50" />
      <button
        type="button"
        onClick={handleCopy}
        className="hover:text-sky-600 dark:hover:text-sky-400"
        aria-label="Copy wallet address"
      >
        <Copy className="h-3 w-3 opacity-50" />
      </button>
      {copied && (
        <span className="text-green-600 dark:text-green-400">Copied</span>
      )}
    </span>
  )
}
