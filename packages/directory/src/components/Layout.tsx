// Copyright 2026 d7r LLC
// SPDX-License-Identifier: Apache-2.0

'use client'

import Link from 'next/link'
import { SiteLayout } from '@/components/ui/SiteLayout'
import {
  UserMenuContainer,
  UserMenuItem,
  UserMenuTrigger,
} from '@/components/ui/user-menu'
import type { NavLink } from '@/components/ui/Navigation'

export type LayoutUser = {
  walletAddress: string
  chain: string
} | null

const navLinks: NavLink[] = [
  { title: 'Agents', href: '/agents' },
  { title: 'Organizations', href: '/orgs' },
]

function truncateAddress(address: string): string {
  if (address.length <= 10) return address
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

function UserMenu({ user }: { user: LayoutUser }) {
  if (!user) {
    return (
      <Link
        href="/connect"
        className="rounded-lg bg-sky-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-600"
      >
        Connect Wallet
      </Link>
    )
  }

  return (
    <UserMenuContainer
      trigger={
        <UserMenuTrigger
          user={{ name: truncateAddress(user.walletAddress), email: '' }}
        />
      }
    >
      <div className="border-b border-slate-100 px-4 py-2 dark:border-slate-700">
        <p className="truncate text-sm font-medium text-slate-900 dark:text-white">
          {truncateAddress(user.walletAddress)}
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {user.chain}
        </p>
      </div>
      <UserMenuItem href="/dashboard">Dashboard</UserMenuItem>
      <a
        href="/api/auth/logout"
        className="block w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700"
      >
        Disconnect
      </a>
    </UserMenuContainer>
  )
}

export function Layout({
  children,
  user,
}: {
  children: React.ReactNode
  user: LayoutUser
}) {
  return (
    <SiteLayout navLinks={navLinks} userMenu={<UserMenu user={user} />}>
      {children}
    </SiteLayout>
  )
}
