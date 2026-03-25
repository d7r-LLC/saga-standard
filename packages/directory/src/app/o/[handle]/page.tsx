// Copyright 2026 d7r LLC
// SPDX-License-Identifier: Apache-2.0

import { notFound } from 'next/navigation'
import { type Metadata } from 'next'
import { createSagaClient } from '@/lib/saga-client'
import { OrgHero } from '@/components/org-profile/org-hero'

export const revalidate = 60

interface PageProps {
  params: Promise<{ handle: string }>
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { handle } = await params
  return {
    title: handle,
    description: `SAGA organization profile for ${handle}`,
  }
}

export default async function OrgProfilePage({ params }: PageProps) {
  const { handle } = await params
  const client = await createSagaClient()

  let detail
  try {
    detail = await client.getOrg(handle)
  } catch {
    notFound()
  }

  const org = detail.organization

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      <OrgHero org={org} />
      <div className="mt-8">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Registered {new Date(org.registeredAt).toLocaleDateString()}
        </p>
      </div>
    </div>
  )
}
