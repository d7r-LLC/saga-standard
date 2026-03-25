// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

'use client'

import { Menu, MenuButton, MenuItem, MenuItems } from '@headlessui/react'
import Link from 'next/link'
import clsx from 'clsx'

interface UserMenuUser {
  name?: string
  email: string
  avatarUrl?: string | null
}

export function UserMenuTrigger({ user }: { user: UserMenuUser }) {
  const initials = user.name
    ? user.name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .slice(0, 2)
        .toUpperCase()
    : user.email
      ? user.email[0].toUpperCase()
      : '?'

  return user.avatarUrl ? (
    <img
      src={user.avatarUrl}
      alt={user.name ?? user.email}
      className="h-8 w-8 rounded-full"
    />
  ) : (
    <div className="bg-accent-400 flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold text-slate-900">
      {initials}
    </div>
  )
}

export function UserMenuContainer({
  children,
  trigger,
}: {
  children: React.ReactNode
  trigger: React.ReactNode
}) {
  return (
    <Menu as="div" className="relative">
      <MenuButton aria-label="Open user menu" className="flex items-center">
        {trigger}
      </MenuButton>
      <MenuItems
        className={clsx(
          'absolute right-0 z-50 mt-2 w-56 origin-top-right rounded-md',
          'bg-white shadow-lg ring-1 ring-black/5 focus:outline-none',
          'dark:bg-slate-800 dark:ring-white/10',
        )}
      >
        <div className="py-1">{children}</div>
      </MenuItems>
    </Menu>
  )
}

export function UserMenuItemComponent({
  href,
  onClick,
  children,
}: {
  href?: string
  onClick?: () => void
  children: React.ReactNode
}) {
  const className = clsx(
    'block w-full px-4 py-2 text-left text-sm',
    'text-slate-700 hover:bg-slate-100',
    'dark:text-slate-300 dark:hover:bg-slate-700',
  )

  if (href) {
    return (
      <MenuItem>
        <Link href={href} className={className}>
          {children}
        </Link>
      </MenuItem>
    )
  }

  return (
    <MenuItem>
      <button type="button" onClick={onClick} className={className}>
        {children}
      </button>
    </MenuItem>
  )
}

export { UserMenuItemComponent as UserMenuItem }
