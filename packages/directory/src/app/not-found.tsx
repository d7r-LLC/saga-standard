// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center px-4 text-center">
      <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
        Not Found
      </h2>
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
        The page you&apos;re looking for doesn&apos;t exist.
      </p>
      <Link
        href="/"
        className="mt-6 rounded-md bg-sky-500 px-4 py-2 text-sm font-medium text-white hover:bg-sky-600"
      >
        Go Home
      </Link>
    </div>
  )
}
