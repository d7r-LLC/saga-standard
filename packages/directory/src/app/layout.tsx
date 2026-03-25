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
