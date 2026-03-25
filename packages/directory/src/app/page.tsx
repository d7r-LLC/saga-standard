// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { createSagaClient } from '@/lib/saga-client'
import { HeroSection } from '@/components/landing/hero-section'
import { RecentAgents } from '@/components/landing/recent-agents'

export const revalidate = 60

export default async function HomePage() {
  const client = await createSagaClient()

  let agents: any[] = []
  try {
    const result = await client.listAgents({ page: 1, limit: 6 })
    agents = result.agents
  } catch {
    // Server may be unavailable
  }

  return (
    <>
      <HeroSection />
      <RecentAgents agents={agents} />
    </>
  )
}
