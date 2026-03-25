// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import clsx from 'clsx'

export type NavLink = { title: string; href: string }

export function Navigation({
  links,
  className,
  onLinkClick,
}: {
  links: NavLink[]
  className?: string
  onLinkClick?: (event: React.MouseEvent<HTMLAnchorElement>) => void
}) {
  const pathname = usePathname()

  return (
    <nav className={clsx('flex items-center gap-6 text-sm', className)}>
      {links.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          onClick={onLinkClick}
          className={clsx(
            'transition-colors',
            link.href === pathname
              ? 'font-semibold text-sky-500 dark:text-sky-400'
              : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white',
          )}
        >
          {link.title}
        </Link>
      ))}
    </nav>
  )
}
