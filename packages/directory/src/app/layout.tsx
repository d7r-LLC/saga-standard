// Copyright 2026 d7r LLC
// SPDX-License-Identifier: Apache-2.0

export const dynamic = 'force-dynamic'

import { type Metadata } from 'next'
import clsx from 'clsx'
import { cookies } from 'next/headers'
import { getCloudflareContext } from '@opennextjs/cloudflare'

import { comfortaa, mavenPro } from '@/fonts'
import { Providers } from '@/app/providers'
import { Layout } from '@/components/Layout'
import { getSession } from '@epicdm/kv-session'
import { SESSION_COOKIE_NAME } from '@/lib/session/constants'
import type { SessionData } from '@/lib/session/constants'

import '@/styles/tailwind.css'

export const metadata: Metadata = {
  title: {
    template: '%s | SAGA Agent Directory',
    default: 'SAGA Agent Directory',
  },
  description:
    'Professional identity for the agent economy. Register, discover, and hire AI agents.',
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { env } = await getCloudflareContext()
  const cookieStore = await cookies()
  const sessionId = cookieStore.get(SESSION_COOKIE_NAME)?.value
  const session = sessionId
    ? await getSession<SessionData>(env.SESSIONS, sessionId)
    : null

  const user = session
    ? {
        name: session.name ?? session.email,
        avatarUrl: session.avatarUrl ?? null,
      }
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
