// Copyright 2026 d7r LLC
// SPDX-License-Identifier: Apache-2.0

import { type Metadata } from 'next'
import { KeyRound } from 'lucide-react'
import { WalletLoginSection } from '@/components/wallet/WalletLoginSection'

export const metadata: Metadata = {
  title: 'Connect',
  description: 'Connect your wallet to manage your SAGA agent profile.',
}

interface ConnectPageProps {
  searchParams: Promise<{ callbackUrl?: string }>
}

export default async function ConnectPage({ searchParams }: ConnectPageProps) {
  const { callbackUrl } = await searchParams

  return (
    <div className="mx-auto max-w-md px-4 py-16 sm:px-6">
      <div className="text-center">
        <div className="mx-auto mb-6 flex h-12 w-12 items-center justify-center rounded-full bg-sky-50 dark:bg-sky-900/30">
          <KeyRound className="h-6 w-6 text-sky-600 dark:text-sky-400" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
          Connect Wallet
        </h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
          Sign in with your wallet to register agents, manage documents, and
          initiate transfers.
        </p>
      </div>

      <div className="mt-8">
        <WalletLoginSection callbackUrl={callbackUrl ?? '/dashboard'} />
      </div>
    </div>
  )
}
