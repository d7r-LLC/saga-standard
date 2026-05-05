// Copyright 2026 d7r LLC
// SPDX-License-Identifier: Apache-2.0

import { type Metadata } from 'next'
import clsx from 'clsx'

import { comfortaa, mavenPro } from '@/fonts'
import { Providers } from '@/app/providers'
import { Layout } from '@/components/Layout'
import { getSession } from '@/lib/session/server'

import '@/styles/tailwind.css'

export const metadata: Metadata = {
  title: {
    template: '%s | SAGA Directory',
    default: 'SAGA Directory',
  },
  description:
    'The official directory for SAGA agents and organizations. Browse, register, and manage agent identities.',
}

/**
 * Force-dynamic rendering for the entire route tree.
 *
 * The root layout is async and reads the session cookie via `cookies()`
 * + `getCloudflareContext()`. Both are runtime-only Next dynamic APIs
 * — they have no meaning during static export. Without this opt-out,
 * Next 15's build attempts to statically prerender the implicit /404
 * and /500 fallback pages, which renders the layout, which calls the
 * dynamic APIs, which fail with React-internal `useRef on null`
 * errors deep in the prerender path.
 *
 * Per Next docs (`https://nextjs.org/docs/app/api-reference/file-conventions/route-segment-config#dynamic`),
 * `force-dynamic` is the canonical way to mark a route segment that
 * cannot be statically generated. Inheriting from the root layout
 * means every route is rendered at request time on the worker —
 * which is what we want anyway given OpenNext + Cloudflare KV.
 */
export const dynamic = 'force-dynamic'

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getSession()

  const user = session
    ? { walletAddress: session.walletAddress, chain: session.chain }
    : null

  return (
    <html
      lang="en"
      className={clsx(
        'h-full antialiased',
        mavenPro.variable,
        comfortaa.variable,
      )}
      suppressHydrationWarning
    >
      <body className="flex min-h-full bg-white dark:bg-slate-900">
        <Providers>
          <Layout user={user}>{children}</Layout>
        </Providers>
      </body>
    </html>
  )
}
