> **FlowState Document:** `docu_k3Tp5wB5YG`

# Marketplace OIDC Integration Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace NextAuth in the marketplace with a custom OIDC client that authenticates against the FlowState Identity Server.

**Architecture:** The marketplace becomes an OIDC Relying Party using Arctic (OAuth2Client for PKCE flow) and oslo/jwt (ID token verification). Auth UI lives on the identity server. The marketplace maintains KV-backed sessions and a local profiles table linked by `identityId` (the `sub` claim).

**Tech Stack:** Arctic, oslo/jwt, oslo/crypto, Cloudflare Workers KV, D1 (Drizzle ORM), Next.js 15

**Spec:** `docs/specs/2026-03-11-marketplace-oidc-integration-design.md`

**Marketplace root:** `/Users/sthornock/code/epic/flowstate-marketplace/packages/template-directory`
**Identity server root:** `/Users/sthornock/code/epic/epic-flowstate-identity`

**Test runner:** Jest (`npm test` or `npx jest --passWithNoTests`)

---

## Chunk 1: Foundation (Dependencies, Config, Session, OIDC Client)

### Task 1: Update dependencies and environment config

**Files:**

- Modify: `package.json`
- Modify: `src/env.d.ts`
- Modify: `wrangler.jsonc`

- [ ] **Step 1: Install arctic and oslo, remove next-auth and @auth/drizzle-adapter**

```bash
cd /Users/sthornock/code/epic/flowstate-marketplace/packages/template-directory
npm install arctic oslo
npm uninstall next-auth @auth/drizzle-adapter
```

Verify `package.json` no longer has `next-auth` or `@auth/drizzle-adapter` in dependencies, and has `arctic` and `oslo`.

- [ ] **Step 2: Create KV namespaces for sessions**

```bash
npx wrangler kv namespace create SESSIONS
npx wrangler kv namespace create SESSIONS --env staging
```

Note the IDs printed to stdout — use them in the next step.

- [ ] **Step 3: Update `wrangler.jsonc`**

Add the SESSIONS KV binding and IDENTITY_ISSUER_URL env var. Add to top-level (production) `kv_namespaces` array:

```jsonc
{ "binding": "SESSIONS", "id": "<production-kv-id>" }
```

Add to `env.staging.kv_namespaces` array:

```jsonc
{ "binding": "SESSIONS", "id": "<staging-kv-id>" }
```

Add to top-level `vars` (create if not exists, sibling to `env`):

```jsonc
"vars": {
  "NODE_ENV": "production",
  "IDENTITY_ISSUER_URL": "https://id.epicflowstate.ai"
}
```

Add to `env.staging.vars`:

```jsonc
"IDENTITY_ISSUER_URL": "https://id-staging.epicflowstate.ai"
```

- [ ] **Step 3b: Add local dev identity URL**

Create or update `.dev.vars` (already gitignored) to include:

```
IDENTITY_ISSUER_URL=http://localhost:3100
```

This ensures the local dev server points at the local identity server.

- [ ] **Step 4: Update `src/env.d.ts`**

Replace the full file with:

```typescript
// Copyright 2026 d7r LLC
// SPDX-License-Identifier: Apache-2.0

interface CloudflareEnv {
  DB: D1Database
  CACHE: KVNamespace
  SESSIONS: KVNamespace
  BUNDLES: R2Bucket
  NEXT_INC_CACHE_R2_BUCKET: R2Bucket
  IDENTITY_ISSUER_URL: string
  CRON_SECRET: string
}

declare module '@opennextjs/cloudflare' {
  export function getCloudflareContext(): Promise<{
    env: CloudflareEnv
    ctx: ExecutionContext
  }>
}
```

Note: `AUTH_SECRET`, `AUTH_RESEND_KEY`, `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET`, `ADMIN_EMAILS` are removed — the identity server handles those now. `SESSIONS` and `IDENTITY_ISSUER_URL` are added.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json src/env.d.ts wrangler.jsonc
git commit -m "chore: swap next-auth for arctic+oslo, add session KV and identity URL config"
```

---

### Task 2: KV session module

**Files:**

- Create: `src/lib/session/kv-session.ts`
- Create: `src/lib/session/__tests__/kv-session.test.ts`

- [ ] **Step 1: Write tests for KV session module**

Create `src/lib/session/__tests__/kv-session.test.ts`:

```typescript
// Copyright 2026 d7r LLC
// SPDX-License-Identifier: Apache-2.0

import {
  SESSION_COOKIE_NAME,
  createSession,
  getSession,
  destroySession,
  buildSessionCookie,
  buildSessionClearCookie,
} from '../kv-session'

// Minimal KV mock
function createMockKV() {
  const store = new Map<string, { value: string; expiration?: number }>()
  return {
    put: jest.fn(
      async (key: string, value: string, opts?: { expirationTtl?: number }) => {
        store.set(key, { value, expiration: opts?.expirationTtl })
      },
    ),
    get: jest.fn(async (key: string) => store.get(key)?.value ?? null),
    delete: jest.fn(async (key: string) => {
      store.delete(key)
    }),
    _store: store,
  } as unknown as KVNamespace
}

describe('kv-session', () => {
  it('creates a session and retrieves it', async () => {
    const kv = createMockKV()
    const data = {
      identityId: 'user_abc',
      email: 'a@b.com',
      name: 'A',
      avatarUrl: null,
      role: 'user' as const,
    }
    const id = await createSession(kv, data)
    expect(typeof id).toBe('string')
    expect(id.length).toBeGreaterThan(10)

    const session = await getSession(kv, id)
    expect(session).not.toBeNull()
    expect(session!.identityId).toBe('user_abc')
    expect(session!.email).toBe('a@b.com')
    expect(session!.role).toBe('user')
    expect(session!.createdAt).toBeDefined()
  })

  it('returns null for missing session', async () => {
    const kv = createMockKV()
    const session = await getSession(kv, 'nonexistent')
    expect(session).toBeNull()
  })

  it('destroys a session', async () => {
    const kv = createMockKV()
    const data = {
      identityId: 'user_abc',
      email: 'a@b.com',
      name: 'A',
      avatarUrl: null,
      role: 'user' as const,
    }
    const id = await createSession(kv, data)
    await destroySession(kv, id)
    const session = await getSession(kv, id)
    expect(session).toBeNull()
  })

  it('builds a session cookie string', () => {
    const cookie = buildSessionCookie('sess_123')
    expect(cookie).toContain('__session=sess_123')
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('Secure')
    expect(cookie).toContain('SameSite=Lax')
    expect(cookie).toContain('Path=/')
    expect(cookie).toContain('Max-Age=')
  })

  it('builds a clear cookie string', () => {
    const cookie = buildSessionClearCookie()
    expect(cookie).toContain('__session=')
    expect(cookie).toContain('Max-Age=0')
  })

  it('SESSION_COOKIE_NAME is __session', () => {
    expect(SESSION_COOKIE_NAME).toBe('__session')
  })
})
```

- [ ] **Step 2: Run tests — expect FAIL (module not found)**

```bash
npx jest src/lib/session/__tests__/kv-session.test.ts
```

Expected: FAIL — `Cannot find module '../kv-session'`

- [ ] **Step 3: Implement KV session module**

Create `src/lib/session/kv-session.ts`:

```typescript
// Copyright 2026 d7r LLC
// SPDX-License-Identifier: Apache-2.0

import type { ProfileRole } from '@/db/schema'

export const SESSION_COOKIE_NAME = '__session'
const SESSION_TTL = 7 * 24 * 60 * 60 // 7 days in seconds

export interface SessionData {
  identityId: string
  email: string
  name: string
  avatarUrl: string | null
  role: ProfileRole
  createdAt: string
}

/**
 * Create a new server-side session in KV.
 * Returns the session ID to be stored in the cookie.
 */
export async function createSession(
  kv: KVNamespace,
  data: Omit<SessionData, 'createdAt'>,
): Promise<string> {
  const sessionId = crypto.randomUUID()
  await kv.put(
    `session:${sessionId}`,
    JSON.stringify({ ...data, createdAt: new Date().toISOString() }),
    { expirationTtl: SESSION_TTL },
  )
  return sessionId
}

/**
 * Retrieve session data from KV by session ID.
 * Returns null if the session does not exist or has expired.
 */
export async function getSession(
  kv: KVNamespace,
  sessionId: string,
): Promise<SessionData | null> {
  const raw = await kv.get(`session:${sessionId}`)
  if (!raw) return null
  return JSON.parse(raw) as SessionData
}

/**
 * Destroy a session by removing it from KV.
 */
export async function destroySession(
  kv: KVNamespace,
  sessionId: string,
): Promise<void> {
  await kv.delete(`session:${sessionId}`)
}

/**
 * Build a Set-Cookie header value to store the session ID.
 */
export function buildSessionCookie(sessionId: string): string {
  return [
    `${SESSION_COOKIE_NAME}=${sessionId}`,
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
    'Path=/',
    `Max-Age=${SESSION_TTL}`,
  ].join('; ')
}

/**
 * Build a Set-Cookie header value that clears the session cookie.
 */
export function buildSessionClearCookie(): string {
  return [
    `${SESSION_COOKIE_NAME}=`,
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
    'Path=/',
    'Max-Age=0',
  ].join('; ')
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
npx jest src/lib/session/__tests__/kv-session.test.ts
```

Expected: 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/session/
git commit -m "feat: add KV-backed session module for marketplace auth"
```

---

### Task 3: OIDC client module

**Files:**

- Create: `src/lib/oidc/client.ts`
- Create: `src/lib/oidc/__tests__/client.test.ts`

This module wraps Arctic's `OAuth2Client` for PKCE-based authorization and provides ID token verification via `oslo/jwt`.

- [ ] **Step 1: Write tests for OIDC client module**

Create `src/lib/oidc/__tests__/client.test.ts`:

```typescript
// Copyright 2026 d7r LLC
// SPDX-License-Identifier: Apache-2.0

import { buildAuthorizationUrl } from '../client'

describe('oidc/client', () => {
  describe('buildAuthorizationUrl', () => {
    it('returns a URL with correct query params', () => {
      const result = buildAuthorizationUrl(
        'https://id.example.com',
        'https://app.example.com/auth/callback',
      )

      expect(result.url).toBeInstanceOf(URL)
      expect(result.url.origin).toBe('https://id.example.com')
      expect(result.url.pathname).toBe('/authorize')
      expect(result.url.searchParams.get('client_id')).toBe('marketplace')
      expect(result.url.searchParams.get('response_type')).toBe('code')
      expect(result.url.searchParams.get('redirect_uri')).toBe(
        'https://app.example.com/auth/callback',
      )
      expect(result.url.searchParams.get('scope')).toBe(
        'openid profile email offline_access',
      )
      expect(result.url.searchParams.get('code_challenge_method')).toBe('S256')
      expect(result.url.searchParams.get('code_challenge')).toBeTruthy()
      expect(result.url.searchParams.get('state')).toBe(result.state)
      expect(result.url.searchParams.get('nonce')).toBe(result.nonce)
    })

    it('returns state, nonce, and codeVerifier as strings', () => {
      const result = buildAuthorizationUrl(
        'https://id.example.com',
        'https://app.example.com/auth/callback',
      )
      expect(typeof result.state).toBe('string')
      expect(typeof result.nonce).toBe('string')
      expect(typeof result.codeVerifier).toBe('string')
      expect(result.state.length).toBeGreaterThan(10)
      expect(result.nonce.length).toBeGreaterThan(10)
      expect(result.codeVerifier.length).toBeGreaterThan(10)
    })
  })
})
```

Note: `exchangeCode` and `verifyIdToken` require network calls and crypto — they'll be tested via integration tests during Task 8, not unit tested here.

- [ ] **Step 2: Run tests — expect FAIL**

```bash
npx jest src/lib/oidc/__tests__/client.test.ts
```

Expected: FAIL — `Cannot find module '../client'`

- [ ] **Step 3: Implement OIDC client module**

Create `src/lib/oidc/client.ts`:

```typescript
// Copyright 2026 d7r LLC
// SPDX-License-Identifier: Apache-2.0

import {
  OAuth2Client,
  CodeChallengeMethod,
  generateCodeVerifier,
  generateState,
} from 'arctic'

const CLIENT_ID = 'marketplace'
const SCOPES = ['openid', 'profile', 'email', 'offline_access']

/**
 * Build the OIDC authorization URL with PKCE.
 * Returns the URL to redirect to, plus state/nonce/codeVerifier to store in a cookie.
 */
export function buildAuthorizationUrl(
  issuerUrl: string,
  redirectUri: string,
): { url: URL; state: string; nonce: string; codeVerifier: string } {
  const client = new OAuth2Client(CLIENT_ID, null, redirectUri)
  const state = generateState()
  const nonce = generateState() // generateState produces a random string, fine for nonce
  const codeVerifier = generateCodeVerifier()

  const url = client.createAuthorizationURLWithPKCE(
    `${issuerUrl}/authorize`,
    state,
    CodeChallengeMethod.S256,
    codeVerifier,
    SCOPES,
  )

  // Add nonce (Arctic doesn't add it automatically for generic OAuth2)
  url.searchParams.set('nonce', nonce)

  return { url, state, nonce, codeVerifier }
}

/**
 * Exchange an authorization code for tokens at the identity server's token endpoint.
 * Public client — no client_secret, only PKCE code_verifier.
 */
export async function exchangeCode(
  issuerUrl: string,
  code: string,
  codeVerifier: string,
  redirectUri: string,
): Promise<{ idToken: string; accessToken: string; refreshToken?: string }> {
  const client = new OAuth2Client(CLIENT_ID, null, redirectUri)
  const tokens = await client.validateAuthorizationCode(
    `${issuerUrl}/api/oauth/token`,
    code,
    codeVerifier,
  )

  const accessToken = tokens.accessToken()
  const idToken = tokens.idToken()
  const refreshToken = tokens.hasRefreshToken()
    ? tokens.refreshToken()
    : undefined

  return { idToken, accessToken, refreshToken }
}

const JWKS_CACHE_KEY = 'jwks:cache'
const JWKS_CACHE_TTL = 60 * 60 // 1 hour in seconds

/**
 * Fetch JWKS with KV caching (1-hour TTL).
 * Falls back to network fetch if cache is empty or stale.
 */
async function fetchJWKS(
  issuerUrl: string,
  kv: KVNamespace,
): Promise<{ keys: JsonWebKey[] }> {
  // Try KV cache first
  const cached = await kv.get(JWKS_CACHE_KEY)
  if (cached) {
    return JSON.parse(cached) as { keys: JsonWebKey[] }
  }

  // Fetch from identity server
  const jwksResponse = await fetch(`${issuerUrl}/.well-known/jwks.json`)
  if (!jwksResponse.ok) {
    throw new Error(`Failed to fetch JWKS: ${jwksResponse.status}`)
  }
  const jwks = (await jwksResponse.json()) as { keys: JsonWebKey[] }

  // Cache in KV with 1-hour TTL
  await kv.put(JWKS_CACHE_KEY, JSON.stringify(jwks), {
    expirationTtl: JWKS_CACHE_TTL,
  })

  return jwks
}

/**
 * Verify an ID token's RS256 signature against the identity server's JWKS,
 * then validate standard OIDC claims (iss, aud, exp, nonce).
 *
 * Returns the decoded payload claims.
 */
export async function verifyIdToken(
  idToken: string,
  issuerUrl: string,
  clientId: string,
  nonce: string,
  kv: KVNamespace,
): Promise<Record<string, unknown>> {
  // Fetch JWKS (cached in KV)
  const jwks = await fetchJWKS(issuerUrl, kv)

  // Decode the JWT header to find the kid
  const [headerB64] = idToken.split('.')
  const header = JSON.parse(
    atob(headerB64.replace(/-/g, '+').replace(/_/g, '/')),
  ) as {
    kid?: string
    alg: string
  }

  if (header.alg !== 'RS256') {
    throw new Error(`Unsupported algorithm: ${header.alg}`)
  }

  // Find the matching key
  const jwk = jwks.keys.find((k) => k.kid === header.kid)
  if (!jwk) {
    throw new Error(`No matching key found for kid: ${header.kid}`)
  }

  // Import the public key and verify the signature
  const publicKey = await crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify'],
  )

  const [, payloadB64, signatureB64] = idToken.split('.')
  const signedInput = new TextEncoder().encode(
    `${idToken.split('.')[0]}.${payloadB64}`,
  )
  const signature = Uint8Array.from(
    atob(signatureB64.replace(/-/g, '+').replace(/_/g, '/')),
    (c) => c.charCodeAt(0),
  )

  const valid = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    publicKey,
    signature,
    signedInput,
  )
  if (!valid) {
    throw new Error('Invalid ID token signature')
  }

  // Decode and validate claims
  const payload = JSON.parse(
    atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/')),
  ) as Record<string, unknown>

  // Validate issuer
  if (payload.iss !== issuerUrl) {
    throw new Error(`Invalid issuer: expected ${issuerUrl}, got ${payload.iss}`)
  }

  // Validate audience
  if (payload.aud !== clientId) {
    throw new Error(
      `Invalid audience: expected ${clientId}, got ${payload.aud}`,
    )
  }

  // Validate expiry
  const exp = payload.exp as number
  if (exp * 1000 < Date.now()) {
    throw new Error('ID token has expired')
  }

  // Validate nonce
  if (payload.nonce !== nonce) {
    throw new Error(`Invalid nonce: expected ${nonce}, got ${payload.nonce}`)
  }

  return payload
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
npx jest src/lib/oidc/__tests__/client.test.ts
```

Expected: 2 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/oidc/
git commit -m "feat: add OIDC client module with PKCE authorization and ID token verification"
```

---

## Chunk 2: Auth Routes, Schema Migration, Auth Helpers

### Task 4: Auth routes (login, callback, logout)

**Files:**

- Create: `src/app/auth/login/route.ts`
- Create: `src/app/auth/callback/route.ts`
- Create: `src/app/auth/logout/route.ts`

- [ ] **Step 1: Create login route**

Create `src/app/auth/login/route.ts`:

```typescript
// Copyright 2026 d7r LLC
// SPDX-License-Identifier: Apache-2.0

import { type NextRequest, NextResponse } from 'next/server'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { buildAuthorizationUrl } from '../../../lib/oidc/client'

export async function GET(request: NextRequest) {
  const { env } = await getCloudflareContext()
  const callbackUrl =
    request.nextUrl.searchParams.get('callbackUrl') || '/dashboard'

  const redirectUri = `${request.nextUrl.origin}/auth/callback`
  const { url, state, nonce, codeVerifier } = buildAuthorizationUrl(
    env.IDENTITY_ISSUER_URL,
    redirectUri,
  )

  const response = NextResponse.redirect(url)

  // Store PKCE params + destination in HttpOnly cookie
  const cookieValue = JSON.stringify({
    state,
    nonce,
    codeVerifier,
    callbackUrl,
  })
  response.headers.append(
    'Set-Cookie',
    [
      `oidc_params=${encodeURIComponent(cookieValue)}`,
      'HttpOnly',
      'Secure',
      'SameSite=Lax',
      'Path=/',
      'Max-Age=600',
    ].join('; '),
  )

  return response
}
```

- [ ] **Step 2: Create callback route**

Create `src/app/auth/callback/route.ts`:

```typescript
// Copyright 2026 d7r LLC
// SPDX-License-Identifier: Apache-2.0

import { type NextRequest, NextResponse } from 'next/server'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { drizzle } from 'drizzle-orm/d1'
import { eq } from 'drizzle-orm'
import { exchangeCode, verifyIdToken } from '../../../lib/oidc/client'
import {
  createSession,
  buildSessionCookie,
} from '../../../lib/session/kv-session'
import * as schema from '../../../db/schema'

const CLEAR_OIDC_COOKIE =
  'oidc_params=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax'

export async function GET(request: NextRequest) {
  const { env } = await getCloudflareContext()

  // Read and clear OIDC params cookie
  const rawParams = request.cookies.get('oidc_params')?.value
  if (!rawParams) {
    return NextResponse.redirect(
      new URL('/login?error=missing_params', request.url),
    )
  }

  let params: {
    state: string
    nonce: string
    codeVerifier: string
    callbackUrl: string
  }
  try {
    params = JSON.parse(decodeURIComponent(rawParams))
  } catch {
    const response = NextResponse.redirect(
      new URL('/login?error=invalid_params', request.url),
    )
    response.headers.append('Set-Cookie', CLEAR_OIDC_COOKIE)
    return response
  }

  // Validate state
  const returnedState = request.nextUrl.searchParams.get('state')
  if (!returnedState || returnedState !== params.state) {
    const response = NextResponse.redirect(
      new URL('/login?error=invalid_state', request.url),
    )
    response.headers.append('Set-Cookie', CLEAR_OIDC_COOKIE)
    return response
  }

  // Check for error from identity server
  const error = request.nextUrl.searchParams.get('error')
  if (error) {
    const response = NextResponse.redirect(
      new URL(`/login?error=${error}`, request.url),
    )
    response.headers.append('Set-Cookie', CLEAR_OIDC_COOKIE)
    return response
  }

  const code = request.nextUrl.searchParams.get('code')
  if (!code) {
    const response = NextResponse.redirect(
      new URL('/login?error=missing_code', request.url),
    )
    response.headers.append('Set-Cookie', CLEAR_OIDC_COOKIE)
    return response
  }

  try {
    // Exchange code for tokens
    const redirectUri = `${request.nextUrl.origin}/auth/callback`
    const tokens = await exchangeCode(
      env.IDENTITY_ISSUER_URL,
      code,
      params.codeVerifier,
      redirectUri,
    )

    // Verify ID token (uses KV-cached JWKS)
    const claims = await verifyIdToken(
      tokens.idToken,
      env.IDENTITY_ISSUER_URL,
      'marketplace',
      params.nonce,
      env.SESSIONS,
    )

    const identityId = claims.sub as string
    const email = claims.email as string
    const name = (claims.name as string) || email.split('@')[0]
    const avatarUrl = (claims.picture as string) || null

    // Upsert profile in marketplace D1
    const db = drizzle(env.DB, { schema })
    const existingProfile = await db.query.profiles.findFirst({
      where: eq(schema.profiles.identityId, identityId),
    })

    if (existingProfile) {
      // Update profile with latest identity data
      await db
        .update(schema.profiles)
        .set({
          displayName: name,
          avatarUrl,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(schema.profiles.identityId, identityId))
    } else {
      // Create new profile
      await db.insert(schema.profiles).values({
        identityId,
        displayName: name,
        avatarUrl,
        role: 'user',
        status: 'active',
      })
    }

    // Resolve the user's role from the profile
    const resolvedRole = existingProfile?.role ?? 'user'

    // Create KV session
    const sessionId = await createSession(env.SESSIONS, {
      identityId,
      email,
      name,
      avatarUrl,
      role: resolvedRole,
    })

    // Redirect to callback URL
    const response = NextResponse.redirect(
      new URL(params.callbackUrl, request.url),
    )
    response.headers.append('Set-Cookie', buildSessionCookie(sessionId))
    response.headers.append('Set-Cookie', CLEAR_OIDC_COOKIE)
    return response
  } catch (err) {
    console.error('OIDC callback error:', err)
    const response = NextResponse.redirect(
      new URL('/login?error=callback_failed', request.url),
    )
    response.headers.append('Set-Cookie', CLEAR_OIDC_COOKIE)
    return response
  }
}
```

- [ ] **Step 3: Create logout route**

Create `src/app/auth/logout/route.ts`:

```typescript
// Copyright 2026 d7r LLC
// SPDX-License-Identifier: Apache-2.0

import { type NextRequest, NextResponse } from 'next/server'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import {
  SESSION_COOKIE_NAME,
  destroySession,
  buildSessionClearCookie,
} from '../../../lib/session/kv-session'

export async function GET(request: NextRequest) {
  const { env } = await getCloudflareContext()

  // Destroy local session
  const sessionId = request.cookies.get(SESSION_COOKIE_NAME)?.value
  if (sessionId) {
    await destroySession(env.SESSIONS, sessionId)
  }

  // Redirect to identity server logout
  const postLogoutUrl = request.nextUrl.origin
  const logoutUrl = new URL('/api/oauth/logout', env.IDENTITY_ISSUER_URL)
  logoutUrl.searchParams.set('post_logout_redirect_uri', postLogoutUrl)

  const response = NextResponse.redirect(logoutUrl)
  response.headers.append('Set-Cookie', buildSessionClearCookie())
  return response
}
```

- [ ] **Step 4: Commit**

```bash
git add src/app/auth/
git commit -m "feat: add OIDC auth routes (login, callback, logout)"
```

---

### Task 5: Database schema migration

**Files:**

- Modify: `src/db/schema.ts`
- Create: `drizzle/0006_*.sql` (generated by drizzle-kit)

Since there is no production data, we generate a clean migration that drops the NextAuth tables and modifies profiles + FK columns.

- [ ] **Step 1: Update `src/db/schema.ts`**

Remove the following table definitions and their imports:

- `users` table (lines 78-86)
- `accounts` table (lines 88-105)
- `sessions` table (lines 107-116)
- `verificationTokens` table (lines 118-128)

In `profiles`, replace the `userId` column with `identityId`:

```typescript
export const profiles = sqliteTable('profiles', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  identityId: text('identity_id').notNull().unique(),
  displayName: text('display_name'),
  username: text('username').unique(),
  avatarUrl: text('avatar_url'),
  bio: text('bio'),
  company: text('company'),
  website: text('website'),
  githubUsername: text('github_username'),
  timezone: text('timezone'),
  role: text('role', { enum: profileRoles }).notNull().default('user'),
  status: text('status', { enum: profileStatuses }).notNull().default('active'),
  metadata: text('metadata', { mode: 'json' }).$type<Record<string, unknown>>(),
  createdAt: text('created_at').$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').$defaultFn(() => new Date().toISOString()),
})
```

For all other tables that had `.references(() => users.id, ...)`, remove the `.references()` call but keep the column. The column now stores the identity server's `sub` claim (a text string), not a local FK. Affected tables:

- `activityLogs.userId` — remove `.references(() => users.id, { onDelete: 'set null' })`
- `publishers.userId` — remove `.references(() => users.id, { onDelete: 'cascade' })`
- `reviews.userId` — remove `.references(() => users.id, { onDelete: 'cascade' })`
- `installEvents.userId` — remove `.references(() => users.id, { onDelete: 'set null' })`
- `emailPreferences.userId` — remove `.references(() => users.id, { onDelete: 'cascade' })`
- `supportTickets.userId` — remove `.references(() => users.id, { onDelete: 'cascade' })`
- `supportTickets.assignedTo` — remove `.references(() => users.id)`
- `supportMessages.senderId` — remove `.references(() => users.id)`
- `stripeCustomers.userId` — remove `.references(() => users.id, { onDelete: 'cascade' })`
- `listingPurchases.userId` — remove `.references(() => users.id, { onDelete: 'cascade' })`
- `media.uploadedBy` — remove `.references(() => users.id, { onDelete: 'set null' })`

- [ ] **Step 2: Generate migration**

```bash
npx drizzle-kit generate
```

This produces a new migration SQL file in `drizzle/`. Review it — it should drop users, accounts, sessions, verificationTokens, and alter profiles to replace userId with identityId.

**Important:** Since there's no production data, if drizzle-kit produces complex alter statements, you can manually write a simpler migration that drops and recreates the affected tables. The key requirement is that the final schema matches the updated `schema.ts`.

- [ ] **Step 3: Apply migration locally**

```bash
npx wrangler d1 migrations apply flowstate-templates-db --local
```

- [ ] **Step 4: Commit**

```bash
git add src/db/schema.ts drizzle/
git commit -m "feat: drop NextAuth tables, replace userId with identityId in profiles"
```

---

### Task 6: Update middleware and admin-auth

**Files:**

- Modify: `src/middleware.ts`
- Modify: `src/lib/admin-auth.ts`

- [ ] **Step 1: Update middleware**

Replace `src/middleware.ts` with:

```typescript
// Copyright 2026 d7r LLC
// SPDX-License-Identifier: Apache-2.0

import { type NextRequest, NextResponse } from 'next/server'

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  const sessionToken = request.cookies.get('__session')?.value

  // Fast cookie check for protected API routes.
  // Full role validation still happens inside each route handler.
  if (
    pathname.startsWith('/api/admin') ||
    pathname.startsWith('/api/developer')
  ) {
    if (!sessionToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  // Redirect unauthenticated users from protected pages to login
  if (pathname.startsWith('/dashboard') || pathname.startsWith('/admin')) {
    if (!sessionToken) {
      const loginUrl = new URL('/auth/login', request.url)
      loginUrl.searchParams.set('callbackUrl', pathname)
      return NextResponse.redirect(loginUrl)
    }
  }

  // Redirect already-authenticated users away from the login page
  if (pathname === '/login' && sessionToken) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/api/admin/:path*',
    '/api/developer/:path*',
    '/dashboard/:path*',
    '/admin/:path*',
    '/login',
  ],
}
```

Changes from old middleware:

- Cookie name: `__session` (was `__Secure-authjs.session-token` or `authjs.session-token`)
- Login redirect: `/auth/login` (was `/login`) — this route starts the OIDC flow

- [ ] **Step 2: Update admin-auth**

Replace `src/lib/admin-auth.ts` with:

```typescript
// Copyright 2026 d7r LLC
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { drizzle } from 'drizzle-orm/d1'
import { eq } from 'drizzle-orm'
import * as schema from '@/db/schema'
import type { ProfileRole } from '@/db/schema'
import { SESSION_COOKIE_NAME, getSession } from '@/lib/session/kv-session'

export interface AuthSession {
  user: { identityId: string; email: string; name: string }
}

interface AuthSuccess {
  authorized: true
  env: CloudflareEnv
  session: AuthSession
  role: ProfileRole
}

interface AuthFailure {
  authorized: false
  response: NextResponse
}

type AuthResult = AuthSuccess | AuthFailure

// Higher number = broader access. Used for min-role comparisons.
const ROLE_HIERARCHY: Record<ProfileRole, number> = {
  user: 0,
  developer: 1,
  admin: 2,
  super_admin: 3,
}

async function requireRole(minRole: ProfileRole): Promise<AuthResult> {
  const { env } = await getCloudflareContext()

  const cookieStore = await cookies()
  const sessionId = cookieStore.get(SESSION_COOKIE_NAME)?.value
  if (!sessionId) {
    return {
      authorized: false,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    }
  }

  const session = await getSession(env.SESSIONS, sessionId)
  if (!session) {
    return {
      authorized: false,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    }
  }

  const db = drizzle(env.DB, { schema })
  const profile = await db.query.profiles.findFirst({
    where: eq(schema.profiles.identityId, session.identityId),
  })

  const role: ProfileRole = profile?.role ?? 'user'
  if (ROLE_HIERARCHY[role] < ROLE_HIERARCHY[minRole]) {
    return {
      authorized: false,
      response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    }
  }

  return {
    authorized: true,
    env,
    session: {
      user: {
        identityId: session.identityId,
        email: session.email,
        name: session.name,
      },
    },
    role,
  }
}

export function requireAuth() {
  return requireRole('user')
}

export function requireDeveloper() {
  return requireRole('developer')
}

export function requireAdmin() {
  return requireRole('admin')
}

export function requireSuperAdmin() {
  return requireRole('super_admin')
}

/**
 * Returns true if the current session meets `minRole`, false otherwise.
 * Never throws — safe to use in conditional rendering guards.
 */
export async function checkRole(minRole: ProfileRole): Promise<boolean> {
  try {
    const result = await requireRole(minRole)
    return result.authorized
  } catch {
    return false
  }
}

export async function checkIsAdmin(): Promise<boolean> {
  return checkRole('admin')
}

/**
 * Fetch the profile row for a given identityId directly.
 * Used by server components that already hold the session.
 */
export async function getUserProfile(identityId: string) {
  const { env } = await getCloudflareContext()
  const db = drizzle(env.DB, { schema })
  return db.query.profiles.findFirst({
    where: eq(schema.profiles.identityId, identityId),
  })
}
```

Key changes:

- Uses `cookies()` from `next/headers` + `getSession(env.SESSIONS, ...)` instead of `createAuth(env.DB, env).auth()`
- `session.user.id` → `session.user.identityId`
- Profile lookup: `profiles.identityId` instead of `profiles.userId`
- `getUserProfile` takes `identityId` instead of `userId`

**Note for callers:** Any code that references `result.session.user.id` must be updated to `result.session.user.identityId`. Search the codebase for `session.user.id` and update all references.

- [ ] **Step 3: Commit**

```bash
git add src/middleware.ts src/lib/admin-auth.ts
git commit -m "feat: update middleware and admin-auth for KV session + identityId"
```

---

### Task 7: Remove NextAuth files, update login page, update references

**Files:**

- Delete: `src/auth.ts`
- Delete: `src/app/api/auth/[...nextauth]/route.ts`
- Delete: `src/app/(auth)/login/magic-link-form.tsx`
- Modify: `src/app/(auth)/login/page.tsx`
- Modify: any files referencing `session.user.id` or importing from `@/auth`

- [ ] **Step 1: Delete NextAuth files**

```bash
rm src/auth.ts
rm -rf src/app/api/auth/
rm src/app/(auth)/login/magic-link-form.tsx
```

- [ ] **Step 2: Replace login page**

Replace `src/app/(auth)/login/page.tsx` with:

```tsx
// Copyright 2026 d7r LLC
// SPDX-License-Identifier: Apache-2.0

export const dynamic = 'force-dynamic'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>
}) {
  const { callbackUrl, error } = await searchParams
  const loginUrl = `/auth/login${callbackUrl ? `?callbackUrl=${encodeURIComponent(callbackUrl)}` : ''}`

  return (
    <>
      <div className="text-center">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
          Sign in to FlowState Marketplace
        </h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
          Sign in with your FlowState account to continue
        </p>
      </div>

      {error && (
        <div className="mt-4 rounded-lg bg-red-50 p-3 text-center text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
          {error === 'callback_failed'
            ? 'Authentication failed. Please try again.'
            : error === 'invalid_state'
              ? 'Session expired. Please try again.'
              : `Authentication error: ${error}`}
        </div>
      )}

      <a
        href={loginUrl}
        className="mt-8 flex w-full items-center justify-center gap-3 rounded-lg bg-sky-500 px-4 py-2 font-medium text-white hover:bg-sky-600 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2"
      >
        Sign in with FlowState
      </a>
    </>
  )
}
```

- [ ] **Step 3: Search for and update all references to `session.user.id` and `@/auth`**

Search the codebase for:

- `from '@/auth'` or `from '../../auth'` — remove these imports entirely
- `session.user.id` — replace with `session.user.identityId`
- `createAuth(` — remove all usages
- `signIn(` or `signOut(` from next-auth — replace with redirects to `/auth/login` and `/auth/logout`

Key files likely affected:

- `src/app/(admin)/layout.tsx` — replace NextAuth session check with KV session check
- `src/app/(dashboard)/` layouts/pages — same
- `src/lib/actions/user-actions.ts` — update `result.session.user.id` to `result.session.user.identityId`
- `src/lib/actions/review-actions.ts` — same
- `src/lib/actions/listing-actions.ts` — same
- Any server component that calls `createAuth().auth()`

For server components that need session data, use this pattern:

```typescript
import { cookies } from 'next/headers'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { SESSION_COOKIE_NAME, getSession } from '@/lib/session/kv-session'

// In the server component:
const { env } = await getCloudflareContext()
const cookieStore = await cookies()
const sessionId = cookieStore.get(SESSION_COOKIE_NAME)?.value
const session = sessionId ? await getSession(env.SESSIONS, sessionId) : null
if (!session) redirect('/auth/login')
```

- [ ] **Step 4: Run the full test suite**

```bash
npx jest --passWithNoTests
```

Fix any failing tests due to the auth changes.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: remove NextAuth, update login page and all auth references for OIDC"
```

---

## Chunk 3: Identity Server Seed Update, Build & Deploy

### Task 8: Update identity server seed and re-seed

**Files:**

- Modify: `/Users/sthornock/code/epic/epic-flowstate-identity/scripts/seed-clients.ts`

- [ ] **Step 1: Add staging callback URL to marketplace client**

In the identity server's `scripts/seed-clients.ts`, update the marketplace client's `redirectUris` to include the staging URL:

```typescript
{
  id: 'marketplace',
  name: 'FlowState Marketplace',
  type: 'public',
  redirectUris: [
    'https://marketplace.epicflowstate.ai/auth/callback',
    'https://flowstate-marketplace-staging.epicdm.workers.dev/auth/callback',
    'http://localhost:3000/auth/callback',
  ],
  allowedScopes: 'openid profile email offline_access',
  isFirstParty: true,
},
```

- [ ] **Step 2: Generate seed SQL and apply to local D1**

```bash
cd /Users/sthornock/code/epic/epic-flowstate-identity
npx tsx scripts/seed-clients.ts > /tmp/seed-clients.sql
npx wrangler d1 execute flowstate-identity --local --file=/tmp/seed-clients.sql
```

- [ ] **Step 3: Apply seed to staging and production D1**

```bash
# Staging — uses --env staging to target the flowstate-identity-staging database
npx wrangler d1 execute flowstate-identity-staging --env staging --file=/tmp/seed-clients.sql

# Production — no --env flag; top-level config IS production (flowstate-identity database)
npx wrangler d1 execute flowstate-identity --file=/tmp/seed-clients.sql
```

- [ ] **Step 4: Commit identity server changes**

```bash
git add scripts/seed-clients.ts
git commit -m "feat: add staging callback URL to marketplace OIDC client seed"
```

---

### Task 9: Build, deploy, and verify

- [ ] **Step 0: Pre-deploy checklist**

Before deploying, verify:

1. KV namespaces (`SESSIONS`) were created in Task 1 Step 2 and their IDs are in `wrangler.jsonc`
2. `IDENTITY_ISSUER_URL` is set in `wrangler.jsonc` vars for both production and staging
3. D1 migration was applied locally in Task 5 Step 3
4. All tests pass (`npx jest --passWithNoTests`)

- [ ] **Step 1: Verify marketplace builds**

```bash
cd /Users/sthornock/code/epic/flowstate-marketplace/packages/template-directory
npx opennextjs-cloudflare build
```

Fix any build errors (TypeScript, ESLint).

- [ ] **Step 2: Apply D1 migration to staging**

```bash
npx wrangler d1 migrations apply flowstate-templates-db-staging --env staging
```

- [ ] **Step 3: Set environment variables on staging**

Add `IDENTITY_ISSUER_URL` to staging if not in wrangler.jsonc vars (it should be from Task 1).

- [ ] **Step 4: Deploy marketplace to staging**

```bash
npm run deploy:staging
```

- [ ] **Step 5: Test the full OIDC flow on staging**

1. Navigate to `https://flowstate-marketplace-staging.epicdm.workers.dev`
2. Click "Sign in with FlowState"
3. Should redirect to `https://id-staging.epicflowstate.ai/authorize?...`
4. Authenticate via GitHub or Google
5. Should redirect back to staging marketplace with a session
6. Verify `/dashboard` loads with user data
7. Test logout — should clear session and redirect through identity server

- [ ] **Step 6: Apply D1 migration to production**

```bash
# No --env flag — top-level wrangler config IS production
npx wrangler d1 migrations apply flowstate-templates-db
```

- [ ] **Step 7: Deploy marketplace to production**

```bash
npm run deploy:production
```

- [ ] **Step 8: Verify production flow**

Same test as staging but on `https://marketplace.epicflowstate.ai`.

- [ ] **Step 9: Commit any remaining fixes**

```bash
git add -A
git commit -m "fix: resolve build and deploy issues for OIDC integration"
```
