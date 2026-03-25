// Copyright 2026 d7r LLC
// SPDX-License-Identifier: Apache-2.0

'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Building2, LogOut, User } from 'lucide-react'
import clsx from 'clsx'

interface DashboardNavProps {
  agentName: string | null
  agentHandle: string | null
  agentAvatar: string | null
  hasCompany: boolean
}

const navItems = [
  { href: '/dashboard/profile', label: 'Agent Profile', icon: User },
  { href: '/dashboard/company', label: 'Company', icon: Building2 },
]

export function DashboardNav({
  agentName,
  agentHandle,
  agentAvatar,
  hasCompany,
}: DashboardNavProps) {
  const pathname = usePathname()

  const visibleItems = navItems.filter((item) => {
    if (item.href === '/dashboard/company' && !hasCompany) return false
    return true
  })

  return (
    <nav className="flex flex-col gap-1">
      {/* User identity header */}
      <div className="mb-4 flex items-center gap-3 px-3 py-2">
        {agentAvatar ? (
          <img
            src={agentAvatar}
            alt=""
            className="h-8 w-8 rounded-full object-cover"
          />
        ) : (
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-200 dark:bg-slate-700">
            <User className="h-4 w-4 text-slate-500 dark:text-slate-400" />
          </div>
        )}
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-slate-900 dark:text-white">
            {agentName ?? 'No profile'}
          </p>
          {agentHandle && (
            <p className="truncate text-xs text-slate-500 dark:text-slate-400">
              @{agentHandle}
            </p>
          )}
        </div>
      </div>

      {/* Nav links */}
      {visibleItems.map((item) => {
        const isActive =
          pathname === item.href || pathname.startsWith(`${item.href}/`)
        const Icon = item.icon
        return (
          <Link
            key={item.href}
            href={item.href}
            className={clsx(
              'flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors',
              isActive
                ? 'bg-sky-50 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400'
                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white',
            )}
          >
            <Icon className="h-4 w-4" />
            {item.label}
          </Link>
        )
      })}

      {/* Logout */}
      <div className="mt-auto border-t border-slate-200 pt-2 dark:border-slate-700">
        <a
          href="/auth/logout"
          className="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </a>
      </div>
    </nav>
  )
}
