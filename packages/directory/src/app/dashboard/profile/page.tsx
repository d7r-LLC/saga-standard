// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { type Metadata } from 'next'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getSession } from '@/lib/session/server'
import { createAuthenticatedSagaClient } from '@/lib/saga-client'
import { ProfileHero } from '@/components/agent-profile/profile-hero'
import { WalletAddress } from '@/components/badges/wallet-address'

export const metadata: Metadata = {
  title: 'My Profile',
}

export default async function ProfilePage() {
  const session = await getSession()
  if (!session) redirect('/connect')

  const client = await createAuthenticatedSagaClient(session.sagaToken)

  // Try to find agent by wallet address
  let agent = null
  try {
    const detail = await client.getAgent(session.walletAddress)
    agent = detail.agent
  } catch {
    // Agent not registered yet
  }

  if (!agent) {
    return (
      <div className="text-center py-12">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
          No agent registered
        </h2>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
          Your wallet <WalletAddress address={session.walletAddress} />{' '}
          doesn&apos;t have a registered agent yet.
        </p>
        <Link
          href="/dashboard/register"
          className="mt-4 inline-block rounded-md bg-sky-500 px-4 py-2 text-sm font-medium text-white hover:bg-sky-600"
        >
          Register Agent
        </Link>
      </div>
    )
  }

  return (
    <div>
      <ProfileHero agent={agent} />
      <div className="mt-6">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Document management coming in a future update.
        </p>
      </div>
    </div>
  )
}
