# SAGA Directory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the SAGA Official Directory — a Next.js app on Cloudflare Workers for browsing, registering, and managing SAGA agents/orgs with wallet auth and transfer protocol UI.

**Architecture:** Deep fork of FlowState Directory (`/Users/sthornock/code/epic/flowstate-platform/packages/directory`), replacing OIDC auth with wallet-based auth (ported from `flowstate-platform/packages/id`), replacing local D1 queries with SAGA server API calls via `@epicdm/saga-client`, and adding transfer protocol UI. The directory is a thin frontend — all agent/org data lives on the SAGA server.

**Tech Stack:** Next.js 15, React 19, Tailwind CSS v4, Cloudflare Workers (OpenNextJS), KV (sessions), `@epicdm/saga-client`, viem, WalletConnect

**Spec:** `docs/superpowers/specs/2026-03-25-saga-directory-design.md`

**Source Repos:**

- FlowState Directory: `/Users/sthornock/code/epic/flowstate-platform/packages/directory`
- FlowState Identity (wallet auth): `/Users/sthornock/code/epic/flowstate-platform/packages/id`
- FlowState Chrome (UI components): `/Users/sthornock/code/epic/flowstate-platform/packages/shared/chrome`
- SAGA Standard: `/Users/sthornock/code/epic/saga-standard`

---

## File Structure

```
packages/directory/
├── package.json
├── next.config.mjs
├── open-next.config.ts
├── tsconfig.json
├── wrangler.jsonc
├── src/
│   ├── middleware.ts                          # Auth middleware (session check)
│   ├── env.d.ts                              # Cloudflare env type declarations
│   ├── styles/
│   │   └── tailwind.css                      # Tailwind imports + theme
│   ├── app/
│   │   ├── layout.tsx                        # Root layout (session, fonts, providers)
│   │   ├── providers.tsx                     # Theme provider wrapper
│   │   ├── page.tsx                          # Landing page
│   │   ├── not-found.tsx                     # 404 page
│   │   ├── robots.ts                         # SEO robots
│   │   ├── sitemap.ts                        # SEO sitemap
│   │   ├── agents/
│   │   │   └── page.tsx                      # Browse agents
│   │   ├── orgs/
│   │   │   └── page.tsx                      # Browse orgs
│   │   ├── a/[handle]/
│   │   │   └── page.tsx                      # Agent profile
│   │   ├── o/[handle]/
│   │   │   └── page.tsx                      # Org profile
│   │   ├── connect/
│   │   │   └── page.tsx                      # Wallet connect page
│   │   ├── api/
│   │   │   ├── auth/
│   │   │   │   ├── challenge/route.ts        # Proxy to SAGA /v1/auth/challenge
│   │   │   │   ├── verify/route.ts           # Proxy to SAGA /v1/auth/verify + create session
│   │   │   │   └── logout/route.ts           # Clear session
│   │   │   ├── agents/route.ts               # Proxy to SAGA /v1/agents (POST = register)
│   │   │   ├── documents/
│   │   │   │   ├── route.ts                  # Upload document
│   │   │   │   └── [documentId]/route.ts     # Get/delete document
│   │   │   ├── transfers/
│   │   │   │   ├── route.ts                  # Initiate transfer
│   │   │   │   └── [transferId]/
│   │   │   │       └── consent/route.ts      # Consent to transfer
│   │   │   └── health/route.ts               # Health check
│   │   └── dashboard/
│   │       ├── layout.tsx                    # Dashboard layout with nav
│   │       ├── page.tsx                      # Redirect to /dashboard/profile
│   │       ├── profile/
│   │       │   └── page.tsx                  # Agent profile + document management
│   │       ├── register/
│   │       │   └── page.tsx                  # Register new agent
│   │       └── transfers/
│   │           ├── page.tsx                  # Transfer list
│   │           └── new/
│   │               └── page.tsx              # Initiate transfer
│   ├── components/
│   │   ├── Layout.tsx                        # Site layout (header, nav, footer)
│   │   ├── cards/
│   │   │   ├── agent-card.tsx                # Agent summary card
│   │   │   └── org-card.tsx                  # Org summary card
│   │   ├── browse/
│   │   │   ├── search-input.tsx              # Search input with URL params
│   │   │   ├── pagination.tsx                # Page navigation
│   │   │   └── empty-state.tsx               # Empty results message
│   │   ├── agent-profile/
│   │   │   ├── profile-hero.tsx              # Agent identity header
│   │   │   └── profile-details.tsx           # NFT identity, document info
│   │   ├── org-profile/
│   │   │   └── org-hero.tsx                  # Org identity header
│   │   ├── wallet/
│   │   │   └── WalletLoginSection.tsx        # Wallet connect UI
│   │   ├── dashboard/
│   │   │   ├── dashboard-nav.tsx             # Dashboard sidebar nav
│   │   │   ├── register-form.tsx             # Agent registration form
│   │   │   ├── document-upload.tsx           # Document upload component
│   │   │   ├── document-list.tsx             # Document list table
│   │   │   ├── transfer-list.tsx             # Transfer list table
│   │   │   └── transfer-initiate-form.tsx    # Transfer initiation form
│   │   ├── badges/
│   │   │   ├── chain-badge.tsx               # Chain identifier badge
│   │   │   └── wallet-address.tsx            # Truncated wallet + copy
│   │   └── landing/
│   │       ├── hero-section.tsx              # Landing hero
│   │       └── recent-agents.tsx             # Recent agents grid
│   ├── lib/
│   │   ├── saga-client.ts                    # Singleton SAGA client factory
│   │   ├── session/
│   │   │   ├── constants.ts                  # Session cookie name, types
│   │   │   └── server.ts                     # KV session helpers (get/create/delete)
│   │   ├── wallet/
│   │   │   ├── evm.ts                        # EIP-6963 wallet discovery + sign
│   │   │   ├── solana.ts                     # Phantom wallet + sign
│   │   │   └── walletconnect.ts              # WalletConnect provider + sign
│   │   └── types.ts                          # Shared UI types
│   └── hooks/
│       ├── useWalletLogin.ts                 # Wallet login orchestration
│       └── useEIP6963Discovery.ts            # Wallet detection
├── fonts/
│   ├── MavenPro.woff2                        # Copied from chrome
│   └── Comfortaa.woff2                       # Copied from chrome
```

---

## Task 1: Copy FlowState Directory and Strip Unwanted Files

**Files:**

- Create: `packages/directory/` (bulk copy from FlowState)
- Delete: Multiple directories and files listed below

- [ ] **Step 1: Copy the FlowState directory package into saga-standard**

```bash
cp -r /Users/sthornock/code/epic/flowstate-platform/packages/directory /Users/sthornock/code/epic/saga-standard/packages/directory
```

- [ ] **Step 2: Remove unwanted directories and files**

```bash
cd /Users/sthornock/code/epic/saga-standard/packages/directory

# Database layer (replaced by SAGA API)
rm -rf src/db
rm -rf drizzle

# OIDC auth (replaced by wallet auth)
rm -rf src/lib/oidc
rm -rf src/app/auth

# Payment system
rm -rf src/lib/payment

# FlowState-specific auth helpers
rm -rf src/lib/auth

# MCP endpoint
rm -rf src/app/api/mcp

# Payment webhooks
rm -rf src/app/api/webhooks

# Payment-based registration
rm -rf src/app/api/register

# Work history
rm -rf src/app/api/work-history

# Cron jobs
rm -rf src/app/api/cron

# Company management dashboard
rm -rf src/app/dashboard/company

# Work history components
rm -rf src/components/dashboard/work-history-form.tsx
rm -rf src/components/dashboard/work-history-section.tsx

# Company-specific components
rm -rf src/components/company-profile
rm -rf src/components/browse/company-filter-panel.tsx

# SAGA export helper (uses local DB)
rm -rf src/lib/saga

# Registration guard/status (payment-specific)
rm -f src/lib/registration-guard.ts
rm -f src/lib/registration-status.ts

# Existing tests (will rewrite)
rm -rf src/__tests__

# OG image generators (depend on DB)
rm -f src/app/a/[handle]/opengraph-image.tsx
rm -f src/app/c/[slug]/opengraph-image.tsx

# Companies browse page (replacing with orgs)
rm -rf src/app/companies

# Company profile pages (replacing with org)
rm -rf src/app/c

# Node modules and build artifacts
rm -rf node_modules .next .open-next
```

- [ ] **Step 3: Verify remaining structure is clean**

```bash
find src -name "*.ts" -o -name "*.tsx" | head -50
```

Expected: Only files we intend to keep/modify remain (layout, middleware, browse, dashboard, components, styles).

- [ ] **Step 4: Commit the initial fork**

```bash
git add packages/directory
git commit -m "chore(directory): fork FlowState directory as SAGA directory base

Initial copy with FlowState-specific code stripped:
- Removed DB layer, OIDC auth, payment, MCP, webhooks
- Removed work history, company management, cron jobs
- Ready for SAGA API integration"
```

---

## Task 2: Reconfigure Package for SAGA Monorepo

**Files:**

- Modify: `packages/directory/package.json`
- Modify: `packages/directory/tsconfig.json`
- Modify: `packages/directory/next.config.mjs`
- Modify: `packages/directory/open-next.config.ts`
- Create: `packages/directory/wrangler.jsonc`
- Modify: `pnpm-workspace.yaml` (root — already includes `packages/*`)

- [ ] **Step 1: Rewrite package.json**

Replace `packages/directory/package.json` with:

```json
{
  "name": "@epicdm/saga-directory",
  "version": "0.1.0",
  "private": true,
  "description": "SAGA Official Directory — browse, register, and manage SAGA agents and organizations",
  "scripts": {
    "dev": "next dev --port 6008",
    "build": "next build",
    "start": "next start",
    "preview": "opennextjs-cloudflare build && opennextjs-cloudflare preview",
    "deploy:staging": "opennextjs-cloudflare build && opennextjs-cloudflare deploy --env staging",
    "deploy:production": "opennextjs-cloudflare build && opennextjs-cloudflare deploy",
    "typecheck": "tsc --noEmit",
    "test": "echo 'no tests yet'"
  },
  "dependencies": {
    "@epicdm/saga-client": "workspace:*",
    "@headlessui/react": "^2.2.6",
    "@tailwindcss/postcss": "^4.1.11",
    "clsx": "^2.1.1",
    "lucide-react": "^0.577.0",
    "next": "^15",
    "next-themes": "^0.4.6",
    "react": "19.2.0",
    "react-dom": "19.2.0",
    "tailwindcss": "^4.1.11",
    "typescript": "^5.8.3",
    "viem": "^2.47.6",
    "zod": "^4.3.6"
  },
  "devDependencies": {
    "@cloudflare/workers-types": "^4.20260305.1",
    "@opennextjs/cloudflare": "^1.6.3",
    "@types/node": "^24.1.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "wrangler": "^4.71.0"
  }
}
```

- [ ] **Step 2: Write wrangler.jsonc for SAGA directory**

Create `packages/directory/wrangler.jsonc`:

```jsonc
{
  "account_id": "63396a5b2b279efdc0e1618233dcdc17",
  "main": "worker-entry.js",
  "name": "saga-directory",
  "compatibility_date": "2024-09-23",
  "compatibility_flags": ["nodejs_compat"],
  "assets": {
    "directory": ".open-next/assets",
    "binding": "ASSETS",
  },
  "observability": {
    "logs": { "enabled": true },
  },
  "vars": {
    "SAGA_SERVER_URL": "https://saga-server.epicdm.workers.dev",
  },
  "kv_namespaces": [
    {
      "binding": "SESSIONS",
      "id": "PLACEHOLDER_PRODUCTION_KV_ID",
    },
  ],
  "r2_buckets": [
    {
      "binding": "NEXT_INC_CACHE_R2_BUCKET",
      "bucket_name": "saga-directory-opennext-cache",
    },
  ],
  "env": {
    "staging": {
      "name": "saga-directory-staging",
      "vars": {
        "SAGA_SERVER_URL": "https://saga-server-staging.epicdm.workers.dev",
      },
      "kv_namespaces": [
        {
          "binding": "SESSIONS",
          "id": "PLACEHOLDER_STAGING_KV_ID",
        },
      ],
      "r2_buckets": [
        {
          "binding": "NEXT_INC_CACHE_R2_BUCKET",
          "bucket_name": "saga-directory-opennext-cache-staging",
        },
      ],
    },
  },
}
```

**Note:** KV namespace IDs need to be created via `wrangler kv namespace create SESSIONS` and filled in. The deploying engineer will do this.

- [ ] **Step 3: Update next.config.mjs**

Replace `packages/directory/next.config.mjs` with:

```javascript
import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare'

await initOpenNextCloudflareForDev()

/** @type {import('next').NextConfig} */
const nextConfig = {
  pageExtensions: ['js', 'jsx', 'ts', 'tsx'],
  images: {
    unoptimized: true,
  },
  webpack: (config, { dev }) => {
    if (dev) {
      config.watchOptions = {
        ...config.watchOptions,
        poll: 1000,
        aggregateTimeout: 300,
        ignored: ['**/node_modules/**', '**/.next/**', '**/.git/**'],
      }
    }
    return config
  },
}

export default nextConfig
```

Note: Removed `transpilePackages: ['@epicdm/chrome']` since we're inlining chrome components.

- [ ] **Step 4: Keep open-next.config.ts as-is**

The file is already correct:

```typescript
import { defineCloudflareConfig } from '@opennextjs/cloudflare'
import r2IncrementalCache from '@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache'

export default defineCloudflareConfig({
  incrementalCache: r2IncrementalCache,
})
```

- [ ] **Step 5: Update tsconfig.json**

Replace `packages/directory/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "es6",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "forceConsistentCasingInFileNames": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "types": ["@cloudflare/workers-types", "node"],
    "plugins": [{ "name": "next" }],
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["**/*.ts", "**/*.tsx", "next-env.d.ts", ".next/types/**/*.ts"],
  "exclude": ["node_modules", ".next", "open-next.config.ts"]
}
```

- [ ] **Step 6: Install dependencies**

```bash
cd /Users/sthornock/code/epic/saga-standard && pnpm install
```

- [ ] **Step 7: Commit**

```bash
git add packages/directory/package.json packages/directory/wrangler.jsonc packages/directory/next.config.mjs packages/directory/tsconfig.json pnpm-lock.yaml
git commit -m "chore(directory): reconfigure package for saga-standard monorepo

- New package.json with saga-client dependency, no DB/OIDC deps
- Wrangler config for staging/production with KV sessions
- Updated next.config.mjs without chrome transpile
- Updated tsconfig without jest/better-sqlite3 types"
```

---

## Task 3: Inline Chrome UI Components and Fonts

**Files:**

- Create: `packages/directory/src/components/ui/Navigation.tsx`
- Create: `packages/directory/src/components/ui/Header.tsx`
- Create: `packages/directory/src/components/ui/Footer.tsx`
- Create: `packages/directory/src/components/ui/SiteLayout.tsx`
- Create: `packages/directory/src/components/ui/ThemeSelector.tsx`
- Create: `packages/directory/src/components/ui/user-menu.tsx`
- Create: `packages/directory/src/fonts/index.ts`
- Create: `packages/directory/src/providers/ChromeProviders.tsx`
- Modify: `packages/directory/src/styles/tailwind.css`

These are all direct copies from `flowstate-platform/packages/shared/chrome` with minimal modifications (remove Epic branding, update imports).

- [ ] **Step 1: Copy font files**

```bash
mkdir -p /Users/sthornock/code/epic/saga-standard/packages/directory/src/fonts
cp /Users/sthornock/code/epic/flowstate-platform/packages/shared/chrome/src/fonts/MavenPro.woff2 /Users/sthornock/code/epic/saga-standard/packages/directory/src/fonts/
cp /Users/sthornock/code/epic/flowstate-platform/packages/shared/chrome/src/fonts/Comfortaa.woff2 /Users/sthornock/code/epic/saga-standard/packages/directory/src/fonts/
```

- [ ] **Step 2: Create font index**

Create `packages/directory/src/fonts/index.ts`:

```typescript
import localFont from 'next/font/local'

export const mavenPro = localFont({
  src: './MavenPro.woff2',
  variable: '--font-maven-pro',
  display: 'swap',
  weight: '300 700',
})

export const comfortaa = localFont({
  src: './Comfortaa.woff2',
  variable: '--font-comfortaa',
  display: 'swap',
  weight: '300 700',
})
```

- [ ] **Step 3: Copy and adapt UI components**

Copy the following files from `/Users/sthornock/code/epic/flowstate-platform/packages/shared/chrome/src/`:

- `components/Navigation.tsx` → `packages/directory/src/components/ui/Navigation.tsx`
- `components/Header.tsx` → `packages/directory/src/components/ui/Header.tsx`
- `components/Footer.tsx` → `packages/directory/src/components/ui/Footer.tsx`
- `components/SiteLayout.tsx` → `packages/directory/src/components/ui/SiteLayout.tsx`
- `components/ThemeSelector.tsx` → `packages/directory/src/components/ui/ThemeSelector.tsx`
- `ui/user-menu.tsx` → `packages/directory/src/components/ui/user-menu.tsx`

After copying, update all internal imports in these files to use relative paths instead of chrome package imports. For example, in `SiteLayout.tsx` change:

- `import { Footer } from './Footer'` (already relative — no change needed)
- `import { Header, HeaderRight } from './Header'` (already relative — no change needed)

In `Header.tsx`, remove the `EpicLogo` and `EpicLogomark` imports. Replace the logo with a simple SAGA text logo:

```typescript
// Replace the EpicLogo/EpicLogomark import and usage in Header.tsx with:
function SagaLogo({ className }: { className?: string }) {
  return (
    <span className={clsx('font-display text-xl font-bold tracking-tight text-slate-900 dark:text-white', className)}>
      SAGA
    </span>
  )
}
```

In `Footer.tsx`, update the footer columns with SAGA-relevant links and remove `EpicLogomark`. Replace with the same `SagaLogo` text mark.

- [ ] **Step 4: Create ChromeProviders replacement**

Create `packages/directory/src/app/providers.tsx`:

```typescript
'use client'

import { ThemeProvider } from 'next-themes'

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" disableTransitionOnChange>
      {children}
    </ThemeProvider>
  )
}
```

- [ ] **Step 5: Create theme CSS**

Replace `packages/directory/src/styles/tailwind.css`:

```css
@import 'tailwindcss';

@theme {
  --color-accent-400: #4dd8ff;
  --color-accent-500: #00c3ff;
  --color-accent-600: #0088cc;

  --text-*: initial;
  --text-xs: 0.75rem;
  --text-xs--line-height: 1rem;
  --text-sm: 0.875rem;
  --text-sm--line-height: 1.5rem;
  --text-base: 1rem;
  --text-base--line-height: 2rem;
  --text-lg: 1.125rem;
  --text-lg--line-height: 1.75rem;

  --font-sans: var(--font-maven-pro);
  --font-display: var(--font-comfortaa);
}
```

- [ ] **Step 6: Commit**

```bash
git add packages/directory/src/fonts packages/directory/src/components/ui packages/directory/src/app/providers.tsx packages/directory/src/styles/tailwind.css
git commit -m "feat(directory): inline chrome UI components and fonts

Copied SiteLayout, Header, Footer, Navigation, ThemeSelector,
and user-menu from @epicdm/chrome. Replaced Epic branding with
SAGA. Inlined fonts and theme CSS."
```

---

## Task 4: Session Management and SAGA Client Factory

**Files:**

- Create: `packages/directory/src/lib/session/constants.ts`
- Create: `packages/directory/src/lib/session/server.ts`
- Create: `packages/directory/src/lib/saga-client.ts`
- Create: `packages/directory/src/env.d.ts`

- [ ] **Step 1: Create env.d.ts with Cloudflare bindings**

Create `packages/directory/src/env.d.ts`:

```typescript
interface CloudflareEnv {
  SESSIONS: KVNamespace
  SAGA_SERVER_URL: string
  WALLETCONNECT_PROJECT_ID?: string
}
```

- [ ] **Step 2: Create session constants**

Create `packages/directory/src/lib/session/constants.ts`:

```typescript
export const SESSION_COOKIE_NAME = '__session_saga_dir'
export const SESSION_TTL_SECONDS = 3600 // 1 hour (matches SAGA token TTL)

export interface SessionData {
  walletAddress: string
  chain: string
  sagaToken: string
  expiresAt: string
}
```

- [ ] **Step 3: Create session server helpers**

Create `packages/directory/src/lib/session/server.ts`:

```typescript
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { cookies } from 'next/headers'
import { SESSION_COOKIE_NAME, SESSION_TTL_SECONDS, type SessionData } from './constants'

export async function getSession(): Promise<SessionData | null> {
  const cookieStore = await cookies()
  const sessionId = cookieStore.get(SESSION_COOKIE_NAME)?.value
  if (!sessionId) return null

  const { env } = await getCloudflareContext<{ env: CloudflareEnv }>()
  const raw = await env.SESSIONS.get(sessionId)
  if (!raw) return null

  const session: SessionData = JSON.parse(raw)

  // Check if SAGA token has expired
  if (new Date(session.expiresAt) <= new Date()) {
    await env.SESSIONS.delete(sessionId)
    return null
  }

  return session
}

export async function createSession(data: SessionData): Promise<string> {
  const { env } = await getCloudflareContext<{ env: CloudflareEnv }>()
  const sessionId = `saga_dir_${crypto.randomUUID()}`

  await env.SESSIONS.put(sessionId, JSON.stringify(data), {
    expirationTtl: SESSION_TTL_SECONDS,
  })

  return sessionId
}

export async function deleteSession(sessionId: string): Promise<void> {
  const { env } = await getCloudflareContext<{ env: CloudflareEnv }>()
  await env.SESSIONS.delete(sessionId)
}

export function setSessionCookie(sessionId: string) {
  // Returns cookie options for use in route handlers
  return {
    name: SESSION_COOKIE_NAME,
    value: sessionId,
    httpOnly: true,
    secure: true,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  }
}
```

- [ ] **Step 4: Create SAGA client factory**

Create `packages/directory/src/lib/saga-client.ts`:

```typescript
import { SagaServerClient } from '@epicdm/saga-client'
import { getCloudflareContext } from '@opennextjs/cloudflare'

/**
 * Create an unauthenticated SAGA client for public API calls.
 */
export async function createSagaClient(): Promise<SagaServerClient> {
  const { env } = await getCloudflareContext<{ env: CloudflareEnv }>()
  return new SagaServerClient({ serverUrl: env.SAGA_SERVER_URL })
}

/**
 * Create an authenticated SAGA client using a session's bearer token.
 */
export async function createAuthenticatedSagaClient(sagaToken: string): Promise<SagaServerClient> {
  const { env } = await getCloudflareContext<{ env: CloudflareEnv }>()
  return new SagaServerClient({
    serverUrl: env.SAGA_SERVER_URL,
    auth: {
      token: sagaToken,
      expiresAt: new Date(Date.now() + 3600000), // 1h from now
      walletAddress: '', // Not needed for requests
      serverUrl: env.SAGA_SERVER_URL,
    },
  })
}
```

- [ ] **Step 5: Commit**

```bash
git add packages/directory/src/env.d.ts packages/directory/src/lib/session packages/directory/src/lib/saga-client.ts
git commit -m "feat(directory): add session management and SAGA client factory

- KV-backed session with HttpOnly cookie
- Session stores wallet address, chain, and SAGA bearer token
- Client factory for public and authenticated API calls"
```

---

## Task 5: Wallet Auth — Port Client-Side Wallet Code

**Files:**

- Create: `packages/directory/src/lib/wallet/evm.ts`
- Create: `packages/directory/src/lib/wallet/solana.ts`
- Create: `packages/directory/src/lib/wallet/walletconnect.ts`
- Create: `packages/directory/src/hooks/useWalletLogin.ts`
- Create: `packages/directory/src/hooks/useEIP6963Discovery.ts`

- [ ] **Step 1: Copy wallet utility files**

```bash
mkdir -p /Users/sthornock/code/epic/saga-standard/packages/directory/src/lib/wallet
mkdir -p /Users/sthornock/code/epic/saga-standard/packages/directory/src/hooks

# Copy wallet utilities (no changes needed)
cp /Users/sthornock/code/epic/flowstate-platform/packages/id/src/lib/wallet/evm.ts \
   /Users/sthornock/code/epic/saga-standard/packages/directory/src/lib/wallet/evm.ts

cp /Users/sthornock/code/epic/flowstate-platform/packages/id/src/lib/wallet/solana.ts \
   /Users/sthornock/code/epic/saga-standard/packages/directory/src/lib/wallet/solana.ts

cp /Users/sthornock/code/epic/flowstate-platform/packages/id/src/lib/wallet/walletconnect.ts \
   /Users/sthornock/code/epic/saga-standard/packages/directory/src/lib/wallet/walletconnect.ts

# Copy hooks (EIP6963 discovery needs no changes)
cp /Users/sthornock/code/epic/flowstate-platform/packages/id/src/hooks/useEIP6963Discovery.ts \
   /Users/sthornock/code/epic/saga-standard/packages/directory/src/hooks/useEIP6963Discovery.ts
```

- [ ] **Step 2: Create adapted useWalletLogin hook**

Copy from `/Users/sthornock/code/epic/flowstate-platform/packages/id/src/hooks/useWalletLogin.ts` then modify the API endpoints. The key changes:

1. Challenge endpoint: `/api/auth/challenge` (directory proxy → SAGA server)
2. Verify endpoint: `/api/auth/verify` (directory proxy → SAGA server, creates local session)
3. Response shape: `{ walletAddress, chain }` instead of `{ user_id, is_new_account }`
4. Redirect: to `/dashboard` on success instead of `/onboard`

The hook should call the directory's own API routes (which proxy to SAGA), not the SAGA server directly. This is because the directory API routes handle session creation.

Create `packages/directory/src/hooks/useWalletLogin.ts` — copy the original and modify the `executeLogin` function's API calls:

- Change `POST /api/auth/wallet/challenge` → `POST /api/auth/challenge`
- Change `POST /api/auth/wallet/login` → `POST /api/auth/verify`
- Change the result type from `{ user_id, is_new_account }` to `{ walletAddress, chain }`
- Remove redirect logic (let the page handle it)

- [ ] **Step 3: Verify wallet files have correct imports**

Check that `evm.ts` doesn't import anything from the FlowState package. It should only use browser APIs and `viem`. Same for `solana.ts` (uses `window.solana`) and `walletconnect.ts` (dynamic imports from `@walletconnect/*`).

If `walletconnect.ts` references `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`, that's fine — Next.js handles `NEXT_PUBLIC_*` env vars automatically.

- [ ] **Step 4: Commit**

```bash
git add packages/directory/src/lib/wallet packages/directory/src/hooks
git commit -m "feat(directory): port wallet auth from flowstate-identity

Copied evm.ts, solana.ts, walletconnect.ts wallet utilities.
Adapted useWalletLogin hook to call SAGA directory auth proxy.
Supports MetaMask, Phantom, and WalletConnect."
```

---

## Task 6: Auth API Routes

**Files:**

- Create: `packages/directory/src/app/api/auth/challenge/route.ts`
- Create: `packages/directory/src/app/api/auth/verify/route.ts`
- Create: `packages/directory/src/app/api/auth/logout/route.ts`

- [ ] **Step 1: Create challenge proxy route**

Create `packages/directory/src/app/api/auth/challenge/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { getCloudflareContext } from '@opennextjs/cloudflare'

export async function POST(request: Request) {
  const body = await request.json()
  const { walletAddress, chain } = body

  if (!walletAddress || !chain) {
    return NextResponse.json({ error: 'Missing walletAddress or chain' }, { status: 400 })
  }

  const { env } = await getCloudflareContext<{ env: CloudflareEnv }>()

  const res = await fetch(`${env.SAGA_SERVER_URL}/v1/auth/challenge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ walletAddress, chain }),
  })

  const data = await res.json()

  if (!res.ok) {
    return NextResponse.json(data, { status: res.status })
  }

  return NextResponse.json(data)
}
```

- [ ] **Step 2: Create verify route with session creation**

Create `packages/directory/src/app/api/auth/verify/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { createSession, setSessionCookie } from '@/lib/session/server'

export async function POST(request: Request) {
  const body = await request.json()
  const { walletAddress, chain, signature, challenge } = body

  if (!walletAddress || !chain || !signature || !challenge) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const { env } = await getCloudflareContext<{ env: CloudflareEnv }>()

  const res = await fetch(`${env.SAGA_SERVER_URL}/v1/auth/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ walletAddress, chain, signature, challenge }),
  })

  const data = await res.json()

  if (!res.ok) {
    return NextResponse.json(data, { status: res.status })
  }

  // SAGA server returns { token, expiresAt, walletAddress }
  const sessionId = await createSession({
    walletAddress: data.walletAddress,
    chain,
    sagaToken: data.token,
    expiresAt: data.expiresAt,
  })

  const cookie = setSessionCookie(sessionId)
  const response = NextResponse.json({ walletAddress: data.walletAddress, chain })
  response.cookies.set(cookie)

  return response
}
```

- [ ] **Step 3: Create logout route**

Create `packages/directory/src/app/api/auth/logout/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { SESSION_COOKIE_NAME } from '@/lib/session/constants'
import { deleteSession } from '@/lib/session/server'

export async function POST() {
  const cookieStore = await cookies()
  const sessionId = cookieStore.get(SESSION_COOKIE_NAME)?.value

  if (sessionId) {
    await deleteSession(sessionId)
  }

  const response = NextResponse.json({ ok: true })
  response.cookies.delete(SESSION_COOKIE_NAME)
  return response
}

// Also support GET for simple link-based logout
export async function GET() {
  const cookieStore = await cookies()
  const sessionId = cookieStore.get(SESSION_COOKIE_NAME)?.value

  if (sessionId) {
    await deleteSession(sessionId)
  }

  const response = NextResponse.redirect(new URL('/', 'https://placeholder.dev'))
  response.cookies.delete(SESSION_COOKIE_NAME)
  return response
}
```

Note: The GET handler redirect URL will be resolved relative to the request in production.

- [ ] **Step 4: Commit**

```bash
git add packages/directory/src/app/api/auth
git commit -m "feat(directory): add auth API routes

- POST /api/auth/challenge: proxy to SAGA server challenge
- POST /api/auth/verify: proxy to SAGA verify + create KV session
- POST|GET /api/auth/logout: clear session"
```

---

## Task 7: Middleware and Root Layout

**Files:**

- Modify: `packages/directory/src/middleware.ts`
- Modify: `packages/directory/src/app/layout.tsx`

- [ ] **Step 1: Update middleware for wallet sessions**

Replace `packages/directory/src/middleware.ts`:

```typescript
import { type NextRequest, NextResponse } from 'next/server'
import { SESSION_COOKIE_NAME } from '@/lib/session/constants'

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const sessionToken = request.cookies.get(SESSION_COOKIE_NAME)?.value

  // Protected dashboard pages require session
  if (pathname.startsWith('/dashboard')) {
    if (!sessionToken) {
      const connectUrl = new URL('/connect', request.url)
      connectUrl.searchParams.set('callbackUrl', pathname)
      return NextResponse.redirect(connectUrl)
    }
  }

  // Redirect authenticated users away from connect page
  if (pathname === '/connect' && sessionToken) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/dashboard/:path*', '/connect'],
}
```

- [ ] **Step 2: Rewrite root layout**

Replace `packages/directory/src/app/layout.tsx`:

```typescript
import { type Metadata } from 'next'
import clsx from 'clsx'

import { mavenPro, comfortaa } from '@/fonts'
import { Providers } from '@/app/providers'
import { Layout } from '@/components/Layout'
import { getSession } from '@/lib/session/server'

import '@/styles/tailwind.css'

export const metadata: Metadata = {
  title: {
    template: '%s | SAGA Directory',
    default: 'SAGA Directory',
  },
  description:
    'The official directory for SAGA agents and organizations. Browse, register, and manage agent identities.',
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getSession()

  const user = session
    ? { walletAddress: session.walletAddress, chain: session.chain }
    : null

  return (
    <html
      lang="en"
      className={clsx('h-full antialiased', mavenPro.variable, comfortaa.variable)}
      suppressHydrationWarning
    >
      <body className="flex min-h-full bg-white dark:bg-slate-900">
        <Providers>
          <Layout user={user}>{children}</Layout>
        </Providers>
      </body>
    </html>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/directory/src/middleware.ts packages/directory/src/app/layout.tsx
git commit -m "feat(directory): update middleware and root layout for wallet auth

- Middleware protects /dashboard/* with session cookie check
- Root layout reads wallet session, passes to Layout component
- SAGA branding in metadata"
```

---

## Task 8: Site Layout Component

**Files:**

- Modify: `packages/directory/src/components/Layout.tsx`

- [ ] **Step 1: Rewrite Layout.tsx for SAGA with wallet auth**

Replace `packages/directory/src/components/Layout.tsx`:

```typescript
'use client'

import Link from 'next/link'
import { SiteLayout } from '@/components/ui/SiteLayout'
import { UserMenuContainer, UserMenuItem, UserMenuTrigger } from '@/components/ui/user-menu'
import type { NavLink } from '@/components/ui/Navigation'

export type LayoutUser = {
  walletAddress: string
  chain: string
} | null

const navLinks: NavLink[] = [
  { title: 'Agents', href: '/agents' },
  { title: 'Organizations', href: '/orgs' },
]

function truncateAddress(address: string): string {
  if (address.length <= 10) return address
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

function UserMenu({ user }: { user: LayoutUser }) {
  if (!user) {
    return (
      <Link
        href="/connect"
        className="rounded-lg bg-sky-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-600"
      >
        Connect Wallet
      </Link>
    )
  }

  return (
    <UserMenuContainer
      trigger={
        <UserMenuTrigger
          user={{ name: truncateAddress(user.walletAddress), email: '' }}
        />
      }
    >
      <div className="border-b border-slate-100 px-4 py-2 dark:border-slate-700">
        <p className="truncate text-sm font-medium text-slate-900 dark:text-white">
          {truncateAddress(user.walletAddress)}
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {user.chain}
        </p>
      </div>
      <UserMenuItem href="/dashboard">Dashboard</UserMenuItem>
      <a
        href="/api/auth/logout"
        className="block w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700"
      >
        Disconnect
      </a>
    </UserMenuContainer>
  )
}

export function Layout({
  children,
  user,
}: {
  children: React.ReactNode
  user: LayoutUser
}) {
  return (
    <SiteLayout navLinks={navLinks} userMenu={<UserMenu user={user} />}>
      {children}
    </SiteLayout>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/directory/src/components/Layout.tsx
git commit -m "feat(directory): SAGA site layout with wallet connect menu

- Nav links: Agents, Organizations
- User menu shows truncated wallet address
- Connect Wallet button for unauthenticated users
- Disconnect link clears session"
```

---

## Task 9: Connect Page (Wallet Login)

**Files:**

- Modify: `packages/directory/src/app/connect/page.tsx`
- Create: `packages/directory/src/components/wallet/WalletLoginSection.tsx`

- [ ] **Step 1: Copy and adapt WalletLoginSection**

Copy from `/Users/sthornock/code/epic/flowstate-platform/packages/id/src/components/wallet/WalletLoginSection.tsx` to `packages/directory/src/components/wallet/WalletLoginSection.tsx`.

Update imports:

- `useWalletLogin` → `from '@/hooks/useWalletLogin'`
- `useEIP6963Discovery` → `from '@/hooks/useEIP6963Discovery'`

Update redirect on success: change from `/onboard` / `/` to use `window.location.href = callbackUrl || '/dashboard'` where `callbackUrl` is passed as a prop.

- [ ] **Step 2: Rewrite connect page**

Replace `packages/directory/src/app/connect/page.tsx`:

```typescript
import { type Metadata } from 'next'
import { KeyRound } from 'lucide-react'
import { WalletLoginSection } from '@/components/wallet/WalletLoginSection'

export const metadata: Metadata = {
  title: 'Connect',
  description: 'Connect your wallet to manage your SAGA agent profile.',
}

interface ConnectPageProps {
  searchParams: Promise<{ callbackUrl?: string }>
}

export default async function ConnectPage({ searchParams }: ConnectPageProps) {
  const { callbackUrl } = await searchParams

  return (
    <div className="mx-auto max-w-md px-4 py-16 sm:px-6">
      <div className="text-center">
        <div className="mx-auto mb-6 flex h-12 w-12 items-center justify-center rounded-full bg-sky-50 dark:bg-sky-900/30">
          <KeyRound className="h-6 w-6 text-sky-600 dark:text-sky-400" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
          Connect Wallet
        </h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
          Sign in with your wallet to register agents, manage documents, and initiate transfers.
        </p>
      </div>

      <div className="mt-8">
        <WalletLoginSection callbackUrl={callbackUrl ?? '/dashboard'} />
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/directory/src/app/connect packages/directory/src/components/wallet
git commit -m "feat(directory): wallet connect page with MetaMask/Phantom/WalletConnect

- Connect page with wallet login section
- Supports MetaMask (EIP-6963), Phantom (Solana), WalletConnect
- Challenge-response auth flow against SAGA server"
```

---

## Task 10: Shared UI Components (Badges, Cards)

**Files:**

- Create: `packages/directory/src/components/badges/chain-badge.tsx`
- Create: `packages/directory/src/components/badges/wallet-address.tsx`
- Modify: `packages/directory/src/components/cards/agent-card.tsx`
- Create: `packages/directory/src/components/cards/org-card.tsx`
- Create: `packages/directory/src/lib/types.ts`

- [ ] **Step 1: Create shared UI types**

Create `packages/directory/src/lib/types.ts`:

```typescript
import type { AgentRecord, OrgRecord } from '@epicdm/saga-client'

// Re-export client types for convenience
export type { AgentRecord, OrgRecord }

// UI-specific types
export type AgentSummary = AgentRecord
export type OrgSummary = OrgRecord
```

- [ ] **Step 2: Create ChainBadge component**

Create `packages/directory/src/components/badges/chain-badge.tsx`:

```typescript
import clsx from 'clsx'

const CHAIN_LABELS: Record<string, { label: string; color: string }> = {
  'eip155:8453': { label: 'Base', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' },
  'eip155:1': { label: 'Ethereum', color: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300' },
  'eip155:137': { label: 'Polygon', color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300' },
  'solana:mainnet': { label: 'Solana', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' },
}

export function ChainBadge({ chain }: { chain: string }) {
  const info = CHAIN_LABELS[chain] ?? { label: chain, color: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400' }

  return (
    <span className={clsx('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', info.color)}>
      {info.label}
    </span>
  )
}
```

- [ ] **Step 3: Create WalletAddress component**

Create `packages/directory/src/components/badges/wallet-address.tsx`:

```typescript
'use client'

import { useState } from 'react'
import { Copy, Check } from 'lucide-react'

function truncate(address: string): string {
  if (address.length <= 10) return address
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

export function WalletAddress({ address }: { address: string }) {
  const [copied, setCopied] = useState(false)

  async function copyToClipboard() {
    await navigator.clipboard.writeText(address)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <button
      onClick={copyToClipboard}
      className="inline-flex items-center gap-1.5 rounded-md bg-slate-100 px-2 py-1 font-mono text-xs text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700"
      title={address}
    >
      {truncate(address)}
      {copied ? (
        <Check className="h-3 w-3 text-green-500" />
      ) : (
        <Copy className="h-3 w-3" />
      )}
    </button>
  )
}
```

- [ ] **Step 4: Rewrite AgentCard for SAGA**

Replace `packages/directory/src/components/cards/agent-card.tsx`:

```typescript
import Link from 'next/link'
import { ChainBadge } from '@/components/badges/chain-badge'
import type { AgentSummary } from '@/lib/types'

function truncateAddress(address: string): string {
  if (address.length <= 10) return address
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

export function AgentCard({ agent }: { agent: AgentSummary }) {
  return (
    <Link
      href={`/a/${agent.handle}`}
      className="group block rounded-lg border border-slate-200 p-5 transition-shadow hover:shadow-md dark:border-slate-700"
    >
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-semibold text-slate-900 group-hover:text-sky-600 dark:text-white dark:group-hover:text-sky-400">
            @{agent.handle}
          </h3>
          <p className="mt-1 font-mono text-xs text-slate-500 dark:text-slate-400">
            {truncateAddress(agent.walletAddress)}
          </p>
        </div>
        <ChainBadge chain={agent.chain} />
      </div>
      {agent.tokenId != null && (
        <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
          NFT #{agent.tokenId}
        </p>
      )}
    </Link>
  )
}
```

- [ ] **Step 5: Create OrgCard**

Create `packages/directory/src/components/cards/org-card.tsx`:

```typescript
import Link from 'next/link'
import { ChainBadge } from '@/components/badges/chain-badge'
import type { OrgSummary } from '@/lib/types'

function truncateAddress(address: string): string {
  if (address.length <= 10) return address
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

export function OrgCard({ org }: { org: OrgSummary }) {
  return (
    <Link
      href={`/o/${org.handle}`}
      className="group block rounded-lg border border-slate-200 p-5 transition-shadow hover:shadow-md dark:border-slate-700"
    >
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-semibold text-slate-900 group-hover:text-sky-600 dark:text-white dark:group-hover:text-sky-400">
            {org.name}
          </h3>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
            @{org.handle}
          </p>
          <p className="mt-1 font-mono text-xs text-slate-500 dark:text-slate-400">
            {truncateAddress(org.walletAddress)}
          </p>
        </div>
        <ChainBadge chain={org.chain} />
      </div>
    </Link>
  )
}
```

- [ ] **Step 6: Commit**

```bash
git add packages/directory/src/lib/types.ts packages/directory/src/components/badges packages/directory/src/components/cards
git commit -m "feat(directory): add SAGA card and badge components

- ChainBadge: colored badge for Base/ETH/Polygon/Solana
- WalletAddress: truncated address with copy-to-clipboard
- AgentCard: agent summary with handle, wallet, chain, NFT ID
- OrgCard: org summary with name, handle, wallet, chain"
```

---

## Task 11: Browse Agents Page

**Files:**

- Modify: `packages/directory/src/app/agents/page.tsx`
- Keep: `packages/directory/src/components/browse/search-input.tsx` (may need minor fixes)
- Keep: `packages/directory/src/components/browse/pagination.tsx`
- Keep: `packages/directory/src/components/browse/empty-state.tsx`

- [ ] **Step 1: Rewrite agents browse page to use SAGA API**

Replace `packages/directory/src/app/agents/page.tsx`:

```typescript
import { type Metadata } from 'next'
import { Suspense } from 'react'
import { createSagaClient } from '@/lib/saga-client'
import { AgentCard } from '@/components/cards/agent-card'
import { SearchInput } from '@/components/browse/search-input'
import { Pagination } from '@/components/browse/pagination'
import { EmptyState } from '@/components/browse/empty-state'

export const metadata: Metadata = {
  title: 'Browse Agents',
  description: 'Discover SAGA-registered AI agents.',
}

export const revalidate = 60

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function AgentBrowsePage({ searchParams }: PageProps) {
  const params = await searchParams
  const client = await createSagaClient()

  const page = Number(params.page ?? '1')
  const limit = 20
  const search = typeof params.q === 'string' ? params.q : undefined

  const result = await client.listAgents({ page, limit, search })

  const totalPages = Math.ceil(result.total / limit)

  const paginationParams: Record<string, string> = {}
  for (const [key, val] of Object.entries(params)) {
    if (key !== 'page' && typeof val === 'string' && val) {
      paginationParams[key] = val
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
          Browse Agents
        </h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          {result.total} agent{result.total !== 1 ? 's' : ''} registered
        </p>
      </div>

      <div className="mb-6">
        <Suspense>
          <SearchInput basePath="/agents" placeholder="Search by handle or wallet..." />
        </Suspense>
      </div>

      {result.agents.length === 0 ? (
        <EmptyState
          title="No agents found"
          description="Try adjusting your search terms."
          action={{ label: 'Clear search', href: '/agents' }}
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {result.agents.map((agent) => (
              <AgentCard key={agent.agentId} agent={agent} />
            ))}
          </div>
          <div className="mt-6">
            <Pagination
              page={page}
              totalPages={totalPages}
              basePath="/agents"
              params={paginationParams}
            />
          </div>
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Remove the agent-filter-panel (FlowState-specific filters)**

```bash
rm -f packages/directory/src/components/browse/agent-filter-panel.tsx
```

- [ ] **Step 3: Verify SearchInput and Pagination have no DB imports**

Read `search-input.tsx` and `pagination.tsx` — they should be pure UI components using URL params. If they import anything from `@/db` or `@epicdm/*`, remove those imports. These components typically only depend on `next/navigation` and `clsx`.

- [ ] **Step 4: Commit**

```bash
git add packages/directory/src/app/agents packages/directory/src/components/browse
git commit -m "feat(directory): browse agents page with SAGA API

- Server-side rendered with ISR (60s revalidate)
- Paginated search via SagaServerClient.listAgents()
- Removed FlowState-specific filter panel"
```

---

## Task 12: Browse Orgs Page

**Files:**

- Create: `packages/directory/src/app/orgs/page.tsx`

- [ ] **Step 1: Create orgs browse page**

Create `packages/directory/src/app/orgs/page.tsx`:

```typescript
import { type Metadata } from 'next'
import { Suspense } from 'react'
import { createSagaClient } from '@/lib/saga-client'
import { OrgCard } from '@/components/cards/org-card'
import { SearchInput } from '@/components/browse/search-input'
import { Pagination } from '@/components/browse/pagination'
import { EmptyState } from '@/components/browse/empty-state'

export const metadata: Metadata = {
  title: 'Browse Organizations',
  description: 'Discover SAGA-registered organizations.',
}

export const revalidate = 60

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function OrgBrowsePage({ searchParams }: PageProps) {
  const params = await searchParams
  const client = await createSagaClient()

  const page = Number(params.page ?? '1')
  const limit = 20
  const search = typeof params.q === 'string' ? params.q : undefined

  const result = await client.listOrgs({ page, limit, search })

  const totalPages = Math.ceil(result.total / limit)

  const paginationParams: Record<string, string> = {}
  for (const [key, val] of Object.entries(params)) {
    if (key !== 'page' && typeof val === 'string' && val) {
      paginationParams[key] = val
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
          Browse Organizations
        </h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          {result.total} organization{result.total !== 1 ? 's' : ''} registered
        </p>
      </div>

      <div className="mb-6">
        <Suspense>
          <SearchInput basePath="/orgs" placeholder="Search by handle..." />
        </Suspense>
      </div>

      {result.organizations.length === 0 ? (
        <EmptyState
          title="No organizations found"
          description="Try adjusting your search terms."
          action={{ label: 'Clear search', href: '/orgs' }}
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {result.organizations.map((org) => (
              <OrgCard key={org.orgId} org={org} />
            ))}
          </div>
          <div className="mt-6">
            <Pagination
              page={page}
              totalPages={totalPages}
              basePath="/orgs"
              params={paginationParams}
            />
          </div>
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/directory/src/app/orgs
git commit -m "feat(directory): browse organizations page with SAGA API"
```

---

## Task 13: Agent and Org Profile Pages

**Files:**

- Modify: `packages/directory/src/app/a/[handle]/page.tsx`
- Create: `packages/directory/src/app/o/[handle]/page.tsx`
- Create: `packages/directory/src/components/agent-profile/profile-hero.tsx`
- Create: `packages/directory/src/components/agent-profile/profile-details.tsx`
- Create: `packages/directory/src/components/org-profile/org-hero.tsx`

- [ ] **Step 1: Create agent profile hero**

Create `packages/directory/src/components/agent-profile/profile-hero.tsx`:

```typescript
import { ChainBadge } from '@/components/badges/chain-badge'
import { WalletAddress } from '@/components/badges/wallet-address'
import type { AgentRecord } from '@epicdm/saga-client'

export function ProfileHero({ agent }: { agent: AgentRecord }) {
  return (
    <div className="border-b border-slate-200 pb-6 dark:border-slate-700">
      <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
        @{agent.handle}
      </h1>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <WalletAddress address={agent.walletAddress} />
        <ChainBadge chain={agent.chain} />
      </div>
      {agent.entityType && agent.entityType !== 'agent' && (
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          Type: {agent.entityType}
        </p>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Create agent profile details**

Create `packages/directory/src/components/agent-profile/profile-details.tsx`:

```typescript
import type { AgentRecord, DocumentRecord } from '@epicdm/saga-client'

export function ProfileDetails({
  agent,
  latestDocument,
}: {
  agent: AgentRecord
  latestDocument?: DocumentRecord
}) {
  const nftFields = [
    agent.tokenId != null && { label: 'Token ID', value: `#${agent.tokenId}` },
    agent.tbaAddress && { label: 'TBA Address', value: agent.tbaAddress },
    agent.contractAddress && { label: 'Contract', value: agent.contractAddress },
    agent.mintTxHash && { label: 'Mint TX', value: agent.mintTxHash },
    agent.homeHubUrl && { label: 'Home Hub', value: agent.homeHubUrl },
  ].filter(Boolean) as { label: string; value: string }[]

  return (
    <div className="space-y-6">
      {nftFields.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
            On-Chain Identity
          </h2>
          <dl className="mt-3 space-y-2">
            {nftFields.map((field) => (
              <div key={field.label} className="flex gap-2 text-sm">
                <dt className="shrink-0 font-medium text-slate-500 dark:text-slate-400">
                  {field.label}:
                </dt>
                <dd className="truncate font-mono text-slate-700 dark:text-slate-300">
                  {field.value}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {latestDocument && (
        <section>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
            Latest Document
          </h2>
          <div className="mt-3 rounded-lg border border-slate-200 p-4 dark:border-slate-700">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <span className="text-slate-500 dark:text-slate-400">Type: </span>
                <span className="font-medium text-slate-700 dark:text-slate-300">
                  {latestDocument.exportType}
                </span>
              </div>
              <div>
                <span className="text-slate-500 dark:text-slate-400">Version: </span>
                <span className="font-medium text-slate-700 dark:text-slate-300">
                  {latestDocument.sagaVersion}
                </span>
              </div>
              <div>
                <span className="text-slate-500 dark:text-slate-400">Size: </span>
                <span className="font-medium text-slate-700 dark:text-slate-300">
                  {(latestDocument.sizeBytes / 1024).toFixed(1)} KB
                </span>
              </div>
              <div>
                <span className="text-slate-500 dark:text-slate-400">Uploaded: </span>
                <span className="font-medium text-slate-700 dark:text-slate-300">
                  {new Date(latestDocument.createdAt).toLocaleDateString()}
                </span>
              </div>
            </div>
          </div>
        </section>
      )}

      <section>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
          Registration
        </h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Registered {new Date(agent.registeredAt).toLocaleDateString()}
        </p>
      </section>
    </div>
  )
}
```

- [ ] **Step 3: Rewrite agent profile page**

Replace `packages/directory/src/app/a/[handle]/page.tsx`:

```typescript
import { notFound } from 'next/navigation'
import { type Metadata } from 'next'
import { createSagaClient } from '@/lib/saga-client'
import { ProfileHero } from '@/components/agent-profile/profile-hero'
import { ProfileDetails } from '@/components/agent-profile/profile-details'

export const revalidate = 60

interface PageProps {
  params: Promise<{ handle: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { handle } = await params
  return {
    title: `@${handle}`,
    description: `SAGA agent profile for @${handle}`,
  }
}

export default async function AgentProfilePage({ params }: PageProps) {
  const { handle } = await params
  const client = await createSagaClient()

  let detail
  try {
    detail = await client.getAgent(handle)
  } catch {
    notFound()
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      <ProfileHero agent={detail.agent} />
      <div className="mt-8">
        <ProfileDetails agent={detail.agent} latestDocument={detail.latestDocument} />
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Create org profile page**

Create `packages/directory/src/components/org-profile/org-hero.tsx`:

```typescript
import { ChainBadge } from '@/components/badges/chain-badge'
import { WalletAddress } from '@/components/badges/wallet-address'
import type { OrgRecord } from '@epicdm/saga-client'

export function OrgHero({ org }: { org: OrgRecord }) {
  return (
    <div className="border-b border-slate-200 pb-6 dark:border-slate-700">
      <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
        {org.name}
      </h1>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        @{org.handle}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <WalletAddress address={org.walletAddress} />
        <ChainBadge chain={org.chain} />
      </div>
    </div>
  )
}
```

Create `packages/directory/src/app/o/[handle]/page.tsx`:

```typescript
import { notFound } from 'next/navigation'
import { type Metadata } from 'next'
import { createSagaClient } from '@/lib/saga-client'
import { OrgHero } from '@/components/org-profile/org-hero'

export const revalidate = 60

interface PageProps {
  params: Promise<{ handle: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { handle } = await params
  return {
    title: handle,
    description: `SAGA organization profile for ${handle}`,
  }
}

export default async function OrgProfilePage({ params }: PageProps) {
  const { handle } = await params
  const client = await createSagaClient()

  let detail
  try {
    detail = await client.getOrg(handle)
  } catch {
    notFound()
  }

  const org = detail.organization

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      <OrgHero org={org} />
      <div className="mt-8">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Registered {new Date(org.registeredAt).toLocaleDateString()}
        </p>
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Commit**

```bash
git add packages/directory/src/app/a packages/directory/src/app/o packages/directory/src/components/agent-profile packages/directory/src/components/org-profile
git commit -m "feat(directory): agent and org profile pages

- Agent profile: identity hero, on-chain NFT details, latest document
- Org profile: name, handle, wallet, chain, registration date
- Both use SAGA server API via createSagaClient()"
```

---

## Task 14: Dashboard Layout, Registration, and Profile

**Files:**

- Modify: `packages/directory/src/app/dashboard/layout.tsx`
- Modify: `packages/directory/src/app/dashboard/page.tsx`
- Modify: `packages/directory/src/app/dashboard/register/page.tsx`
- Modify: `packages/directory/src/app/dashboard/profile/page.tsx`
- Create: `packages/directory/src/components/dashboard/dashboard-nav.tsx`
- Create: `packages/directory/src/components/dashboard/register-form.tsx`
- Create: `packages/directory/src/app/api/agents/route.ts`

- [ ] **Step 1: Create dashboard nav**

Create `packages/directory/src/components/dashboard/dashboard-nav.tsx`:

```typescript
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import clsx from 'clsx'
import { User, Send, FileText } from 'lucide-react'

const navItems = [
  { label: 'Profile', href: '/dashboard/profile', icon: User },
  { label: 'Transfers', href: '/dashboard/transfers', icon: Send },
]

export function DashboardNav() {
  const pathname = usePathname()

  return (
    <nav className="flex gap-1 border-b border-slate-200 dark:border-slate-700">
      {navItems.map((item) => {
        const Icon = item.icon
        const isActive = pathname.startsWith(item.href)
        return (
          <Link
            key={item.href}
            href={item.href}
            className={clsx(
              'flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors',
              isActive
                ? 'border-sky-500 text-sky-600 dark:text-sky-400'
                : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300'
            )}
          >
            <Icon className="h-4 w-4" />
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}
```

- [ ] **Step 2: Rewrite dashboard layout**

Replace `packages/directory/src/app/dashboard/layout.tsx`:

```typescript
import { DashboardNav } from '@/components/dashboard/dashboard-nav'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <DashboardNav />
      <div className="mt-6">{children}</div>
    </div>
  )
}
```

- [ ] **Step 3: Dashboard index redirects to profile**

Replace `packages/directory/src/app/dashboard/page.tsx`:

```typescript
import { redirect } from 'next/navigation'

export default function DashboardPage() {
  redirect('/dashboard/profile')
}
```

- [ ] **Step 4: Create agent registration API route**

Create `packages/directory/src/app/api/agents/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session/server'
import { createAuthenticatedSagaClient } from '@/lib/saga-client'

export async function POST(request: Request) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { handle } = body

  if (!handle) {
    return NextResponse.json({ error: 'Missing handle' }, { status: 400 })
  }

  const client = await createAuthenticatedSagaClient(session.sagaToken)

  try {
    const agent = await client.registerAgent({
      handle,
      walletAddress: session.walletAddress,
      chain: session.chain as any,
    })
    return NextResponse.json(agent, { status: 201 })
  } catch (err: any) {
    const message = err?.message ?? 'Registration failed'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
```

- [ ] **Step 5: Create register form**

Create `packages/directory/src/components/dashboard/register-form.tsx`:

```typescript
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

const HANDLE_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9._-]{1,62}[a-zA-Z0-9]$/

export function RegisterForm({ walletAddress, chain }: { walletAddress: string; chain: string }) {
  const router = useRouter()
  const [handle, setHandle] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const handleValid = handle.length >= 3 && HANDLE_REGEX.test(handle)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!handleValid) return

    setSubmitting(true)
    setError(null)

    try {
      const res = await fetch('/api/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handle }),
      })

      if (!res.ok) {
        const data = await res.json()
        setError(data.error ?? 'Registration failed')
        return
      }

      router.push('/dashboard/profile')
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <div>
        <label htmlFor="handle" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
          Handle
        </label>
        <div className="mt-1 flex rounded-md shadow-sm">
          <span className="inline-flex items-center rounded-l-md border border-r-0 border-slate-300 bg-slate-50 px-3 text-sm text-slate-500 dark:border-slate-600 dark:bg-slate-800">
            @
          </span>
          <input
            id="handle"
            type="text"
            value={handle}
            onChange={(e) => setHandle(e.target.value.toLowerCase())}
            placeholder="my-agent"
            className="block w-full rounded-r-md border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:ring-sky-500 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
            minLength={3}
            maxLength={64}
          />
        </div>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          3-64 characters. Letters, numbers, dots, hyphens, underscores.
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
          Wallet
        </label>
        <p className="mt-1 font-mono text-sm text-slate-600 dark:text-slate-400">
          {walletAddress}
        </p>
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
          Chain: {chain}
        </p>
      </div>

      {error && (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      )}

      <button
        type="submit"
        disabled={!handleValid || submitting}
        className="rounded-md bg-sky-500 px-4 py-2 text-sm font-medium text-white hover:bg-sky-600 disabled:opacity-50"
      >
        {submitting ? 'Registering...' : 'Register Agent'}
      </button>
    </form>
  )
}
```

- [ ] **Step 6: Create register page**

Replace `packages/directory/src/app/dashboard/register/page.tsx`:

```typescript
import { type Metadata } from 'next'
import { getSession } from '@/lib/session/server'
import { redirect } from 'next/navigation'
import { RegisterForm } from '@/components/dashboard/register-form'

export const metadata: Metadata = {
  title: 'Register Agent',
}

export default async function RegisterPage() {
  const session = await getSession()
  if (!session) redirect('/connect')

  return (
    <div>
      <h1 className="text-xl font-bold text-slate-900 dark:text-white">
        Register New Agent
      </h1>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
        Register your agent identity on the SAGA network.
      </p>
      <div className="mt-6 max-w-md">
        <RegisterForm walletAddress={session.walletAddress} chain={session.chain} />
      </div>
    </div>
  )
}
```

- [ ] **Step 7: Create profile page**

Replace `packages/directory/src/app/dashboard/profile/page.tsx`:

```typescript
import { type Metadata } from 'next'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getSession } from '@/lib/session/server'
import { createAuthenticatedSagaClient } from '@/lib/saga-client'
import { ProfileHero } from '@/components/agent-profile/profile-hero'
import { WalletAddress } from '@/components/badges/wallet-address'

export const metadata: Metadata = {
  title: 'My Profile',
}

export default async function ProfilePage() {
  const session = await getSession()
  if (!session) redirect('/connect')

  const client = await createAuthenticatedSagaClient(session.sagaToken)

  // Try to find agent by wallet address
  let agent = null
  try {
    const detail = await client.getAgent(session.walletAddress)
    agent = detail.agent
  } catch {
    // Agent not registered yet
  }

  if (!agent) {
    return (
      <div className="text-center py-12">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
          No agent registered
        </h2>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
          Your wallet <WalletAddress address={session.walletAddress} /> doesn&apos;t have a registered agent yet.
        </p>
        <Link
          href="/dashboard/register"
          className="mt-4 inline-block rounded-md bg-sky-500 px-4 py-2 text-sm font-medium text-white hover:bg-sky-600"
        >
          Register Agent
        </Link>
      </div>
    )
  }

  return (
    <div>
      <ProfileHero agent={agent} />
      <div className="mt-6">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Document management coming in a future update.
        </p>
      </div>
    </div>
  )
}
```

- [ ] **Step 8: Commit**

```bash
git add packages/directory/src/app/dashboard packages/directory/src/app/api/agents packages/directory/src/components/dashboard
git commit -m "feat(directory): dashboard with registration and profile

- Dashboard layout with nav (Profile, Transfers)
- Agent registration form with handle validation
- Profile page shows agent details or registration prompt
- POST /api/agents proxies to SAGA server"
```

---

## Task 15: Transfer Protocol UI

**Files:**

- Create: `packages/directory/src/app/dashboard/transfers/page.tsx`
- Create: `packages/directory/src/app/dashboard/transfers/new/page.tsx`
- Create: `packages/directory/src/app/api/transfers/route.ts`
- Create: `packages/directory/src/app/api/transfers/[transferId]/consent/route.ts`
- Create: `packages/directory/src/components/dashboard/transfer-initiate-form.tsx`

- [ ] **Step 1: Create transfer API routes**

Create `packages/directory/src/app/api/transfers/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session/server'
import { createAuthenticatedSagaClient } from '@/lib/saga-client'

export async function POST(request: Request) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { agentHandle, destinationServerUrl, requestedLayers } = body

  if (!agentHandle || !destinationServerUrl) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const client = await createAuthenticatedSagaClient(session.sagaToken)

  try {
    const transfer = await client.initiateTransfer({
      agentHandle,
      destinationServerUrl,
      requestedLayers,
    })
    return NextResponse.json(transfer, { status: 201 })
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? 'Transfer initiation failed' },
      { status: 400 }
    )
  }
}
```

Create `packages/directory/src/app/api/transfers/[transferId]/consent/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session/server'
import { createAuthenticatedSagaClient } from '@/lib/saga-client'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ transferId: string }> }
) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { transferId } = await params
  const body = await request.json()
  const { signature } = body

  if (!signature) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 })
  }

  const client = await createAuthenticatedSagaClient(session.sagaToken)

  try {
    const transfer = await client.consentToTransfer(transferId, signature)
    return NextResponse.json(transfer)
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Consent failed' }, { status: 400 })
  }
}
```

- [ ] **Step 2: Create transfer initiate form**

Create `packages/directory/src/components/dashboard/transfer-initiate-form.tsx`:

```typescript
'use client'

import { useState } from 'react'

const SAGA_LAYERS = [
  'identity', 'persona', 'cognitive', 'memory', 'skills',
  'task-history', 'relationships', 'environment', 'vault',
]

interface TransferInitiateFormProps {
  agentHandle: string
}

export function TransferInitiateForm({ agentHandle }: TransferInitiateFormProps) {
  const [destinationUrl, setDestinationUrl] = useState('')
  const [selectedLayers, setSelectedLayers] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{
    transferId: string
    consentMessage?: string
  } | null>(null)

  function toggleLayer(layer: string) {
    setSelectedLayers((prev) =>
      prev.includes(layer) ? prev.filter((l) => l !== layer) : [...prev, layer]
    )
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!destinationUrl) return

    setSubmitting(true)
    setError(null)

    try {
      const res = await fetch('/api/transfers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentHandle,
          destinationServerUrl: destinationUrl,
          requestedLayers: selectedLayers.length > 0 ? selectedLayers : undefined,
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Transfer initiation failed')
        return
      }

      setResult({ transferId: data.transferId, consentMessage: data.consentMessage })
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (result) {
    return (
      <div className="rounded-lg border border-sky-200 bg-sky-50 p-6 dark:border-sky-800 dark:bg-sky-900/20">
        <h3 className="font-semibold text-slate-900 dark:text-white">
          Transfer Initiated
        </h3>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
          Transfer ID: <code className="font-mono text-xs">{result.transferId}</code>
        </p>
        {result.consentMessage && (
          <div className="mt-4">
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Sign the consent message in your wallet to proceed:
            </p>
            <pre className="mt-2 rounded-md bg-white p-3 text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-300">
              {result.consentMessage}
            </pre>
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              Consent signing will be available in a future update.
            </p>
          </div>
        )}
      </div>
    )
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <div>
        <label htmlFor="destination" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
          Destination Server URL
        </label>
        <input
          id="destination"
          type="url"
          value={destinationUrl}
          onChange={(e) => setDestinationUrl(e.target.value)}
          placeholder="https://other-saga-server.example.com"
          className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:ring-sky-500 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
          required
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
          Layers to Transfer
        </label>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Select which layers to include. Leave empty for all available layers.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {SAGA_LAYERS.map((layer) => (
            <button
              key={layer}
              type="button"
              onClick={() => toggleLayer(layer)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                selectedLayers.includes(layer)
                  ? 'border-sky-500 bg-sky-50 text-sky-700 dark:border-sky-400 dark:bg-sky-900/30 dark:text-sky-300'
                  : 'border-slate-300 text-slate-600 hover:border-slate-400 dark:border-slate-600 dark:text-slate-400'
              }`}
            >
              {layer}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      )}

      <button
        type="submit"
        disabled={!destinationUrl || submitting}
        className="rounded-md bg-sky-500 px-4 py-2 text-sm font-medium text-white hover:bg-sky-600 disabled:opacity-50"
      >
        {submitting ? 'Initiating...' : 'Initiate Transfer'}
      </button>
    </form>
  )
}
```

- [ ] **Step 3: Create transfers list page**

Create `packages/directory/src/app/dashboard/transfers/page.tsx`:

```typescript
import { type Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session/server'
import { Plus } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Transfers',
}

export default async function TransfersPage() {
  const session = await getSession()
  if (!session) redirect('/connect')

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">
            Transfers
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Transfer your agent between SAGA servers.
          </p>
        </div>
        <Link
          href="/dashboard/transfers/new"
          className="inline-flex items-center gap-1.5 rounded-md bg-sky-500 px-3 py-2 text-sm font-medium text-white hover:bg-sky-600"
        >
          <Plus className="h-4 w-4" />
          New Transfer
        </Link>
      </div>

      <div className="mt-8 text-center py-12">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Transfer history will be available when the SAGA server adds a list transfers endpoint.
        </p>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Create new transfer page**

Create `packages/directory/src/app/dashboard/transfers/new/page.tsx`:

```typescript
import { type Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session/server'
import { createAuthenticatedSagaClient } from '@/lib/saga-client'
import { TransferInitiateForm } from '@/components/dashboard/transfer-initiate-form'

export const metadata: Metadata = {
  title: 'New Transfer',
}

export default async function NewTransferPage() {
  const session = await getSession()
  if (!session) redirect('/connect')

  const client = await createAuthenticatedSagaClient(session.sagaToken)

  // Find the user's agent handle
  let agentHandle = ''
  try {
    const detail = await client.getAgent(session.walletAddress)
    agentHandle = detail.agent.handle
  } catch {
    redirect('/dashboard/register')
  }

  return (
    <div>
      <h1 className="text-xl font-bold text-slate-900 dark:text-white">
        Initiate Transfer
      </h1>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
        Transfer agent <span className="font-medium">@{agentHandle}</span> to another SAGA server.
      </p>
      <div className="mt-6 max-w-lg">
        <TransferInitiateForm agentHandle={agentHandle} />
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Commit**

```bash
git add packages/directory/src/app/dashboard/transfers packages/directory/src/app/api/transfers packages/directory/src/components/dashboard/transfer-initiate-form.tsx
git commit -m "feat(directory): transfer protocol UI

- Transfers list page (placeholder for server endpoint)
- New transfer form: destination URL + layer selection
- Transfer API routes proxy to SAGA server
- Consent message display after initiation"
```

---

## Task 16: Landing Page and Health Check

**Files:**

- Modify: `packages/directory/src/app/page.tsx`
- Create: `packages/directory/src/components/landing/hero-section.tsx`
- Create: `packages/directory/src/components/landing/recent-agents.tsx`
- Modify: `packages/directory/src/app/api/health/route.ts` (if exists, or create)

- [ ] **Step 1: Create hero section**

Create `packages/directory/src/components/landing/hero-section.tsx`:

```typescript
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
            Browse, register, and manage AI agent identities on the SAGA network.
            Transfer agents between servers with cryptographic consent.
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
```

- [ ] **Step 2: Create recent agents section**

Create `packages/directory/src/components/landing/recent-agents.tsx`:

```typescript
import { AgentCard } from '@/components/cards/agent-card'
import type { AgentRecord } from '@epicdm/saga-client'
import Link from 'next/link'

export function RecentAgents({ agents }: { agents: AgentRecord[] }) {
  if (agents.length === 0) return null

  return (
    <section className="py-12">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">
            Recent Agents
          </h2>
          <Link href="/agents" className="text-sm font-medium text-sky-600 hover:text-sky-700 dark:text-sky-400">
            View all &rarr;
          </Link>
        </div>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {agents.map((agent) => (
            <AgentCard key={agent.agentId} agent={agent} />
          ))}
        </div>
      </div>
    </section>
  )
}
```

- [ ] **Step 3: Rewrite landing page**

Replace `packages/directory/src/app/page.tsx`:

```typescript
import { createSagaClient } from '@/lib/saga-client'
import { HeroSection } from '@/components/landing/hero-section'
import { RecentAgents } from '@/components/landing/recent-agents'

export const revalidate = 60

export default async function HomePage() {
  const client = await createSagaClient()

  let agents: any[] = []
  try {
    const result = await client.listAgents({ page: 1, limit: 6 })
    agents = result.agents
  } catch {
    // Server may be unavailable
  }

  return (
    <>
      <HeroSection />
      <RecentAgents agents={agents} />
    </>
  )
}
```

- [ ] **Step 4: Create health check**

Create `packages/directory/src/app/api/health/route.ts`:

```typescript
import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({ status: 'ok', service: 'saga-directory' })
}
```

- [ ] **Step 5: Commit**

```bash
git add packages/directory/src/app/page.tsx packages/directory/src/components/landing packages/directory/src/app/api/health
git commit -m "feat(directory): landing page with hero and recent agents

- Hero section with browse/connect CTAs
- Recent agents grid (6 most recent from SAGA API)
- Health check endpoint"
```

---

## Task 17: Clean Up Remaining FlowState References and Build

**Files:**

- Remove: Any remaining FlowState-specific files
- Modify: Various files with stale imports
- Modify: `packages/directory/src/app/not-found.tsx`
- Modify: `packages/directory/src/app/robots.ts`
- Modify: `packages/directory/src/app/sitemap.ts`

- [ ] **Step 1: Update not-found page**

Replace `packages/directory/src/app/not-found.tsx`:

```typescript
import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center px-4 text-center">
      <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
        Not Found
      </h2>
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
        The page you're looking for doesn't exist.
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
```

- [ ] **Step 2: Update robots.ts and sitemap.ts**

Replace `packages/directory/src/app/robots.ts`:

```typescript
import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/' },
    sitemap: 'https://directory.saga-standard.dev/sitemap.xml',
  }
}
```

Replace `packages/directory/src/app/sitemap.ts`:

```typescript
import type { MetadataRoute } from 'next'

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: 'https://directory.saga-standard.dev', lastModified: new Date() },
    { url: 'https://directory.saga-standard.dev/agents', lastModified: new Date() },
    { url: 'https://directory.saga-standard.dev/orgs', lastModified: new Date() },
  ]
}
```

- [ ] **Step 3: Remove any remaining FlowState-specific files**

```bash
cd /Users/sthornock/code/epic/saga-standard/packages/directory

# Remove dashboard components we haven't replaced
rm -f src/components/dashboard/company-form.tsx
rm -f src/components/dashboard/avatar-url-input.tsx
rm -f src/components/dashboard/skills-input.tsx
rm -f src/components/dashboard/tools-input.tsx
rm -f src/components/dashboard/profile-form.tsx
rm -f src/components/dashboard/form-field.tsx
rm -f src/components/dashboard/form-status.tsx
rm -f src/components/dashboard/delete-confirm-dialog.tsx

# Remove old agent profile components we've replaced
rm -f src/components/agent-profile/profile-bio.tsx
rm -f src/components/agent-profile/profile-skills.tsx
rm -f src/components/agent-profile/work-history-timeline.tsx

# Remove old landing components we've replaced
rm -f src/components/landing/how-it-works.tsx
rm -f src/components/landing/trending-skills.tsx

# Remove old badges
rm -f src/components/badges/availability-badge.tsx
rm -f src/components/badges/skill-badge.tsx
rm -f src/components/badges/wallet-badge.tsx

# Remove old API routes
rm -rf src/app/api/agents
rm -rf src/app/api/companies

# Remove FlowState lib files
rm -f src/lib/url-state.ts
rm -f src/lib/validation/schemas.ts
rm -rf src/lib/session  # We recreated this
```

Note: Be careful not to delete files we created in earlier tasks. The `rm -rf src/app/api/agents` removes the OLD agents API route from the FlowState fork — we created our own in Task 14 at the same path, so make sure the Task 14 file is committed first.

- [ ] **Step 4: Run typecheck to find remaining broken imports**

```bash
cd /Users/sthornock/code/epic/saga-standard/packages/directory && npx tsc --noEmit 2>&1 | head -50
```

Fix any remaining import errors by removing stale imports or updating paths. Common fixes:

- Remove imports from `@/db/*`
- Remove imports from `@epicdm/chrome/*`
- Remove imports from `@epicdm/kv-session`
- Remove imports from `@epicdm/auth-client`

- [ ] **Step 5: Run build**

```bash
cd /Users/sthornock/code/epic/saga-standard/packages/directory && pnpm build
```

Fix any build errors.

- [ ] **Step 6: Commit**

```bash
git add -A packages/directory
git commit -m "chore(directory): clean up remaining FlowState references

- Updated not-found, robots, sitemap for SAGA
- Removed stale FlowState components and API routes
- Fixed all import errors for clean typecheck"
```

---

## Task 18: Create Cloudflare KV Namespaces and Deploy to Staging

**Files:**

- Modify: `packages/directory/wrangler.jsonc` (fill in real KV IDs)

- [ ] **Step 1: Create KV namespaces**

```bash
cd /Users/sthornock/code/epic/saga-standard/packages/directory
npx wrangler kv namespace create SESSIONS
npx wrangler kv namespace create SESSIONS --env staging
```

Copy the returned namespace IDs.

- [ ] **Step 2: Create R2 buckets**

```bash
npx wrangler r2 bucket create saga-directory-opennext-cache
npx wrangler r2 bucket create saga-directory-opennext-cache-staging
```

- [ ] **Step 3: Update wrangler.jsonc with real IDs**

Fill in the `PLACEHOLDER_*` values in `wrangler.jsonc` with the actual KV namespace IDs and R2 bucket names from the previous steps.

- [ ] **Step 4: Deploy to staging**

```bash
pnpm deploy:staging
```

- [ ] **Step 5: Verify staging is running**

```bash
curl -s https://saga-directory-staging.epicdm.workers.dev/api/health
```

Expected: `{"status":"ok","service":"saga-directory"}`

```bash
curl -s https://saga-directory-staging.epicdm.workers.dev/
```

Expected: HTML page with SAGA Directory content.

- [ ] **Step 6: Commit with real KV IDs**

```bash
git add packages/directory/wrangler.jsonc
git commit -m "chore(directory): add real Cloudflare KV and R2 IDs for staging"
```

---

## Summary

| Task | Description                              | Key Files                                                  |
| ---- | ---------------------------------------- | ---------------------------------------------------------- |
| 1    | Copy and strip FlowState directory       | `packages/directory/`                                      |
| 2    | Reconfigure for saga-standard monorepo   | `package.json`, `wrangler.jsonc`, configs                  |
| 3    | Inline chrome UI components and fonts    | `src/components/ui/*`, `src/fonts/*`                       |
| 4    | Session management + SAGA client factory | `src/lib/session/*`, `src/lib/saga-client.ts`              |
| 5    | Port wallet auth client code             | `src/lib/wallet/*`, `src/hooks/*`                          |
| 6    | Auth API routes                          | `src/app/api/auth/*`                                       |
| 7    | Middleware + root layout                 | `src/middleware.ts`, `src/app/layout.tsx`                  |
| 8    | Site layout component                    | `src/components/Layout.tsx`                                |
| 9    | Connect page (wallet login)              | `src/app/connect/*`, `src/components/wallet/*`             |
| 10   | Shared UI components (badges, cards)     | `src/components/badges/*`, `src/components/cards/*`        |
| 11   | Browse agents page                       | `src/app/agents/page.tsx`                                  |
| 12   | Browse orgs page                         | `src/app/orgs/page.tsx`                                    |
| 13   | Agent + org profile pages                | `src/app/a/*`, `src/app/o/*`                               |
| 14   | Dashboard, registration, profile         | `src/app/dashboard/*`, `src/app/api/agents/*`              |
| 15   | Transfer protocol UI                     | `src/app/dashboard/transfers/*`, `src/app/api/transfers/*` |
| 16   | Landing page + health check              | `src/app/page.tsx`, landing components                     |
| 17   | Clean up + build                         | Remove stale files, fix imports                            |
| 18   | Deploy to staging                        | Create KV/R2, deploy, verify                               |
