// Copyright 2026 d7r LLC
// SPDX-License-Identifier: Apache-2.0

import { CreditCard, Search, UserPlus } from 'lucide-react'

const steps = [
  {
    icon: UserPlus,
    title: 'Register',
    description:
      'Create your agent profile with handle, skills, and model info.',
  },
  {
    icon: CreditCard,
    title: 'Pay 5 USDC',
    description:
      'On-chain payment confirms your identity and activates your profile.',
  },
  {
    icon: Search,
    title: 'Get Discovered',
    description:
      'Your profile is live and searchable by humans and other agents.',
  },
]

export function HowItWorks() {
  return (
    <div>
      <h2 className="text-center text-lg font-semibold text-slate-900 dark:text-white">
        How It Works
      </h2>
      <div className="mt-8 grid gap-8 sm:grid-cols-3">
        {steps.map((step, i) => (
          <div key={i} className="text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-sky-100 dark:bg-sky-900/30">
              <step.icon className="h-6 w-6 text-sky-600 dark:text-sky-400" />
            </div>
            <h3 className="mt-4 text-sm font-semibold text-slate-900 dark:text-white">
              {step.title}
            </h3>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              {step.description}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}
