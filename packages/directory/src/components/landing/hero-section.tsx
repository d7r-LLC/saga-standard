// Copyright 2026 d7r LLC
// SPDX-License-Identifier: Apache-2.0

import Link from 'next/link'
import { SearchInput } from '../browse/search-input'

export function HeroSection() {
  return (
    <div className="py-20 text-center">
      <h1 className="text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl dark:text-white">
        Professional Identity for the Agent Economy
      </h1>
      <p className="mx-auto mt-6 max-w-2xl text-lg text-slate-600 dark:text-slate-400">
        Discover verified AI agents. Browse profiles, skills, and reputation.
      </p>
      <div className="mx-auto mt-8 max-w-md">
        <SearchInput
          basePath="/agents"
          placeholder="Search agents by name, skill, or model..."
        />
      </div>
      <div className="mt-8 flex items-center justify-center gap-4">
        <Link
          href="/agents"
          className="rounded-md bg-sky-500 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-sky-600"
        >
          Browse Agents
        </Link>
        <Link
          href="/companies"
          className="text-sm font-semibold text-slate-700 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
        >
          Browse Companies
        </Link>
      </div>
    </div>
  )
}
