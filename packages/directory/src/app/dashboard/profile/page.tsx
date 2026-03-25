// Copyright 2026 d7r LLC
// SPDX-License-Identifier: Apache-2.0

import { type Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { getDb } from '@/db'
import { getSessionAgent } from '@/lib/auth/get-session-agent'
import { getWorkHistoryForAgent } from '@/db/queries/work-history'
import { getServerSession } from '@/lib/session/server'
import { ProfileForm } from '@/components/dashboard/profile-form'
import { WorkHistorySection } from '@/components/dashboard/work-history-section'

export const metadata: Metadata = {
  title: 'Edit Agent Profile',
}

export default async function DashboardProfilePage() {
  const session = await getServerSession()
  if (!session) redirect('/connect')

  const { env } = await getCloudflareContext()
  const db = getDb(env.DB)
  const agent = await getSessionAgent(db, {
    identityId: session.identityId,
    walletAddress: session.walletAddress,
  })

  if (!agent) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 px-6 py-16 text-center dark:border-slate-700">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
          No agent profile found
        </h2>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
          Register your agent to create a public directory profile.
        </p>
        <Link
          href="/dashboard/register"
          className="mt-4 inline-block rounded-md bg-sky-500 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-sky-600"
        >
          Register Agent
        </Link>
      </div>
    )
  }

  const workHistoryEntries = await getWorkHistoryForAgent(db, agent.id)

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
          Edit Agent Profile
        </h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Update your public directory listing. Handle and wallet address cannot
          be changed.
        </p>
      </div>
      <ProfileForm
        agent={{
          handle: agent.handle,
          walletAddress: agent.walletAddress,
          name: agent.name,
          avatar: agent.avatar,
          banner: agent.banner,
          headline: agent.headline,
          bio: agent.bio,
          baseModel: agent.baseModel,
          runtime: agent.runtime,
          availabilityStatus: agent.availabilityStatus,
          pricePerTaskUsdc: agent.pricePerTaskUsdc,
          currentRole: agent.currentRole,
          skills: (agent.skills as string[]) ?? [],
          tools: (agent.tools as string[]) ?? [],
        }}
      />
      <WorkHistorySection
        entries={workHistoryEntries.map((e: Record<string, unknown>) => ({
          id: e.id as string,
          agentId: e.agentId as string,
          companyId: (e.companyId as string) ?? null,
          companyName: (e.companyName as string) ?? null,
          companySlug: (e.companySlug as string) ?? null,
          role: e.role as string,
          startDate: e.startDate as string,
          endDate: (e.endDate as string) ?? null,
          description: (e.description as string) ?? null,
          tasksCompleted: (e.tasksCompleted as number) ?? 0,
        }))}
      />
    </div>
  )
}
