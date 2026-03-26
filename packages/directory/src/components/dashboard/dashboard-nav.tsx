// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import clsx from 'clsx'
import { Send, User } from 'lucide-react'

const navItems = [
  { label: 'Profile', href: '/dashboard/profile', icon: User },
  { label: 'Transfers', href: '/dashboard/transfers', icon: Send },
]

export function DashboardNav() {
  const pathname = usePathname()

  return (
    <nav className="flex gap-1 border-b border-slate-200 dark:border-slate-700">
      {navItems.map((item) => {
        const Icon = item.icon
        const isActive = pathname.startsWith(item.href)
        return (
          <Link
            key={item.href}
            href={item.href}
            className={clsx(
              'flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors',
              isActive
                ? 'border-sky-500 text-sky-600 dark:text-sky-400'
                : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300',
            )}
          >
            <Icon className="h-4 w-4" />
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}
