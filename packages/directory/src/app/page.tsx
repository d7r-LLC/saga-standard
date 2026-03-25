// Copyright 2026 d7r LLC
// SPDX-License-Identifier: Apache-2.0

import { Suspense } from 'react'
import { type Metadata } from 'next'
import Link from 'next/link'
import { sql } from 'drizzle-orm'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { getDb } from '@/db'
import { agents } from '@/db/schema'
import { searchAgents } from '@/db/queries/agents'
import { HeroSection } from '@/components/landing/hero-section'
import { RecentAgents } from '@/components/landing/recent-agents'
import { TrendingSkills } from '@/components/landing/trending-skills'
import { HowItWorks } from '@/components/landing/how-it-works'
import type { AgentSummary } from '@/lib/types'

export const revalidate = 60

export const metadata: Metadata = {
  title: 'FlowState Agent Directory',
  description:
    'Discover and browse verified AI agents in the FlowState directory.',
}

async function getRecentAgents(
  db: ReturnType<typeof getDb>,
): Promise<AgentSummary[]> {
  const result = await searchAgents(db, {
    verifiedOnly: true,
    page: 1,
    limit: 12,
  })
  return result.agents.map((a: Record<string, unknown>) => ({
    ...a,
    skills: (a.skills as string[]) ?? [],
    tools: (a.tools as string[]) ?? [],
  })) as AgentSummary[]
}

async function getTrendingSkills(
  db: ReturnType<typeof getDb>,
): Promise<Array<{ name: string; count: number }>> {
  const allAgents = await db
    .select({ skills: agents.skills })
    .from(agents)
    .where(sql`${agents.isVerified} = 1`)

  const skillCounts = new Map<string, number>()
  for (const agent of allAgents) {
    const skills = (agent.skills as string[]) ?? []
    for (const skill of skills) {
      skillCounts.set(skill, (skillCounts.get(skill) ?? 0) + 1)
    }
  }

  return Array.from(skillCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, count]) => ({ name, count }))
}

export default async function HomePage() {
  const { env } = await getCloudflareContext()
  const db = getDb(env.DB)

  const [recentAgents, trendingSkills] = await Promise.all([
    getRecentAgents(db),
    getTrendingSkills(db),
  ])

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
      <Suspense>
        <HeroSection />
      </Suspense>

      <div className="space-y-16 pb-20">
        <RecentAgents agents={recentAgents} />
        <TrendingSkills skills={trendingSkills} />
        <HowItWorks />

        <div className="rounded-xl bg-slate-50 px-8 py-12 text-center dark:bg-slate-800/50">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">
            The agent directory is growing
          </h2>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
            Browse verified AI agents and find the right fit for your project.
          </p>
          <Link
            href="/agents"
            className="mt-6 inline-block rounded-md bg-sky-500 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-sky-600"
          >
            Browse Agents
          </Link>
        </div>
      </div>
    </div>
  )
}
