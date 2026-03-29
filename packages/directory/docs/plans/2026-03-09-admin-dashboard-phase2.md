> **FlowState Document:** `docu_gy-y5_BU77`

# Phase 2: Admin Dashboard — Core CRUD & Analytics UI

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace admin placeholder pages with working Server Component UIs for analytics, listing management, user management, and review moderation — all powered by existing Drizzle queries and API routes.

**Architecture:** Server Components fetch data directly via Drizzle (no client-side fetch for initial render). Forms use Next.js Server Actions for mutations. Shared UI primitives (stat cards, data tables, status badges) are built first and reused across all admin pages. No client-side state management needed — standard request/response.

**Tech Stack:** Next.js 15 App Router (Server Components + Server Actions), Drizzle ORM + Cloudflare D1, Tailwind CSS, Lucide icons, Zod validation

---

## Context for Implementers

### Repository Layout

```
packages/template-directory/
├── src/
│   ├── app/
│   │   ├── (admin)/
│   │   │   ├── layout.tsx          # Auth gate (admin+ role required)
│   │   │   └── admin/
│   │   │       ├── page.tsx        # Admin dashboard (placeholder → Task 3)
│   │   │       ├── listings/       # Listing management (Tasks 4-5)
│   │   │       ├── users/          # User management (Tasks 6-7)
│   │   │       └── reviews/        # Review moderation (Task 8)
│   │   └── api/admin/
│   │       ├── analytics/route.ts  # GET analytics (existing, working)
│   │       └── templates/route.ts  # POST template (existing, working)
│   ├── components/
│   │   ├── admin/
│   │   │   ├── sidebar.tsx         # Admin sidebar (existing)
│   │   │   └── sidebar-context.tsx # Sidebar state (existing)
│   │   └── ui/                     # NEW — shared UI primitives (Tasks 1-2)
│   ├── db/
│   │   ├── schema.ts              # 35 tables (existing)
│   │   ├── queries.ts             # Public queries (existing)
│   │   ├── admin-queries.ts       # Admin CRUD (existing)
│   │   ├── analytics-queries.ts   # Analytics queries (existing)
│   │   └── user-queries.ts        # NEW (Task 6)
│   └── lib/
│       ├── admin-auth.ts          # Role checks (existing)
│       ├── actions/               # NEW — Server Actions (Tasks 4-8)
│       └── validation/schemas.ts  # Zod schemas (existing)
```

### Key Patterns

1. **Auth:** Admin layout (`src/app/(admin)/layout.tsx`) already gates on admin+ role. Pages inside don't need to re-check auth.
2. **DB access:** Use `getCloudflareContext()` → `getDb(env.DB)` in Server Components. Example in `src/app/api/admin/analytics/route.ts`.
3. **Queries:** `src/db/queries.ts` (public), `src/db/admin-queries.ts` (admin CRUD), `src/db/analytics-queries.ts` (stats). Add new query files for new domains.
4. **Validation:** `src/lib/validation/schemas.ts` has Zod schemas. Use `parseBody()` helper.
5. **Cache:** `src/lib/cache/kv.ts` has `CacheKeys`, `invalidateCacheKeys()`. Invalidate after mutations.

### How to run things

```bash
cd packages/template-directory

# Tests
npx jest

# TypeScript check
npx tsc --noEmit

# Dev server (from repo root)
# Note: requires wrangler bindings, not needed for this work
```

---

## Task 1: Create Shared UI Primitives — StatCard & StatusBadge

These two components are used on nearly every admin page. Build them first.

**Files:**

- Create: `src/components/ui/stat-card.tsx`
- Create: `src/components/ui/status-badge.tsx`
- Test: `src/__tests__/components/stat-card.test.tsx`
- Test: `src/__tests__/components/status-badge.test.tsx`

**Step 1: Write the StatCard test**

Create `src/__tests__/components/stat-card.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { StatCard } from '@/components/ui/stat-card'

describe('StatCard', () => {
  it('renders label and value', () => {
    render(<StatCard label="Total Users" value={1234} />)
    expect(screen.getByText('Total Users')).toBeInTheDocument()
    expect(screen.getByText('1,234')).toBeInTheDocument()
  })

  it('renders string values without formatting', () => {
    render(<StatCard label="Status" value="Active" />)
    expect(screen.getByText('Active')).toBeInTheDocument()
  })

  it('renders optional description', () => {
    render(
      <StatCard label="Downloads" value={500} description="+12% this week" />,
    )
    expect(screen.getByText('+12% this week')).toBeInTheDocument()
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npx jest src/__tests__/components/stat-card.test.tsx`
Expected: FAIL — module not found

**Step 3: Install test dependencies if needed**

Run: `npx jest --listReporters 2>&1 | head -5`

If `@testing-library/react` is not installed:

```bash
yarn add -D @testing-library/react @testing-library/jest-dom
```

Also check if there's a jest setup file for React — if not, create `jest.setup.ts` with `import '@testing-library/jest-dom'` and add `setupFilesAfterSetup: ['./jest.setup.ts']` to jest config. **Only if needed — check existing config first.**

**Step 4: Write StatCard implementation**

Create `src/components/ui/stat-card.tsx`:

```tsx
// Copyright 2026 d7r LLC
// SPDX-License-Identifier: Apache-2.0

interface StatCardProps {
  label: string
  value: number | string
  description?: string
}

function formatValue(value: number | string): string {
  if (typeof value === 'number') {
    return value.toLocaleString('en-US')
  }
  return value
}

export function StatCard({ label, value, description }: StatCardProps) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-800">
      <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
        {label}
      </p>
      <p className="mt-1 text-3xl font-semibold text-slate-900 dark:text-white">
        {formatValue(value)}
      </p>
      {description && (
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {description}
        </p>
      )}
    </div>
  )
}
```

**Step 5: Run test to verify it passes**

Run: `npx jest src/__tests__/components/stat-card.test.tsx`
Expected: PASS

**Step 6: Write the StatusBadge test**

Create `src/__tests__/components/status-badge.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { StatusBadge } from '@/components/ui/status-badge'

describe('StatusBadge', () => {
  it('renders the label text', () => {
    render(<StatusBadge label="Published" variant="success" />)
    expect(screen.getByText('Published')).toBeInTheDocument()
  })

  it('applies success variant classes', () => {
    const { container } = render(
      <StatusBadge label="Active" variant="success" />,
    )
    const badge = container.firstElementChild!
    expect(badge.className).toContain('bg-green')
  })

  it('applies warning variant classes', () => {
    const { container } = render(
      <StatusBadge label="Draft" variant="warning" />,
    )
    const badge = container.firstElementChild!
    expect(badge.className).toContain('bg-amber')
  })

  it('applies danger variant classes', () => {
    const { container } = render(
      <StatusBadge label="Archived" variant="danger" />,
    )
    const badge = container.firstElementChild!
    expect(badge.className).toContain('bg-red')
  })

  it('applies neutral variant classes', () => {
    const { container } = render(
      <StatusBadge label="Pending" variant="neutral" />,
    )
    const badge = container.firstElementChild!
    expect(badge.className).toContain('bg-slate')
  })
})
```

**Step 7: Write StatusBadge implementation**

Create `src/components/ui/status-badge.tsx`:

```tsx
// Copyright 2026 d7r LLC
// SPDX-License-Identifier: Apache-2.0

import clsx from 'clsx'

type BadgeVariant = 'success' | 'warning' | 'danger' | 'neutral' | 'info'

const variantClasses: Record<BadgeVariant, string> = {
  success:
    'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  warning:
    'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  danger: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  neutral: 'bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-300',
  info: 'bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-400',
}

interface StatusBadgeProps {
  label: string
  variant: BadgeVariant
}

export function StatusBadge({ label, variant }: StatusBadgeProps) {
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        variantClasses[variant],
      )}
    >
      {label}
    </span>
  )
}
```

**Step 8: Run all component tests**

Run: `npx jest src/__tests__/components/`
Expected: PASS (both test files)

**Step 9: Commit**

```bash
git add src/components/ui/stat-card.tsx src/components/ui/status-badge.tsx src/__tests__/components/
git commit -m "feat(ui): add StatCard and StatusBadge shared components

Built with Epic Flowstate"
```

---

## Task 2: Create DataTable Shared Component

A reusable server-rendered table with column definitions, used by listings, users, and reviews pages.

**Files:**

- Create: `src/components/ui/data-table.tsx`
- Test: `src/__tests__/components/data-table.test.tsx`

**Step 1: Write the DataTable test**

Create `src/__tests__/components/data-table.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { DataTable, type Column } from '@/components/ui/data-table'

interface TestRow {
  id: string
  name: string
  status: string
}

const columns: Column<TestRow>[] = [
  { header: 'Name', accessor: 'name' },
  { header: 'Status', accessor: 'status' },
]

const data: TestRow[] = [
  { id: '1', name: 'Alpha', status: 'Active' },
  { id: '2', name: 'Beta', status: 'Draft' },
]

describe('DataTable', () => {
  it('renders column headers', () => {
    render(<DataTable columns={columns} data={data} />)
    expect(screen.getByText('Name')).toBeInTheDocument()
    expect(screen.getByText('Status')).toBeInTheDocument()
  })

  it('renders row data', () => {
    render(<DataTable columns={columns} data={data} />)
    expect(screen.getByText('Alpha')).toBeInTheDocument()
    expect(screen.getByText('Beta')).toBeInTheDocument()
  })

  it('renders empty state when no data', () => {
    render(
      <DataTable columns={columns} data={[]} emptyMessage="No results found" />,
    )
    expect(screen.getByText('No results found')).toBeInTheDocument()
  })

  it('renders custom cell via render function', () => {
    const columnsWithRender: Column<TestRow>[] = [
      {
        header: 'Name',
        accessor: 'name',
        render: (value) => <strong>{value as string}</strong>,
      },
      { header: 'Status', accessor: 'status' },
    ]
    render(<DataTable columns={columnsWithRender} data={data} />)
    const strong = screen.getByText('Alpha')
    expect(strong.tagName).toBe('STRONG')
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npx jest src/__tests__/components/data-table.test.tsx`
Expected: FAIL — module not found

**Step 3: Write DataTable implementation**

Create `src/components/ui/data-table.tsx`:

```tsx
// Copyright 2026 d7r LLC
// SPDX-License-Identifier: Apache-2.0

import type React from 'react'

export interface Column<T> {
  header: string
  accessor: keyof T
  render?: (value: T[keyof T], row: T) => React.ReactNode
  className?: string
}

interface DataTableProps<T> {
  columns: Column<T>[]
  data: T[]
  emptyMessage?: string
}

export function DataTable<T extends Record<string, unknown>>({
  columns,
  data,
  emptyMessage = 'No data available',
}: DataTableProps<T>) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
      <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
        <thead className="bg-slate-50 dark:bg-slate-800">
          <tr>
            {columns.map((col) => (
              <th
                key={String(col.accessor)}
                scope="col"
                className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400"
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200 bg-white dark:divide-slate-700 dark:bg-slate-900">
          {data.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                className="px-4 py-12 text-center text-sm text-slate-500 dark:text-slate-400"
              >
                {emptyMessage}
              </td>
            </tr>
          ) : (
            data.map((row, rowIdx) => (
              <tr
                key={rowIdx}
                className="hover:bg-slate-50 dark:hover:bg-slate-800/50"
              >
                {columns.map((col) => (
                  <td
                    key={String(col.accessor)}
                    className={
                      col.className ??
                      'whitespace-nowrap px-4 py-3 text-sm text-slate-700 dark:text-slate-300'
                    }
                  >
                    {col.render
                      ? col.render(row[col.accessor], row)
                      : String(row[col.accessor] ?? '')}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}
```

**Step 4: Run test to verify it passes**

Run: `npx jest src/__tests__/components/data-table.test.tsx`
Expected: PASS

**Step 5: Commit**

```bash
git add src/components/ui/data-table.tsx src/__tests__/components/data-table.test.tsx
git commit -m "feat(ui): add DataTable shared component

Built with Epic Flowstate"
```

---

## Task 3: Admin Dashboard Page — Analytics Overview

Replace the admin dashboard placeholder with real stats from the existing analytics API.

**Files:**

- Modify: `src/app/(admin)/admin/page.tsx`
- Uses: `src/db/analytics-queries.ts` (existing — `getOverviewStats`, `getTopDownloads`, `getCategoryBreakdown`)
- Uses: `src/components/ui/stat-card.tsx` (Task 1)

**Step 1: Replace admin dashboard page**

Overwrite `src/app/(admin)/admin/page.tsx`:

```tsx
// Copyright 2026 d7r LLC
// SPDX-License-Identifier: Apache-2.0

import Link from 'next/link'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { getDb } from '@/db'
import {
  getCategoryBreakdown,
  getOverviewStats,
  getTopDownloads,
} from '@/db/analytics-queries'
import { StatCard } from '@/components/ui/stat-card'
import { StatusBadge } from '@/components/ui/status-badge'

export default async function AdminDashboardPage() {
  const { env } = await getCloudflareContext()
  const db = getDb(env.DB)

  const [overview, topDownloads, categories] = await Promise.all([
    getOverviewStats(db),
    getTopDownloads(db, 5),
    getCategoryBreakdown(db),
  ])

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
          Dashboard
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Platform overview
        </p>
      </div>

      {/* Stats grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Listings" value={overview.totalListings} />
        <StatCard label="Published" value={overview.publishedListings} />
        <StatCard label="Total Downloads" value={overview.totalDownloads} />
        <StatCard
          label="By Type"
          value={`${overview.totalTemplates}T / ${overview.totalApps}A / ${overview.totalPlugins}P`}
          description="Templates / Apps / Plugins"
        />
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        {/* Top Downloads */}
        <div>
          <h2 className="mb-4 text-lg font-semibold text-slate-900 dark:text-white">
            Top Downloads
          </h2>
          <div className="rounded-lg border border-slate-200 dark:border-slate-700">
            <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
              <thead className="bg-slate-50 dark:bg-slate-800">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Listing
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Downloads
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white dark:divide-slate-700 dark:bg-slate-900">
                {topDownloads.map((item) => (
                  <tr key={item.id}>
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/listings/${item.id}`}
                        className="text-sm font-medium text-sky-600 hover:text-sky-500 dark:text-sky-400"
                      >
                        {item.label}
                      </Link>
                      <span className="ml-2">
                        <StatusBadge
                          label={item.type}
                          variant={
                            item.type === 'app'
                              ? 'info'
                              : item.type === 'plugin'
                                ? 'warning'
                                : 'neutral'
                          }
                        />
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-slate-700 dark:text-slate-300">
                      {item.downloadCount.toLocaleString()}
                    </td>
                  </tr>
                ))}
                {topDownloads.length === 0 && (
                  <tr>
                    <td
                      colSpan={2}
                      className="px-4 py-8 text-center text-sm text-slate-500"
                    >
                      No download data yet
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Category Breakdown */}
        <div>
          <h2 className="mb-4 text-lg font-semibold text-slate-900 dark:text-white">
            Categories
          </h2>
          <div className="rounded-lg border border-slate-200 dark:border-slate-700">
            <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
              <thead className="bg-slate-50 dark:bg-slate-800">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Category
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Listings
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Downloads
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white dark:divide-slate-700 dark:bg-slate-900">
                {categories.map((cat) => (
                  <tr key={cat.category}>
                    <td className="px-4 py-3 text-sm font-medium text-slate-900 dark:text-white">
                      {cat.category}
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-slate-700 dark:text-slate-300">
                      {cat.listingCount}
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-slate-700 dark:text-slate-300">
                      {cat.totalDownloads.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
```

**Step 2: Run typecheck**

Run: `npx tsc --noEmit`
Expected: No new errors (only the pre-existing `listings.test.ts` error)

**Step 3: Commit**

```bash
git add src/app/\(admin\)/admin/page.tsx
git commit -m "feat(admin): replace dashboard placeholder with analytics overview

Built with Epic Flowstate"
```

---

## Task 4: Admin Listings Page — Data Table with Status Filters

Replace the listings placeholder with a server-rendered data table showing all listings.

**Files:**

- Create: `src/db/listing-queries.ts`
- Test: `src/__tests__/db/listing-queries.test.ts`
- Modify: `src/app/(admin)/admin/listings/page.tsx`

**Step 1: Write listing query tests**

Create `src/__tests__/db/listing-queries.test.ts`:

```ts
import { drizzle } from 'drizzle-orm/better-sqlite3'
import Database from 'better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import * as schema from '@/db/schema'
import { listAllListings, countListings } from '@/db/listing-queries'

function setupDb() {
  const sqlite = new Database(':memory:')
  const db = drizzle(sqlite, { schema })
  migrate(db, { migrationsFolder: './drizzle' })
  return db
}

function seedListing(
  db: ReturnType<typeof setupDb>,
  overrides: Partial<typeof schema.templates.$inferInsert> = {},
) {
  const id = overrides.id ?? `tpl-${Math.random().toString(36).slice(2, 8)}`
  db.insert(schema.templates)
    .values({
      id,
      label: 'Test',
      description: 'A test listing',
      category: 'business',
      status: 'published',
      type: 'template',
      ...overrides,
    })
    .run()
  return id
}

describe('listing-queries', () => {
  describe('listAllListings', () => {
    it('returns all listings sorted by updatedAt desc', async () => {
      const db = setupDb()
      seedListing(db, { id: 'a', label: 'Alpha' })
      seedListing(db, { id: 'b', label: 'Beta' })

      const result = await listAllListings(db, {})
      expect(result).toHaveLength(2)
    })

    it('filters by status', async () => {
      const db = setupDb()
      seedListing(db, { id: 'pub', status: 'published' })
      seedListing(db, { id: 'draft', status: 'draft' })

      const result = await listAllListings(db, { status: 'draft' })
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('draft')
    })

    it('filters by type', async () => {
      const db = setupDb()
      seedListing(db, { id: 'tpl', type: 'template' })
      seedListing(db, { id: 'app1', type: 'app' })

      const result = await listAllListings(db, { type: 'app' })
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('app1')
    })

    it('supports pagination with limit and offset', async () => {
      const db = setupDb()
      for (let i = 0; i < 5; i++) seedListing(db, { id: `item-${i}` })

      const result = await listAllListings(db, { limit: 2, offset: 0 })
      expect(result).toHaveLength(2)
    })
  })

  describe('countListings', () => {
    it('counts all listings', async () => {
      const db = setupDb()
      seedListing(db)
      seedListing(db)

      const result = await countListings(db, {})
      expect(result).toBe(2)
    })

    it('counts with status filter', async () => {
      const db = setupDb()
      seedListing(db, { status: 'published' })
      seedListing(db, { status: 'draft' })
      seedListing(db, { status: 'draft' })

      const result = await countListings(db, { status: 'draft' })
      expect(result).toBe(2)
    })
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npx jest src/__tests__/db/listing-queries.test.ts`
Expected: FAIL — module not found

**Step 3: Write listing queries**

Create `src/db/listing-queries.ts`:

```ts
// Copyright 2026 d7r LLC
// SPDX-License-Identifier: Apache-2.0

import { and, count, desc, eq } from 'drizzle-orm'
import { templates } from './schema'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = any

interface ListingFilters {
  status?: 'draft' | 'published' | 'archived'
  type?: 'template' | 'app' | 'plugin'
  category?: string
  limit?: number
  offset?: number
}

export interface AdminListingRow {
  id: string
  label: string
  category: string
  type: string
  status: string
  downloadCount: number
  pricing: string
  createdAt: string | null
  updatedAt: string | null
}

function buildConditions(filters: ListingFilters) {
  const conditions = []
  if (filters.status) conditions.push(eq(templates.status, filters.status))
  if (filters.type) conditions.push(eq(templates.type, filters.type))
  if (filters.category)
    conditions.push(eq(templates.category, filters.category))
  return conditions.length > 0 ? and(...conditions) : undefined
}

export async function listAllListings(
  db: AnyDb,
  filters: ListingFilters,
): Promise<AdminListingRow[]> {
  let query = db
    .select({
      id: templates.id,
      label: templates.label,
      category: templates.category,
      type: templates.type,
      status: templates.status,
      downloadCount: templates.downloadCount,
      pricing: templates.pricing,
      createdAt: templates.createdAt,
      updatedAt: templates.updatedAt,
    })
    .from(templates)
    .orderBy(desc(templates.updatedAt))

  const where = buildConditions(filters)
  if (where) query = query.where(where)
  if (filters.limit) query = query.limit(filters.limit)
  if (filters.offset) query = query.offset(filters.offset)

  const rows = await query.all()

  return rows.map((row: Record<string, unknown>) => ({
    id: row.id as string,
    label: row.label as string,
    category: row.category as string,
    type: (row.type as string) ?? 'template',
    status: (row.status as string) ?? 'draft',
    downloadCount: (row.downloadCount as number) ?? 0,
    pricing: (row.pricing as string) ?? 'free',
    createdAt: row.createdAt as string | null,
    updatedAt: row.updatedAt as string | null,
  }))
}

export async function countListings(
  db: AnyDb,
  filters: Omit<ListingFilters, 'limit' | 'offset'>,
): Promise<number> {
  let query = db.select({ count: count() }).from(templates)

  const where = buildConditions(filters)
  if (where) query = query.where(where)

  const [result] = await query.all()
  return result.count
}
```

**Step 4: Run test to verify it passes**

Run: `npx jest src/__tests__/db/listing-queries.test.ts`
Expected: PASS

**Step 5: Build the admin listings page**

Overwrite `src/app/(admin)/admin/listings/page.tsx`:

```tsx
// Copyright 2026 d7r LLC
// SPDX-License-Identifier: Apache-2.0

import Link from 'next/link'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { getDb } from '@/db'
import { listAllListings, countListings } from '@/db/listing-queries'
import { StatusBadge } from '@/components/ui/status-badge'

const statusVariant = {
  published: 'success',
  draft: 'warning',
  archived: 'danger',
} as const

const typeVariant = {
  template: 'neutral',
  app: 'info',
  plugin: 'warning',
} as const

export default async function AdminListingsPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string
    type?: string
    page?: string
  }>
}) {
  const params = await searchParams
  const { env } = await getCloudflareContext()
  const db = getDb(env.DB)

  const status = params.status as 'draft' | 'published' | 'archived' | undefined
  const type = params.type as 'template' | 'app' | 'plugin' | undefined
  const page = Math.max(1, parseInt(params.page ?? '1', 10))
  const perPage = 20

  const filters = {
    status: status || undefined,
    type: type || undefined,
    limit: perPage,
    offset: (page - 1) * perPage,
  }

  const [listings, total] = await Promise.all([
    listAllListings(db, filters),
    countListings(db, { status: filters.status, type: filters.type }),
  ])

  const totalPages = Math.ceil(total / perPage)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            Listings
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {total} total listings
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        {(['all', 'published', 'draft', 'archived'] as const).map((s) => (
          <Link
            key={s}
            href={`/admin/listings?status=${s === 'all' ? '' : s}${type ? `&type=${type}` : ''}`}
            className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
              (s === 'all' && !status) || s === status
                ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700'
            }`}
          >
            {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
          </Link>
        ))}
        <span className="mx-2 border-l border-slate-300 dark:border-slate-600" />
        {(['all', 'template', 'app', 'plugin'] as const).map((t) => (
          <Link
            key={t}
            href={`/admin/listings?type=${t === 'all' ? '' : t}${status ? `&status=${status}` : ''}`}
            className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
              (t === 'all' && !type) || t === type
                ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700'
            }`}
          >
            {t === 'all'
              ? 'All Types'
              : t.charAt(0).toUpperCase() + t.slice(1) + 's'}
          </Link>
        ))}
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
        <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
          <thead className="bg-slate-50 dark:bg-slate-800">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Name
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Category
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Type
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Status
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Downloads
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Pricing
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 bg-white dark:divide-slate-700 dark:bg-slate-900">
            {listings.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-12 text-center text-sm text-slate-500"
                >
                  No listings match the current filters
                </td>
              </tr>
            ) : (
              listings.map((listing) => (
                <tr
                  key={listing.id}
                  className="hover:bg-slate-50 dark:hover:bg-slate-800/50"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/listings/${listing.id}`}
                      className="text-sm font-medium text-sky-600 hover:text-sky-500 dark:text-sky-400"
                    >
                      {listing.label}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-700 dark:text-slate-300">
                    {listing.category}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge
                      label={listing.type}
                      variant={
                        typeVariant[listing.type as keyof typeof typeVariant] ??
                        'neutral'
                      }
                    />
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge
                      label={listing.status}
                      variant={
                        statusVariant[
                          listing.status as keyof typeof statusVariant
                        ] ?? 'neutral'
                      }
                    />
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-slate-700 dark:text-slate-300">
                    {listing.downloadCount.toLocaleString()}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge
                      label={listing.pricing}
                      variant={listing.pricing === 'paid' ? 'info' : 'neutral'}
                    />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Page {page} of {totalPages}
          </p>
          <div className="flex gap-2">
            {page > 1 && (
              <Link
                href={`/admin/listings?page=${page - 1}${status ? `&status=${status}` : ''}${type ? `&type=${type}` : ''}`}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800"
              >
                Previous
              </Link>
            )}
            {page < totalPages && (
              <Link
                href={`/admin/listings?page=${page + 1}${status ? `&status=${status}` : ''}${type ? `&type=${type}` : ''}`}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800"
              >
                Next
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
```

**Step 6: Run typecheck**

Run: `npx tsc --noEmit`
Expected: No new errors

**Step 7: Run all tests**

Run: `npx jest`
Expected: All pass

**Step 8: Commit**

```bash
git add src/db/listing-queries.ts src/__tests__/db/listing-queries.test.ts src/app/\(admin\)/admin/listings/page.tsx
git commit -m "feat(admin): add listings page with filters and pagination

Built with Epic Flowstate"
```

---

## Task 5: Admin Listing Detail Page — View & Edit Form

Replace listing detail placeholder with a view/edit page using Server Actions.

**Files:**

- Create: `src/lib/actions/listing-actions.ts`
- Modify: `src/app/(admin)/admin/listings/[id]/page.tsx`

**Step 1: Create listing server actions**

Create `src/lib/actions/listing-actions.ts`:

```ts
// Copyright 2026 d7r LLC
// SPDX-License-Identifier: Apache-2.0

'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { getDb } from '@/db'
import { updateTemplate, deleteTemplate } from '@/db/admin-queries'
import { updateTemplateSchema, parseBody } from '@/lib/validation/schemas'
import { requireAdmin } from '@/lib/admin-auth'
import { CacheKeys, invalidateCacheKeys } from '@/lib/cache/kv'

export async function updateListingAction(id: string, formData: FormData) {
  const result = await requireAdmin()
  if (!result.authorized) throw new Error('Forbidden')

  const db = getDb(result.env.DB)

  const body: Record<string, unknown> = {}
  for (const [key, value] of formData.entries()) {
    if (key === 'featured') {
      body[key] = value === 'on'
    } else if (key === 'tags') {
      body[key] = (value as string)
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
    } else if (key === 'sortOrder') {
      body[key] = parseInt(value as string, 10)
    } else {
      body[key] = value
    }
  }

  const parsed = parseBody(updateTemplateSchema, body)
  if (!parsed.success) {
    throw new Error(
      `Validation failed: ${parsed.errors.map((e) => e.message).join(', ')}`,
    )
  }

  await updateTemplate(db, id, parsed.data)

  await invalidateCacheKeys(result.env.CACHE, [
    CacheKeys.publishedListings(),
    CacheKeys.listingDetail(id),
    CacheKeys.categories(),
    CacheKeys.featuredListings(),
  ])

  revalidatePath(`/admin/listings/${id}`)
  revalidatePath('/admin/listings')
}

export async function deleteListingAction(id: string) {
  const result = await requireAdmin()
  if (!result.authorized) throw new Error('Forbidden')

  const db = getDb(result.env.DB)

  await deleteTemplate(db, id)

  await invalidateCacheKeys(result.env.CACHE, [
    CacheKeys.publishedListings(),
    CacheKeys.listingDetail(id),
    CacheKeys.categories(),
    CacheKeys.featuredListings(),
  ])

  redirect('/admin/listings')
}
```

**Step 2: Build the listing detail page**

Overwrite `src/app/(admin)/admin/listings/[id]/page.tsx`:

```tsx
// Copyright 2026 d7r LLC
// SPDX-License-Identifier: Apache-2.0

import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { getDb } from '@/db'
import { getTemplateById } from '@/db/queries'
import { StatusBadge } from '@/components/ui/status-badge'
import {
  updateListingAction,
  deleteListingAction,
} from '@/lib/actions/listing-actions'

export default async function AdminListingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const { env } = await getCloudflareContext()
  const db = getDb(env.DB)
  const listing = await getTemplateById(db, id)

  if (!listing) notFound()

  const statusVariant = {
    published: 'success',
    draft: 'warning',
    archived: 'danger',
  } as const

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <Link
              href="/admin/listings"
              className="text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
            >
              &larr; Listings
            </Link>
          </div>
          <h1 className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">
            {listing.label}
          </h1>
          <div className="mt-2 flex items-center gap-2">
            <StatusBadge
              label={listing.type}
              variant={
                listing.type === 'app'
                  ? 'info'
                  : listing.type === 'plugin'
                    ? 'warning'
                    : 'neutral'
              }
            />
            <StatusBadge
              label={listing.status ?? 'draft'}
              variant={
                statusVariant[
                  (listing.status ?? 'draft') as keyof typeof statusVariant
                ] ?? 'neutral'
              }
            />
            {listing.pricing && (
              <StatusBadge
                label={listing.pricing}
                variant={listing.pricing === 'paid' ? 'info' : 'neutral'}
              />
            )}
          </div>
        </div>
      </div>

      {/* Edit Form */}
      <form
        action={async (formData: FormData) => {
          'use server'
          await updateListingAction(id, formData)
        }}
        className="space-y-6 rounded-lg border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-800"
      >
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
          Edit Listing
        </h2>

        <div className="grid gap-6 sm:grid-cols-2">
          <div>
            <label
              htmlFor="label"
              className="block text-sm font-medium text-slate-700 dark:text-slate-300"
            >
              Name
            </label>
            <input
              id="label"
              name="label"
              type="text"
              defaultValue={listing.label}
              className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
            />
          </div>
          <div>
            <label
              htmlFor="category"
              className="block text-sm font-medium text-slate-700 dark:text-slate-300"
            >
              Category
            </label>
            <input
              id="category"
              name="category"
              type="text"
              defaultValue={listing.category}
              className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
            />
          </div>
        </div>

        <div>
          <label
            htmlFor="description"
            className="block text-sm font-medium text-slate-700 dark:text-slate-300"
          >
            Description
          </label>
          <textarea
            id="description"
            name="description"
            rows={3}
            defaultValue={listing.description}
            className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
          />
        </div>

        <div className="grid gap-6 sm:grid-cols-3">
          <div>
            <label
              htmlFor="status"
              className="block text-sm font-medium text-slate-700 dark:text-slate-300"
            >
              Status
            </label>
            <select
              id="status"
              name="status"
              defaultValue={listing.status ?? 'draft'}
              className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
            >
              <option value="draft">Draft</option>
              <option value="published">Published</option>
              <option value="archived">Archived</option>
            </select>
          </div>
          <div>
            <label
              htmlFor="sortOrder"
              className="block text-sm font-medium text-slate-700 dark:text-slate-300"
            >
              Sort Order
            </label>
            <input
              id="sortOrder"
              name="sortOrder"
              type="number"
              min={0}
              defaultValue={listing.version ?? 0}
              className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
            />
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                name="featured"
                defaultChecked={listing.featured}
                className="h-4 w-4 rounded border-slate-300 text-sky-500 focus:ring-sky-500"
              />
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Featured
              </span>
            </label>
          </div>
        </div>

        <div>
          <label
            htmlFor="tags"
            className="block text-sm font-medium text-slate-700 dark:text-slate-300"
          >
            Tags (comma-separated)
          </label>
          <input
            id="tags"
            name="tags"
            type="text"
            defaultValue={listing.tags?.join(', ')}
            className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
          />
        </div>

        <div className="flex items-center justify-between border-t border-slate-200 pt-6 dark:border-slate-700">
          <button
            type="submit"
            className="rounded-lg bg-sky-500 px-4 py-2 text-sm font-medium text-white hover:bg-sky-600 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2"
          >
            Save Changes
          </button>
        </div>
      </form>

      {/* Metadata */}
      <div className="rounded-lg border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-800">
        <h2 className="mb-4 text-lg font-semibold text-slate-900 dark:text-white">
          Metadata
        </h2>
        <dl className="grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-sm font-medium text-slate-500 dark:text-slate-400">
              ID
            </dt>
            <dd className="mt-1 font-mono text-sm text-slate-900 dark:text-white">
              {listing.id}
            </dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-slate-500 dark:text-slate-400">
              Downloads
            </dt>
            <dd className="mt-1 text-sm text-slate-900 dark:text-white">
              {(listing.downloadCount ?? 0).toLocaleString()}
            </dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-slate-500 dark:text-slate-400">
              Version
            </dt>
            <dd className="mt-1 text-sm text-slate-900 dark:text-white">
              {listing.version ?? 'N/A'}
            </dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-slate-500 dark:text-slate-400">
              Author
            </dt>
            <dd className="mt-1 text-sm text-slate-900 dark:text-white">
              {listing.author ?? 'N/A'}
            </dd>
          </div>
        </dl>
      </div>

      {/* Danger zone */}
      <div className="rounded-lg border border-red-200 bg-red-50 p-6 dark:border-red-900/50 dark:bg-red-900/10">
        <h2 className="text-lg font-semibold text-red-900 dark:text-red-400">
          Danger Zone
        </h2>
        <p className="mt-1 text-sm text-red-700 dark:text-red-300">
          Permanently delete this listing and all associated data.
        </p>
        <form
          action={async () => {
            'use server'
            await deleteListingAction(id)
          }}
          className="mt-4"
        >
          <button
            type="submit"
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
          >
            Delete Listing
          </button>
        </form>
      </div>
    </div>
  )
}
```

**Step 3: Run typecheck**

Run: `npx tsc --noEmit`
Expected: No new errors

**Step 4: Commit**

```bash
git add src/lib/actions/listing-actions.ts src/app/\(admin\)/admin/listings/\[id\]/page.tsx
git commit -m "feat(admin): add listing detail page with edit form and delete

Built with Epic Flowstate"
```

---

## Task 6: User Management — Query Layer & List Page

**Files:**

- Create: `src/db/user-queries.ts`
- Test: `src/__tests__/db/user-queries.test.ts`
- Modify: `src/app/(admin)/admin/users/page.tsx`

**Step 1: Write user query tests**

Create `src/__tests__/db/user-queries.test.ts`:

```ts
import { drizzle } from 'drizzle-orm/better-sqlite3'
import Database from 'better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import * as schema from '@/db/schema'
import { listUsers, countUsers } from '@/db/user-queries'

function setupDb() {
  const sqlite = new Database(':memory:')
  const db = drizzle(sqlite, { schema })
  migrate(db, { migrationsFolder: './drizzle' })
  return db
}

function seedUser(
  db: ReturnType<typeof setupDb>,
  email: string,
  role: string = 'user',
) {
  const userId = crypto.randomUUID()
  db.insert(schema.users)
    .values({ id: userId, email, name: email.split('@')[0] })
    .run()
  db.insert(schema.profiles)
    .values({
      id: crypto.randomUUID(),
      userId,
      displayName: email.split('@')[0],
      role: role as 'user' | 'developer' | 'admin' | 'super_admin',
    })
    .run()
  return userId
}

describe('user-queries', () => {
  describe('listUsers', () => {
    it('returns users with their profile role', async () => {
      const db = setupDb()
      seedUser(db, 'alice@test.com', 'admin')
      seedUser(db, 'bob@test.com', 'user')

      const users = await listUsers(db, {})
      expect(users).toHaveLength(2)
      expect(users.find((u) => u.email === 'alice@test.com')?.role).toBe(
        'admin',
      )
    })

    it('filters by role', async () => {
      const db = setupDb()
      seedUser(db, 'admin@test.com', 'admin')
      seedUser(db, 'user@test.com', 'user')

      const users = await listUsers(db, { role: 'admin' })
      expect(users).toHaveLength(1)
      expect(users[0].email).toBe('admin@test.com')
    })

    it('supports pagination', async () => {
      const db = setupDb()
      for (let i = 0; i < 5; i++) seedUser(db, `user${i}@test.com`)

      const page1 = await listUsers(db, { limit: 2, offset: 0 })
      expect(page1).toHaveLength(2)
    })
  })

  describe('countUsers', () => {
    it('counts total users', async () => {
      const db = setupDb()
      seedUser(db, 'a@test.com')
      seedUser(db, 'b@test.com')

      const result = await countUsers(db, {})
      expect(result).toBe(2)
    })
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npx jest src/__tests__/db/user-queries.test.ts`
Expected: FAIL

**Step 3: Write user queries**

Create `src/db/user-queries.ts`:

```ts
// Copyright 2026 d7r LLC
// SPDX-License-Identifier: Apache-2.0

import { count, desc, eq } from 'drizzle-orm'
import { profiles, users } from './schema'
import type { ProfileRole } from './schema'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = any

interface UserFilters {
  role?: ProfileRole
  limit?: number
  offset?: number
}

export interface AdminUserRow {
  id: string
  email: string
  name: string | null
  role: ProfileRole
  status: string
  createdAt: string | null
}

export async function listUsers(
  db: AnyDb,
  filters: UserFilters,
): Promise<AdminUserRow[]> {
  let query = db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: profiles.role,
      status: profiles.status,
      createdAt: profiles.createdAt,
    })
    .from(users)
    .leftJoin(profiles, eq(profiles.userId, users.id))
    .orderBy(desc(profiles.createdAt))

  if (filters.role) query = query.where(eq(profiles.role, filters.role))
  if (filters.limit) query = query.limit(filters.limit)
  if (filters.offset) query = query.offset(filters.offset)

  const rows = await query.all()

  return rows.map((row: Record<string, unknown>) => ({
    id: row.id as string,
    email: row.email as string,
    name: row.name as string | null,
    role: (row.role as ProfileRole) ?? 'user',
    status: (row.status as string) ?? 'active',
    createdAt: row.createdAt as string | null,
  }))
}

export async function countUsers(
  db: AnyDb,
  filters: Omit<UserFilters, 'limit' | 'offset'>,
): Promise<number> {
  let query = db
    .select({ count: count() })
    .from(users)
    .leftJoin(profiles, eq(profiles.userId, users.id))

  if (filters.role) query = query.where(eq(profiles.role, filters.role))

  const [result] = await query.all()
  return result.count
}
```

**Step 4: Run test to verify it passes**

Run: `npx jest src/__tests__/db/user-queries.test.ts`
Expected: PASS

**Step 5: Build the admin users page**

Overwrite `src/app/(admin)/admin/users/page.tsx`:

```tsx
// Copyright 2026 d7r LLC
// SPDX-License-Identifier: Apache-2.0

import Link from 'next/link'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { getDb } from '@/db'
import { listUsers, countUsers } from '@/db/user-queries'
import { StatusBadge } from '@/components/ui/status-badge'
import type { ProfileRole } from '@/db/schema'

const roleVariant: Record<
  ProfileRole,
  'danger' | 'warning' | 'info' | 'neutral'
> = {
  super_admin: 'danger',
  admin: 'warning',
  developer: 'info',
  user: 'neutral',
}

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string; page?: string }>
}) {
  const params = await searchParams
  const { env } = await getCloudflareContext()
  const db = getDb(env.DB)

  const role = params.role as ProfileRole | undefined
  const page = Math.max(1, parseInt(params.page ?? '1', 10))
  const perPage = 20

  const [userList, total] = await Promise.all([
    listUsers(db, {
      role: role || undefined,
      limit: perPage,
      offset: (page - 1) * perPage,
    }),
    countUsers(db, { role: role || undefined }),
  ])

  const totalPages = Math.ceil(total / perPage)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
          Users
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {total} total users
        </p>
      </div>

      {/* Role filters */}
      <div className="flex flex-wrap gap-2">
        {(['all', 'user', 'developer', 'admin', 'super_admin'] as const).map(
          (r) => (
            <Link
              key={r}
              href={`/admin/users${r === 'all' ? '' : `?role=${r}`}`}
              className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
                (r === 'all' && !role) || r === role
                  ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700'
              }`}
            >
              {r === 'all'
                ? 'All'
                : r === 'super_admin'
                  ? 'Super Admin'
                  : r.charAt(0).toUpperCase() + r.slice(1)}
            </Link>
          ),
        )}
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
        <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
          <thead className="bg-slate-50 dark:bg-slate-800">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
                User
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Email
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Role
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Status
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Joined
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 bg-white dark:divide-slate-700 dark:bg-slate-900">
            {userList.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-12 text-center text-sm text-slate-500"
                >
                  No users found
                </td>
              </tr>
            ) : (
              userList.map((user) => (
                <tr
                  key={user.id}
                  className="hover:bg-slate-50 dark:hover:bg-slate-800/50"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/users/${user.id}`}
                      className="text-sm font-medium text-sky-600 hover:text-sky-500 dark:text-sky-400"
                    >
                      {user.name ?? 'No name'}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-700 dark:text-slate-300">
                    {user.email}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge
                      label={user.role}
                      variant={roleVariant[user.role]}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge
                      label={user.status}
                      variant={
                        user.status === 'active'
                          ? 'success'
                          : user.status === 'suspended'
                            ? 'danger'
                            : 'neutral'
                      }
                    />
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400">
                    {user.createdAt
                      ? new Date(user.createdAt).toLocaleDateString()
                      : 'N/A'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Page {page} of {totalPages}
          </p>
          <div className="flex gap-2">
            {page > 1 && (
              <Link
                href={`/admin/users?page=${page - 1}${role ? `&role=${role}` : ''}`}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800"
              >
                Previous
              </Link>
            )}
            {page < totalPages && (
              <Link
                href={`/admin/users?page=${page + 1}${role ? `&role=${role}` : ''}`}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800"
              >
                Next
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
```

**Step 6: Run all tests**

Run: `npx jest`
Expected: PASS

**Step 7: Commit**

```bash
git add src/db/user-queries.ts src/__tests__/db/user-queries.test.ts src/app/\(admin\)/admin/users/page.tsx
git commit -m "feat(admin): add user management page with role filters

Built with Epic Flowstate"
```

---

## Task 7: User Detail Page — Profile View & Role Management

**Files:**

- Create: `src/lib/actions/user-actions.ts`
- Modify: `src/app/(admin)/admin/users/[id]/page.tsx`

**Step 1: Create user server actions**

Create `src/lib/actions/user-actions.ts`:

```ts
// Copyright 2026 d7r LLC
// SPDX-License-Identifier: Apache-2.0

'use server'

import { revalidatePath } from 'next/cache'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import * as schema from '@/db/schema'
import { requireSuperAdmin } from '@/lib/admin-auth'
import type { ProfileRole } from '@/db/schema'

export async function updateUserRoleAction(userId: string, formData: FormData) {
  const result = await requireSuperAdmin()
  if (!result.authorized) throw new Error('Forbidden — super_admin required')

  const newRole = formData.get('role') as ProfileRole
  if (!schema.profileRoles.includes(newRole)) {
    throw new Error(`Invalid role: ${newRole}`)
  }

  const db = drizzle(result.env.DB, { schema })

  await db
    .update(schema.profiles)
    .set({ role: newRole, updatedAt: new Date().toISOString() })
    .where(eq(schema.profiles.userId, userId))
    .run()

  revalidatePath(`/admin/users/${userId}`)
  revalidatePath('/admin/users')
}

export async function updateUserStatusAction(
  userId: string,
  formData: FormData,
) {
  const result = await requireAdmin()
  if (!result.authorized) throw new Error('Forbidden')

  const newStatus = formData.get('status') as
    | 'active'
    | 'inactive'
    | 'suspended'
  if (!schema.profileStatuses.includes(newStatus)) {
    throw new Error(`Invalid status: ${newStatus}`)
  }

  const db = drizzle(result.env.DB, { schema })

  await db
    .update(schema.profiles)
    .set({ status: newStatus, updatedAt: new Date().toISOString() })
    .where(eq(schema.profiles.userId, userId))
    .run()

  revalidatePath(`/admin/users/${userId}`)
  revalidatePath('/admin/users')
}
```

**Important fix needed:** The `updateUserStatusAction` imports `requireAdmin` but the import is missing. Add at the top:

```ts
import { requireAdmin, requireSuperAdmin } from '@/lib/admin-auth'
```

(Replace the single `requireSuperAdmin` import.)

**Step 2: Build the user detail page**

Overwrite `src/app/(admin)/admin/users/[id]/page.tsx`:

```tsx
// Copyright 2026 d7r LLC
// SPDX-License-Identifier: Apache-2.0

import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import * as schema from '@/db/schema'
import { StatusBadge } from '@/components/ui/status-badge'
import {
  updateUserRoleAction,
  updateUserStatusAction,
} from '@/lib/actions/user-actions'
import type { ProfileRole } from '@/db/schema'

const roleVariant: Record<
  ProfileRole,
  'danger' | 'warning' | 'info' | 'neutral'
> = {
  super_admin: 'danger',
  admin: 'warning',
  developer: 'info',
  user: 'neutral',
}

export default async function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const { env } = await getCloudflareContext()
  const db = drizzle(env.DB, { schema })

  const user = await db.query.users.findFirst({
    where: eq(schema.users.id, id),
  })
  if (!user) notFound()

  const profile = await db.query.profiles.findFirst({
    where: eq(schema.profiles.userId, id),
  })

  const role: ProfileRole = profile?.role ?? 'user'
  const status = profile?.status ?? 'active'

  return (
    <div className="space-y-8">
      <div>
        <Link
          href="/admin/users"
          className="text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
        >
          &larr; Users
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">
          {user.name ?? user.email}
        </h1>
        <div className="mt-2 flex items-center gap-2">
          <StatusBadge label={role} variant={roleVariant[role]} />
          <StatusBadge
            label={status}
            variant={
              status === 'active'
                ? 'success'
                : status === 'suspended'
                  ? 'danger'
                  : 'neutral'
            }
          />
        </div>
      </div>

      {/* User Info */}
      <div className="rounded-lg border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-800">
        <h2 className="mb-4 text-lg font-semibold text-slate-900 dark:text-white">
          Profile
        </h2>
        <dl className="grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-sm font-medium text-slate-500 dark:text-slate-400">
              Email
            </dt>
            <dd className="mt-1 text-sm text-slate-900 dark:text-white">
              {user.email}
            </dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-slate-500 dark:text-slate-400">
              Name
            </dt>
            <dd className="mt-1 text-sm text-slate-900 dark:text-white">
              {user.name ?? 'Not set'}
            </dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-slate-500 dark:text-slate-400">
              Display Name
            </dt>
            <dd className="mt-1 text-sm text-slate-900 dark:text-white">
              {profile?.displayName ?? 'Not set'}
            </dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-slate-500 dark:text-slate-400">
              Username
            </dt>
            <dd className="mt-1 text-sm text-slate-900 dark:text-white">
              {profile?.username ?? 'Not set'}
            </dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-slate-500 dark:text-slate-400">
              Company
            </dt>
            <dd className="mt-1 text-sm text-slate-900 dark:text-white">
              {profile?.company ?? 'Not set'}
            </dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-slate-500 dark:text-slate-400">
              Joined
            </dt>
            <dd className="mt-1 text-sm text-slate-900 dark:text-white">
              {profile?.createdAt
                ? new Date(profile.createdAt).toLocaleDateString()
                : 'N/A'}
            </dd>
          </div>
        </dl>
      </div>

      {/* Role Management */}
      <div className="rounded-lg border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-800">
        <h2 className="mb-4 text-lg font-semibold text-slate-900 dark:text-white">
          Role Management
        </h2>
        <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
          Only super admins can change user roles.
        </p>
        <form
          action={async (formData: FormData) => {
            'use server'
            await updateUserRoleAction(id, formData)
          }}
          className="flex items-end gap-4"
        >
          <div>
            <label
              htmlFor="role"
              className="block text-sm font-medium text-slate-700 dark:text-slate-300"
            >
              Role
            </label>
            <select
              id="role"
              name="role"
              defaultValue={role}
              className="mt-1 block rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
            >
              <option value="user">User</option>
              <option value="developer">Developer</option>
              <option value="admin">Admin</option>
              <option value="super_admin">Super Admin</option>
            </select>
          </div>
          <button
            type="submit"
            className="rounded-lg bg-sky-500 px-4 py-2 text-sm font-medium text-white hover:bg-sky-600 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2"
          >
            Update Role
          </button>
        </form>
      </div>

      {/* Status Management */}
      <div className="rounded-lg border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-800">
        <h2 className="mb-4 text-lg font-semibold text-slate-900 dark:text-white">
          Account Status
        </h2>
        <form
          action={async (formData: FormData) => {
            'use server'
            await updateUserStatusAction(id, formData)
          }}
          className="flex items-end gap-4"
        >
          <div>
            <label
              htmlFor="status"
              className="block text-sm font-medium text-slate-700 dark:text-slate-300"
            >
              Status
            </label>
            <select
              id="status"
              name="status"
              defaultValue={status}
              className="mt-1 block rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="suspended">Suspended</option>
            </select>
          </div>
          <button
            type="submit"
            className="rounded-lg bg-sky-500 px-4 py-2 text-sm font-medium text-white hover:bg-sky-600 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2"
          >
            Update Status
          </button>
        </form>
      </div>
    </div>
  )
}
```

**Step 3: Run typecheck**

Run: `npx tsc --noEmit`
Expected: No new errors

**Step 4: Commit**

```bash
git add src/lib/actions/user-actions.ts src/app/\(admin\)/admin/users/\[id\]/page.tsx
git commit -m "feat(admin): add user detail page with role and status management

Built with Epic Flowstate"
```

---

## Task 8: Review Moderation Page

**Files:**

- Create: `src/db/review-queries.ts`
- Test: `src/__tests__/db/review-queries.test.ts`
- Create: `src/lib/actions/review-actions.ts`
- Modify: `src/app/(admin)/admin/reviews/page.tsx`

**Step 1: Write review query tests**

Create `src/__tests__/db/review-queries.test.ts`:

```ts
import { drizzle } from 'drizzle-orm/better-sqlite3'
import Database from 'better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import * as schema from '@/db/schema'
import { listReviews, countReviews } from '@/db/review-queries'

function setupDb() {
  const sqlite = new Database(':memory:')
  const db = drizzle(sqlite, { schema })
  migrate(db, { migrationsFolder: './drizzle' })
  return db
}

function seedReview(
  db: ReturnType<typeof setupDb>,
  overrides: { status?: string; rating?: number } = {},
) {
  const userId = crypto.randomUUID()
  db.insert(schema.users)
    .values({ id: userId, email: `${userId.slice(0, 8)}@test.com` })
    .run()

  const listingId = `tpl-${Math.random().toString(36).slice(2, 8)}`
  db.insert(schema.templates)
    .values({
      id: listingId,
      label: 'Test',
      description: 'Test',
      category: 'biz',
      status: 'published',
    })
    .run()

  const reviewId = crypto.randomUUID()
  db.insert(schema.reviews)
    .values({
      id: reviewId,
      listingId,
      userId,
      rating: overrides.rating ?? 4,
      title: 'Great',
      body: 'Works well',
      status: (overrides.status ?? 'pending') as
        | 'pending'
        | 'approved'
        | 'flagged'
        | 'removed',
    })
    .run()
  return reviewId
}

describe('review-queries', () => {
  it('lists reviews with user and listing info', async () => {
    const db = setupDb()
    seedReview(db)
    const reviews = await listReviews(db, {})
    expect(reviews).toHaveLength(1)
    expect(reviews[0].rating).toBe(4)
  })

  it('filters by status', async () => {
    const db = setupDb()
    seedReview(db, { status: 'pending' })
    seedReview(db, { status: 'approved' })

    const pending = await listReviews(db, { status: 'pending' })
    expect(pending).toHaveLength(1)
  })

  it('counts reviews', async () => {
    const db = setupDb()
    seedReview(db)
    seedReview(db)
    const total = await countReviews(db, {})
    expect(total).toBe(2)
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npx jest src/__tests__/db/review-queries.test.ts`
Expected: FAIL

**Step 3: Write review queries**

Create `src/db/review-queries.ts`:

```ts
// Copyright 2026 d7r LLC
// SPDX-License-Identifier: Apache-2.0

import { and, count, desc, eq } from 'drizzle-orm'
import { reviews, templates, users } from './schema'
import type { ReviewStatus } from './schema'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = any

interface ReviewFilters {
  status?: ReviewStatus
  limit?: number
  offset?: number
}

export interface AdminReviewRow {
  id: string
  rating: number
  title: string | null
  body: string | null
  status: ReviewStatus
  userEmail: string | null
  listingLabel: string | null
  listingId: string
  createdAt: string | null
}

export async function listReviews(
  db: AnyDb,
  filters: ReviewFilters,
): Promise<AdminReviewRow[]> {
  let query = db
    .select({
      id: reviews.id,
      rating: reviews.rating,
      title: reviews.title,
      body: reviews.body,
      status: reviews.status,
      userEmail: users.email,
      listingLabel: templates.label,
      listingId: reviews.listingId,
      createdAt: reviews.createdAt,
    })
    .from(reviews)
    .leftJoin(users, eq(users.id, reviews.userId))
    .leftJoin(templates, eq(templates.id, reviews.listingId))
    .orderBy(desc(reviews.createdAt))

  if (filters.status) query = query.where(eq(reviews.status, filters.status))
  if (filters.limit) query = query.limit(filters.limit)
  if (filters.offset) query = query.offset(filters.offset)

  const rows = await query.all()

  return rows.map((row: Record<string, unknown>) => ({
    id: row.id as string,
    rating: row.rating as number,
    title: row.title as string | null,
    body: row.body as string | null,
    status: (row.status as ReviewStatus) ?? 'pending',
    userEmail: row.userEmail as string | null,
    listingLabel: row.listingLabel as string | null,
    listingId: row.listingId as string,
    createdAt: row.createdAt as string | null,
  }))
}

export async function countReviews(
  db: AnyDb,
  filters: Omit<ReviewFilters, 'limit' | 'offset'>,
): Promise<number> {
  let query = db.select({ count: count() }).from(reviews)
  if (filters.status) query = query.where(eq(reviews.status, filters.status))
  const [result] = await query.all()
  return result.count
}
```

**Step 4: Run test to verify it passes**

Run: `npx jest src/__tests__/db/review-queries.test.ts`
Expected: PASS

**Step 5: Create review server actions**

Create `src/lib/actions/review-actions.ts`:

```ts
// Copyright 2026 d7r LLC
// SPDX-License-Identifier: Apache-2.0

'use server'

import { revalidatePath } from 'next/cache'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import * as schema from '@/db/schema'
import { requireAdmin } from '@/lib/admin-auth'
import type { ReviewStatus } from '@/db/schema'

export async function updateReviewStatusAction(
  reviewId: string,
  formData: FormData,
) {
  const result = await requireAdmin()
  if (!result.authorized) throw new Error('Forbidden')

  const newStatus = formData.get('status') as ReviewStatus
  if (!schema.reviewStatuses.includes(newStatus)) {
    throw new Error(`Invalid status: ${newStatus}`)
  }

  const db = drizzle(result.env.DB, { schema })

  await db
    .update(schema.reviews)
    .set({ status: newStatus, updatedAt: new Date().toISOString() })
    .where(eq(schema.reviews.id, reviewId))
    .run()

  revalidatePath('/admin/reviews')
}
```

**Step 6: Build the reviews page**

Overwrite `src/app/(admin)/admin/reviews/page.tsx`:

```tsx
// Copyright 2026 d7r LLC
// SPDX-License-Identifier: Apache-2.0

import Link from 'next/link'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { getDb } from '@/db'
import { listReviews, countReviews } from '@/db/review-queries'
import { StatusBadge } from '@/components/ui/status-badge'
import { updateReviewStatusAction } from '@/lib/actions/review-actions'
import type { ReviewStatus } from '@/db/schema'

const statusVariant: Record<
  ReviewStatus,
  'warning' | 'success' | 'danger' | 'neutral'
> = {
  pending: 'warning',
  approved: 'success',
  flagged: 'danger',
  removed: 'neutral',
}

function StarRating({ rating }: { rating: number }) {
  return (
    <span className="text-amber-500" aria-label={`${rating} out of 5 stars`}>
      {'★'.repeat(rating)}
      {'☆'.repeat(5 - rating)}
    </span>
  )
}

export default async function AdminReviewsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>
}) {
  const params = await searchParams
  const { env } = await getCloudflareContext()
  const db = getDb(env.DB)

  const status = params.status as ReviewStatus | undefined
  const page = Math.max(1, parseInt(params.page ?? '1', 10))
  const perPage = 20

  const [reviewList, total] = await Promise.all([
    listReviews(db, {
      status: status || undefined,
      limit: perPage,
      offset: (page - 1) * perPage,
    }),
    countReviews(db, { status: status || undefined }),
  ])

  const totalPages = Math.ceil(total / perPage)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
          Reviews
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {total} total reviews
        </p>
      </div>

      {/* Status filters */}
      <div className="flex flex-wrap gap-2">
        {(['all', 'pending', 'approved', 'flagged', 'removed'] as const).map(
          (s) => (
            <Link
              key={s}
              href={`/admin/reviews${s === 'all' ? '' : `?status=${s}`}`}
              className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
                (s === 'all' && !status) || s === status
                  ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700'
              }`}
            >
              {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
            </Link>
          ),
        )}
      </div>

      {/* Reviews list */}
      <div className="space-y-4">
        {reviewList.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 px-8 py-12 text-center dark:border-slate-700">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              No reviews match the current filters
            </p>
          </div>
        ) : (
          reviewList.map((review) => (
            <div
              key={review.id}
              className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800"
            >
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <StarRating rating={review.rating} />
                    <StatusBadge
                      label={review.status}
                      variant={statusVariant[review.status]}
                    />
                  </div>
                  {review.title && (
                    <p className="font-medium text-slate-900 dark:text-white">
                      {review.title}
                    </p>
                  )}
                  {review.body && (
                    <p className="text-sm text-slate-600 dark:text-slate-400">
                      {review.body}
                    </p>
                  )}
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    by {review.userEmail ?? 'Unknown'} on{' '}
                    <Link
                      href={`/admin/listings/${review.listingId}`}
                      className="text-sky-600 hover:text-sky-500 dark:text-sky-400"
                    >
                      {review.listingLabel ?? review.listingId}
                    </Link>
                    {review.createdAt &&
                      ` — ${new Date(review.createdAt).toLocaleDateString()}`}
                  </p>
                </div>

                {/* Moderation actions */}
                <form
                  action={async (formData: FormData) => {
                    'use server'
                    await updateReviewStatusAction(review.id, formData)
                  }}
                  className="flex items-center gap-2"
                >
                  <select
                    name="status"
                    defaultValue={review.status}
                    className="rounded-lg border border-slate-300 px-2 py-1 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
                  >
                    <option value="pending">Pending</option>
                    <option value="approved">Approved</option>
                    <option value="flagged">Flagged</option>
                    <option value="removed">Removed</option>
                  </select>
                  <button
                    type="submit"
                    className="rounded-lg bg-sky-500 px-3 py-1 text-sm font-medium text-white hover:bg-sky-600"
                  >
                    Update
                  </button>
                </form>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Page {page} of {totalPages}
          </p>
          <div className="flex gap-2">
            {page > 1 && (
              <Link
                href={`/admin/reviews?page=${page - 1}${status ? `&status=${status}` : ''}`}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800"
              >
                Previous
              </Link>
            )}
            {page < totalPages && (
              <Link
                href={`/admin/reviews?page=${page + 1}${status ? `&status=${status}` : ''}`}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800"
              >
                Next
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
```

**Step 7: Run all tests**

Run: `npx jest`
Expected: PASS

**Step 8: Run typecheck**

Run: `npx tsc --noEmit`
Expected: No new errors

**Step 9: Commit**

```bash
git add src/db/review-queries.ts src/__tests__/db/review-queries.test.ts src/lib/actions/review-actions.ts src/app/\(admin\)/admin/reviews/page.tsx
git commit -m "feat(admin): add review moderation page with status management

Built with Epic Flowstate"
```

---

## Task 9: End-to-End Verification

**Step 1: Run full test suite**

Run: `npx jest`
Expected: All tests pass (original 61 + new query tests)

**Step 2: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: No new errors

**Step 3: Verify all new files exist**

Verify these files were created:

- `src/components/ui/stat-card.tsx`
- `src/components/ui/status-badge.tsx`
- `src/components/ui/data-table.tsx`
- `src/db/listing-queries.ts`
- `src/db/user-queries.ts`
- `src/db/review-queries.ts`
- `src/lib/actions/listing-actions.ts`
- `src/lib/actions/user-actions.ts`
- `src/lib/actions/review-actions.ts`

Verify these placeholder pages were replaced:

- `src/app/(admin)/admin/page.tsx` — now has real analytics
- `src/app/(admin)/admin/listings/page.tsx` — data table with filters
- `src/app/(admin)/admin/listings/[id]/page.tsx` — edit form
- `src/app/(admin)/admin/users/page.tsx` — user list with role filters
- `src/app/(admin)/admin/users/[id]/page.tsx` — role/status management
- `src/app/(admin)/admin/reviews/page.tsx` — moderation queue

**Step 4: Commit any remaining files**

```bash
git status
# If anything unstaged, add and commit
```

---

## Summary of Changes

| Task | What                              | Files Created                | Files Modified             |
| ---- | --------------------------------- | ---------------------------- | -------------------------- |
| 1    | StatCard + StatusBadge components | 4 (2 src + 2 test)           | 0                          |
| 2    | DataTable component               | 2 (1 src + 1 test)           | 0                          |
| 3    | Admin Dashboard (analytics)       | 0                            | 1 (admin/page.tsx)         |
| 4    | Admin Listings page               | 2 (queries + test)           | 1 (listings/page.tsx)      |
| 5    | Admin Listing Detail page         | 1 (actions)                  | 1 (listings/[id]/page.tsx) |
| 6    | Admin Users page                  | 2 (queries + test)           | 1 (users/page.tsx)         |
| 7    | Admin User Detail page            | 1 (actions)                  | 1 (users/[id]/page.tsx)    |
| 8    | Admin Reviews page                | 3 (queries + test + actions) | 1 (reviews/page.tsx)       |
| 9    | End-to-end verification           | 0                            | 0                          |

**Total:** 15 new files, 6 modified files, 9 tasks
