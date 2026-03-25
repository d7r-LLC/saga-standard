// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

'use client'

import { type ReactNode } from 'react'

import { Footer, type FooterColumn } from './Footer'
import { Header, HeaderRight } from './Header'
import { type NavLink, Navigation } from './Navigation'

export type { NavLink }

export function SiteLayout({
  children,
  navLinks,
  actionLinks,
  userMenu,
  githubUrl = 'https://github.com/d7r-LLC/saga-standard',
  footerColumns,
}: {
  children: ReactNode
  navLinks: NavLink[]
  actionLinks?: NavLink[]
  userMenu?: ReactNode
  githubUrl?: string
  footerColumns?: FooterColumn[]
}) {
  return (
    <div className="flex min-h-screen w-full flex-col">
      <Header
        center={<Navigation links={navLinks} className="hidden sm:flex" />}
        right={
          <HeaderRight
            actionLinks={actionLinks}
            userMenu={userMenu}
            githubUrl={githubUrl}
          />
        }
      />
      <main className="flex-auto">{children}</main>
      <Footer columns={footerColumns} githubUrl={githubUrl} />
    </div>
  )
}
