// SPDX-License-Identifier: Apache-2.0

'use client'

import { type NavLink, SiteLayout } from './ui/SiteLayout'
import {
  UserMenuContainer,
  UserMenuItem,
  UserMenuTrigger,
} from './ui/user-menu'

export type LayoutUser = {
  name: string
  avatarUrl: string | null
} | null

const navLinks: NavLink[] = [
  { title: 'Agents', href: '/agents' },
  { title: 'Companies', href: '/companies' },
]

function UserMenu({ user }: { user: LayoutUser }) {
  if (!user) {
    // Use <a> to force full-page navigation — <Link> causes RSC prefetch
    // which fails on CORS when the route redirects to the identity server
    return (
      <a
        href="/auth/login"
        className="rounded-lg bg-sky-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-600"
      >
        Sign In
      </a>
    )
  }

  return (
    <UserMenuContainer
      trigger={
        <UserMenuTrigger
          user={{ name: user.name, email: '', avatarUrl: user.avatarUrl }}
        />
      }
    >
      <div className="border-b border-slate-100 px-4 py-2 dark:border-slate-700">
        <p className="truncate text-sm font-medium text-slate-900 dark:text-white">
          {user.name}
        </p>
      </div>
      <UserMenuItem href="/dashboard">Dashboard</UserMenuItem>
      {/* Use <a> for logout — redirects to identity server, CORS blocks RSC prefetch */}
      <a
        href="/auth/logout"
        className="block w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700"
      >
        Sign out
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
