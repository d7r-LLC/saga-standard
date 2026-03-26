// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { type Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session/server'
import { createAuthenticatedSagaClient } from '@/lib/saga-client'
import { TransferInitiateForm } from '@/components/dashboard/transfer-initiate-form'

export const metadata: Metadata = {
  title: 'New Transfer',
}

export default async function NewTransferPage() {
  const session = await getSession()
  if (!session) redirect('/connect')

  const client = await createAuthenticatedSagaClient(session.sagaToken)

  // Find the user's agent handle
  let agentHandle = ''
  try {
    const detail = await client.getAgent(session.walletAddress)
    agentHandle = detail.agent.handle
  } catch {
    redirect('/dashboard/register')
  }

  return (
    <div>
      <h1 className="text-xl font-bold text-slate-900 dark:text-white">
        Initiate Transfer
      </h1>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
        Transfer agent <span className="font-medium">@{agentHandle}</span> to
        another SAGA server.
      </p>
      <div className="mt-6 max-w-lg">
        <TransferInitiateForm agentHandle={agentHandle} />
      </div>
    </div>
  )
}
