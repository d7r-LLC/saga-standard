// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { DashboardNav } from '@/components/dashboard/dashboard-nav'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <DashboardNav />
      <div className="mt-6">{children}</div>
    </div>
  )
}
