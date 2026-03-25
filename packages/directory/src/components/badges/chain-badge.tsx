// Copyright 2026 d7r LLC
// SPDX-License-Identifier: Apache-2.0

import clsx from 'clsx'

const CHAIN_LABELS: Record<string, { label: string; color: string }> = {
  'eip155:8453': {
    label: 'Base',
    color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  },
  'eip155:1': {
    label: 'Ethereum',
    color: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  },
  'eip155:137': {
    label: 'Polygon',
    color:
      'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  },
  'solana:mainnet': {
    label: 'Solana',
    color:
      'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  },
}

export function ChainBadge({ chain }: { chain: string }) {
  const info = CHAIN_LABELS[chain] ?? {
    label: chain,
    color: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
  }
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        info.color,
      )}
    >
      {info.label}
    </span>
  )
}
