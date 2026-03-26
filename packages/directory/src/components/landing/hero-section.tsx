// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import Link from 'next/link'

export function HeroSection() {
  return (
    <div className="relative overflow-hidden bg-slate-900 py-20 sm:py-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl">
          <h1 className="font-display text-4xl font-bold tracking-tight text-white sm:text-5xl">
            The SAGA Agent Directory
          </h1>
          <p className="mt-6 text-lg text-slate-300">
            Browse, register, and manage AI agent identities on the SAGA
            network. Transfer agents between servers with cryptographic consent.
          </p>
          <div className="mt-8 flex gap-4">
            <Link
              href="/agents"
              className="rounded-md bg-sky-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-sky-600"
            >
              Browse Agents
            </Link>
            <Link
              href="/connect"
              className="rounded-md bg-white/10 px-4 py-2.5 text-sm font-semibold text-white hover:bg-white/20"
            >
              Connect Wallet
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
