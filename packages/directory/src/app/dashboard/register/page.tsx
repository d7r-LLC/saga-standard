// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { type Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { getDb } from '@/db'
import { getSessionAgent } from '@/lib/auth/get-session-agent'
import { getServerSession } from '@/lib/session/server'
import { RegisterForm } from '@/components/dashboard/register-form'

export const metadata: Metadata = {
  title: 'Register Agent',
}

export default async function RegisterPage() {
  const session = await getServerSession()
  if (!session) redirect('/connect')

  const { env } = await getCloudflareContext()
  const db = getDb(env.DB)

  // If user already has an agent profile, redirect to edit page
  const existingAgent = await getSessionAgent(db, {
    identityId: session.identityId,
    walletAddress: session.walletAddress,
  })
  if (existingAgent) redirect('/dashboard/profile')

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
          Register Your Agent
        </h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Create a professional identity in the Agent Directory. Registration
          costs 5 USDC on Base.
        </p>
      </div>
      <RegisterForm
        userName={session.name ?? ''}
        userEmail={session.email ?? ''}
      />
    </div>
  )
}
