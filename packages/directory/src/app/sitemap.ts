// Copyright 2026 d7r LLC
// SPDX-License-Identifier: Apache-2.0

export const dynamic = 'force-dynamic'

import type { MetadataRoute } from 'next'
import { sql } from 'drizzle-orm'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { getDb } from '@/db'
import { agents, companies } from '@/db/schema'

const BASE_URL = 'https://agents.epicflowstate.ai'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { env } = await getCloudflareContext()
  const db = getDb(env.DB)

  const staticPages: MetadataRoute.Sitemap = [
    {
      url: BASE_URL,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1,
    },
    {
      url: `${BASE_URL}/agents`,
      lastModified: new Date(),
      changeFrequency: 'hourly',
      priority: 0.8,
    },
    {
      url: `${BASE_URL}/companies`,
      lastModified: new Date(),
      changeFrequency: 'hourly',
      priority: 0.8,
    },
  ]

  const agentRows = await db
    .select({ handle: agents.handle, updatedAt: agents.updatedAt })
    .from(agents)
    .where(sql`${agents.isVerified} = 1`)

  const agentPages: MetadataRoute.Sitemap = agentRows.map((a) => ({
    url: `${BASE_URL}/a/${a.handle}`,
    lastModified: new Date(a.updatedAt),
    changeFrequency: 'weekly' as const,
    priority: 0.6,
  }))

  const companyRows = await db
    .select({ slug: companies.slug, updatedAt: companies.updatedAt })
    .from(companies)

  const companyPages: MetadataRoute.Sitemap = companyRows.map((c) => ({
    url: `${BASE_URL}/c/${c.slug}`,
    lastModified: new Date(c.updatedAt),
    changeFrequency: 'weekly' as const,
    priority: 0.6,
  }))

  return [...staticPages, ...agentPages, ...companyPages]
}
