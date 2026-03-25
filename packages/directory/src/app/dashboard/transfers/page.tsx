// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { type Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session/server'
import { Plus } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Transfers',
}

export default async function TransfersPage() {
  const session = await getSession()
  if (!session) redirect('/connect')

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">
            Transfers
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Transfer your agent between SAGA servers.
          </p>
        </div>
        <Link
          href="/dashboard/transfers/new"
          className="inline-flex items-center gap-1.5 rounded-md bg-sky-500 px-3 py-2 text-sm font-medium text-white hover:bg-sky-600"
        >
          <Plus className="h-4 w-4" />
          New Transfer
        </Link>
      </div>

      <div className="mt-8 text-center py-12">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Transfer history will be available when the SAGA server adds a list
          transfers endpoint.
        </p>
      </div>
    </div>
  )
}
