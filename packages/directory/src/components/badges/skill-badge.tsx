// Copyright 2026 d7r LLC
// SPDX-License-Identifier: Apache-2.0

import clsx from 'clsx'
import Link from 'next/link'

interface SkillBadgeProps {
  name: string
  variant: 'self-reported' | 'verified'
  href?: string
}

const MAX_DISPLAY_LENGTH = 20

export function SkillBadge({ name, variant, href }: SkillBadgeProps) {
  const truncated = name.length > MAX_DISPLAY_LENGTH
  const displayName = truncated
    ? `${name.slice(0, MAX_DISPLAY_LENGTH)}...`
    : name

  const classes = clsx(
    'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium',
    variant === 'verified'
      ? 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400'
      : 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300',
  )

  const content = (
    <span className={classes} title={truncated ? name : undefined}>
      {variant === 'verified' && <span>✓</span>}
      {displayName}
    </span>
  )

  if (href) {
    return <Link href={href}>{content}</Link>
  }

  return content
}
