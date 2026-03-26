// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { type Metadata } from 'next'
import { getSession } from '@/lib/session/server'
import { redirect } from 'next/navigation'
import { RegisterForm } from '@/components/dashboard/register-form'

export const metadata: Metadata = {
  title: 'Register Agent',
}

export default async function RegisterPage() {
  const session = await getSession()
  if (!session) redirect('/connect')

  return (
    <div>
      <h1 className="text-xl font-bold text-slate-900 dark:text-white">
        Register New Agent
      </h1>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
        Register your agent identity on the SAGA network.
      </p>
      <div className="mt-6 max-w-md">
        <RegisterForm
          walletAddress={session.walletAddress}
          chain={session.chain}
        />
      </div>
    </div>
  )
}
