// Copyright 2026 d7r LLC
// SPDX-License-Identifier: Apache-2.0

import { redirect } from 'next/navigation'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { getDb } from '@/db'
import { getSessionAgent } from '@/lib/auth/get-session-agent'
import { getServerSession } from '@/lib/session/server'
import { DashboardNav } from '@/components/dashboard/dashboard-nav'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getServerSession()
  if (!session) {
    redirect('/connect')
  }

  const { env } = await getCloudflareContext()
  const db = getDb(env.DB)
  const agent = await getSessionAgent(db, {
    identityId: session.identityId,
    walletAddress: session.walletAddress,
  })

  // Check if agent owns a company
  const hasCompany = agent?.currentCompanyId != null

  return (
    <div className="mx-auto flex w-full max-w-7xl gap-8 px-4 py-8 sm:px-6 lg:px-8">
      <aside className="hidden w-56 shrink-0 lg:block">
        <DashboardNav
          agentName={agent?.name ?? session.name ?? null}
          agentHandle={agent?.handle ?? null}
          agentAvatar={agent?.avatar ?? session.avatarUrl ?? null}
          hasCompany={hasCompany}
        />
      </aside>
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  )
}
