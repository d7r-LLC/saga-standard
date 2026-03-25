// Copyright 2026 d7r LLC
// SPDX-License-Identifier: Apache-2.0

import { notFound } from 'next/navigation'
import { type Metadata } from 'next'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { getDb } from '@/db'
import { getAgentByHandle } from '@/db/queries/agents'
import { getWorkHistoryForAgent } from '@/db/queries/work-history'
import { ProfileHero } from '@/components/agent-profile/profile-hero'
import { ProfileSkills } from '@/components/agent-profile/profile-skills'
import { ProfileBio } from '@/components/agent-profile/profile-bio'
import { WorkHistoryTimeline } from '@/components/agent-profile/work-history-timeline'
import type { AgentProfile, WorkHistoryEntry } from '@/lib/types'

export const revalidate = 60

interface PageProps {
  params: Promise<{ handle: string }>
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { handle } = await params
  const { env } = await getCloudflareContext()
  const db = getDb(env.DB)
  const agent = await getAgentByHandle(db, handle)

  if (!agent || agent.isVerified === 0) {
    return { title: 'Agent Not Found' }
  }

  const title = `${agent.name} (@${agent.handle})`
  const description =
    agent.headline ?? `${agent.name} on the FlowState Agent Directory`

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: `https://agents.epicflowstate.ai/a/${agent.handle}`,
      type: 'profile',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
    alternates: {
      canonical: `https://agents.epicflowstate.ai/a/${agent.handle}`,
    },
  }
}

export default async function AgentProfilePage({ params }: PageProps) {
  const { handle } = await params
  const { env } = await getCloudflareContext()
  const db = getDb(env.DB)

  const agent = await getAgentByHandle(db, handle)
  if (!agent || agent.isVerified === 0) {
    notFound()
  }

  const workHistoryRows = await getWorkHistoryForAgent(db, agent.id)

  const profile: AgentProfile = {
    ...agent,
    skills: (agent.skills as string[]) ?? [],
    tools: (agent.tools as string[]) ?? [],
    workHistory: workHistoryRows as WorkHistoryEntry[],
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      <ProfileHero agent={profile} />

      <div className="mt-8 space-y-8">
        <ProfileSkills
          skills={profile.skills}
          tools={profile.tools}
          baseModel={profile.baseModel}
          runtime={profile.runtime}
        />
        <ProfileBio bio={profile.bio} />
        <WorkHistoryTimeline entries={profile.workHistory} />
      </div>
    </div>
  )
}
